import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from './index.js'
import { isAgentLoopRunCommand, isBashRunInBackground, isSecretDumpCommand, nestedAgentLoopRunReason, secretDumpReason } from './nested-run.js'
import { AGENT_LOOPER_PROMPT_NAME, agentLooperPromptSection } from './prompt.js'
import { discoverSkills, parseSkillFile, pluginRoot, resolveSkillsDir } from './skills.js'

function mockCtx() {
  const registeredSkills: Array<{ name: string; description: string; content: string }> = []
  const registeredCommands: Array<{ name: string; description: string; handler: Function }> = []
  const sections: Array<{ name: string; order: number; text: string }> = []
  const guards: Array<(execution: { name: string; arguments: unknown }) => string | undefined> = []

  const ctx = {
    skills: {
      register: vi.fn((skill) => {
        registeredSkills.push(skill)
        return () => {}
      }),
    },
    commands: {
      register: vi.fn((command) => {
        registeredCommands.push(command)
        return () => {}
      }),
    },
    systemPrompt: {
      section: vi.fn((section) => {
        sections.push(section)
        return () => {}
      }),
    },
    tools: {
      guard: vi.fn((guard) => {
        guards.push(guard)
        return () => {}
      }),
    },
  }

  return { ctx, registeredSkills, registeredCommands, sections, guards }
}

describe('dsh-agent-looper plugin', () => {
  it('exports named plugin surface', () => {
    expect(name).toBe('agent-looper')
    expect(inject).toEqual(['skills', 'commands', 'systemPrompt', 'tools'])
    expect(typeof apply).toBe('function')
  })

  it('registers companion skills, prompt, guard, and loop-scaffold via ctx', () => {
    const { ctx, registeredSkills, registeredCommands, sections, guards } = mockCtx()

    apply(ctx, {
      skillsDir: './skills',
      agentLoopBinary: 'agent-loop',
      blockNestedRun: true,
    })

    expect(ctx.systemPrompt.section).toHaveBeenCalledTimes(1)
    expect(sections[0]?.name).toBe(AGENT_LOOPER_PROMPT_NAME)
    expect(sections[0]?.text).toBe(agentLooperPromptSection)
    expect(sections[0]?.text).not.toMatch(/\{\{/)
    expect(sections[0]?.text).toMatch(/danger-full-access/)

    expect(ctx.tools.guard).toHaveBeenCalledTimes(1)
    expect(guards[0]?.({ name: 'bash', arguments: { command: 'agent-loop run .cursor/loops/x' } })).toMatch(
      /Blocked/,
    )
    expect(
      guards[0]?.({
        name: 'bash',
        arguments: { command: 'agent-loop run .cursor/loops/x', run_in_background: true },
      }),
    ).toBeUndefined()
    expect(guards[0]?.({ name: 'bash', arguments: { command: 'agent-loop --help' } })).toBeUndefined()
    expect(guards[0]?.({ name: 'bash', arguments: { command: 'doppler secrets' } })).toMatch(/Blocked/)

    expect(ctx.skills.register).toHaveBeenCalledTimes(4)
    expect(registeredSkills.map((s) => s.name).sort()).toEqual([
      'design-loop',
      'install-agent-looper',
      'review-gate',
      'run-loop-in-dsh',
    ])
    for (const skill of registeredSkills) {
      expect(skill.description.length).toBeGreaterThan(0)
      expect(skill.content.length).toBeGreaterThan(0)
    }

    expect(ctx.commands.register).toHaveBeenCalledTimes(1)
    const command = registeredCommands[0]
    if (!command) throw new Error('expected loop-scaffold registration')
    expect(command.name).toBe('loop-scaffold')
    expect(command.description.toLowerCase()).toContain('agent looper')
    expect(command.description.toLowerCase()).toMatch(/goal|verify|scaffold/)

    const result = command.handler({ rawInput: ' my-loop ' } as never)
    expect(result.kind).toBe('success')
    expect(result.text).toContain('GOAL.md')
    expect(result.text).toContain('verify.sh')
    expect(result.text).toContain('my-loop')
    expect(result.text).toMatch(/run_in_background/)
    expect(result.text).toMatch(/Full Access/)
    expect(result.text).toMatch(/--project/)
  })

  it('still guards secret dumps when blockNestedRun is false', () => {
    const { ctx, guards } = mockCtx()
    apply(ctx, {
      skillsDir: './skills',
      agentLoopBinary: 'agent-loop',
      blockNestedRun: false,
    })
    expect(ctx.tools.guard).toHaveBeenCalledTimes(1)
    expect(guards[0]?.({ name: 'bash', arguments: { command: 'agent-loop run x' } })).toBeUndefined()
    expect(guards[0]?.({ name: 'bash', arguments: { command: 'doppler secrets' } })).toMatch(/Blocked/)
  })

  it('parses bundled SKILL.md frontmatter', () => {
    const sample = `---
name: design-loop
description: Design loops.
---
# Body
`
    const parsed = parseSkillFile('/tmp/SKILL.md', sample)
    expect(parsed?.name).toBe('design-loop')
    expect(parsed?.description).toBe('Design loops.')
    expect(parsed?.content).toContain('# Body')
  })

  it('discovers the companion skills from the package', () => {
    const skillsDir = resolveSkillsDir('./skills', path.join(pluginRoot, '..'))
    const names = discoverSkills(skillsDir).map((s) => s.name)
    expect(names).toEqual([
      'design-loop',
      'install-agent-looper',
      'review-gate',
      'run-loop-in-dsh',
    ])
  })
})

describe('nested agent-loop run detection', () => {
  it('matches grind invocations and ignores help', () => {
    expect(isAgentLoopRunCommand('pnpm exec agent-loop run .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('npx agent-loop run foo')).toBe(true)
    expect(isAgentLoopRunCommand('pnpm run agent:loop')).toBe(true)
    expect(isAgentLoopRunCommand('node dist/cli/run.js .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('pnpm exec node dist/cli/run.js .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('node dist/cli/run.js --help')).toBe(false)
    expect(isAgentLoopRunCommand('node dist/cli/run.js')).toBe(false)
    expect(isAgentLoopRunCommand('agent-loop --help')).toBe(false)
    expect(isAgentLoopRunCommand('agent-loop-init')).toBe(false)
    expect(isAgentLoopRunCommand("cat > package.json <<'EOF'\n\"agent:loop\": \"agent-loop run\"\nEOF")).toBe(
      false,
    )
  })

  it('only guards bash grind commands', () => {
    expect(nestedAgentLoopRunReason('read', { path: '/tmp' })).toBeUndefined()
    expect(nestedAgentLoopRunReason('bash', { command: 'ls' })).toBeUndefined()
    expect(nestedAgentLoopRunReason('bash', { command: 'agent-loop run x' })).toMatch(/foreground/)
    expect(
      nestedAgentLoopRunReason('bash', { command: 'node dist/cli/run.js .cursor/loops/x' }),
    ).toMatch(/foreground/)
    expect(
      nestedAgentLoopRunReason('bash', {
        command: 'node dist/cli/run.js .cursor/loops/x',
        run_in_background: true,
      }),
    ).toBeUndefined()
    expect(
      nestedAgentLoopRunReason('bash', { command: 'agent-loop run x', run_in_background: true }),
    ).toBeUndefined()
    expect(isBashRunInBackground({ command: 'agent-loop run x', run_in_background: true })).toBe(true)
    expect(isBashRunInBackground({ command: 'agent-loop run x' })).toBe(false)
  })

  it('blocks secret dumps without treating heredoc docs as dumps', () => {
    expect(isSecretDumpCommand('doppler secrets')).toBe(true)
    expect(isSecretDumpCommand('cat ~/.doppler/.doppler.yaml')).toBe(true)
    expect(isSecretDumpCommand('python3 -c "open(\'$HOME/.local/share/opencode/auth.json\')"')).toBe(true)
    expect(isSecretDumpCommand('DOPPLER_TOKEN=x doppler run -- true')).toBe(true)
    expect(
      isSecretDumpCommand(
        "GO_KEY=$(grep -E '^OPENCODE_GO_API_KEY:' /Users/me/.dsh/.credentials.yaml | sed 's/.*: //')",
      ),
    ).toBe(true)
    expect(isSecretDumpCommand('doppler run --project agent-looper --config dev -- agent-check opencode')).toBe(
      false,
    )
    expect(secretDumpReason('bash', { command: 'doppler secrets get OPENCODE_API_KEY' })).toMatch(/Blocked/)
    expect(
      secretDumpReason('bash', { command: 'cat /Users/me/.dsh/.credentials.yaml' }),
    ).toMatch(/Blocked/)
  })
})
