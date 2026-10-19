import path from 'node:path'
import { grindStatus, heartbeat, startGrind, type SpawnFn } from './run.js'
import { defaultSkillsDir, discoverSkills, pluginRoot, type ParsedSkill } from './skills.js'

export type AgentLooperOptions = {
  skillsDir?: string
  agentLoopBinary?: string
  /** Default true: deny foreground `agent-loop run` in the bash / shell tool. */
  blockNestedRun: boolean
}

export function readOptions(options: Readonly<Record<string, unknown>> | undefined): AgentLooperOptions {
  const raw = options ?? {}
  return {
    skillsDir: typeof raw.skillsDir === 'string' ? raw.skillsDir : undefined,
    agentLoopBinary: typeof raw.agentLoopBinary === 'string' ? raw.agentLoopBinary : undefined,
    blockNestedRun: raw.blockNestedRun !== false,
  }
}

/** Harness-spawned `opencode serve` (see AGENT_LOOP_WORKER_ENV in the harness). */
export function isHarnessWorker(env: NodeJS.ProcessEnv): boolean {
  return env.AGENT_LOOP_WORKER === '1'
}

export const TOOL_DESCRIPTIONS = {
  skill: (skills: ParsedSkill[]) => `Load Agent Looper guidance. Skills: ${skills.map((s) => s.name).join(', ')}.`,
  start:
    'Start `agent-loop run <loopDir>` detached (survives shell timeouts). Returns pid and log path immediately. Only after the bundle is frozen and the user asked to run it.',
  status: 'Report whether an Agent Looper grind is running, dead, or done, with the log tail and the runtime-agnostic heartbeat.',
  loopDir: 'Loop bundle dir, e.g. .cursor/loops/my-task',
  extraArgs: 'Extra CLI flags, e.g. ["--max-iterations","5"]',
} as const

/** Host-agnostic tool bodies shared by the OpenCode 1.x and 2.x adapters. */
export function createLooperCore(options: AgentLooperOptions, deps: { spawnImpl?: SpawnFn } = {}) {
  const skillsDir = options.skillsDir ? path.resolve(pluginRoot(), options.skillsDir) : defaultSkillsDir()
  const skills = discoverSkills(skillsDir)

  return {
    skills,
    skillsDir,

    skillText(name: string): string {
      const skill = skills.find((s) => s.name === name)
      if (!skill) return `Unknown skill "${name}". Available: ${skills.map((s) => s.name).join(', ')}`
      return `Skill dir: ${path.dirname(skill.path)}\n\n${skill.content}`
    },

    startText(input: { directory: string; worktree: string; loopDir: string; extraArgs?: string[] }): string {
      const result = startGrind({ ...input, binary: options.agentLoopBinary, spawnImpl: deps.spawnImpl })
      if (!result.ok) return result.error
      return `Started: ${result.command}\npid: ${result.pid}\nlog: ${result.logPath}\nCheck later with agent_loop_status; do not busy-poll.`
    },

    async statusText(input: { directory: string; worktree: string; loopDir: string }): Promise<string> {
      const status = grindStatus({ directory: input.directory, loopDir: input.loopDir })
      const beat = await heartbeat({ skillsDir, worktree: input.worktree })
      return beat ? `${status}\n--- heartbeat ---\n${beat}` : status
    },
  }
}
