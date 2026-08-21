export const NESTED_RUN_DENIAL = [
  'Blocked: do not start `agent-loop run` (or `node dist/cli/run.js <loop-dir>`) in *foreground* DSH bash.',
  'Foreground bash times out (~60s) and kills the grind.',
  'Retry the same command with bash `run_in_background: true`, then `job_output` / `job_kill`.',
  'Load skill `run-loop-in-dsh`. `--help` is still allowed in the foreground.',
].join(' ')

export const SECRET_DUMP_DENIAL = [
  'Blocked: do not dump Doppler tokens, DSH credentials-local, OpenCode auth.json, or `doppler secrets` from DSH.',
  'Those files land in the session log. Tell the user to set keys in a host terminal:',
  '`doppler run --project <name> --config <config> -- agent-loop run …` or `export OPENCODE_API_KEY=…`.',
  'Bare `doppler run --` fails with "You must specify a project" unless this directory is Doppler-scoped.',
].join(' ')

function bashCommand(args: unknown): string | undefined {
  if (args === null || typeof args !== 'object') return undefined
  const command = (args as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}

/** DSH bash schema: `run_in_background: true` registers a ctx.jobs task (no foreground timeout). */
export function isBashRunInBackground(args: unknown): boolean {
  if (args === null || typeof args !== 'object') return false
  return (args as { run_in_background?: unknown }).run_in_background === true
}

/** Drop heredoc bodies so writing package.json / docs that mention the CLI is not a grind. */
function withoutHeredoc(command: string): string {
  return command.replace(/<<[\s\S]*$/, '')
}

/** True when the shell line would spawn the Agent Looper grind (not --help / init). */
export function isAgentLoopRunCommand(command: string): boolean {
  const visible = withoutHeredoc(command)
  if (/\bagent-loop(?:\.js)?\s+run\b/.test(visible)) return true
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?agent:loop\b/.test(visible)) return true
  if (isDistCliRunGrind(visible)) return true
  return false
}

/** `node dist/cli/run.js <loop-dir>` (dogfood when package bins are missing). */
function isDistCliRunGrind(visible: string): boolean {
  if (!/\b(?:node|nodejs)\b/.test(visible)) return false
  if (!/\bdist\/cli\/run\.js\b/.test(visible)) return false
  const after = visible.split(/\bdist\/cli\/run\.js\b/).pop() ?? ''
  if (/^\s*(?:--help|-h)?\s*$/.test(after)) return false
  return true
}

export function isSecretDumpCommand(command: string): boolean {
  const visible = withoutHeredoc(command)
  if (/\bdoppler\s+secrets\b/.test(visible)) return true
  if (/\bDOPPLER_TOKEN\s*=/.test(visible)) return true
  if (/(?:^|[/\s])\.doppler\.yaml\b/.test(visible) && /\b(?:cat|less|more|head|tail|bat|python3?)\b/.test(visible)) {
    return true
  }
  if (
    /\.credentials\.ya?ml\b/.test(visible) &&
    /\b(?:cat|less|more|head|tail|bat|grep|rg|sed|awk|python3?)\b/.test(visible)
  ) {
    return true
  }
  if (/opencode\/auth\.json/.test(visible)) return true
  return false
}

export function nestedAgentLoopRunReason(toolName: string, args: unknown): string | undefined {
  if (toolName !== 'bash') return undefined
  const command = bashCommand(args)
  if (command === undefined) return undefined
  if (!isAgentLoopRunCommand(command)) return undefined
  if (isBashRunInBackground(args)) return undefined
  return NESTED_RUN_DENIAL
}

export function secretDumpReason(toolName: string, args: unknown): string | undefined {
  if (toolName !== 'bash') return undefined
  const command = bashCommand(args)
  if (command === undefined) return undefined
  if (!isSecretDumpCommand(command)) return undefined
  return SECRET_DUMP_DENIAL
}

export function dshBashGuardReason(toolName: string, args: unknown): string | undefined {
  return secretDumpReason(toolName, args) ?? nestedAgentLoopRunReason(toolName, args)
}
