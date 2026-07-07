import { describe, expect, it } from 'vitest'
import {
  CLINE_INNER_MAX_ITERATIONS,
  previewAssistantText,
  resolveInnerAgentStatus,
} from './innerAgentStatus.js'

describe('resolveInnerAgentStatus', () => {
  it('marks Cline iteration-cap messages as incomplete', () => {
    const status = resolveInnerAgentStatus('Agent runtime exceeded maxIterations (25)')
    expect(status.complete).toBe(false)
    expect(status.clineMaxIterations).toBe(25)
    expect(status.reason).toContain('clineMaxIterations')
  })

  it('treats normal assistant text as complete', () => {
    expect(resolveInnerAgentStatus('Implemented publish scripts and updated tests.')).toEqual({
      complete: true,
    })
  })

  it('does not treat empty cursor output as incomplete', () => {
    expect(resolveInnerAgentStatus('', 'cursor')).toEqual({ complete: true })
  })

  it('treats empty cline output as incomplete', () => {
    expect(resolveInnerAgentStatus('', 'cline').complete).toBe(false)
  })
})

describe('previewAssistantText', () => {
  it('does not surface inner cap error as the headline preview', () => {
    const status = resolveInnerAgentStatus('Agent runtime exceeded maxIterations (25)')
    const preview = previewAssistantText('Agent runtime exceeded maxIterations (25)', status)
    expect(preview).toContain('clineMaxIterations')
    expect(preview).not.toMatch(/^Agent runtime exceeded/)
  })

  it('uses configured default cap in preview hint', () => {
    const status = resolveInnerAgentStatus(`Agent runtime exceeded maxIterations (${CLINE_INNER_MAX_ITERATIONS})`)
    const preview = previewAssistantText(
      `Agent runtime exceeded maxIterations (${CLINE_INNER_MAX_ITERATIONS})`,
      status,
    )
    expect(preview).toContain(String(CLINE_INNER_MAX_ITERATIONS))
  })
})
