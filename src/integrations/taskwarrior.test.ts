import { describe, expect, it } from 'vitest'
import {
  buildHitlCheckTaskArgs,
  escapeTaskDescriptionFilter,
  formatHitlCheckTaskDescription,
  taskwarriorProjectSchema,
  taskwarriorUuidSchema,
} from './taskwarrior.js'

describe('taskwarriorUuidSchema', () => {
  it('accepts a valid UUID', () => {
    expect(taskwarriorUuidSchema.parse('a74a94d1-2069-4e05-861e-de80143b0526')).toBe(
      'a74a94d1-2069-4e05-861e-de80143b0526',
    )
  })
})

describe('formatHitlCheckTaskDescription', () => {
  it('prefixes and trims the description', () => {
    expect(formatHitlCheckTaskDescription('  affiliate hub ref  ')).toBe(
      'HITL Check: affiliate hub ref',
    )
  })
})

describe('buildHitlCheckTaskArgs', () => {
  it('uses the given taskwarrior project', () => {
    expect(buildHitlCheckTaskArgs('affiliate checkout flow', 'zwook')).toEqual([
      'add',
      'project:zwook',
      '+hitl',
      '+manual',
      'HITL Check: affiliate checkout flow',
    ])
  })
})

describe('taskwarriorProjectSchema', () => {
  it('rejects project names with spaces', () => {
    expect(() => taskwarriorProjectSchema.parse('my project')).toThrow(/spaces/i)
  })
describe('escapeTaskDescriptionFilter', () => {
  it('escapes regex metacharacters so descriptions match literally', () => {
    expect(escapeTaskDescriptionFilter('fix auth (v1.2) [prod]')).toBe(
      '/fix auth \\(v1\\.2\\) \\[prod\\]/',
    )
  })

  it('escapes backslashes and forward slashes', () => {
    expect(escapeTaskDescriptionFilter('a/b\\c')).toBe('/a\\/b\\\\c/')
  })

  it('escapes quantifiers and anchors', () => {
    expect(escapeTaskDescriptionFilter('a*b+c?^$|{}')).toBe('/a\\*b\\+c\\?\\^\\$\\|\\{\\}/')
  })

  it('leaves plain text unchanged', () => {
    expect(escapeTaskDescriptionFilter('HITL Check: plain text')).toBe('/HITL Check: plain text/')
  })
})

})
