import type { Plugin } from '@opencode-ai/plugin'
import { createAgentLooperHooks } from './plugin.js'
import { setupV2, type V2Context } from './v2.js'

const server: Plugin = async (input, options) => createAgentLooperHooks(input, options)

/**
 * One default export for both hosts: OpenCode 1.x reads `{ id, server }`, 2.x reads `{ id, setup }`.
 * No named exports — the 1.x legacy loader calls every exported function as a plugin.
 */
export default {
  id: 'agent-looper',
  server,
  setup: (ctx: V2Context) => setupV2(ctx),
}
