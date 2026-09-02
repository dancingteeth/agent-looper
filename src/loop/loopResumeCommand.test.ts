import { describe, expect, it } from 'vitest'
import { formatLoopResumeCommand } from './loopResumeCommand.js'

describe('formatLoopResumeCommand', () => {
  it('prints a bare run when Doppler env is absent', () => {
    expect(formatLoopResumeCommand('.cursor/loops/museum2', {})).toBe(
      'agent-loop run .cursor/loops/museum2',
    )
  })

  it('wraps with doppler run when project and config are set', () => {
    expect(
      formatLoopResumeCommand('.cursor/loops/museum2', {
        DOPPLER_PROJECT: 'agent-looper',
        DOPPLER_CONFIG: 'dev',
      }),
    ).toBe(
      'doppler run --project agent-looper --config dev -- agent-loop run .cursor/loops/museum2',
    )
  })

  it('quotes Doppler identifiers that are not [A-Za-z0-9._-]', () => {
    expect(
      formatLoopResumeCommand('x', {
        DOPPLER_PROJECT: 'agent looper',
        DOPPLER_CONFIG: 'dev',
      }),
    ).toBe(`doppler run --project 'agent looper' --config dev -- agent-loop run x`)
  })
})
