import type { RepoContext } from '../context/repoContext.js'
import { runCursorAgentPrompt } from './cursorAgent.js'
import type { AgentRunResult } from './agentRunResult.js'
import {
  isClineSdkRuntime,
  isOpencodeRuntime,
  isPiRuntime,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  resolveLoopAgent,
  type LoopRuntime,
  type ResolvedLoopAgent,
} from '../loop/loopAgentConfig.js'
import type { LoopConfig } from '../loop/loopConfig.js'
// Type-only — erased at emit; keeps Cursor-only installs free of optional SDKs.
import type { ClineLoopSession } from './clineAgent.js'
import type { OpencodeLoopSession } from './opencodeAgent.js'
import type { PiLoopSession } from './piAgent.js'

import type { StreamCollector } from '../stream/streamCollect.js'

export type AgentPromptOptions = {
  verbose?: boolean
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
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
  /**
   * Optional: tear down and recreate the worker backend (OpenCode local server).
   * Used on transport retries — new sessions on a wedged server still fail.
   */
  recycle?: () => Promise<void>
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
      role: 'worker',
      assistantOutput: options.assistantOutput,
      phase: options.phase ?? 'implement',
      collector: options.collector,
    })
  }
}

function createClineRunner(cline: ClineLoopSession): PromptRunner {
  return (prompt, agent, options) => {
    if (!isClineSdkRuntime(agent.runtime)) {
      throw new Error('Cline runner invoked for non-Cline agent')
    }
    return cline.runPrompt(prompt, {
      verbose: options.verbose,
      modelId: agent.model,
      providerId: agent.runtime,
      assistantOutput: options.assistantOutput,
      phase: options.phase ?? 'implement',
      reasoningEffort: agent.reasoningEffort,
      collector: options.collector,
    })
  }
}

function createOpencodeRunner(opencode: OpencodeLoopSession): PromptRunner {
  return (prompt, agent, options) => {
    if (!isOpencodeRuntime(agent.runtime)) {
      throw new Error('OpenCode runner invoked for non-opencode agent')
    }
    return opencode.runPrompt(prompt, {
      verbose: options.verbose,
      modelId: agent.model,
      assistantOutput: options.assistantOutput,
      phase: options.phase ?? 'implement',
      collector: options.collector,
    })
  }
}

function createPiRunner(pi: PiLoopSession): PromptRunner {
  return (prompt, agent, options) => {
    if (!isPiRuntime(agent.runtime)) {
      throw new Error('Pi runner invoked for non-pi agent')
    }
    return pi.runPrompt(prompt, {
      verbose: options.verbose,
      modelId: agent.model,
      assistantOutput: options.assistantOutput,
      phase: options.phase ?? 'implement',
      collector: options.collector,
    })
  }
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

  if (runtime === LOOP_RUNTIME_OPENCODE) {
    // Dynamic import: @opencode-ai/sdk is an optional peer.
    const { createOpencodeLoopSession } = await import('./opencodeAgent.js')
    let opencode = await createOpencodeLoopSession(ctx)
    let runner = createOpencodeRunner(opencode)
    return {
      runIterationPrompt: (prompt, agent, options) => runner(prompt, agent, options),
      recycle: async () => {
        console.error('[agent-loop:opencode] recycling local server after transport error')
        await opencode.dispose()
        opencode = await createOpencodeLoopSession(ctx)
        runner = createOpencodeRunner(opencode)
      },
      dispose: () => opencode.dispose(),
    }
  }

  if (runtime === LOOP_RUNTIME_PI) {
    const { createPiLoopSession } = await import('./piAgent.js')
    const pi = await createPiLoopSession(ctx)
    const runner = createPiRunner(pi)
    return {
      runIterationPrompt: (prompt, agent, options) => runner(prompt, agent, options),
      dispose: () => pi.dispose(),
    }
  }

  // Dynamic import: @cline/sdk is an optional peer. Cursor-only consumers must not
  // load clineAgent (and thus @cline/sdk) at module evaluation time.
  const { createClineLoopSession } = await import('./clineAgent.js')
  const cline = await createClineLoopSession(ctx)
  const runner = createClineRunner(cline)
  return {
    runIterationPrompt: (prompt, agent, options) => runner(prompt, agent, options),
    dispose: () => cline.dispose(),
  }
}

export function loopRuntimeLabel(runtime: LoopRuntime): string {
  switch (runtime) {
    case LOOP_RUNTIME_CURSOR:
      return 'cursor'
    case LOOP_RUNTIME_CLINE_PASS:
      return 'cline-pass'
    case LOOP_RUNTIME_CLINE:
      return 'cline'
    case LOOP_RUNTIME_OPENCODE:
      return 'opencode'
    case LOOP_RUNTIME_PI:
      return 'pi'
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}
