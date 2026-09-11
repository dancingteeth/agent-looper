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
  const warnings: string[] = []
  const disposers: Array<() => void> = []
  const released: string[] = []
  let seq = 0

  const track = (kind: string) => {
    const tag = `${kind}#${++seq}`
    return () => released.push(tag)
  }

  const ctx = {
    skills: {
      register: vi.fn((skill) => {
        registeredSkills.push(skill)
        return track('skill')
      }),
    },
    commands: {
      register: vi.fn((command) => {
        registeredCommands.push(command)
        return track('command')
      }),
    },
    systemPrompt: {
      section: vi.fn((section) => {
        sections.push(section)
        return track('section')
      }),
    },
    tools: {
      guard: vi.fn((guard) => {
        guards.push(guard)
        return track('guard')
      }),
    },
    logger: {
      warn: vi.fn((message: string) => {
        warnings.push(message)
        return undefined
      }),
    },
    effect: vi.fn((callback: () => void | (() => void)) => {
      const disposer = callback()
      if (typeof disposer === 'function') disposers.push(disposer)
      return () => {}
    }),
  }

  return { ctx, registeredSkills, registeredCommands, sections, guards, warnings, disposers, released }
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
    expect(result.text).toMatch(/GOAL.visual.template.md/)
    expect(result.text).toMatch(/postQualityReview/)
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

  it('hangs registrations off ctx.effect so a reload releases them', () => {
    const { ctx, disposers, released } = mockCtx()
    apply(ctx, {
      skillsDir: './skills',
      agentLoopBinary: 'agent-loop',
      blockNestedRun: true,
    })
    expect(ctx.effect).toHaveBeenCalledTimes(1)
    expect(disposers).toHaveLength(1)
    expect(() => disposers[0]?.()).not.toThrow()
    expect(released).toHaveLength(7)
    expect(released.filter((tag) => tag.startsWith('section#'))).toHaveLength(1)
    expect(released.filter((tag) => tag.startsWith('guard#'))).toHaveLength(1)
    expect(released.filter((tag) => tag.startsWith('skill#'))).toHaveLength(4)
    expect(released.filter((tag) => tag.startsWith('command#'))).toHaveLength(1)
  })

  it('warns through ctx.logger when skillsDir is missing', () => {
    const { ctx, warnings } = mockCtx()
    apply(ctx, {
      skillsDir: './definitely-missing-skills-dir',
      agentLoopBinary: 'agent-loop',
      blockNestedRun: true,
    })
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.join('\n')).toMatch(/skillsDir/)
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

  it('matches every shipped grind entrypoint', () => {
    expect(isAgentLoopRunCommand('agent-loop-batch .cursor/loops')).toBe(true)
    expect(isAgentLoopRunCommand('node dist/cli/run-batch.js .cursor/loops')).toBe(true)
    expect(isAgentLoopRunCommand('pnpm exec tsx src/cli/run.ts .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand(`bash <<'EOF'\nagent-loop run .cursor/loops/x\nEOF`)).toBe(true)
    expect(isAgentLoopRunCommand(`sh -s <<'EOF'\nagent-loop run .cursor/loops/x\nEOF`)).toBe(true)
    expect(isAgentLoopRunCommand('bash -c "agent-loop run .cursor/loops/x"')).toBe(true)
    expect(isAgentLoopRunCommand('eval "agent-loop run .cursor/loops/x"')).toBe(true)
  })

  it('unwraps shells, substitutions, and prefixes before classifying the head', () => {
    expect(isAgentLoopRunCommand('bash -lc "agent-loop run .cursor/loops/x"')).toBe(true)
    expect(isAgentLoopRunCommand('bash --login -c "agent-loop run .cursor/loops/x"')).toBe(true)
    expect(isAgentLoopRunCommand('env agent-loop run .cursor/loops/x')).toBe(true)
    expect(
      isAgentLoopRunCommand(
        'doppler run --project agent-looper --config dev -- agent-loop run .cursor/loops/x',
      ),
    ).toBe(true)
    expect(isAgentLoopRunCommand('OUT=$(agent-loop run .cursor/loops/x)')).toBe(true)
    expect(isAgentLoopRunCommand('OUT=`agent-loop run .cursor/loops/x`')).toBe(true)
    expect(isAgentLoopRunCommand(`sudo bash <<'EOF'\nagent-loop run .cursor/loops/x\nEOF`)).toBe(true)
    expect(isAgentLoopRunCommand(`env bash <<'EOF'\nagent-loop run .cursor/loops/x\nEOF`)).toBe(true)
  })

  it('allows mentions, help, and data heredocs', () => {
    expect(isAgentLoopRunCommand('agent-loop --help')).toBe(false)
    expect(isAgentLoopRunCommand('pnpm exec agent-loop --help')).toBe(false)
    expect(isAgentLoopRunCommand('agent-loop-batch --help')).toBe(false)
    expect(isAgentLoopRunCommand('agent-loop-init')).toBe(false)
    expect(isAgentLoopRunCommand('rg "agent-loop run" docs/')).toBe(false)
    expect(isAgentLoopRunCommand('git log --grep="agent-loop run"')).toBe(false)
    expect(isAgentLoopRunCommand('git commit -m "docs: explain why agent-loop run must be backgrounded"')).toBe(
      false,
    )
    expect(isAgentLoopRunCommand('sed -i "s|agent-loop run|x|" README.md')).toBe(false)
    expect(isAgentLoopRunCommand('sudo ls /tmp')).toBe(false)
    expect(isAgentLoopRunCommand('echo "$(date)"')).toBe(false)
    expect(isAgentLoopRunCommand('STAMP=$(date -u +%FT%TZ) && echo "$STAMP"')).toBe(false)
    expect(
      isAgentLoopRunCommand("cat > package.json <<'EOF'\n  \"agent:loop\": \"agent-loop run .cursor/loops/x\"\nEOF"),
    ).toBe(false)
  })

  it('matches bare, path-prefixed, and package-manager launches of the CLI', () => {
    expect(isAgentLoopRunCommand('agent-loop .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('agent-loop --verbose .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('pnpm agent-loop run .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('yarn run agent-loop run .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('npx -y agent-loop run .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('./node_modules/.bin/agent-loop run .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('node_modules/.bin/agent-loop-batch .cursor/loops')).toBe(true)
    expect(isAgentLoopRunCommand('./dist/cli/run.js .cursor/loops/x')).toBe(true)
    expect(isAgentLoopRunCommand('/usr/local/bin/node dist/cli/run.js .cursor/loops/x')).toBe(true)
  })

  it('sees through wrapper flags, subshells, and shell keywords', () => {
    expect(isAgentLoopRunCommand('timeout 3600 agent-loop run x')).toBe(true)
    expect(isAgentLoopRunCommand('timeout -s KILL 1h agent-loop run x')).toBe(true)
    expect(isAgentLoopRunCommand('sudo -u me agent-loop run x')).toBe(true)
    expect(isAgentLoopRunCommand('nice -n 10 agent-loop run x')).toBe(true)
    expect(isAgentLoopRunCommand('env -i PATH=/usr/bin agent-loop run x')).toBe(true)
    expect(isAgentLoopRunCommand('(agent-loop run x)')).toBe(true)
    expect(isAgentLoopRunCommand('{ agent-loop run x; }')).toBe(true)
    expect(isAgentLoopRunCommand('if true; then agent-loop run x; fi')).toBe(true)
    expect(isAgentLoopRunCommand('! agent-loop run x')).toBe(true)
    expect(isAgentLoopRunCommand('echo "$(agent-loop run x)"')).toBe(true)
    expect(isAgentLoopRunCommand(`sudo -n bash <<'EOF'\nagent-loop run .cursor/loops/x\nEOF`)).toBe(true)
    expect(isAgentLoopRunCommand(`env -i bash <<'EOF'\nagent-loop run .cursor/loops/x\nEOF`)).toBe(true)
  })

  it('allows watch, lookups, bare help, and single-quoted substitutions', () => {
    expect(isAgentLoopRunCommand('agent-loop')).toBe(false)
    expect(isAgentLoopRunCommand('agent-loop run --help')).toBe(false)
    expect(isAgentLoopRunCommand('agent-loop watch .cursor/loops/x --snapshot')).toBe(false)
    expect(isAgentLoopRunCommand('command -v agent-loop')).toBe(false)
    expect(isAgentLoopRunCommand("echo 'tip: $(agent-loop run x)'")).toBe(false)
    expect(isAgentLoopRunCommand("OUT='`agent-loop run x`'")).toBe(false)
  })

  it('blocks doppler env dumps, config reads, and redirect reads of secret files', () => {
    expect(isSecretDumpCommand('doppler run --project p --config dev -- printenv')).toBe(true)
    expect(isSecretDumpCommand('doppler run --project p --config dev -- printenv OPENCODE_API_KEY')).toBe(true)
    expect(isSecretDumpCommand('doppler run --project p --config dev -- env')).toBe(true)
    expect(isSecretDumpCommand('doppler run --project p --config dev -- env | grep KEY')).toBe(true)
    expect(isSecretDumpCommand('doppler run --project p --config dev -- export -p')).toBe(true)
    expect(isSecretDumpCommand('doppler configure')).toBe(true)
    expect(isSecretDumpCommand('doppler configure get token --plain')).toBe(true)
    expect(isSecretDumpCommand('echo "$(< ~/.doppler/.doppler.yaml)"')).toBe(true)
    expect(isSecretDumpCommand('diff ~/.doppler/.doppler.yaml /dev/null')).toBe(true)
    expect(isSecretDumpCommand('doppler run --project p --config dev -- env FOO=1 pnpm test')).toBe(false)
    expect(isSecretDumpCommand('doppler configure set enable-timing false')).toBe(false)
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

  it('denies the pwsh tool for foreground grinds', () => {
    expect(nestedAgentLoopRunReason('pwsh', { command: 'agent-loop run x' })).toMatch(/foreground/)
    expect(
      nestedAgentLoopRunReason('pwsh', { command: 'agent-loop run x', run_in_background: true }),
    ).toBeUndefined()
  })

  it('blocks secret dumps without treating heredoc docs as dumps', () => {
    expect(isSecretDumpCommand('doppler secrets')).toBe(true)
    expect(isSecretDumpCommand('cat ~/.doppler/.doppler.yaml')).toBe(true)
    expect(isSecretDumpCommand('cat ~/.doppler.yaml')).toBe(true)
    expect(isSecretDumpCommand('grep TOKEN ~/.doppler.yaml')).toBe(true)
    expect(isSecretDumpCommand('grep -r token ~/.doppler/.doppler.yaml')).toBe(true)
    expect(isSecretDumpCommand(`bash <<'EOF'\ncat ~/.dsh/.credentials.yaml\nEOF`)).toBe(true)
    expect(isSecretDumpCommand('cp ~/.doppler.yaml /tmp/leak')).toBe(true)
    expect(isSecretDumpCommand('mv ~/.dsh/.credentials.yaml /tmp/leak')).toBe(true)
    expect(isSecretDumpCommand('rsync ~/.doppler.yaml /tmp/leak')).toBe(true)
    expect(isSecretDumpCommand('install -m 600 ~/.dsh/.credentials.yaml /tmp/leak')).toBe(true)
    expect(isSecretDumpCommand('cat ~/.dsh/settings.yaml')).toBe(false)
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
