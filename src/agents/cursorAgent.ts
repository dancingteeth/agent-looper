import path from 'node:path'
import { Agent, CursorAgentError, JsonlLocalAgentStore } from '@cursor/sdk'
import type { RepoContext } from '../context/repoContext.js'
import { printRunStream } from '../stream/streamRun.js'

export type CursorAgentRunOptions = {
  verbose?: boolean
  modelId?: 'composer-2.5'
  assistantOutput?: 'stdout' | 'none'
}

function requireApiKey(): string {
  const apiKey = process.env.CURSOR_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY is not set. Run via doppler or agent-check cursor')
  }
  return apiKey
}

export async function runCursorAgentPrompt(
  ctx: RepoContext,
  prompt: string,
  options: CursorAgentRunOptions = {},
): Promise<string> {
  const apiKey = requireApiKey()
  const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
  const storeDir = path.join(ctx.repoRoot, '.cursor', 'sdk-runs')
  const store = new JsonlLocalAgentStore(storeDir)

  const agentOptions = {
    apiKey,
    model: { id: options.modelId ?? ('composer-2.5' as const) },
    local: {
      cwd: ctx.repoRoot,
      autoReview: true,
      store,
    },
  }

  try {
    await using agent = await Agent.create(agentOptions)
    const run = await agent.send(prompt)
    console.error(`[agent-loop:cursor] run_id=${run.id} agent_id=${run.agentId}`)
    await printRunStream(run.stream(), {
      verbose,
      assistantOutput: options.assistantOutput ?? 'stdout',
    })
    const result = await run.wait()

    if (result.status === 'error') {
      throw new Error('Cursor agent run failed (status=error)')
    }
    if (result.status === 'cancelled') {
      throw new Error('Cursor agent run cancelled')
    }

    const text = result.result?.trim()
    if (!text) {
      throw new Error('Cursor agent returned empty result')
    }
    return text
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor SDK error: ${err.message}`)
    }
    throw err
  }
}
