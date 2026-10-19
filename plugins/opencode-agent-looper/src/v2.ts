import { createLooperCore, isHarnessWorker, readOptions, TOOL_DESCRIPTIONS } from './core.js'
import { foregroundRunReason } from './guard.js'
import type { SpawnFn } from './run.js'

/**
 * The slice of the OpenCode 2.x promise plugin context (`@opencode/plugin` `Plugin.Context`) this
 * adapter uses. Typed locally so the package does not pull `effect` / OpenTUI peers into 1.x hosts.
 */
type Transform<Editor> = (callback: (editor: Editor) => void) => Promise<unknown>

type V2Tool = {
  name: string
  description: string
  input: Record<string, unknown>
  execute: (input: Record<string, unknown>) => Promise<{ content: string }>
}

export type V2Context = {
  readonly location: { readonly directory: string; readonly project?: { readonly directory?: string } }
  readonly options: Readonly<Record<string, unknown>>
  readonly skill: {
    transform: Transform<{
      get(id: string): unknown
      add(skill: { id: string; name: string; description?: string; path: string; content: string }): void
    }>
  }
  readonly tool: {
    transform: Transform<{ add(tool: V2Tool): void }>
    hook: (name: 'execute.before', callback: (event: { tool: string; input: unknown }) => void | Promise<void>) => Promise<unknown>
  }
}

const LOOP_DIR_SCHEMA = { type: 'string', description: TOOL_DESCRIPTIONS.loopDir }

/**
 * OpenCode 2.x setup: same skills, tools, and foreground-grind guard as the 1.x `server` hooks,
 * through the 2.x editors. (`/loop-scaffold` is 1.x-only: 2.x commands are imperative handlers.)
 */
export async function setupV2(
  ctx: V2Context,
  deps: { env?: NodeJS.ProcessEnv; spawnImpl?: SpawnFn } = {},
): Promise<void> {
  const config = readOptions(ctx.options)

  if (config.blockNestedRun) {
    await ctx.tool.hook('execute.before', (event) => {
      const reason = foregroundRunReason(event.tool, event.input)
      if (reason) throw new Error(reason)
    })
  }

  // Harness-spawned worker: keep the guard (no nested grinds) but do not teach it to start grinds.
  if (isHarnessWorker(deps.env ?? process.env)) return

  const core = createLooperCore(config, deps)
  const directory = ctx.location.directory
  const worktree = ctx.location.project?.directory || directory

  await ctx.skill.transform((editor) => {
    for (const skill of core.skills) {
      if (editor.get(skill.name)) continue
      editor.add({ id: skill.name, name: skill.name, description: skill.description, path: skill.path, content: skill.content })
    }
  })

  await ctx.tool.transform((editor) => {
    editor.add({
      name: 'agent_looper_skill',
      description: TOOL_DESCRIPTIONS.skill(core.skills),
      input: { type: 'object', properties: { name: { type: 'string', description: 'Skill name' } }, required: ['name'] },
      execute: async (input) => ({ content: core.skillText(String(input.name)) }),
    })
    editor.add({
      name: 'agent_loop_start',
      description: TOOL_DESCRIPTIONS.start,
      input: {
        type: 'object',
        properties: {
          loopDir: LOOP_DIR_SCHEMA,
          extraArgs: { type: 'array', items: { type: 'string' }, description: TOOL_DESCRIPTIONS.extraArgs },
        },
        required: ['loopDir'],
      },
      execute: async (input) => ({
        content: core.startText({
          directory,
          worktree,
          loopDir: String(input.loopDir),
          extraArgs: Array.isArray(input.extraArgs) ? input.extraArgs.map(String) : undefined,
        }),
      }),
    })
    editor.add({
      name: 'agent_loop_status',
      description: TOOL_DESCRIPTIONS.status,
      input: { type: 'object', properties: { loopDir: LOOP_DIR_SCHEMA }, required: ['loopDir'] },
      execute: async (input) => ({ content: await core.statusText({ directory, worktree, loopDir: String(input.loopDir) }) }),
    })
  })
}
