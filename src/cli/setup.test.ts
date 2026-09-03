import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isSetupCliEntry, parseArgs, pickLoopConfigFields, runWizard, usage, formatNextStepsLines } from './setup.js'
import {
  formatMenu,
  judgeModelChoices,
  parseMenuSelection,
  workerModelChoices,
  escalateModelChoices,
  modelChoiceDescription,
  costPresetChoices,
  WORKER_RUNTIME_CHOICES,
  SECONDARY_REVIEW_RUNTIME_CHOICES,
} from './setupMenus.js'
import { emptyDetection } from './detectRuntimes.js'
import {
  OPENROUTER_FREE_REVIEW_MODEL,
  OPENROUTER_FREE_WORKER_MODEL,
} from '../loop/loopAgentConfig.js'

const dirs: string[] = []

function tmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('agent-loop-setup', () => {
  it('lists dsh and review/notify/git in --help text', () => {
    const text = usage()
    expect(text).toMatch(/\bdsh\b/)
    expect(text).toMatch(/review/i)
    expect(text).toMatch(/notify|telegram/i)
    expect(text).toMatch(/git|pr|branch|comment/i)
    expect(text).toMatch(/numbered|number|--plain/i)
    expect(text).toMatch(/Ink|TUI/i)
    expect(text).toMatch(/defaults/i)
    expect(text).toMatch(/minmax|cost preset|costPreset/i)
  })

  it('parses --plain without treating it as unknown', () => {
    expect(parseArgs(['--plain', '--out', '/tmp/loop']).plain).toBe(true)
    expect(parseArgs(['--out', '/tmp/loop']).plain).toBe(false)
    expect(parseArgs(['--', '--out', '/tmp/loop']).outDir).toBe('/tmp/loop')
  })

  it('next steps mention agent-loop-prompt', () => {
    const lines = formatNextStepsLines({ runtime: 'cursor' }, '.cursor/loops/foo', '/repo', false)
    expect(lines.join('\n')).toMatch(/agent-loop-prompt --out/)
  })

  it('treats bin shims and node dist/cli/setup.js as CLI entry, not vitest imports', () => {
    const moduleUrl = 'file:///Users/paul/Projects/agent-loop/dist/cli/setup.js'
    expect(isSetupCliEntry('/Users/paul/.nvm/versions/node/v22.23.2/bin/agent-loop-setup', moduleUrl)).toBe(
      true,
    )
    expect(isSetupCliEntry('/Users/paul/Projects/agent-loop/dist/cli/setup.js', moduleUrl)).toBe(true)
    expect(isSetupCliEntry('/Users/paul/Projects/agent-loop/node_modules/.bin/agent-loop-setup', moduleUrl)).toBe(
      true,
    )
    expect(isSetupCliEntry('/Users/paul/Projects/agent-loop/node_modules/.bin/vitest', moduleUrl)).toBe(false)
    expect(isSetupCliEntry(undefined, moduleUrl)).toBe(false)
  })

  it('parses menu numbers and rejects typed slugs', () => {
    expect(parseMenuSelection('', 7, 0)).toBe(0)
    expect(parseMenuSelection('2', 7, 0)).toBe(1)
    expect(parseMenuSelection('dsh', 7, 0)).toBeNull()
    expect(parseMenuSelection('deepseek-official/deepseek-v4-pro', 7, 0)).toBeNull()
    expect(parseMenuSelection('0', 7, 0)).toBeNull()
    expect(parseMenuSelection('8', 7, 0)).toBeNull()
  })

  it('scopes cursor judge models away from DSH slugs', () => {
    const values = judgeModelChoices('cursor', 'dsh').map((choice) => choice.value)
    expect(values).toContain('grok-4.6')
    expect(values).toContain('composer-2.5')
    expect(values.some((value) => value.startsWith('deepseek-official/'))).toBe(false)
    const menu = formatMenu(
      'Judge runtime',
      'Who writes residual review.md.',
      WORKER_RUNTIME_CHOICES,
      0,
    )
    expect(menu).toMatch(/1\) Cursor \(cursor\) \(default\)/)
    expect(menu).toMatch(/DeepSeek Harness \(dsh\)/)
    expect(menu).toMatch(/Needs `dsh` on PATH/)
    expect(menu).toMatch(/Pi coding agent \(pi\)/)
    expect(menu).toMatch(/Cline \(cline-pass\)/)
    expect(menu).toMatch(/Cline \(credits\)/)
    expect(menu).toMatch(/Muse Code \(muse\)/)
    expect(menu).toMatch(/Claude Code \(claude\)/)
  })

  it('keeps both Cline families on secondary review and adds the rest of the judge list', () => {
    const values = SECONDARY_REVIEW_RUNTIME_CHOICES.map((choice) => choice.value)
    expect(values).toEqual([
      'none',
      'cline-pass',
      'cline',
      'cursor',
      'dsh',
      'opencode',
      'pi',
      'codex',
      'muse',
      'claude',
    ])
    expect(SECONDARY_REVIEW_RUNTIME_CHOICES.map((choice) => choice.title)).toEqual([
      'none',
      'Cline (cline-pass)',
      'Cline (credits)',
      'Cursor (cursor)',
      'DeepSeek Harness (dsh)',
      'OpenCode (opencode)',
      'Pi coding agent (pi)',
      'Codex (codex)',
      'Muse Code (muse)',
      'Claude Code (claude)',
    ])
  })

  it('gives every catalog model a what/when description, not filler', () => {
    const runtimes = ['cline-pass', 'opencode', 'dsh', 'codex', 'cursor', 'cline', 'pi', 'muse', 'claude'] as const
    for (const runtime of runtimes) {
      for (const choice of workerModelChoices(runtime)) {
        if (choice.value === '' || choice.value === '__custom__') continue
        expect(choice.description, choice.value).not.toMatch(/catalog slug/i)
        expect(choice.description, choice.value).not.toMatch(/newer than/i)
        expect(choice.description.length, choice.value).toBeGreaterThan(40)
        expect(choice.description, choice.value).toMatch(/—/)
      }
    }
  })

  it('offers Claude Sonnet, Opus, Fable, and Haiku', () => {
    const claude = workerModelChoices('claude').map((choice) => choice.value)
    expect(claude).toContain('sonnet')
    expect(claude).toContain('opus')
    expect(claude).toContain('fable')
    expect(claude).toContain('haiku')
    expect(escalateModelChoices('claude').map((choice) => choice.value)).toContain('opus')
  })

  it('does not offer a Muse model escalate — PAYG Spark is a billing pick, not a stronger slug', () => {
    expect(escalateModelChoices('muse').map((choice) => choice.value)).toEqual([''])
    const muse = workerModelChoices('muse').map((choice) => choice.value)
    expect(muse).toContain('muse-spark-1.3-contributor')
    expect(muse).toContain('muse-spark-1.3')
    expect(muse).toContain('muse-spark-1.2-contributor')
    expect(muse).toContain('muse-spark-1.2')
    expect(modelChoiceDescription('muse-spark-1.3')).toMatch(/same weights/i)
    expect(modelChoiceDescription('muse-spark-1.3')).not.toMatch(/escalate/i)
  })

  it('offers DSH vision-exp alongside Flash and Pro', () => {
    const dsh = workerModelChoices('dsh').map((choice) => choice.value)
    expect(dsh).toContain('deepseek-official/deepseek-v4-flash')
    expect(dsh).toContain('deepseek-official/deepseek-v4-flash-vision-exp')
    expect(dsh).toContain('deepseek-official/deepseek-v4-pro')
  })

  it('offers Kimi K3 on Cline Pass and OpenCode Go menus', () => {
    const pass = workerModelChoices('cline-pass').map((choice) => choice.value)
    const go = workerModelChoices('opencode').map((choice) => choice.value)
    expect(pass).toContain('cline-pass/kimi-k3')
    expect(go).toContain('opencode-go/kimi-k3')
    expect(go).toContain('opencode-go/hy3')
  })

  it('offers OpenRouter :free models on the OpenCode menu', () => {
    const go = workerModelChoices('opencode').map((choice) => choice.value)
    expect(go).toContain(OPENROUTER_FREE_WORKER_MODEL)
    expect(go).toContain(OPENROUTER_FREE_REVIEW_MODEL)
    expect(modelChoiceDescription(OPENROUTER_FREE_WORKER_MODEL)).toMatch(/hosted \$0/)
    expect(modelChoiceDescription(OPENROUTER_FREE_REVIEW_MODEL)).toMatch(/hosted \$0/)
    expect(judgeModelChoices('opencode', 'opencode').map((choice) => choice.value)).toContain(
      OPENROUTER_FREE_REVIEW_MODEL,
    )
  })

  it('describes or-free as OpenRouter hosted $0, not a generic saved preset', () => {
    const choices = costPresetChoices(emptyDetection(), {
      'or-free': {
        runtime: 'opencode',
        model: OPENROUTER_FREE_WORKER_MODEL,
        escalateModel: OPENROUTER_FREE_REVIEW_MODEL,
        reviewRuntime: 'opencode',
        reviewModel: OPENROUTER_FREE_REVIEW_MODEL,
      },
    })
    const row = choices.find((choice) => choice.value === 'or-free')
    expect(row?.title).toBe('or-free — OpenRouter $0')
    expect(row?.description).toMatch(/not minmax/)
    expect(row?.description).toMatch(/OPENROUTER_API_KEY/)
  })

  it('writes a dsh worker+judge loop.json without a reviewModel key', () => {
    const outDir = tmpDir('agent-loop-setup-dsh-')
    const repoRoot = tmpDir('agent-loop-setup-repo-')
    const code = runWizard(
      {
        runtime: 'dsh',
        reviewRuntime: 'dsh',
        model: 'deepseek-official/deepseek-v4-flash',
        escalateModel: 'deepseek-official/deepseek-v4-pro',
        maxIterations: 5,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      repoRoot,
    )
    expect(code).toBe(0)
    const written = JSON.parse(fs.readFileSync(path.join(outDir, 'loop.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(written.runtime).toBe('dsh')
    expect(written.reviewRuntime).toBe('dsh')
    expect(written).not.toHaveProperty('reviewModel')
    const profile = JSON.parse(
      fs.readFileSync(path.join(repoRoot, '.cursor', 'agent-loop.repo.json'), 'utf8'),
    ) as { defaults?: Record<string, unknown> }
    expect(profile.defaults?.runtime).toBe('dsh')
    expect(profile.defaults?.reviewRuntime).toBe('dsh')
    expect(profile.defaults).not.toHaveProperty('verify')
  })

  it('writes a user-defined costPreset name without rejecting it at write time', () => {
    const outDir = tmpDir('agent-loop-setup-userpreset-')
    const repoRoot = tmpDir('agent-loop-setup-userpreset-repo-')
    const cheapPi = {
      runtime: 'pi',
      model: 'openrouter/deepseek/deepseek-chat',
      escalateModel: 'openrouter/qwen/qwen3-coder-plus',
      reviewRuntime: 'pi',
      reviewModel: 'openrouter/qwen/qwen3-coder-plus',
    }
    const code = runWizard(
      {
        costPreset: 'cheap-pi',
        runtime: 'pi',
        model: 'openrouter/deepseek/deepseek-chat',
        reviewRuntime: 'pi',
        reviewModel: 'openrouter/qwen/qwen3-coder-plus',
        maxIterations: 8,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      repoRoot,
      { costPresets: { 'cheap-pi': cheapPi } },
    )
    expect(code).toBe(0)
    const written = JSON.parse(fs.readFileSync(path.join(outDir, 'loop.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(written.costPreset).toBe('cheap-pi')
    expect(written.runtime).toBe('pi')
    expect(written.reviewRuntime).toBe('pi')
  })

  it('round-trips notifyTelegram false and notifyPrComment true', () => {
    const outDir = tmpDir('agent-loop-setup-notify-')
    const code = runWizard(
      {
        runtime: 'opencode',
        model: 'opencode-go/deepseek-v4-flash',
        notifyTelegram: false,
        notifyPrComment: true,
        maxIterations: 5,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      tmpDir('agent-loop-setup-repo-'),
    )
    expect(code).toBe(0)
    const written = JSON.parse(fs.readFileSync(path.join(outDir, 'loop.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(written.notifyTelegram).toBe(false)
    expect(written.notifyPrComment).toBe(true)
  })

  it('rejects an unknown runtime and does not write loop.json or profile', () => {
    const outDir = tmpDir('agent-loop-setup-bad-')
    const repoRoot = tmpDir('agent-loop-setup-repo-')
    const code = runWizard(
      {
        runtime: 'banana',
        maxIterations: 5,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      repoRoot,
    )
    expect(code).toBe(1)
    expect(fs.existsSync(path.join(outDir, 'loop.json'))).toBe(false)
    expect(fs.existsSync(path.join(repoRoot, '.cursor', 'agent-loop.repo.json'))).toBe(false)
  })

  it('does not print next-steps after a rejected config', () => {
    const outDir = tmpDir('agent-loop-setup-next-')
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    }
    try {
      runWizard(
        {
          runtime: 'banana',
          maxIterations: 5,
          verify: 'bash .cursor/loops/example/verify.sh',
        },
        outDir,
        tmpDir('agent-loop-setup-next-repo-'),
      )
    } finally {
      console.log = origLog
    }
    expect(logs.join('\n')).not.toMatch(/Next steps/)
    expect(logs.join('\n')).not.toMatch(/agent-loop run/)
  })

  it('rejects a Fast cursor review model and does not write loop.json', () => {
    const outDir = tmpDir('agent-loop-setup-fast-')
    const code = runWizard(
      {
        runtime: 'cursor',
        model: 'composer-2.5',
        reviewRuntime: 'cursor',
        reviewModel: 'composer-fast-1',
        maxIterations: 5,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      tmpDir('agent-loop-setup-repo-'),
    )
    expect(code).toBe(1)
    expect(fs.existsSync(path.join(outDir, 'loop.json'))).toBe(false)
  })

  it('drops unknown answers keys instead of inventing schema fields', () => {
    expect(pickLoopConfigFields({ runtime: 'dsh', notAField: true, profile: {} })).toEqual({
      runtime: 'dsh',
    })
  })

  it('writes a named costPresets stack without loop.json', () => {
    const outDir = tmpDir('agent-loop-setup-savepreset-out-')
    const repoRoot = tmpDir('agent-loop-setup-savepreset-repo-')
    const code = runWizard(
      {
        saveCostPreset: 'hy3-dsh',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        escalateModel: 'opencode-go/qwen3.7-plus',
        reviewRuntime: 'dsh',
        reviewModel: 'deepseek-official/deepseek-v4-pro',
      },
      outDir,
      repoRoot,
    )
    expect(code).toBe(0)
    expect(fs.existsSync(path.join(outDir, 'loop.json'))).toBe(false)
    const profile = JSON.parse(
      fs.readFileSync(path.join(repoRoot, '.cursor', 'agent-loop.repo.json'), 'utf8'),
    ) as {
      costPresets?: Record<string, Record<string, string>>
      defaults?: Record<string, unknown>
    }
    expect(profile.costPresets?.['hy3-dsh']).toEqual({
      runtime: 'opencode',
      model: 'opencode-go/hy3',
      escalateModel: 'opencode-go/qwen3.7-plus',
      reviewRuntime: 'dsh',
      reviewModel: 'deepseek-official/deepseek-v4-pro',
    })
    expect(profile.defaults?.costPreset).toBeUndefined()
  })

  it('writes catalog and loop.json when saveCostPreset is paired with verify', () => {
    const outDir = tmpDir('agent-loop-setup-savepreset-full-out-')
    const repoRoot = tmpDir('agent-loop-setup-savepreset-full-repo-')
    const code = runWizard(
      {
        saveCostPreset: 'hy3-dsh',
        costPreset: 'hy3-dsh',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        escalateModel: 'opencode-go/qwen3.7-plus',
        reviewRuntime: 'dsh',
        reviewModel: 'deepseek-official/deepseek-v4-pro',
        maxIterations: 8,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      repoRoot,
    )
    expect(code).toBe(0)
    const written = JSON.parse(fs.readFileSync(path.join(outDir, 'loop.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(written.costPreset).toBe('hy3-dsh')
    expect(written.verify).toBe('bash .cursor/loops/example/verify.sh')
    const profile = JSON.parse(
      fs.readFileSync(path.join(repoRoot, '.cursor', 'agent-loop.repo.json'), 'utf8'),
    ) as {
      costPresets?: Record<string, unknown>
      defaults?: { costPreset?: string }
    }
    expect(profile.costPresets).toHaveProperty('hy3-dsh')
    expect(profile.defaults?.costPreset).toBe('hy3-dsh')
  })

  it('merges a new preset without dropping an existing catalog name', () => {
    const outDir = tmpDir('agent-loop-setup-savepreset-merge-out-')
    const repoRoot = tmpDir('agent-loop-setup-savepreset-merge-repo-')
    fs.mkdirSync(path.join(repoRoot, '.cursor'), { recursive: true })
    fs.writeFileSync(
      path.join(repoRoot, '.cursor', 'agent-loop.repo.json'),
      `${JSON.stringify({
        defaultBranch: 'main',
        costPresets: {
          'cheap-pi': {
            runtime: 'pi',
            model: 'openrouter/deepseek/deepseek-chat',
            reviewRuntime: 'pi',
            reviewModel: 'openrouter/qwen/qwen3-coder-plus',
          },
        },
      })}\n`,
      'utf8',
    )
    const code = runWizard(
      {
        saveCostPreset: 'hy3-dsh',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        reviewRuntime: 'cursor',
        reviewModel: 'grok-4.6',
        setCostPresetDefault: true,
      },
      outDir,
      repoRoot,
    )
    expect(code).toBe(0)
    const profile = JSON.parse(
      fs.readFileSync(path.join(repoRoot, '.cursor', 'agent-loop.repo.json'), 'utf8'),
    ) as {
      costPresets?: Record<string, unknown>
      defaults?: { costPreset?: string }
    }
    expect(profile.costPresets).toHaveProperty('cheap-pi')
    expect(profile.costPresets).toHaveProperty('hy3-dsh')
    expect(profile.defaults?.costPreset).toBe('hy3-dsh')
  })

  it('rejects a reserved saveCostPreset name and writes nothing', () => {
    const outDir = tmpDir('agent-loop-setup-savepreset-reserved-out-')
    const repoRoot = tmpDir('agent-loop-setup-savepreset-reserved-repo-')
    const code = runWizard(
      {
        saveCostPreset: 'minmax',
        runtime: 'pi',
        model: 'openrouter/deepseek/deepseek-chat',
        reviewRuntime: 'pi',
        reviewModel: 'openrouter/qwen/qwen3-coder-plus',
      },
      outDir,
      repoRoot,
    )
    expect(code).toBe(1)
    expect(fs.existsSync(path.join(outDir, 'loop.json'))).toBe(false)
    expect(fs.existsSync(path.join(repoRoot, '.cursor', 'agent-loop.repo.json'))).toBe(false)
  })
})
