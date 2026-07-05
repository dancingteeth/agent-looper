import type { RepoContext } from '../context/repoContext.js'
import { createClineLoopSession, type ClineLoopSession } from './clineAgent.js'
import { runCursorAgentPrompt } from './cursorAgent.js'
import type { AgentRunResult } from './agentRunResult.js'
import {
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  resolveLoopAgent,
  type LoopRuntime,
  type ResolvedLoopAgent,
} from '../loop/loopAgentConfig.js'
import type { LoopConfig } from '../loop/loopConfig.js'

export type AgentPromptOptions = {
  verbose?: boolean
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review'
}

type PromptRunner = (
  prompt: string,
  agent: ResolvedLoopAgent,
  options: AgentPromptOptions,
) => Promise<AgentRunResult>

export type LoopAgentSession = {
  runIterationPrompt(
    prompt: string,
    agent: ResolvedLoopAgent,
    options: AgentPromptOptions,
  ): Promise<AgentRunResult>
  dispose(): Promise<void>
}

function createCursorRunner(ctx: RepoContext): PromptRunner {
  return (prompt, agent, options) => {
    if (agent.runtime !== LOOP_RUNTIME_CURSOR) {
      throw new Error('Cursor runner invoked for non-cursor agent')
    }
    return runCursorAgentPrompt(ctx, prompt, {
      verbose: options.verbose,
      modelId: agent.model,
      assistantOutput: options.assistantOutput,
    })
  }
}

function createClineRunner(cline: ClineLoopSession): PromptRunner {
  return (prompt, agent, options) =>
    cline.runPrompt(prompt, {
      verbose: options.verbose,
      modelId: agent.model,
      assistantOutput: options.assistantOutput,
      phase: options.phase ?? 'implement',
    })
}

export async function createLoopAgentSession(
  config: LoopConfig,
  ctx: RepoContext,
): Promise<LoopAgentSession> {
  const { runtime } = resolveLoopAgent(config)

  if (runtime === LOOP_RUNTIME_CURSOR) {
    const runner = createCursorRunner(ctx)
    return {
      runIterationPrompt: (prompt, agent, options) => runner(prompt, agent, options),
      dispose: async () => undefined,
    }
  }

  const cline = await createClineLoopSession(ctx)
  const runner = createClineRunner(cline)
  return {
    runIterationPrompt: (prompt, agent, options) => runner(prompt, agent, options),
    dispose: () => cline.dispose(),
  }
}

export function loopRuntimeLabel(runtime: LoopRuntime): string {
  return runtime === LOOP_RUNTIME_CLINE_PASS ? 'cline-pass' : 'cursor'
}
