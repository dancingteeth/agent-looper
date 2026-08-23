import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'
import { runCursorAgentPrompt } from '../agents/cursorAgent.js'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  type ResolvedReviewAgent,
} from '../loop/loopAgentConfig.js'

export type ReviewAgentPromptOptions = {
  verbose?: boolean
}

/**
 * Run a single judge prompt on the configured review runtime
 * (cursor | cline-pass | cline | opencode | pi | codex | dsh).
 * Used for primary residual review and optional secondary review.
 */
export async function runReviewAgentPrompt(
  ctx: RepoContext,
  prompt: string,
  agent: ResolvedReviewAgent,
  options: ReviewAgentPromptOptions = {},
): Promise<AgentRunResult> {
  switch (agent.runtime) {
    case LOOP_RUNTIME_CURSOR:
      return runCursorAgentPrompt(ctx, prompt, {
        verbose: options.verbose,
        assistantOutput: 'none',
        modelId: agent.model,
        role: 'review',
        phase: 'review',
      })
    case LOOP_RUNTIME_CLINE_PASS:
    case LOOP_RUNTIME_CLINE: {
      const { createClineLoopSession } = await import('../agents/clineAgent.js')
      const cline = await createClineLoopSession(ctx)
      try {
        return await cline.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          providerId: agent.runtime,
          assistantOutput: 'none',
          phase: 'review',
          reasoningEffort: agent.reasoningEffort,
        })
      } finally {
        await cline.dispose()
      }
    }
    case LOOP_RUNTIME_OPENCODE: {
      const { createOpencodeLoopSession } = await import('../agents/opencodeAgent.js')
      const opencode = await createOpencodeLoopSession(ctx)
      try {
        return await opencode.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: 'review',
        })
      } finally {
        await opencode.dispose()
      }
    }
    case LOOP_RUNTIME_PI: {
      const { createPiLoopSession } = await import('../agents/piAgent.js')
      const pi = await createPiLoopSession(ctx)
      try {
        return await pi.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: 'review',
        })
      } finally {
        await pi.dispose()
      }
    }
    case LOOP_RUNTIME_CODEX: {
      const { createCodexLoopSession } = await import('../agents/codexAgent.js')
      const codex = await createCodexLoopSession(ctx)
      try {
        return await codex.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: 'review',
        })
      } finally {
        await codex.dispose()
      }
    }
    case LOOP_RUNTIME_DSH: {
      const { createDshLoopSession } = await import('../agents/dshAgent.js')
      const dsh = await createDshLoopSession(ctx)
      try {
        return await dsh.runPrompt(prompt, {
          verbose: options.verbose,
          modelId: agent.model,
          assistantOutput: 'none',
          phase: 'review',
        })
      } finally {
        await dsh.dispose()
      }
    }
    default: {
      const _exhaustive: never = agent
      return _exhaustive
    }
  }
}
