import type { ParsedSkill } from './skills.js'

export function agentLooperSystemSection(skills: ParsedSkill[]): string {
  const index = skills.map((skill) => `- \`${skill.name}\`: ${skill.description}`).join('\n')
  return [
    '## Agent Looper (plugin loaded)',
    'Agent Looper is a fix-until-green harness: a frozen `GOAL.md` + `verify.sh` finish line, a worker runtime, and a judge.',
    'This session designs and freezes loops and starts the harness. Shell `verify` is the finish line, not your own judgment.',
    'Start grinds with the `agent_loop_start` tool, never `agent-loop run` in bash (it times out). Check them with `agent_loop_status`.',
    'Load guidance with the `agent_looper_skill` tool before designing, installing, reviewing, or checking loops:',
    index,
  ].join('\n')
}

export const LOOP_SCAFFOLD_TEMPLATE = [
  'Scaffold one Agent Looper bundle under `.cursor/loops/<name>/` in this repo. $ARGUMENTS',
  '',
  '1. Load skill `run-loop-in-opencode` (install section) via `agent_looper_skill` and confirm `pnpm exec agent-loop --help` works.',
  '2. Load skill `design-loop`. Pick a short kebab-case name.',
  '3. If the repo has no `.cursor/agent-loop.repo.json`, run `pnpm exec agent-loop-init`.',
  '4. Write GOAL.md (goal, acceptance criteria, constraints, out of scope), a verify.sh that exits 0 only on real success, and loop.json with `verify`.',
  '5. Stop after freeze and say the bundle is ready. Only call `agent_loop_start` if the user asked to run it.',
].join('\n')
