export const PLAIN_TEXT_TOOL_CALL_HEADING = '## Plain-text tool calls are not executed'

const TOOL_JSON_SHAPE =
  /\{\s*"(?:name|tool)"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|parameters)"\s*:/

export function detectPlainTextToolCalls(text: string): boolean {
  if (!text.trim()) return false
  if (text.includes('<tool_call>')) return true
  if (/<function=/i.test(text)) return true
  if (text.includes('[TOOL_CALLS]')) return true
  if (/```tool_code/i.test(text)) return true
  if (TOOL_JSON_SHAPE.test(text)) return true
  return false
}

export function buildPlainTextToolCallWarningSection(): string {
  return `${PLAIN_TEXT_TOOL_CALL_HEADING}

Your previous reply included tool-like syntax as plain text. That text is not executed — invoke tools through the tool-calling interface instead.

`
}
