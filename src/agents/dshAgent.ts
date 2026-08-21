import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { assertPosixShell } from './shellPreflight.js'
import { resolveInnerAgentStatus } from './innerAgentStatus.js'
import { parseProviderModel } from '../loop/loopAgentConfig.js'
import type { StreamCollector } from '../stream/streamCollect.js'

export const DSH_SESSION_TIMEOUT_MS = 45 * 60 * 1000
export const DSH_KILL_GRACE_MS = 3000
export const DSH_MIN_NODE_MAJOR = 22
export const DSH_MIN_NODE_MINOR = 15

export type DshAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
}

export type DshLoopSession = {
  runPrompt(prompt: string, options: DshAgentRunOptions): Promise<AgentRunResult>
  dispose(): Promise<void>
}

export type SpawnDshFn = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ['ignore', 'pipe', 'pipe']; detached: boolean },
) => ChildProcess

function yamlDoubleQuoted(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Preset name that matches unattended workspace-write (approval never). */
export const DSH_LOOP_PERMISSION_PRESET = 'workspace-write-never'

/** Headless overlay: model + unattended workspace-write. */
export function buildDshLoopPatchYaml(repoRoot: string, modelId: string): string {
  const { providerID, modelID } = parseProviderModel(modelId)
  return [
    '- id: agent-default-model',
    "  name: '@deepseek-ai/dsh-agent-default-model'",
    '  config:',
    `    provider: ${yamlDoubleQuoted(providerID)}`,
    `    model: ${yamlDoubleQuoted(modelID)}`,
    '- id: approval',
    "  name: '@deepseek-ai/dsh-user-approval'",
    '  config:',
    '    policy: never',
    '- id: sandbox-policy',
    "  name: '@deepseek-ai/dsh-sandbox-policy'",
    '  config:',
    '    mode: workspace-write',
    `    workspaceRoot: ${yamlDoubleQuoted(repoRoot)}`,
    '- id: permission',
    "  name: '@deepseek-ai/dsh-permission-presets'",
    '  config:',
    `    defaultPreset: ${DSH_LOOP_PERMISSION_PRESET}`,
    '    presets:',
    '      read-only:',
    '        sandbox: read-only',
    '        approval: ask',
    '        name: read-only',
    '        description: Read-only with ask approval.',
    '      workspace-write:',
    '        sandbox: workspace-write',
    '        approval: ask',
    '        name: workspace-write',
    '        description: Write inside the workspace; wider retries require approval.',
    '      danger-full-access:',
    '        sandbox: danger-full-access',
    '        approval: never',
    '        name: danger-full-access',
    '        description: Full file access without approval prompts.',
    `      ${DSH_LOOP_PERMISSION_PRESET}:`,
    '        sandbox: workspace-write',
    '        approval: never',
    `        name: ${DSH_LOOP_PERMISSION_PRESET}`,
    '        description: Unattended workspace-write for Agent Looper headless workers.',
    '',
  ].join('\n')
}

export function nodeMeetsDshMinimum(version = process.versions.node): boolean {
  const [majorRaw, minorRaw] = version.split('.')
  const major = Number(majorRaw)
  const minor = Number(minorRaw)
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false
  if (major > DSH_MIN_NODE_MAJOR) return true
  return major === DSH_MIN_NODE_MAJOR && minor >= DSH_MIN_NODE_MINOR
}

/** POSIX: `detached` spawn makes `pid` a process-group leader; `-pid` kills the tree. */
export function killProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined || pid <= 0) return
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // already gone
    }
  }
}

export function spawnDshHeadless(input: {
  repoRoot: string
  patchPath: string
  task: string
  timeoutMs: number
  killGraceMs?: number
  spawnImpl?: SpawnDshFn
  killGroup?: typeof killProcessGroup
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const spawnImpl = input.spawnImpl ?? (spawn as SpawnDshFn)
  const killGroup = input.killGroup ?? killProcessGroup
  const killGraceMs = input.killGraceMs ?? DSH_KILL_GRACE_MS

  return new Promise((resolve, reject) => {
    const child = spawnImpl(
      'dsh',
      ['--profile', 'headless', '--patch', input.patchPath, input.task],
      {
        cwd: input.repoRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      },
    )

    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    let killTimer: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child.pid, 'SIGTERM')
      killTimer = setTimeout(() => {
        killGroup(child.pid, 'SIGKILL')
      }, killGraceMs)
      killTimer.unref?.()
    }, input.timeoutMs)
    timer.unref?.()

    const finish = (code: number | null) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      if (timedOut) {
        reject(new Error(`DSH headless timed out after ${input.timeoutMs}ms`))
        return
      }
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    }

    child.on('error', (err) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      const message = err instanceof Error ? err.message : String(err)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new Error(
            '`dsh` CLI is not on PATH. Install DeepSeek Harness (`npx @deepseek-ai/dsh`) and retry. ' +
              'The Agent Looper CLI does not depend on `@deepseek-ai/dsh`.',
          ),
        )
        return
      }
      reject(new Error(`Failed to spawn dsh: ${message}`))
    })

    child.on('close', (code) => {
      finish(code)
    })
  })
}

export async function createDshLoopSession(ctx: RepoContext): Promise<DshLoopSession> {
  await assertPosixShell()
  if (!nodeMeetsDshMinimum()) {
    throw new Error(
      `Node.js ${DSH_MIN_NODE_MAJOR}.${DSH_MIN_NODE_MINOR}+ required for DSH headless ` +
        `(current: ${process.versions.node})`,
    )
  }
  const systemPrompt = buildLoopSystemPrompt(ctx)

  return {
    async runPrompt(prompt, options) {
      const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
      const assistantOutput = options.assistantOutput ?? 'stdout'
      const task = `${systemPrompt}\n\n---\n\n${prompt}`
      const patchPath = path.join(
        os.tmpdir(),
        `agent-loop-dsh-${process.pid}-${Date.now()}.yml`,
      )
      fs.writeFileSync(patchPath, buildDshLoopPatchYaml(ctx.repoRoot, options.modelId), 'utf8')

      console.error(`[agent-loop:dsh] profile=headless model=${options.modelId}`)

      try {
        const result = await spawnDshHeadless({
          repoRoot: ctx.repoRoot,
          patchPath,
          task,
          timeoutMs: DSH_SESSION_TIMEOUT_MS,
        })

        if (verbose && result.stderr.trim()) {
          process.stderr.write(result.stderr)
        }

        const text = result.stdout.trim()
        if (result.exitCode !== 0) {
          const detail = result.stderr.trim() || text || `exit ${result.exitCode}`
          throw new Error(`DSH headless failed (exit ${result.exitCode}): ${detail}`)
        }
        if (!text) {
          throw new Error('DSH headless exited 0 without assistant text on stdout')
        }

        if (assistantOutput === 'stdout' || verbose) {
          process.stdout.write(`${text}\n`)
        }

        return {
          text,
          innerAgent: resolveInnerAgentStatus(text, 'dsh'),
          sessionRef: { provider: 'dsh' },
          toolSummary: options.collector?.toolSummary,
          transcriptEvents: options.collector?.events,
        }
      } finally {
        try {
          fs.unlinkSync(patchPath)
        } catch {
          // tmp cleanup is best-effort
        }
      }
    },
    async dispose() {
      return undefined
    },
  }
}
