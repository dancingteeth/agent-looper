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

/** Interpreters whose heredoc body is *code* (scan it), not data (drop it). */
const EXECUTED_HEREDOC_CONSUMERS = new Set([
  'bash',
  'sh',
  'zsh',
  'dash',
  'ksh',
  'node',
  'nodejs',
  'python',
  'python3',
  'perl',
  'ruby',
  'php',
])

/** Commands whose heredoc body is written to a file/stdout and must not be treated as code. */
const DATA_HEREDOC_CONSUMERS = new Set(['cat', 'tee', 'dd', 'cp', 'mv', 'sed', 'awk'])

function heredocBodyIsCode(operatorLine: string): boolean {
  const before = operatorLine.split('<<')[0] ?? ''
  const words = before.trim().split(/\s+/).filter(Boolean)
  let index = 0
  while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) index += 1
  const head = (words[index] ?? '').replace(/^.*\//, '')
  if (EXECUTED_HEREDOC_CONSUMERS.has(head)) return true
  if (DATA_HEREDOC_CONSUMERS.has(head)) return false
  return false
}

/**
 * Drop heredoc bodies that are *data* (writing package.json / docs that mention the CLI) but keep
 * the body when the consumer is an interpreter (`bash <<EOF`, `sh -s <<EOF`) — that body is code.
 */
function withoutDataHeredoc(command: string): string {
  const lines = command.split('\n')
  const kept: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    kept.push(line)
    const marker = line.match(/<<-?\s*(?:['"]([A-Za-z_][A-Za-z0-9_]*)['"]|([A-Za-z_][A-Za-z0-9_]*))/)
    if (!marker) continue
    const terminator = marker[1] ?? marker[2] ?? ''
    const keepBody = heredocBodyIsCode(line)
    index += 1
    while (index < lines.length && lines[index].trim() !== terminator) {
      if (keepBody) kept.push(lines[index])
      index += 1
    }
  }
  return kept.join('\n')
}

const SHELL_WRAPPER_RE =
  /\b(?:bash|sh|zsh|dash|ksh)\s+(?:-[A-Za-z]+\s+)*-c\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s;|&]+))/g
const EVAL_RE = /\beval\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s;|&]+))/g

/** Rewrite `bash -c "…"` / `eval "…"` wrappers into their payload so the inner command is scanned. */
function unwrapEvaluated(command: string): string {
  let text = command
  for (let pass = 0; pass < 8; pass += 1) {
    const next = text.replace(SHELL_WRAPPER_RE, '$1$2$3').replace(EVAL_RE, '$1$2$3')
    if (next === text) break
    text = next
  }
  return text
}

/** Split shell code on unquoted `;`/`&&`/`||`/`|`/`&`/newlines, respecting quotes. */
function splitShellSegments(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let quote: string | undefined
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (quote !== undefined) {
      current += char
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '\\') {
      current += char
      if (index + 1 < command.length) {
        index += 1
        current += command[index]
      }
      continue
    }
    if (char === '\n' || char === ';') {
      segments.push(current)
      current = ''
      continue
    }
    if (char === '&' || char === '|') {
      segments.push(current)
      current = ''
      if (command[index + 1] === char) index += 1
      continue
    }
    current += char
  }
  segments.push(current)
  return segments
}

/** Split one segment into shell words, stripping single/double quotes. */
function shellWords(segment: string): string[] {
  const words: string[] = []
  let current = ''
  let quote: string | undefined
  let hasToken = false
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index]
    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined
        continue
      }
      if (char === '\\' && quote === '"' && index + 1 < segment.length) {
        index += 1
        current += segment[index]
        continue
      }
      current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      hasToken = true
      continue
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        words.push(current)
        current = ''
        hasToken = false
      }
      continue
    }
    current += char
    hasToken = true
  }
  if (hasToken) words.push(current)
  return words
}

const PACKAGE_SCRIPT_GRIND_RE = /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?agent:loop\b/

function stripLeadingEnvironment(text: string): string {
  return text.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)+/, '')
}

function stripLeadingBuiltins(text: string): string {
  return text.replace(/^(?:command|exec|builtin|sudo|nohup|time)\s+/, '')
}

function stripRunnerPrefixes(text: string): string {
  let result = text
  for (let pass = 0; pass < 4; pass += 1) {
    const next = result
      .replace(/^(?:npx|pnpx|bunx)\s+/, '')
      .replace(/^(?:npm|pnpm|yarn|bun)\s+(?:exec|dlx|x)\s+/, '')
    if (next === result) return result
    result = next
  }
  return result
}

/** True when `words` invokes `scriptPattern` with any argument other than `--help`/`-h`. */
function hasInvokedScript(words: string[], scriptPattern: RegExp): boolean {
  const index = words.findIndex((word) => scriptPattern.test(word))
  if (index < 0) return false
  const args = words.slice(index + 1)
  if (args.length === 0) return false
  return !args.every((arg) => /^(?:--help|-h)$/.test(arg))
}

function isGrindTokens(words: string[]): boolean {
  const head = words[0]
  if (head === undefined) return false
  if (/^agent-loop(?:\.js)?$/.test(head)) return words[1] === 'run'
  if (/^agent-loop-batch(?:\.js)?$/.test(head)) return true
  if (head === 'node' || head === 'nodejs') {
    return (
      hasInvokedScript(words, /dist\/cli\/run(?:-batch)?\.js$/) ||
      hasInvokedScript(words, /src\/cli\/run(?:-batch)?\.ts$/)
    )
  }
  if (head === 'tsx' || head === 'ts-node' || head === 'ts-node-esm') {
    return hasInvokedScript(words, /src\/cli\/run(?:-batch)?\.ts$/)
  }
  return false
}

/** True when a shell segment starts the Agent Looper grind (not --help / init / a mere mention). */
function isGrindInvocation(segment: string): boolean {
  let text = segment.trim()
  if (text === '') return false
  text = stripLeadingEnvironment(text)
  text = stripLeadingBuiltins(text)
  if (PACKAGE_SCRIPT_GRIND_RE.test(text)) return true
  return isGrindTokens(shellWords(stripRunnerPrefixes(text)))
}

/**
 * True when the shell line would spawn the Agent Looper grind (not --help / init).
 * Mentions inside quotes (`rg`, `git log --grep`, `sed`, doc-writing heredocs) are allowed.
 */
export function isAgentLoopRunCommand(command: string): boolean {
  const code = unwrapEvaluated(withoutDataHeredoc(command))
  for (const segment of splitShellSegments(code)) {
    if (isGrindInvocation(segment)) return true
  }
  return false
}

const SECRET_FILE_RE = /(?:\.doppler\.yaml|\.credentials\.ya?ml)\b/
const OPENCODE_AUTH_RE = /opencode[/\\]auth\.json/
const READER_TOOL_RE =
  /\b(?:cat|bat|tac|less|more|head|tail|grep|rg|awk|sed|cut|sort|uniq|strings|xxd|od|base64|python3?|perl|ruby|node|jq|yq|read|type|open|source)\b/i

export function isSecretDumpCommand(command: string): boolean {
  const visible = withoutDataHeredoc(command)
  if (/\bdoppler\s+secrets\b/.test(visible)) return true
  if (/\bDOPPLER_TOKEN\s*=/.test(visible)) return true
  if (OPENCODE_AUTH_RE.test(visible)) return true
  if (SECRET_FILE_RE.test(visible) && READER_TOOL_RE.test(visible)) return true
  return false
}

const SHELL_TOOLS: readonly string[] = ['bash', 'pwsh']

export function nestedAgentLoopRunReason(toolName: string, args: unknown): string | undefined {
  if (!SHELL_TOOLS.includes(toolName)) return undefined
  const command = bashCommand(args)
  if (command === undefined) return undefined
  if (!isAgentLoopRunCommand(command)) return undefined
  if (isBashRunInBackground(args)) return undefined
  return NESTED_RUN_DENIAL
}

export function secretDumpReason(toolName: string, args: unknown): string | undefined {
  if (!SHELL_TOOLS.includes(toolName)) return undefined
  const command = bashCommand(args)
  if (command === undefined) return undefined
  if (!isSecretDumpCommand(command)) return undefined
  return SECRET_DUMP_DENIAL
}
