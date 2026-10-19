export const FOREGROUND_RUN_DENIAL = [
  'Blocked: do not start `agent-loop run` / `agent-loop-batch` in the OpenCode shell tool.',
  'The shell tool times out long before a grind finishes and kills it.',
  'Call the `agent_loop_start` tool with the loop dir instead, then `agent_loop_status` when asked.',
  '`--help` is still allowed.',
].join(' ')

/** Matches the grind entrypoints: `agent-loop run`, `agent-loop-batch`, `node dist/cli/run(-batch).js`. */
const GRIND_RE = /(?:^|[\s;&|(`])(?:agent-loop\s+run\b|agent-loop-batch\b|(?:\S*\/)?dist\/cli\/run(?:-batch)?\.js\b)/

/**
 * Best-effort tripwire against *accidental* foreground grinds (bash timeout kills them).
 * It matches literal command text, so indirection (`sh -c "$CMD"`) slips past by design — not a sandbox.
 */
export function foregroundRunReason(tool: string, args: unknown): string | undefined {
  // 1.x calls it `bash`, 2.x `shell`.
  if (tool !== 'bash' && tool !== 'shell') return undefined
  if (args === null || typeof args !== 'object') return undefined
  const command = (args as { command?: unknown }).command
  if (typeof command !== 'string') return undefined
  if (!GRIND_RE.test(command)) return undefined
  if (/(?:^|\s)(?:--help|-h)(?:\s|$)/.test(command)) return undefined
  return FOREGROUND_RUN_DENIAL
}
