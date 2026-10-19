import type { Hooks, PluginInput, PluginOptions } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin'
import { createLooperCore, isHarnessWorker, readOptions, TOOL_DESCRIPTIONS } from './core.js'
import { foregroundRunReason } from './guard.js'
import { agentLooperSystemSection, LOOP_SCAFFOLD_TEMPLATE } from './prompt.js'
import type { SpawnFn } from './run.js'

/** OpenCode 1.x hooks. Testable factory; `index.ts` wires it as `server`. */
export function createAgentLooperHooks(
  input: Pick<PluginInput, 'directory' | 'worktree'>,
  options?: PluginOptions,
  deps: { env?: NodeJS.ProcessEnv; spawnImpl?: SpawnFn } = {},
): Hooks {
  const config = readOptions(options)
  const core = createLooperCore(config, deps)
  const worktree = input.worktree || input.directory

  const guard: Hooks['tool.execute.before'] = async (call, output) => {
    if (!config.blockNestedRun) return
    const reason = foregroundRunReason(call.tool, output.args)
    if (reason) throw new Error(reason)
  }

  // Harness-spawned worker: keep the guard (no nested grinds) but hide orchestration tools and prompt.
  if (isHarnessWorker(deps.env ?? process.env)) {
    return { 'tool.execute.before': guard }
  }

  return {
    config: async (cfg) => {
      cfg.command ??= {}
      cfg.command['loop-scaffold'] ??= {
        description: 'Scaffold an Agent Looper bundle (GOAL.md, verify.sh, loop.json)',
        template: LOOP_SCAFFOLD_TEMPLATE,
      }
    },

    tool: {
      agent_looper_skill: tool({
        description: TOOL_DESCRIPTIONS.skill(core.skills),
        args: { name: tool.schema.string().describe('Skill name') },
        async execute({ name }) {
          return core.skillText(name)
        },
      }),

      agent_loop_start: tool({
        description: TOOL_DESCRIPTIONS.start,
        args: {
          loopDir: tool.schema.string().describe(TOOL_DESCRIPTIONS.loopDir),
          extraArgs: tool.schema.array(tool.schema.string()).optional().describe(TOOL_DESCRIPTIONS.extraArgs),
        },
        async execute({ loopDir, extraArgs }, ctx) {
          return core.startText({ directory: ctx.directory, worktree: ctx.worktree || worktree, loopDir, extraArgs })
        },
      }),

      agent_loop_status: tool({
        description: TOOL_DESCRIPTIONS.status,
        args: { loopDir: tool.schema.string().describe(TOOL_DESCRIPTIONS.loopDir) },
        async execute({ loopDir }, ctx) {
          return core.statusText({ directory: ctx.directory, worktree: ctx.worktree || worktree, loopDir })
        },
      }),
    },

    'tool.execute.before': guard,

    'experimental.chat.system.transform': async (_input, output) => {
      output.system.push(agentLooperSystemSection(core.skills))
    },
  }
}
