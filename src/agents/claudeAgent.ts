import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  killProcessGroup,
  signalProcessTree,
  spawnParentDeathReaper,
  trackSpawnedRoot,
} from './processTree.js'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { assertPosixShell } from './shellPreflight.js'
import { resolveInnerAgentStatus } from './innerAgentStatus.js'
import type { StreamCollector } from '../stream/streamCollect.js'
import { emitAssistantText } from '../stream/assistantStream.js'
import { LOOP_RUNTIME_CLAUDE } from '../loop/loopAgentConfig.js'
import { createUsageRecord } from '../usage/loopUsage.js'

export const CLAUDE_SESSION_TIMEOUT_MS = 45 * 60 * 1000
export const CLAUDE_KILL_GRACE_MS = 3000

/** `--safe-mode` (keeps OAuth) shipped in 2.1.169. */
export const CLAUDE_MIN_MAJOR = 2
export const CLAUDE_MIN_MINOR = 1
export const CLAUDE_MIN_PATCH = 169

export type ClaudeAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  onAssistantText?: (chunk: string) => void
  collector?: StreamCollector
}

export type ClaudeLoopSession = {
  runPrompt(prompt: string, options: ClaudeAgentRunOptions): Promise<AgentRunResult>
  dispose(): Promise<void>
}

export type SpawnClaudeFn = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ['ignore', 'pipe', 'pipe']; detached: boolean },
) => ChildProcess

export type ClaudeSemver = { major: number; minor: number; patch: number }

export function parseClaudeCliVersion(raw: string): ClaudeSemver | undefined {
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return undefined
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function claudeVersionMeetsMinimum(raw: string): boolean {
  const version = parseClaudeCliVersion(raw)
  if (!version) return false
  if (version.major !== CLAUDE_MIN_MAJOR) return version.major > CLAUDE_MIN_MAJOR
  if (version.minor !== CLAUDE_MIN_MINOR) return version.minor > CLAUDE_MIN_MINOR
  return version.patch >= CLAUDE_MIN_PATCH
}

export type ClaudeCliProbe = { onPath: boolean; version: string }

/** Shared by the loop preflight and `agent-check claude`. Does not spend quota. */
export function probeClaudeCli(): ClaudeCliProbe {
  const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0) return { onPath: false, version: '' }
  return { onPath: true, version: (probe.stdout || probe.stderr).trim().split('\n')[0] ?? '' }
}

export const CLAUDE_MISSING_CLI_MESSAGE =
  '`claude` CLI is not on PATH. Install Claude Code (https://code.claude.com/docs/en/setup) and run `claude login`. ' +
  'The Agent Looper CLI does not depend on `@anthropic-ai/claude-agent-sdk`.'

export function claudeVersionFloorMessage(version: string): string {
  return (
    `Claude Code ${CLAUDE_MIN_MAJOR}.${CLAUDE_MIN_MINOR}.${CLAUDE_MIN_PATCH}+ required for --safe-mode ` +
    `(got ${version || 'unknown'}). Run \`claude update\`.`
  )
}

/**
 * Fail the loop before the first spawn: an older CLI rejects `--safe-mode`, and that flag is
 * what keeps CLAUDE.md / hooks / MCP / skills out of the harness iteration.
 */
export function assertClaudeCliVersion(probe: () => ClaudeCliProbe = probeClaudeCli): void {
  const { onPath, version } = probe()
  if (!onPath) throw new Error(CLAUDE_MISSING_CLI_MESSAGE)
  if (!claudeVersionMeetsMinimum(version)) throw new Error(claudeVersionFloorMessage(version))
}

/** Strip Console-token env so `-p` uses Claude Code login, not pay-per-token. */
export function buildClaudeChildEnv(parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...parent }
  delete env.ANTHROPIC_API_KEY
  delete env.CLAUDE_CODE_SIMPLE
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
  return env
}

export function buildClaudePrintArgs(input: {
  prompt: string
  modelId: string
  systemPrompt: string
}): string[] {
  return [
    '-p',
    input.prompt,
    '--output-format',
    'json',
    '--permission-mode',
    'bypassPermissions',
    '--no-session-persistence',
    '--safe-mode',
    '--model',
    input.modelId,
    '--append-system-prompt',
    input.systemPrompt,
  ]
}

type ClaudePrintUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export type ClaudePrintResult = {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  session_id?: string
  total_cost_usd?: number
  usage?: ClaudePrintUsage
}

export function parseClaudePrintStdout(stdout: string): ClaudePrintResult {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('Claude print exited without JSON on stdout')
  }
  const candidates: string[] = [trimmed]
  const lastBrace = trimmed.lastIndexOf('\n{')
  if (lastBrace >= 0) candidates.push(trimmed.slice(lastBrace + 1))
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace > 0) candidates.push(trimmed.slice(firstBrace))

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as ClaudePrintResult
    } catch (err) {
      lastError = err
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Claude print stdout was not JSON: ${detail}`)
}

export function extractClaudeAssistantText(parsed: ClaudePrintResult): string {
  if (parsed.is_error) {
    const detail = parsed.result?.trim() || parsed.subtype || 'unknown error'
    throw new Error(`Claude print failed: ${detail}`)
  }
  const text = parsed.result?.trim()
  if (!text) {
    throw new Error('Claude print returned empty result text')
  }
  return text
}

function readClaudeUsage(
  parsed: ClaudePrintResult,
  modelId: string,
  phase: NonNullable<ClaudeAgentRunOptions['phase']>,
): AgentRunResult['usage'] {
  const usage = parsed.usage
  const inputTokens = usage?.input_tokens ?? 0
  const outputTokens = usage?.output_tokens ?? 0
  const hasTokens = inputTokens > 0 || outputTokens > 0
  const providerCost =
    typeof parsed.total_cost_usd === 'number' && Number.isFinite(parsed.total_cost_usd)
      ? parsed.total_cost_usd
      : undefined
  if (!hasTokens && providerCost === undefined) return undefined
  return createUsageRecord({
    phase,
    runtime: LOOP_RUNTIME_CLAUDE,
    model: modelId,
    inputTokens,
    outputTokens,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
    providerCostUsd: providerCost,
  })
}

export function spawnClaudePrint(input: {
  repoRoot: string
  args: readonly string[]
  timeoutMs: number
  killGraceMs?: number
  env?: NodeJS.ProcessEnv
  spawnImpl?: SpawnClaudeFn
  killGroup?: typeof killProcessGroup
  signalTree?: typeof signalProcessTree
  spawnReaper?: typeof spawnParentDeathReaper
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const spawnImpl = input.spawnImpl ?? (spawn as SpawnClaudeFn)
  const killGroup = input.killGroup ?? killProcessGroup
  const signalTree = input.signalTree ?? signalProcessTree
  const spawnReaper = input.spawnReaper ?? spawnParentDeathReaper
  const killGraceMs = input.killGraceMs ?? CLAUDE_KILL_GRACE_MS
  const env = input.env ?? buildClaudeChildEnv()

  return new Promise((resolve, reject) => {
    const child = spawnImpl('claude', input.args, {
      cwd: input.repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    const untrack = trackSpawnedRoot(child.pid)
    const parentDeathReaper = spawnReaper({
      parentPid: process.pid,
      rootPid: child.pid ?? 0,
    })

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
      signalTree(child.pid, 'SIGTERM')
      killTimer = setTimeout(() => {
        killGroup(child.pid, 'SIGKILL')
        signalTree(child.pid, 'SIGKILL')
      }, killGraceMs)
      killTimer.unref?.()
    }, input.timeoutMs)
    timer.unref?.()

    const finish = (code: number | null) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      untrack()
      parentDeathReaper.close()
      if (timedOut) {
        reject(new Error(`Claude print timed out after ${input.timeoutMs}ms`))
        return
      }
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    }

    child.on('error', (err) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      untrack()
      parentDeathReaper.close()
      const message = err instanceof Error ? err.message : String(err)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(CLAUDE_MISSING_CLI_MESSAGE))
        return
      }
      reject(new Error(`Failed to spawn claude: ${message}`))
    })

    child.on('close', (code) => {
      finish(code)
    })
  })
}

export async function createClaudeLoopSession(ctx: RepoContext): Promise<ClaudeLoopSession> {
  await assertPosixShell()
  assertClaudeCliVersion()
  const systemPrompt = buildLoopSystemPrompt(ctx)

  return {
    async runPrompt(prompt, options) {
      const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
      const phase = options.phase ?? 'implement'
      const args = buildClaudePrintArgs({
        prompt,
        modelId: options.modelId,
        systemPrompt,
      })

      console.error(`[agent-loop:claude] safe-mode model=${options.modelId}`)

      const result = await spawnClaudePrint({
        repoRoot: ctx.repoRoot,
        args,
        timeoutMs: CLAUDE_SESSION_TIMEOUT_MS,
      })

      if (verbose && result.stderr.trim()) {
        process.stderr.write(result.stderr)
      }

      if (result.exitCode !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`
        throw new Error(`Claude print failed (exit ${result.exitCode}): ${detail}`)
      }

      const parsed = parseClaudePrintStdout(result.stdout)
      const text = extractClaudeAssistantText(parsed)
      emitAssistantText(options, `${text}\n`)

      return {
        text,
        usage: readClaudeUsage(parsed, options.modelId, phase),
        innerAgent: resolveInnerAgentStatus(text, 'claude'),
        sessionRef: parsed.session_id
          ? { provider: 'claude', sessionId: parsed.session_id }
          : { provider: 'claude' },
      }
    },
    async dispose() {
      return undefined
    },
  }
}
