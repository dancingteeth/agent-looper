import type { RepoContext } from '../context/repoContext.js'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  type ResolvedLoopAgent,
  type ResolvedReviewAgent,
} from '../loop/loopAgentConfig.js'
import type { AgentRunResult } from './agentRunResult.js'
import { runCursorAgentPrompt } from './cursorAgent.js'

export type OneShotAgent = ResolvedLoopAgent | ResolvedReviewAgent

export type OneShotAgentPhase = 'review' | 'verify'

export type OneShotAgentPromptOptions = {
  phase: OneShotAgentPhase
  verbose?: boolean
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
 * Used by skill-verify and residual review — not the long-lived worker
 * (`createLoopAgentSession`), which must survive iterations and OpenCode recycle.
 */
export async function runOneShotAgentPrompt(
  ctx: RepoContext,
  prompt: string,
  agent: OneShotAgent,
  options: OneShotAgentPromptOptions,
): Promise<AgentRunResult> {
  switch (agent.runtime) {
    case LOOP_RUNTIME_CURSOR:
      return runCursorAgentPrompt(ctx, prompt, {
        verbose: options.verbose,
        modelId: agent.model,
        role: options.phase === 'review' ? 'review' : 'worker',
        assistantOutput: 'none',
        phase: options.phase,
      })
    case LOOP_RUNTIME_CLINE_PASS:
    case LOOP_RUNTIME_CLINE: {
      const { createClineLoopSession } = await import('./clineAgent.js')
      return withDisposableSession(createClineLoopSession(ctx), (cline) =>
        cline.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          providerId: agent.runtime,
          assistantOutput: 'none',
          phase: options.phase,
          reasoningEffort: agent.reasoningEffort,
        }),
      )
    }
    case LOOP_RUNTIME_OPENCODE: {
      const { createOpencodeLoopSession } = await import('./opencodeAgent.js')
      return withDisposableSession(createOpencodeLoopSession(ctx), (opencode) =>
        opencode.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: options.phase,
        }),
      )
    }
    case LOOP_RUNTIME_PI: {
      const { createPiLoopSession } = await import('./piAgent.js')
      return withDisposableSession(createPiLoopSession(ctx), (pi) =>
        pi.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: options.phase,
          reasoningEffort: agent.reasoningEffort,
        }),
      )
    }
    case LOOP_RUNTIME_CODEX: {
      const { createCodexLoopSession } = await import('./codexAgent.js')
      return withDisposableSession(createCodexLoopSession(ctx), (codex) =>
        codex.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: options.phase,
        }),
      )
    }
    case LOOP_RUNTIME_DSH: {
      const { createDshLoopSession } = await import('./dshAgent.js')
      return withDisposableSession(createDshLoopSession(ctx), (dsh) =>
        dsh.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: options.phase,
        }),
      )
    }
    case LOOP_RUNTIME_MUSE: {
      const { createMuseLoopSession } = await import('./museAgent.js')
      return withDisposableSession(createMuseLoopSession(ctx), (muse) =>
        muse.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: options.phase,
          reasoningEffort: agent.reasoningEffort,
        }),
      )
    }
    default: {
      const _exhaustive: never = agent
      return _exhaustive
    }
  }
}
