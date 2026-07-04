import fs from 'node:fs'
import { resolveTaskwarriorProject, type RepoContext } from '../context/repoContext.js'
import { createLoopAgentSession, loopRuntimeLabel, type LoopAgentSession } from '../agents/agentRunner.js'
import { resolveIterationAgent, resolveLoopAgent, type ResolvedLoopAgent } from '../loop/loopAgentConfig.js'
import type { LoadedLoopBundle } from '../loop/loopConfig.js'
import { captureGitWorkspaceSnapshot } from '../loop/loopGit.js'
import { buildAgentLoopPrompt } from '../loop/loopPrompt.js'
import { runPostLoopQualityReview } from '../review/loopPostReview.js'
import { resolvePostQualityReview } from '../loop/loopRisk.js'
import { detectStagnation } from '../loop/loopStagnation.js'
import { resolveStagnationPolicy } from '../loop/loopStagnationPolicy.js'
import {
  createHitlCheckTask,
  markTaskwarriorDoneByUuid,
  runTaskwarriorSync,
} from '../integrations/taskwarrior.js'
import { runVerifyCommand, type VerifyResult } from '../loop/loopVerify.js'

export type LoopIterationLog = {
  at: string
  iteration: number
  branch: string
  shortSha: string
  verify: VerifyResult
  finalVerify?: VerifyResult
  assistantPreview: string
}

export type AgentLoopResult = {
  complete: boolean
  iterations: number
  completionReason: string
  lastVerify: VerifyResult | null
  logPath: string
}

export type AgentLoopOptions = {
  ctx: RepoContext
  bundle: LoadedLoopBundle
  verbose?: boolean
  onIterationStart?: (iteration: number) => void
}

const PREVIEW_MAX = 500
const SDK_RETRY_DELAYS_MS = [5000, 15_000] as const

function isTransientAgentError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /rate limit|timeout|503|502|429|ECONNRESET|ETIMEDOUT|network|retryable=true/i.test(
    message,
  )
}

async function runIterationWithRetry(
  session: LoopAgentSession,
  prompt: string,
  iterationAgent: ResolvedLoopAgent,
  options: { verbose?: boolean; assistantOutput?: 'stdout' | 'none' },
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt <= SDK_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await session.runIterationPrompt(prompt, iterationAgent, options)
    } catch (err) {
      lastError = err
      if (attempt >= SDK_RETRY_DELAYS_MS.length || !isTransientAgentError(err)) {
        throw err
      }
      const delayMs = SDK_RETRY_DELAYS_MS[attempt]!
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `[agent-loop] transient agent error (retry ${attempt + 1}/${SDK_RETRY_DELAYS_MS.length} in ${delayMs}ms): ${message}`,
      )
      await sleep(delayMs)
    }
  }
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function appendLog(logPath: string, entry: LoopIterationLog): void {
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

function previewAssistant(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= PREVIEW_MAX) return trimmed
  return `${trimmed.slice(0, PREVIEW_MAX)}…`
}

function maybeRunSync(ctx: RepoContext, enabled: boolean): void {
  if (!enabled) return
  const syncCommand = ctx.profile.syncCommand
  if (!syncCommand) {
    console.error('[agent-loop] sync skipped — no syncCommand in .cursor/agent-loop.repo.json')
    return
  }
  runTaskwarriorSync(syncCommand, ctx.repoRoot)
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { ctx, bundle, verbose = false } = options
  const { repoRoot } = ctx
  const { config, goal, logPath } = bundle
  const agentSession = await createLoopAgentSession(config, ctx)
  const baseAgent = resolveLoopAgent(config)
  const twProject = resolveTaskwarriorProject(config.taskwarriorProject, ctx.profile)

  console.error(
    `[agent-loop] repo=${repoRoot} runtime=${loopRuntimeLabel(baseAgent.runtime)} model=${baseAgent.model}`,
  )

  const priorFailures: VerifyResult[] = []
  let lastVerify: VerifyResult | null = null
  let iterations = 0
  const stagnationThreshold = config.stagnationThreshold

  try {
    for (let i = 1; i <= config.maxIterations; i++) {
      iterations = i
      options.onIterationStart?.(i)

      const repeatCount = detectStagnation(priorFailures, stagnationThreshold).repeatCount
      const stagnation = resolveStagnationPolicy(config, repeatCount)
      const iterationAgent = resolveIterationAgent(config, stagnation.escalationRepeatCount)

      const git = captureGitWorkspaceSnapshot(repoRoot)
      const prompt = buildAgentLoopPrompt({
        goal,
        iteration: i,
        maxIterations: config.maxIterations,
        git,
        lastVerify,
        priorFailures: priorFailures.slice(-3),
        stagnationRepeatCount: stagnation.promptRepeatCount,
        agentsFile: ctx.profile.agentsFile,
      })

      console.error(
        `[agent-loop] iteration ${i}/${config.maxIterations} — ${iterationAgent.runtime} ${iterationAgent.model} (fresh context)`,
      )
      const assistantText = await runIterationWithRetry(
        agentSession,
        prompt,
        iterationAgent,
        {
          verbose,
          assistantOutput: 'none',
        },
      )

      if (config.delayMs > 0) {
        await sleep(config.delayMs)
      }

      console.error(`[agent-loop] iteration ${i} — verify: ${config.verify}`)
      const verify = runVerifyCommand(config.verify, repoRoot)
      lastVerify = verify

      let finalVerify: VerifyResult | undefined
      if (verify.complete && config.finalVerify) {
        console.error(`[agent-loop] inner verify passed — final: ${config.finalVerify}`)
        finalVerify = runVerifyCommand(config.finalVerify, repoRoot)
        lastVerify = finalVerify
      }

      const passed = finalVerify ? finalVerify.complete : verify.complete

      appendLog(logPath, {
        at: new Date().toISOString(),
        iteration: i,
        branch: git.branch,
        shortSha: git.shortSha,
        verify,
        ...(finalVerify ? { finalVerify } : {}),
        assistantPreview: previewAssistant(assistantText),
      })

      if (passed) {
        const runQualityReview = resolvePostQualityReview(
          config.postQualityReview,
          goal,
          config.verify,
        )
        if (runQualityReview) {
          console.error('[agent-loop] post-success quality review (advisory, Cursor SDK)')
          try {
            await runPostLoopQualityReview(bundle.loopDir, goal, ctx, { verbose })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[agent-loop] quality review failed (non-blocking): ${message}`)
          }
        }
        if (config.taskwarriorUuid) {
          markTaskwarriorDoneByUuid(config.taskwarriorUuid)
        }
        if (config.hitlCheck) {
          createHitlCheckTask(config.hitlCheck, twProject)
        }
        maybeRunSync(ctx, config.syncOnSuccess)
        return {
          complete: true,
          iterations: i,
          completionReason: lastVerify.reason,
          lastVerify,
          logPath,
        }
      }

      priorFailures.push(lastVerify!)
      console.error(`[agent-loop] iteration ${i} failed — ${lastVerify!.reason}`)

      const afterFailure = detectStagnation(priorFailures, stagnationThreshold)
      if (afterFailure.stagnant) {
        console.error(
          `[agent-loop] stagnation: same verifier failure ${afterFailure.repeatCount} times — stopping early`,
        )
        return {
          complete: false,
          iterations: i,
          completionReason: `Stagnation: verifier failed ${afterFailure.repeatCount} times with the same output. Update GOAL.md/verify, fix manually, or set stagnationThreshold: 0 to disable.`,
          lastVerify,
          logPath,
        }
      }
    }

    return {
      complete: false,
      iterations,
      completionReason: `Max iterations (${config.maxIterations}) reached without passing verifier.`,
      lastVerify,
      logPath,
    }
  } finally {
    await agentSession.dispose()
  }
}
