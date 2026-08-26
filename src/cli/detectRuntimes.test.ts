import { describe, expect, it } from 'vitest'
import { detectLoopRuntimes, type DetectableRuntime } from './detectRuntimes.js'

describe('detectLoopRuntimes', () => {
  it('returns a structured map keyed by every detectable runtime', async () => {
    const result = await detectLoopRuntimes({
      importModule: async () => ({}),
      which: () => true,
    })
    expect(Object.keys(result).sort()).toEqual(
      (['cursor', 'cline', 'opencode', 'pi', 'codex', 'dsh'] as DetectableRuntime[]).sort(),
    )
    expect(result).toEqual({
      cursor: 'detected',
      cline: 'detected',
      opencode: 'detected',
      pi: 'detected',
      codex: 'detected',
      dsh: 'detected',
    })
  })

  it('marks a missing dsh as missing when `which` fails', async () => {
    const result = await detectLoopRuntimes({
      importModule: async () => ({}),
      which: () => false,
    })
    expect(result.dsh).toBe('missing')
    expect(result.opencode).toBe('missing')
    expect(result.codex).toBe('missing')
    expect(result.cursor).toBe('detected')
  })

  it('marks a present cursor SDK as detected even when other runtimes are missing', async () => {
    const result = await detectLoopRuntimes({
      importModule: async (specifier) => {
        if (specifier === '@cursor/sdk') return {}
        throw new Error(`not installed: ${specifier}`)
      },
      which: () => false,
    })
    expect(result.cursor).toBe('detected')
    expect(result.cline).toBe('missing')
    expect(result.dsh).toBe('missing')
  })

  it('marks a runtime missing when its SDK import throws', async () => {
    const result = await detectLoopRuntimes({
      importModule: async () => {
        throw new Error('module not found')
      },
      which: () => true,
    })
    expect(result.cursor).toBe('missing')
    expect(result.cline).toBe('missing')
    expect(result.pi).toBe('missing')
    expect(result.dsh).toBe('detected')
  })
})
