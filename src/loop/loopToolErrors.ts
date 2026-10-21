import type { TranscriptEvent } from '../stream/streamCollect.js'

export type ExpectedToolErrorKind = 'tool_end_error' | 'tool_call_as_plain_text'

export type ToolErrorRole = 'worker' | 'judge'

export type ToolErrorStatRow = {
  role: ToolErrorRole
  runtime: string
  model: string
  toolEndErrors: number
  toolCallAsPlainText: number
}

export function countToolEndErrors(events: TranscriptEvent[]): number {
  return events.filter((e) => e.type === 'tool_end' && e.detail?.startsWith('error:')).length
}

/** Hung worker / text-only stream before tools — not a verifier failure. */
export function classifyAgentMessageAsPlainTextTool(errorMessage: string): boolean {
  return /no tool progress|text stream without tools/i.test(errorMessage)
}

export function summarizeSessionToolErrors(input: {
  role: ToolErrorRole
  runtime: string
  model: string
  transcriptEvents?: TranscriptEvent[]
  agentErrorMessage?: string
}): ToolErrorStatRow | undefined {
  const toolEndErrors = countToolEndErrors(input.transcriptEvents ?? [])
  const toolCallAsPlainText = input.agentErrorMessage &&
    classifyAgentMessageAsPlainTextTool(input.agentErrorMessage)
      ? 1
      : 0
  if (toolEndErrors === 0 && toolCallAsPlainText === 0) return undefined
  return {
    role: input.role,
    runtime: input.runtime,
    model: input.model,
    toolEndErrors,
    toolCallAsPlainText,
  }
}

export function mergeToolErrorStatRows(rows: ToolErrorStatRow[]): ToolErrorStatRow[] {
  const map = new Map<string, ToolErrorStatRow>()
  for (const row of rows) {
    const key = `${row.role}|${row.runtime}|${row.model}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...row })
      continue
    }
    prev.toolEndErrors += row.toolEndErrors
    prev.toolCallAsPlainText += row.toolCallAsPlainText
  }
  return [...map.values()].sort(
    (a, b) =>
      a.role.localeCompare(b.role) ||
      a.runtime.localeCompare(b.runtime) ||
      a.model.localeCompare(b.model),
  )
}

export function aggregateToolErrorsFromLog(
  entries: { toolErrorStats?: ToolErrorStatRow[] }[],
): ToolErrorStatRow[] {
  return mergeToolErrorStatRows(entries.flatMap((e) => e.toolErrorStats ?? []))
}

export function formatToolErrorStatsMarkdown(rows: ToolErrorStatRow[]): string[] {
  if (rows.length === 0) return []
  const lines = ['## Expected tool errors', '', '| Role | Runtime | Model | tool_end errors | plain-text tool calls |', '| --- | --- | --- | ---: | ---: |']
  for (const row of rows) {
    lines.push(
      `| ${row.role} | ${row.runtime} | ${row.model} | ${row.toolEndErrors} | ${row.toolCallAsPlainText} |`,
    )
  }
  lines.push('')
  return lines
}
