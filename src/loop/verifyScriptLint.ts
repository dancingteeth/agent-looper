export type VerifyScriptLintResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const ASSIGN_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(['"])([\s\S]*)\2\s*$/

/** Split an extended-grep pattern on `|` that is not inside `[]`. */
export function splitGrepAlternatives(pattern: string): string[] {
  const alts: string[] = []
  let cur = ''
  let inClass = false
  let escape = false
  for (const ch of pattern) {
    if (escape) {
      cur += ch
      escape = false
      continue
    }
    if (ch === '\\') {
      cur += ch
      escape = true
      continue
    }
    if (ch === '[' && !inClass) {
      inClass = true
      cur += ch
      continue
    }
    if (ch === ']' && inClass) {
      inClass = false
      cur += ch
      continue
    }
    if (ch === '|' && !inClass) {
      alts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  alts.push(cur)
  return alts
}

function uncommentedLines(source: string): string[] {
  return source.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('#')
  })
}

function parseAssignments(lines: readonly string[]): Map<string, string> {
  const assigned = new Map<string, string>()
  for (const line of lines) {
    const match = line.match(ASSIGN_RE)
    if (!match) continue
    assigned.set(match[1]!, match[3]!)
  }
  return assigned
}

function expandGrepHaystack(line: string, assigned: Map<string, string>): string {
  return line.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (whole, name: string) => {
    const value = assigned.get(name)
    return value !== undefined ? value : whole
  })
}

function quotedChunks(text: string): string[] {
  const chunks: string[] = []
  const re = /(['"])((?:\\.|[^\\])*?)\1/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    chunks.push(match[2]!.replace(/\\(.)/g, '$1'))
  }
  return chunks
}

function isGrepLine(line: string): boolean {
  return /\bgrep\b/.test(line)
}

function isTitleRosterOr(pattern: string): boolean {
  const alts = splitGrepAlternatives(pattern).map((part) => part.trim()).filter(Boolean)
  if (alts.length < 2) return false
  const spaced = alts.filter((part) => /\s/.test(part))
  if (spaced.length >= 2) return true
  return alts.length >= 3 && spaced.length >= 1
}

function isQuotedStringExtractor(pattern: string): boolean {
  return /\[[^\]]*?\^["'][^\]]*?\]\+/.test(pattern)
}

function formatLintMessage(result: VerifyScriptLintResult): string {
  const lines: string[] = []
  for (const error of result.errors) lines.push(`  error: ${error}`)
  for (const warning of result.warnings) lines.push(`  warn: ${warning}`)
  return lines.join('\n')
}

/**
 * Catch scoreboards that print OK while missing the ritual (museum2: title OR,
 * single-line caption grep, `it(` count as quality).
 */
export function lintVerifyScript(source: string): VerifyScriptLintResult {
  const errors: string[] = []
  const warnings: string[] = []
  const lines = uncommentedLines(source)
  const assigned = parseAssignments(lines)

  for (const line of lines) {
    if (!isGrepLine(line)) continue
    const haystack = expandGrepHaystack(line, assigned)
    for (const pattern of quotedChunks(haystack)) {
      if (isTitleRosterOr(pattern)) {
        errors.push(
          'grep -E with `|` alternatives treats one match as success — loop over required titles/ids instead of `A|B|C`.',
        )
        break
      }
      if (isQuotedStringExtractor(pattern)) {
        errors.push(
          'single-line `"[^"]+"` / `\'[^\']+\'` grep misses wrapped TS/markdown strings (museum2 captions printed OK with zero matches).',
        )
        break
      }
    }
    if (/grep\s+-c\s+['"]it\(/.test(line) || /grep\s+-c\s+it\(/.test(line)) {
      warnings.push(
        '`grep -c \'it(\'` counts test wrappers, not rituals — assert applyState / mesh changes instead.',
      )
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}

export function formatVerifyScriptLintMessage(result: VerifyScriptLintResult): string {
  return formatLintMessage(result)
}

export function verifyScriptLintWarning(loopLabel: string, result: VerifyScriptLintResult): string {
  return `${loopLabel}: verify.sh scoreboard looks gameable:\n${formatVerifyScriptLintMessage(result)}`
}
