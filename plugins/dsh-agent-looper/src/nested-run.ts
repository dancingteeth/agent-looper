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

/** Shell keywords/wrappers that can sit in front of the real command position. */
const LEADING_WRAPPER_WORDS = new Set(['command', 'exec', 'builtin', 'sudo', 'nohup', 'time', 'env'])

/** Drop leading assignments / builtins / `doppler run … --` so `words[0]` is the real command. */
function skipLeadingPrefixWords(words: string[]): string[] {
  let index = 0
  while (index < words.length) {
    const word = words[index]
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      index += 1
      continue
    }
    if (LEADING_WRAPPER_WORDS.has(word)) {
      index += 1
      continue
    }
    if (word === 'doppler' && words[index + 1] === 'run') {
      let cursor = index + 2
      while (cursor < words.length && words[cursor] !== '--') cursor += 1
      if (cursor < words.length) {
        index = cursor + 1
        continue
      }
    }
    break
  }
  return words.slice(index)
}

function heredocBodyIsCode(operatorLine: string): boolean {
  const before = operatorLine.split('<<')[0] ?? ''
  const words = skipLeadingPrefixWords(before.trim().split(/\s+/).filter(Boolean))
  const head = (words[0] ?? '').replace(/^.*\//, '')
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
  /\b(?:bash|sh|zsh|dash|ksh)\b(?:\s+-{1,2}[A-Za-z][A-Za-z-]*)*\s+-{1,2}[A-Za-z]*c\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s;|&]+))/g
const EVAL_RE = /\beval\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s;|&]+))/g

/** Read a balanced `open…close` group starting just after `open`; `undefined` when unbalanced. */
function readBalanced(
  text: string,
  start: number,
  open: string,
  close: string,
): { body: string; end: number } | undefined {
  let depth = 0
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\\') {
      index += 1
      continue
    }
    if (char === open) depth += 1
    else if (char === close) {
      if (depth === 0) return { body: text.slice(start, index), end: index }
      depth -= 1
    }
  }
  return undefined
}

/**
 * Rewrite `bash -c "…"` / `eval "…"` wrappers into their payload and hoist command substitutions
 * (`$(…)`, `` `…` ``) onto fresh lines so the inner command is classified even when it sits inside
 * quotes or an assignment. A substitution site is blanked; its body is appended for a later pass.
 */
function unwrapShell(command: string): string {
  let text = command
  for (let pass = 0; pass < 8; pass += 1) {
    let blanked = ''
    const bodies: string[] = []
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index]
      if (char === '\\' && index + 1 < text.length) {
        blanked += char + text[index + 1]
        index += 1
        continue
      }
      if (char === '$' && text[index + 1] === '(') {
        const group = readBalanced(text, index + 2, '(', ')')
        if (group) {
          bodies.push(group.body)
          blanked += ' '
          index = group.end
          continue
        }
      }
      if (char === '`') {
        const close = text.indexOf('`', index + 1)
        if (close >= 0) {
          bodies.push(text.slice(index + 1, close))
          blanked += ' '
          index = close
          continue
        }
      }
      blanked += char
    }
    const combined = bodies.length > 0 ? `${blanked}\n${bodies.join('\n')}` : blanked
    const next = combined.replace(SHELL_WRAPPER_RE, '$1$2$3').replace(EVAL_RE, '$1$2$3')
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
const LEADING_ASSIGNMENT_RE = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)+/
const LEADING_WRAPPER_RE =
  /^(?:command|exec|builtin|sudo|nohup|time|env)\b(?:\s+-{1,2}[A-Za-z][A-Za-z-]*)*\s+/
const DOPPLER_RUN_PREFIX_RE = /^doppler\s+run\b[\s\S]*?\s--\s+/

/** Skip assignments / builtins / `doppler run … --` so the head is the real command position. */
function stripLeadingPrefixes(text: string): string {
  let result = text
  for (let pass = 0; pass < 8; pass += 1) {
    const before = result
    result = result
      .replace(LEADING_ASSIGNMENT_RE, '')
      .replace(LEADING_WRAPPER_RE, '')
      .replace(DOPPLER_RUN_PREFIX_RE, '')
    if (result === before) return result
  }
  return result
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
  if (/^agent-loop-batch(?:\.js)?$/.test(head)) {
    return hasInvokedScript(words, /^agent-loop-batch(?:\.js)?$/)
  }
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
  text = stripLeadingPrefixes(text)
  if (PACKAGE_SCRIPT_GRIND_RE.test(text)) return true
  return isGrindTokens(shellWords(stripRunnerPrefixes(text)))
}

/**
 * True when the shell line would spawn the Agent Looper grind (not --help / init).
 * Mentions inside quotes (`rg`, `git log --grep`, `sed`, doc-writing heredocs) are allowed.
 */
export function isAgentLoopRunCommand(command: string): boolean {
  const code = unwrapShell(withoutDataHeredoc(command))
  for (const segment of splitShellSegments(code)) {
    if (isGrindInvocation(segment)) return true
  }
  return false
}

const SECRET_FILE_RE = /(?:\.doppler\.yaml|\.credentials\.ya?ml)\b/
const OPENCODE_AUTH_RE = /opencode[/\\]auth\.json/
const READER_TOOL_RE =
  /\b(?:cat|bat|tac|less|more|head|tail|grep|rg|awk|sed|cut|sort|uniq|strings|xxd|od|base64|python3?|perl|ruby|node|jq|yq|read|type|open|source|cp|mv|rsync|install)\b/i

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
