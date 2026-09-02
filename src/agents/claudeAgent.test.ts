import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { loopConfigSchema } from '../loop/loopConfig.js'
import {
  assertClaudeCliVersion,
  buildClaudeChildEnv,
  buildClaudePrintArgs,
  claudeVersionMeetsMinimum,
  extractClaudeAssistantText,
  parseClaudeCliVersion,
  parseClaudePrintStdout,
  spawnClaudePrint,
} from './claudeAgent.js'

describe('claude CLI version floor', () => {
  it('requires 2.1.169+ for --safe-mode', () => {
    expect(parseClaudeCliVersion('2.1.29 (Claude Code)')).toEqual({
      major: 2,
      minor: 1,
      patch: 29,
    })
    expect(claudeVersionMeetsMinimum('2.1.29 (Claude Code)')).toBe(false)
    expect(claudeVersionMeetsMinimum('2.1.169 (Claude Code)')).toBe(true)
    expect(claudeVersionMeetsMinimum('2.1.251 (Claude Code)')).toBe(true)
    expect(claudeVersionMeetsMinimum('3.0.0')).toBe(true)
    expect(claudeVersionMeetsMinimum('not-a-version')).toBe(false)
  })
})

describe('assertClaudeCliVersion', () => {
  it('rejects a stale CLI before the loop spawns --safe-mode', () => {
    expect(() => assertClaudeCliVersion(() => ({ onPath: true, version: '2.1.29 (Claude Code)' })))
      .toThrow(/2\.1\.169\+ required for --safe-mode/)
  })

  it('names the install path when claude is not on PATH', () => {
    expect(() => assertClaudeCliVersion(() => ({ onPath: false, version: '' }))).toThrow(
      /not on PATH/,
    )
  })

  it('passes on a current CLI', () => {
    expect(() =>
      assertClaudeCliVersion(() => ({ onPath: true, version: '2.1.258 (Claude Code)' })),
    ).not.toThrow()
  })
})

describe('buildClaudeChildEnv', () => {
  it('drops Console token env and disables auto-memory', () => {
    const env = buildClaudeChildEnv({
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      CLAUDE_CODE_SIMPLE: '1',
      HOME: '/Users/test',
    })
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_SIMPLE).toBeUndefined()
    expect(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1')
    expect(env.HOME).toBe('/Users/test')
  })
})

describe('buildClaudePrintArgs', () => {
  it('uses safe-mode print flags and appends the harness prompt', () => {
    expect(
      buildClaudePrintArgs({
        prompt: 'fix it',
        modelId: 'sonnet',
        systemPrompt: 'be honest',
      }),
    ).toEqual([
      '-p',
      'fix it',
      '--output-format',
      'json',
      '--permission-mode',
      'bypassPermissions',
      '--no-session-persistence',
      '--safe-mode',
      '--model',
      'sonnet',
      '--append-system-prompt',
      'be honest',
    ])
  })
})

describe('parseClaudePrintStdout', () => {
  it('reads a result object and rejects is_error', () => {
    const parsed = parseClaudePrintStdout(
      JSON.stringify({
        type: 'result',
        is_error: false,
        result: 'done',
        session_id: 'ses_1',
        total_cost_usd: 0.12,
        usage: { input_tokens: 10, output_tokens: 4 },
      }),
    )
    expect(extractClaudeAssistantText(parsed)).toBe('done')
    expect(parsed.session_id).toBe('ses_1')
  })

  it('throws on is_error including login failures', () => {
    const parsed = parseClaudePrintStdout(
      JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'Invalid API key · Please run /login',
      }),
    )
    expect(() => extractClaudeAssistantText(parsed)).toThrow(/Please run \/login/)
  })
})

describe('spawnClaudePrint', () => {
  const noopReaper = () => ({ pid: undefined, close: () => undefined })

  it('resolves stdout on close 0', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      stdout: PassThrough
      stderr: PassThrough
    }
    child.pid = 1
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()

    const run = spawnClaudePrint({
      repoRoot: '/repo',
      args: ['-p', 'hi'],
      timeoutMs: 5_000,
      spawnImpl: () => child as unknown as ChildProcess,
      killGroup: () => {
        throw new Error('should not kill')
      },
      signalTree: () => {
        throw new Error('should not kill tree')
      },
      spawnReaper: noopReaper,
    })

    child.stdout.write('{"type":"result","result":"ok"}')
    child.emit('close', 0)
    await expect(run).resolves.toMatchObject({
      stdout: '{"type":"result","result":"ok"}',
      exitCode: 0,
    })
  })
})

describe('loop.json runtime claude', () => {
  it('defaults worker sonnet and review opus when reviewRuntime is claude', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'claude',
      reviewRuntime: 'claude',
    })
    expect(config.runtime).toBe('claude')
    expect(config.reviewRuntime).toBe('claude')
  })
})
