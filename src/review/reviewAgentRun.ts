import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'
import { runOneShotAgentPrompt } from '../agents/oneShotAgentRun.js'
import type { ResolvedReviewAgent } from '../loop/loopAgentConfig.js'

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
  return runOneShotAgentPrompt(ctx, prompt, agent, {
    phase: 'review',
    verbose: options.verbose,
  })
}
