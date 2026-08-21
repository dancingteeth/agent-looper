import Schema from '@deepseek-ai/schemastery'
import path from 'node:path'
import { loopScaffoldGuidance } from './loop-scaffold.js'
import { nestedAgentLoopRunReason, secretDumpReason } from './nested-run.js'
import { AGENT_LOOPER_PROMPT_NAME, AGENT_LOOPER_PROMPT_ORDER, agentLooperPromptSection } from './prompt.js'
import { discoverSkills, pluginRoot, resolveSkillsDir } from './skills.js'

/** DSH injects services after `inject` resolves; Cordis `Context` does not declare them. */
export type AgentLooperContext = {
  skills: {
    register: (skill: {
      name: string
      description: string
      content: string
      path: string
      source: string
    }) => unknown
  }
  commands: {
    register: (command: {
      name: string
      description: string
      handler: (invocation: { rawInput: string }) => { kind: 'success'; text: string }
    }) => unknown
  }
  systemPrompt: {
    section: (section: { name: string; order: number; text: string }) => unknown
  }
  tools: {
    guard: (guard: (execution: { name: string; arguments: unknown }) => string | undefined) => unknown
  }
}

export const name = 'agent-looper'

export interface Config {
  skillsDir: string
  agentLoopBinary: string
  /** When true (default), deny *foreground* `agent-loop run`. Background bash jobs are allowed. */
  blockNestedRun: boolean
}

export const Config: Schema<Config> = Schema.object({
  skillsDir: Schema.string().default('./skills'),
  agentLoopBinary: Schema.string().default('agent-loop'),
  blockNestedRun: Schema.boolean().default(true),
})

export const inject = ['skills', 'commands', 'systemPrompt', 'tools'] as const

export function apply(ctx: AgentLooperContext, config: Config) {
  ctx.systemPrompt.section({
    name: AGENT_LOOPER_PROMPT_NAME,
    order: AGENT_LOOPER_PROMPT_ORDER,
    text: agentLooperPromptSection,
  })

  ctx.tools.guard((execution) => {
    const secret = secretDumpReason(execution.name, execution.arguments)
    if (secret !== undefined) return secret
    if (!config.blockNestedRun) return undefined
    return nestedAgentLoopRunReason(execution.name, execution.arguments)
  })

  const skillsDir = resolveSkillsDir(config.skillsDir, path.join(pluginRoot, '..'))
  const skills = discoverSkills(skillsDir)

  for (const skill of skills) {
    ctx.skills.register({
      name: skill.name,
      description: skill.description,
      path: skill.path,
      source: 'bundled',
      content: skill.content,
    })
  }

  ctx.commands.register({
    name: 'loop-scaffold',
    description:
      'Scaffold a new Agent Looper bundle (GOAL.md, verify.sh, loop.json) — GOAL + shell verify finish line.',
    handler(invocation: { rawInput: string }) {
      return {
        kind: 'success',
        text: loopScaffoldGuidance(config.agentLoopBinary, invocation.rawInput),
      }
    },
  })
}
