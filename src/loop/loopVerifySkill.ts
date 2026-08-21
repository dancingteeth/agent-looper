import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import { runCursorAgentPrompt } from '../agents/cursorAgent.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'
import {
  isClineSdkRuntime,
  isCodexRuntime,
  isDshRuntime,
  isOpencodeRuntime,
  isPiRuntime,
  LOOP_RUNTIME_CURSOR,
  resolveLoopAgent,
} from './loopAgentConfig.js'
import type { LoopConfig } from './loopConfig.js'
import { runVerifyCommand, type VerifyResult } from './loopVerify.js'

export type SkillVerifyAgentRun = (input: {
  ctx: RepoContext
  prompt: string
  config: LoopConfig
  verbose?: boolean
}) => Promise<AgentRunResult>

const VERIFY_RESULT_RE = /VERIFY_RESULT:\s*(PASS|FAIL)\b/gi

export function parseVerifyResult(text: string): 'PASS' | 'FAIL' | null {
  let last: 'PASS' | 'FAIL' | null = null
  for (const match of text.matchAll(VERIFY_RESULT_RE)) {
    last = match[1]!.toUpperCase() as 'PASS' | 'FAIL'
  }
  return last
}

export function resolveVerifySkillPath(
  verifySkill: string,
  loopDir: string,
  repoRoot: string,
): string {
  if (path.isAbsolute(verifySkill)) {
    return path.resolve(verifySkill)
  }
  const fromLoop = path.resolve(loopDir, verifySkill)
  if (fs.existsSync(fromLoop)) {
    return fromLoop
  }
  return path.resolve(repoRoot, verifySkill)
}

export function buildVerifySkillPrompt(goal: string, skillBody: string): string {
  return [
    'You are the loop **verify** agent. Run the verification checklist below against the current workspace.',
    'Follow every measurable step. Fail → fix → rerun until all checks pass or you must report FAIL.',
    '',
    '## Goal (acceptance criteria)',
    goal.trim(),
    '',
    '## Verification skill',
    skillBody.trim(),
    '',
    'When finished, end your response with **exactly one** structured footer line:',
    'VERIFY_RESULT: PASS',
    'or',
    'VERIFY_RESULT: FAIL',
  ].join('\n')
}

async function defaultSkillVerifyAgentRun(input: {
  ctx: RepoContext
  prompt: string
  config: LoopConfig
  verbose?: boolean
}): Promise<AgentRunResult> {
  const agent = resolveLoopAgent(input.config)
  if (agent.runtime === LOOP_RUNTIME_CURSOR) {
    return runCursorAgentPrompt(input.ctx, input.prompt, {
      verbose: input.verbose,
      modelId: agent.model,
      role: 'worker',
      assistantOutput: 'none',
      phase: 'verify',
    })
  }
  if (isOpencodeRuntime(agent.runtime)) {
    const { createOpencodeLoopSession } = await import('../agents/opencodeAgent.js')
    const opencode = await createOpencodeLoopSession(input.ctx)
    try {
      return await opencode.runPrompt(input.prompt, {
        verbose: input.verbose,
        modelId: agent.model,
        assistantOutput: 'none',
        phase: 'verify',
      })
    } finally {
      await opencode.dispose()
    }
  }
  if (isPiRuntime(agent.runtime)) {
    const { createPiLoopSession } = await import('../agents/piAgent.js')
    const pi = await createPiLoopSession(input.ctx)
    try {
      return await pi.runPrompt(input.prompt, {
        verbose: input.verbose,
        modelId: agent.model,
        assistantOutput: 'none',
        phase: 'verify',
      })
    } finally {
      await pi.dispose()
    }
  }
  if (isCodexRuntime(agent.runtime)) {
    const { createCodexLoopSession } = await import('../agents/codexAgent.js')
    const codex = await createCodexLoopSession(input.ctx)
    try {
      return await codex.runPrompt(input.prompt, {
        verbose: input.verbose,
        modelId: agent.model,
        assistantOutput: 'none',
        phase: 'verify',
      })
    } finally {
      await codex.dispose()
    }
  }
  if (isDshRuntime(agent.runtime)) {
    const { createDshLoopSession } = await import('../agents/dshAgent.js')
    const dsh = await createDshLoopSession(input.ctx)
    try {
      return await dsh.runPrompt(input.prompt, {
        verbose: input.verbose,
        modelId: agent.model,
        assistantOutput: 'none',
        phase: 'verify',
      })
    } finally {
      await dsh.dispose()
    }
  }
  if (!isClineSdkRuntime(agent.runtime)) {
    throw new Error(`Unsupported verify runtime: ${agent.runtime}`)
  }
  // Dynamic import: @cline/sdk is optional — Cursor-only installs must not load it unless enabled.
  const { createClineLoopSession } = await import('../agents/clineAgent.js')
  const cline = await createClineLoopSession(input.ctx)
  try {
    return await cline.runPrompt(input.prompt, {
      verbose: input.verbose,
      modelId: agent.model,
      providerId: agent.runtime,
      assistantOutput: 'none',
      phase: 'verify',
      reasoningEffort: agent.reasoningEffort,
    })
  } finally {
    await cline.dispose()
  }
}

function skillVerifyFailure(
  verifySkillPath: string,
  shellCommand: string,
  reason: string,
  stdout: string,
  stderr: string,
): VerifyResult {
  return {
    complete: false,
    command: `skill:${verifySkillPath} → ${shellCommand}`,
    exitCode: 1,
    stdout,
    stderr,
    reason,
  }
}

function skillVerifyPassShellGate(
  verifySkillPath: string,
  shellCommand: string,
  agentText: string,
  shell: VerifyResult,
): VerifyResult {
  if (!shell.complete) {
    return {
      ...shell,
      command: `skill:${verifySkillPath} → ${shellCommand}`,
      stdout: [agentText.trim(), shell.stdout.trim()].filter(Boolean).join('\n\n--- shell verify ---\n\n'),
    }
  }
  return {
    complete: true,
    command: `skill:${verifySkillPath} → ${shellCommand}`,
    exitCode: 0,
    stdout: [agentText.trim(), shell.stdout.trim()].filter(Boolean).join('\n\n--- shell verify ---\n\n'),
    stderr: shell.stderr,
    reason: 'Skill verify PASS and shell verify passed (exit 0).',
  }
}

export async function runVerifySkill(input: {
  ctx: RepoContext
  loopDir: string
  goal: string
  config: LoopConfig
  verbose?: boolean
  runAgent?: SkillVerifyAgentRun
}): Promise<VerifyResult> {
  const verifySkill = input.config.verifySkill
  if (!verifySkill?.trim()) {
    throw new Error('verifySkill is required when verifyMode is "skill"')
  }

  const verifySkillPath = resolveVerifySkillPath(verifySkill, input.loopDir, input.ctx.repoRoot)
  if (!fs.existsSync(verifySkillPath)) {
    throw new Error(`verifySkill not found: ${verifySkillPath}`)
  }

  const skillBody = fs.readFileSync(verifySkillPath, 'utf8')
  const prompt = buildVerifySkillPrompt(input.goal, skillBody)
  const shellCommand = input.config.verify

  let agentRun: AgentRunResult
  try {
    const runAgent = input.runAgent ?? defaultSkillVerifyAgentRun
    agentRun = await runAgent({
      ctx: input.ctx,
      prompt,
      config: input.config,
      verbose: input.verbose,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return skillVerifyFailure(
      verifySkillPath,
      shellCommand,
      `Skill verify agent error: ${message}`,
      '',
      message,
    )
  }

  const parsed = parseVerifyResult(agentRun.text)
  if (parsed === 'FAIL') {
    return skillVerifyFailure(
      verifySkillPath,
      shellCommand,
      'Skill verify agent reported VERIFY_RESULT: FAIL.',
      agentRun.text,
      'VERIFY_RESULT: FAIL',
    )
  }
  if (parsed !== 'PASS') {
    return skillVerifyFailure(
      verifySkillPath,
      shellCommand,
      'Skill verify agent did not emit VERIFY_RESULT: PASS or VERIFY_RESULT: FAIL.',
      agentRun.text,
      'Missing VERIFY_RESULT footer.',
    )
  }

  const shell = runVerifyCommand(shellCommand, input.ctx.repoRoot)
  return skillVerifyPassShellGate(verifySkillPath, shellCommand, agentRun.text, shell)
}
