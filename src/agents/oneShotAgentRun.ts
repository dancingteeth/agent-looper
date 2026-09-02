import type { RepoContext } from '../context/repoContext.js'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CLAUDE,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  type ResolvedLoopAgent,
  type ResolvedReviewAgent,
} from '../loop/loopAgentConfig.js'
import type { StreamCollector } from '../stream/streamCollect.js'
import type { CursorSdkModel } from '../loop/loopAgentConfig.js'
import type { AgentRunResult } from './agentRunResult.js'
import { runCursorAgentPrompt } from './cursorAgent.js'

export type OneShotAgent = ResolvedLoopAgent | ResolvedReviewAgent

export type OneShotAgentPhase = 'review' | 'verify' | 'scaffold'

export type OneShotAgentPromptOptions = {
  phase: OneShotAgentPhase
  verbose?: boolean
  collector?: StreamCollector
  onAssistantText?: (chunk: string) => void
}

type RuntimeRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput: 'stdout' | 'none'
  phase: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
  onAssistantText?: (chunk: string) => void
  providerId?: typeof LOOP_RUNTIME_CLINE_PASS | typeof LOOP_RUNTIME_CLINE
  reasoningEffort?: ResolvedLoopAgent['reasoningEffort']
}

function resolveRuntimePhase(phase: OneShotAgentPhase): 'implement' | 'review' | 'verify' {
  return phase === 'scaffold' ? 'review' : phase
}

/** Cursor SDK bans Grok as a worker; scaffold uses the judge, so it must be `review`. */
function cursorRoleForPhase(phase: OneShotAgentPhase): 'worker' | 'review' {
  return phase === 'verify' ? 'worker' : 'review'
}

function baseRunOptions(
  agent: OneShotAgent,
  options: OneShotAgentPromptOptions,
): RuntimeRunOptions {
  return {
    verbose: options.verbose,
    modelId: agent.model,
    assistantOutput: 'none',
    phase: resolveRuntimePhase(options.phase),
    collector: options.collector,
    onAssistantText: options.onAssistantText,
    ...(agent.runtime === LOOP_RUNTIME_CLINE_PASS || agent.runtime === LOOP_RUNTIME_CLINE
      ? {
          providerId: agent.runtime,
          reasoningEffort: agent.reasoningEffort,
        }
      : agent.reasoningEffort !== undefined
        ? { reasoningEffort: agent.reasoningEffort }
        : {}),
  }
}

async function withDisposableSession<TSession extends { dispose(): Promise<void> }, TResult>(
  sessionPromise: Promise<TSession>,
  run: (session: TSession) => Promise<TResult>,
): Promise<TResult> {
  const session = await sessionPromise
  try {
    return await run(session)
  } finally {
    await session.dispose()
  }
}

/**
 * Create a runtime session, run one prompt, dispose.
 * Used by skill-verify, residual review, and prompt-TUI scaffold (judge writes
 * GOAL/verify) — not the long-lived worker (`createLoopAgentSession`).
 */
export async function runOneShotAgentPrompt(
  ctx: RepoContext,
  prompt: string,
  agent: OneShotAgent,
  options: OneShotAgentPromptOptions,
): Promise<AgentRunResult> {
  const runOptions = baseRunOptions(agent, options)
  switch (agent.runtime) {
    case LOOP_RUNTIME_CURSOR:
      return runCursorAgentPrompt(ctx, prompt, {
        verbose: runOptions.verbose,
        modelId: runOptions.modelId as CursorSdkModel,
        role: cursorRoleForPhase(options.phase),
        assistantOutput: runOptions.assistantOutput,
        phase: runOptions.phase,
        collector: runOptions.collector,
        onAssistantText: runOptions.onAssistantText,
      })
    case LOOP_RUNTIME_CLINE_PASS:
    case LOOP_RUNTIME_CLINE: {
      const { createClineLoopSession } = await import('./clineAgent.js')
      return withDisposableSession(createClineLoopSession(ctx), (cline) =>
        cline.runPrompt(prompt, {
          verbose: runOptions.verbose,
          modelId: runOptions.modelId,
          providerId: runOptions.providerId,
          assistantOutput: runOptions.assistantOutput,
          phase: runOptions.phase,
          reasoningEffort: runOptions.reasoningEffort,
          collector: runOptions.collector,
          onAssistantText: runOptions.onAssistantText,
        }),
      )
    }
    case LOOP_RUNTIME_OPENCODE: {
      const { createOpencodeLoopSession } = await import('./opencodeAgent.js')
      return withDisposableSession(createOpencodeLoopSession(ctx), (opencode) =>
        opencode.runPrompt(prompt, {
          verbose: runOptions.verbose,
          modelId: runOptions.modelId,
          assistantOutput: runOptions.assistantOutput,
          phase: runOptions.phase,
          collector: runOptions.collector,
          onAssistantText: runOptions.onAssistantText,
        }),
      )
    }
    case LOOP_RUNTIME_PI: {
      const { createPiLoopSession } = await import('./piAgent.js')
      return withDisposableSession(createPiLoopSession(ctx), (pi) =>
        pi.runPrompt(prompt, {
          verbose: runOptions.verbose,
          modelId: runOptions.modelId,
          assistantOutput: runOptions.assistantOutput,
          phase: runOptions.phase,
          reasoningEffort: runOptions.reasoningEffort,
          collector: runOptions.collector,
          onAssistantText: runOptions.onAssistantText,
        }),
      )
    }
    case LOOP_RUNTIME_CODEX: {
      const { createCodexLoopSession } = await import('./codexAgent.js')
      return withDisposableSession(createCodexLoopSession(ctx), (codex) =>
        codex.runPrompt(prompt, {
          verbose: runOptions.verbose,
          modelId: runOptions.modelId,
          assistantOutput: runOptions.assistantOutput,
          phase: runOptions.phase,
          collector: runOptions.collector,
          onAssistantText: runOptions.onAssistantText,
        }),
      )
    }
    case LOOP_RUNTIME_DSH: {
      const { createDshLoopSession } = await import('./dshAgent.js')
      return withDisposableSession(createDshLoopSession(ctx), (dsh) =>
        dsh.runPrompt(prompt, {
          verbose: runOptions.verbose,
          modelId: runOptions.modelId,
          assistantOutput: runOptions.assistantOutput,
          phase: runOptions.phase,
          collector: runOptions.collector,
          onAssistantText: runOptions.onAssistantText,
        }),
      )
    }
    case LOOP_RUNTIME_MUSE: {
      const { createMuseLoopSession } = await import('./museAgent.js')
      return withDisposableSession(createMuseLoopSession(ctx), (muse) =>
        muse.runPrompt(prompt, {
          verbose: runOptions.verbose,
          modelId: runOptions.modelId,
          assistantOutput: runOptions.assistantOutput,
          phase: runOptions.phase,
          reasoningEffort: runOptions.reasoningEffort,
          collector: runOptions.collector,
          onAssistantText: runOptions.onAssistantText,
        }),
      )
    }
    case LOOP_RUNTIME_CLAUDE: {
      const { createClaudeLoopSession } = await import('./claudeAgent.js')
      return withDisposableSession(createClaudeLoopSession(ctx), (claude) =>
        claude.runPrompt(prompt, {
          verbose: runOptions.verbose,
          modelId: runOptions.modelId,
          assistantOutput: runOptions.assistantOutput,
          phase: runOptions.phase,
          collector: runOptions.collector,
          onAssistantText: runOptions.onAssistantText,
        }),
      )
    }
    default: {
      const _exhaustive: never = agent
      return _exhaustive
    }
  }
}
