import { describe, expect, it } from 'vitest'
import {
  PLAIN_TEXT_TOOL_CALL_HEADING,
  detectPlainTextToolCalls,
} from './loopToolCallText.js'

describe('detectPlainTextToolCalls', () => {
  it.each([
    '<tool_call>{"name": "edit_file", "arguments": {"path": "a.ts"}}</tool_call>',
    'I will now run it.\n<function=bash>\n<parameter=command>pnpm test</parameter>\n</function>',
    '{"name": "bash", "arguments": {"command": "ls"}}',
    '```tool_code\nprint(default_api.read_file(path="a.ts"))\n```',
    '[TOOL_CALLS] [{"name": "read", "arguments": {"path": "a.ts"}}]',
    'Calling the tool: {"tool": "write_file", "parameters": {"path": "x"}}',
  ])('flags pseudo tool call #%#', (text) => {
    expect(detectPlainTextToolCalls(text)).toBe(true)
  })

  it.each([
    '',
    'Updated src/a.ts to export parseDate and ran the tests; 3 still fail.',
    '```ts\nconst cfg = { name: "a", arguments: [] as string[] }\n```',
    'The tool call failed with ENOENT, so I created the directory first.',
    '```json\n{"name": "@dancingteeth/agent-looper", "version": "0.8.2"}\n```',
  ])('does not flag normal worker output #%#', (text) => {
    expect(detectPlainTextToolCalls(text)).toBe(false)
  })

  it('exports a markdown heading constant', () => {
    expect(PLAIN_TEXT_TOOL_CALL_HEADING.startsWith('## ')).toBe(true)
  })
})
