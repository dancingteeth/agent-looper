import { describe, expect, it } from 'vitest'
import { LOOP_RUNTIME_VALUES } from '../loop/loopAgentConfig.js'
import { loopRuntimeFlagError } from '../loop/loopConfig.js'
import { parseRunArgs, runUsage, type RunCliOptions } from './runArgs.js'

function expectRun(argv: string[]): RunCliOptions {
  const result = parseRunArgs(argv)
  if (result.kind !== 'run') {
    throw new Error(`expected run result, got ${result.kind}: ${JSON.stringify(result)}`)
  }
  return result.options
}

describe('parseRunArgs', () => {
  it('parses a bare loop dir with defaults', () => {
    const options = expectRun(['.cursor/loops/fix'])
    expect(options.loopDir).toBe('.cursor/loops/fix')
    expect(options.verbose).toBe(false)
    expect(options.skipSync).toBe(false)
    expect(options.requireTrustConfig).toBe(false)
    expect(options.reviewGate).toBeUndefined()
    expect(options.maxIterations).toBeUndefined()
  })

  it('skips the leading "run" subcommand token', () => {
    expect(expectRun(['run', 'loops/fix']).loopDir).toBe('loops/fix')
  })

  it('parses --review-runtime', () => {
    expect(expectRun(['x', '--review-runtime', 'pi']).reviewRuntime).toBe('pi')
    expect(parseRunArgs(['x', '--review-runtime', 'bogus'])).toEqual({
      kind: 'error',
      message: loopRuntimeFlagError('--review-runtime'),
    })
  })

  it('parses --review-secondary-runtime and --review-secondary-model', () => {
    expect(
      expectRun([
        'x',
        '--review-secondary-runtime',
        'dsh',
        '--review-secondary-model',
        'deepseek-official/deepseek-v4-pro',
      ]),
    ).toMatchObject({
      reviewSecondaryRuntime: 'dsh',
      reviewSecondaryModel: 'deepseek-official/deepseek-v4-pro',
    })
    expect(parseRunArgs(['x', '--review-secondary-runtime', 'bogus'])).toEqual({
      kind: 'error',
      message: loopRuntimeFlagError('--review-secondary-runtime'),
    })
  })

  it('captures value flags', () => {
    const options = expectRun([
      'loops/fix',
      '--verify', 'pnpm test',
      '--final-verify', 'pnpm build',
      '--model', 'composer-2.5',
      '--review-model', 'grok-4.5',
      '--escalate-model', 'qwen3.7-plus',
      '--max-iterations', '5',
      '--repo-root', '/tmp/repo',
    ])
    expect(options).toMatchObject({
      verify: 'pnpm test',
      finalVerify: 'pnpm build',
      model: 'composer-2.5',
      reviewModel: 'grok-4.5',
      escalateModel: 'qwen3.7-plus',
      maxIterations: 5,
      repoRoot: '/tmp/repo',
    })
  })

  it('rejects --max-iterations without a value or with a bad number', () => {
    expect(parseRunArgs(['x', '--max-iterations'])).toEqual({
      kind: 'error',
      message: '--max-iterations requires a number',
    })
    expect(parseRunArgs(['x', '--max-iterations', 'abc'])).toEqual({
      kind: 'error',
      message: '--max-iterations must be a positive integer (got abc)',
    })
    expect(parseRunArgs(['x', '--max-iterations', '0']).kind).toBe('error')
  })

  it('validates --runtime and --mode values', () => {
    expect(parseRunArgs(['x', '--runtime', 'bogus'])).toEqual({
      kind: 'error',
      message: loopRuntimeFlagError('--runtime'),
    })
    expect(parseRunArgs(['x', '--mode', 'sideways'])).toEqual({
      kind: 'error',
      message: '--mode must be forward or reverse',
    })
    for (const runtime of LOOP_RUNTIME_VALUES) {
      expect(expectRun(['x', '--runtime', runtime]).runtime).toBe(runtime)
    }
    expect(expectRun(['x', '--mode', 'reverse']).mode).toBe('reverse')
  })

  it('parses boolean flags', () => {
    const options = expectRun([
      'x',
      '--review-gate',
      '--skip-sync',
      '--pause-after-iteration',
      '--no-telegram',
      '--no-completion-signal',
      '--no-notify-command',
      '--require-notify',
      '--trust-config',
      '--require-trust-config',
      '-v',
    ])
    expect(options).toMatchObject({
      reviewGate: true,
      skipSync: true,
      pauseAfterIteration: true,
      notifyTelegram: false,
      noCompletionSignal: true,
      noNotifyCommand: true,
      requireNotify: true,
      trustConfig: true,
      requireTrustConfig: true,
      verbose: true,
    })
    expect(expectRun(['x', '--no-review-gate']).reviewGate).toBe(false)
  })

  it('maps --quality-review / --no-quality-review', () => {
    expect(expectRun(['x', '--quality-review']).qualityReview).toBe(true)
    expect(expectRun(['x', '--no-quality-review']).qualityReview).toBe('off')
  })

  it('returns help for --help and -h', () => {
    for (const flag of ['--help', '-h']) {
      expect(parseRunArgs([flag])).toEqual({ kind: 'help', text: runUsage() })
    }
  })

  it('errors with usage when no loop dir is given', () => {
    expect(parseRunArgs([])).toEqual({ kind: 'error', message: runUsage() })
  })

  it('joins multiple positionals with a space (path-with-spaces quirk)', () => {
    expect(expectRun(['my', 'dir']).loopDir).toBe('my dir')
  })
})
