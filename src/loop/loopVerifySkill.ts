import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'
import { runOneShotAgentPrompt } from '../agents/oneShotAgentRun.js'
import { resolveIterationAgent, type ResolvedLoopAgent } from './loopAgentConfig.js'
import type { LoopConfig } from './loopConfig.js'
import { runVerifyCommand, type VerifyResult } from './loopVerify.js'

export type SkillVerifyAgentRun = (input: {
  ctx: RepoContext
  prompt: string
  config: LoopConfig
  verbose?: boolean
  /** Same resolved worker as this iteration (ladder / escalateModel). */
  agent?: ResolvedLoopAgent
  iteration?: number
  escalationRepeatCount?: number
  reviewCycleEscalation?: number
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

async function defaultSkillVerifyAgentRun(
  input: Parameters<SkillVerifyAgentRun>[0],
): Promise<AgentRunResult> {
  const agent =
    input.agent ??
    resolveIterationAgent(
      input.config,
      input.iteration ?? 1,
      input.escalationRepeatCount,
      input.reviewCycleEscalation ?? 0,
    )
  return runOneShotAgentPrompt(input.ctx, input.prompt, agent, {
    phase: 'verify',
    verbose: input.verbose,
  })
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
  agent?: ResolvedLoopAgent
  iteration?: number
  escalationRepeatCount?: number
  reviewCycleEscalation?: number
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
      agent: input.agent,
      iteration: input.iteration,
      escalationRepeatCount: input.escalationRepeatCount,
      reviewCycleEscalation: input.reviewCycleEscalation,
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
