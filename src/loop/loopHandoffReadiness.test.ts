import { describe, expect, it } from 'vitest'
import { resolveIterationAgent } from './loopAgentEscalation.js'
import { detectHandoffReadiness } from './loopHandoffReadiness.js'
import type { GitWorkspaceSnapshot } from './loopGit.js'
import type { VerifyResult } from './loopVerify.js'
import { loopConfigSchema } from './loopConfig.js'

function gitWithArtifact(): GitWorkspaceSnapshot {
  return {
    branch: 'main',
    shortSha: 'abc1234',
    diffStat: ' src/foo.ts | 10 +++++-----',
    statusPorcelain: ' M src/foo.ts',
  }
}

function cleanGit(): GitWorkspaceSnapshot {
  return {
    branch: 'main',
    shortSha: 'abc1234',
    diffStat: '(no unstaged diff)',
    statusPorcelain: '(clean)',
  }
}

function productFailure(command = 'npm test', exitCode = 1): VerifyResult {
  return {
    complete: false,
    command,
    exitCode,
    stdout: 'FAIL src/foo.test.ts — expected 1 to equal 2',
    stderr: '',
    reason: 'Verifier failed (exit 1).',
    verifyClass: 'product',
  }
}

describe('detectHandoffReadiness', () => {
  it('is not ready before the minimum iteration', () => {
    const lastVerify = productFailure()
    const result = detectHandoffReadiness({
      iteration: 1,
      git: gitWithArtifact(),
      lastVerify,
      priorFailures: [productFailure()],
      stagnationRepeatCount: 2,
      minIteration: 2,
    })
    expect(result.ready).toBe(false)
  })

  it('is not ready without a workspace artifact', () => {
    const lastVerify = productFailure()
    const result = detectHandoffReadiness({
      iteration: 3,
      git: cleanGit(),
      lastVerify,
      priorFailures: [productFailure()],
      stagnationRepeatCount: 2,
    })
    expect(result.ready).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/no workspace artifact/)
  })

  it('is not ready on env failures (no real feedback)', () => {
    const lastVerify: VerifyResult = {
      ...productFailure(),
      stdout: '',
      stderr: 'npm: command not found',
      verifyClass: 'env',
    }
    const result = detectHandoffReadiness({
      iteration: 3,
      git: gitWithArtifact(),
      lastVerify,
      priorFailures: [productFailure()],
      stagnationRepeatCount: 2,
    })
    expect(result.ready).toBe(false)
  })

  it('is not ready when verify is already green', () => {
    const lastVerify: VerifyResult = {
      ...productFailure(),
      complete: true,
      exitCode: 0,
      verifyClass: 'ok',
    }
    const result = detectHandoffReadiness({
      iteration: 3,
      git: gitWithArtifact(),
      lastVerify,
      priorFailures: [productFailure()],
      stagnationRepeatCount: 2,
    })
    expect(result.ready).toBe(false)
  })

  it('is ready with artifact + product feedback + repeat signature', () => {
    const lastVerify = productFailure()
    const result = detectHandoffReadiness({
      iteration: 3,
      git: gitWithArtifact(),
      lastVerify,
      priorFailures: [productFailure()],
      stagnationRepeatCount: 2,
    })
    expect(result.ready).toBe(true)
  })

  it('is ready on repeated same-command failures without a stagnation count', () => {
    const lastVerify = productFailure()
    const result = detectHandoffReadiness({
      iteration: 2,
      git: gitWithArtifact(),
      lastVerify,
      priorFailures: [productFailure()],
    })
    expect(result.ready).toBe(true)
  })
})

describe('resolveIterationAgent handoff', () => {
  function handoffConfig() {
    return loopConfigSchema.parse({
      verify: 'true',
      runtime: 'opencode',
      model: 'opencode-go/qwen3.7-plus',
      handoffModel: 'opencode-go/deepseek-v4.1-flash',
    })
  }

  it('parses handoffModel with a default min iteration of 2', () => {
    const config = handoffConfig()
    expect(config.handoffModel).toBe('opencode-go/deepseek-v4.1-flash')
    expect(config.handoffMinIteration).toBe(2)
  })

  it('stays on the capable model before readiness fires', () => {
    const agent = resolveIterationAgent(handoffConfig(), 3, undefined, 0, false, false)
    expect(agent.model).toBe('opencode-go/qwen3.7-plus')
  })

  it('switches to the handoff model once readiness fires', () => {
    const agent = resolveIterationAgent(handoffConfig(), 3, undefined, 0, false, true)
    expect(agent.model).toBe('opencode-go/deepseek-v4.1-flash')
  })

  it('lets escalation win over handoff on a worker fault', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'opencode',
      model: 'opencode-go/qwen3.7-plus',
      handoffModel: 'opencode-go/deepseek-v4.1-flash',
      escalateModel: 'opencode-go/qwen3.7-plus',
    })
    const agent = resolveIterationAgent(config, 3, undefined, 0, true, true)
    expect(agent.model).toBe('opencode-go/qwen3.7-plus')
  })

  it('rejects an unpriced handoffModel when maxCostUsd is set', () => {
    const result = loopConfigSchema.safeParse({
      verify: 'true',
      runtime: 'opencode',
      model: 'opencode-go/qwen3.7-plus',
      handoffModel: 'opencode-go/brand-new-model',
      maxCostUsd: 5,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/no pricing row/)
      expect(result.error.issues[0]?.path).toEqual(['handoffModel'])
    }
  })

  it('accepts an unpriced handoffModel when maxCostUsd is unset', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'opencode',
      model: 'opencode-go/qwen3.7-plus',
      handoffModel: 'opencode-go/brand-new-model',
    })
    expect(parsed.handoffModel).toBe('opencode-go/brand-new-model')
  })

  it('does not apply handoff on the pinned Cursor runtime', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cursor',
      handoffModel: 'composer-2.5',
    })
    const agent = resolveIterationAgent(config, 3, undefined, 0, false, true)
    expect(agent.model).toBe('composer-2.5')
  })
})
