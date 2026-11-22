/**
 * Parser for implementation plans written by the shadcn/improve skill
 * (https://github.com/shadcn/improve, MIT). A plan is `plans/NNN-slug.md`
 * with fixed sections (Status, Why this matters, Scope, Steps, Done criteria,
 * STOP conditions, …); `plans/README.md` holds the execution order + status.
 *
 * Pure: no fs. `improveBundle.ts` turns a parsed plan into a loop bundle.
 */

export type PlanCheckExpect = 'zero' | 'empty' | 'nonzero'

export type PlanCheck = {
  /** Shell command, run from the repo root. */
  command: string
  expect: PlanCheckExpect
  /** True when the plan text did not state the expectation and `zero` was assumed. */
  inferred: boolean
  /** Source line in the plan (criterion or step verify). */
  source: string
}

export type PlanCriterion = {
  text: string
  checks: PlanCheck[]
  /** "No files outside the in-scope list are modified" — enforced by a generated scope check. */
  scopeCheck: boolean
  /** Index bookkeeping (`plans/README.md` status row) — dropped; the harness reports status. */
  indexBookkeeping: boolean
}

export type ImprovePlan = {
  /** Three-digit plan number from the title or filename (e.g. `001`). */
  number: string
  slug: string
  title: string
  priority?: string
  effort?: string
  risk?: string
  category?: string
  /** Plan numbers this plan depends on. */
  dependsOn: string[]
  plannedAtSha?: string
  plannedAtDate?: string
  /** Paths from the drift-check command, else the in-scope list. */
  driftPaths: string[]
  why: string
  inScope: string[]
  outOfScope: string[]
  installCommand?: string
  criteria: PlanCriterion[]
  stepChecks: PlanCheck[]
  stopConditions: string[]
  reviewerFocus: string[]
  /** Plan body with the executor-instructions blockquote removed (it targets `plans/README.md`). */
  body: string
  warnings: string[]
}

export type PlanIndexRow = {
  number: string
  title: string
  status: string
  dependsOn: string[]
}

/** First tokens that make a backtick span a runnable command rather than a symbol or path. */
const COMMAND_RUNNERS = new Set([
  'pnpm', 'npm', 'npx', 'yarn', 'bun', 'bunx', 'node', 'deno', 'tsx',
  'git', 'grep', 'rg', 'test', 'make', 'just', 'cargo', 'go', 'python', 'python3',
  'pytest', 'uv', 'uvx', 'poetry', 'tsc', 'vitest', 'jest', 'eslint', 'prettier',
  'biome', 'ruff', 'mypy', 'bash', 'sh', 'ls', 'find', 'diff', 'cmp', 'wc', 'jq',
  'turbo', 'nx', 'mvn', 'gradle', './gradlew', 'dotnet', 'swift', 'mix', 'bundle', 'rake',
  // Recognized only so UNSAFE_COMMAND can reject them with a warning.
  'rm', 'curl', 'wget', 'sudo', 'ssh', 'scp',
])

/** Mutating / network commands never copied into verify.sh. */
const UNSAFE_COMMAND =
  /(^|[;&|]\s*)(sudo|rm|curl|wget|ssh|scp)\b|\bgit\s+(push|commit|reset|checkout|switch|clean|rebase|merge|stash|tag|restore|am|apply|cherry-pick)\b|\|\s*(ba)?sh\b|\b(pnpm|npm|yarn|bun)\s+(install|i|add|remove|publish|update|up)\b/

const EMPTY_EXPECT = /\b(no match(es)?|returns? nothing|no output|returns? empty|is empty|no results|zero matches|finds nothing|prints nothing)\b/i
const NONZERO_EXPECT = /\bexits?\s+(non-?zero|with (a )?non-?zero)\b/i
const ZERO_EXPECT = /\bexit(s|ed)?\s*(code\s*)?`?0`?|\b(all )?pass(es|ing)?\b|\bsucceeds?\b|\bgreen\b|\bno errors\b|\bclean\b/i

const SCOPE_CRITERION = /outside (of )?the in-scope|in-scope list|no (other )?files outside|out-of-scope files? (are|is) (un)?(modified|touched)/i
const INDEX_CRITERION = /plans\/README\.md|status row/i

type Section = { heading: string; level: number; lines: string[] }

function isFence(line: string): boolean {
  return /^\s*(```|~~~)/.test(line)
}

/** Split on `#`/`##` headings outside code fences. Level-3 headings stay inside their section. */
function splitSections(markdown: string): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = []
  const sections: Section[] = []
  let inFence = false
  for (const line of markdown.split(/\r?\n/)) {
    if (isFence(line)) inFence = !inFence
    const m = !inFence ? /^(#{1,2})\s+(.*?)\s*#*\s*$/.exec(line) : null
    if (m) {
      sections.push({ heading: m[2], level: m[1].length, lines: [] })
      continue
    }
    if (sections.length === 0) preamble.push(line)
    else sections[sections.length - 1].lines.push(line)
  }
  return { preamble, sections }
}

function section(sections: Section[], pattern: RegExp): Section | undefined {
  return sections.find((s) => s.level === 2 && pattern.test(s.heading))
}

function text(lines: string[] | undefined): string {
  return (lines ?? []).join('\n').trim()
}

/** Top-level bullets (`- x` / `* x` / `- [ ] x`), continuation lines folded in. Skips fenced code. */
function bullets(lines: string[]): string[] {
  const out: string[] = []
  let inFence = false
  for (const line of lines) {
    if (isFence(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^[-*]\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line)
    if (m) {
      out.push(m[1].trim())
      continue
    }
    if (out.length > 0 && /^\s{2,}\S/.test(line)) {
      out[out.length - 1] += ` ${line.trim()}`
    }
  }
  return out
}

function backtickSpans(s: string): string[] {
  return [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim())
}

function firstBacktick(s: string): string | undefined {
  return backtickSpans(s)[0]
}

export function looksLikeCommand(span: string): boolean {
  const first = span.trim().split(/\s+/)[0] ?? ''
  if (!span.includes(' ') && !first.startsWith('./')) return false
  if (COMMAND_RUNNERS.has(first)) return true
  return /^\.\/[\w./-]+$/.test(first) || /^[\w-]+\/[\w./-]+\.(sh|mjs|cjs|js|py)$/.test(first)
}

export function classifyExpect(context: string): { expect: PlanCheckExpect; inferred: boolean } {
  if (EMPTY_EXPECT.test(context)) return { expect: 'empty', inferred: false }
  if (NONZERO_EXPECT.test(context)) return { expect: 'nonzero', inferred: false }
  if (ZERO_EXPECT.test(context)) return { expect: 'zero', inferred: false }
  return { expect: 'zero', inferred: true }
}

/**
 * Pull runnable checks out of one criterion / verify line. Each command's
 * expectation is read from the text after it (up to the next command).
 */
export function extractChecks(line: string, warnings: string[]): PlanCheck[] {
  const spans = [...line.matchAll(/`([^`]+)`/g)]
  const checks: PlanCheck[] = []
  for (let i = 0; i < spans.length; i++) {
    const command = spans[i][1].trim()
    if (!looksLikeCommand(command)) continue
    if (/<[^>]+>/.test(command)) {
      warnings.push(`skipped placeholder command \`${command}\` (unrendered template slot)`)
      continue
    }
    if (UNSAFE_COMMAND.test(command)) {
      warnings.push(`skipped mutating/network command \`${command}\` — verify.sh stays read-only`)
      continue
    }
    const start = (spans[i].index ?? 0) + spans[i][0].length
    let end = line.length
    for (let j = i + 1; j < spans.length; j++) {
      if (looksLikeCommand(spans[j][1])) {
        end = spans[j].index ?? line.length
        break
      }
    }
    const { expect, inferred } = classifyExpect(line.slice(start, end))
    checks.push({ command, expect, inferred, source: line })
  }
  return checks
}

function statusField(lines: string[], key: string): string | undefined {
  const re = new RegExp(`^[-*]\\s+\\*\\*${key}\\*\\*\\s*:\\s*(.+)$`, 'i')
  for (const line of lines) {
    const m = re.exec(line.trim())
    if (m) return m[1].trim()
  }
  return undefined
}

export function parsePlanNumbers(value: string | undefined): string[] {
  if (!value || /^(none|—|-|n\/a)$/i.test(value.trim())) return []
  return [...new Set([...value.matchAll(/\b(\d{3})\b/g)].map((m) => m[1]))]
}

/** Strip the plan's executor-instructions blockquote, returning the drift-check paths it named. */
function stripExecutorBlockquote(lines: string[]): { lines: string[]; driftPaths: string[] } {
  const out: string[] = []
  let driftPaths: string[] = []
  let i = 0
  while (i < lines.length) {
    if (/^>\s*\*\*Executor instructions\*\*/i.test(lines[i])) {
      while (i < lines.length && /^>/.test(lines[i])) {
        const drift = /git diff --stat\s+\S+\s+--\s+([^`]+)`/.exec(lines[i])
        if (drift) driftPaths = drift[1].trim().split(/\s+/)
        i++
      }
      continue
    }
    out.push(lines[i])
    i++
  }
  return { lines: out, driftPaths }
}

function scopeLists(lines: string[]): { inScope: string[]; outOfScope: string[] } {
  const inLines: string[] = []
  const outLines: string[] = []
  let target: string[] | undefined
  for (const line of lines) {
    if (/^\*\*In scope\*\*/i.test(line.trim())) {
      target = inLines
      continue
    }
    if (/^\*\*Out of scope\*\*/i.test(line.trim())) {
      target = outLines
      continue
    }
    target?.push(line)
  }
  const inScope = bullets(inLines)
    .map((b) => firstBacktick(b))
    .filter((p): p is string => Boolean(p))
  return { inScope, outOfScope: bullets(outLines) }
}

function installFromCommands(lines: string[]): string | undefined {
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 3 || !/install/i.test(cells[1] ?? '')) continue
    const cmd = firstBacktick(cells[2] ?? '')
    if (cmd && !/<[^>]+>/.test(cmd)) return cmd
  }
  return undefined
}

function slugFromFilename(fileName: string | undefined): { number?: string; slug?: string } {
  const base = (fileName ?? '').replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '') ?? ''
  const m = /^(\d{3})-(.+)$/.exec(base)
  return m ? { number: m[1], slug: m[2] } : {}
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
}

export function parseImprovePlan(markdown: string, fileName?: string): ImprovePlan {
  const warnings: string[] = []
  const stripped = stripExecutorBlockquote(markdown.split(/\r?\n/))
  const body = stripped.lines.join('\n')
  const { sections } = splitSections(body)

  const titleSection = sections.find((s) => s.level === 1)
  const titleMatch = /^Plan\s+(\d{3})\s*[:—–-]\s*(.+)$/i.exec(titleSection?.heading ?? '')
  const fromFile = slugFromFilename(fileName)
  const number = titleMatch?.[1] ?? fromFile.number
  const title = (titleMatch?.[2] ?? titleSection?.heading ?? '').trim()
  if (!number) {
    throw new Error('Not an improve plan: no "# Plan NNN: …" title and no NNN-slug.md filename.')
  }
  if (!title) throw new Error(`Plan ${number}: missing title.`)

  const status = section(sections, /^status$/i)?.lines ?? []
  const plannedAt = statusField(status, 'Planned at')
  const shaMatch = plannedAt ? /`?([0-9a-f]{7,40})`?/i.exec(plannedAt) : null
  const dateMatch = plannedAt ? /(\d{4}-\d{2}-\d{2})/.exec(plannedAt) : null

  const scope = scopeLists(section(sections, /^scope$/i)?.lines ?? [])
  if (scope.inScope.length === 0) warnings.push('no in-scope file list — scope check disabled')

  const doneSection = section(sections, /^done criteria$/i)
  if (!doneSection) warnings.push('no "## Done criteria" section')
  const criteria: PlanCriterion[] = bullets(doneSection?.lines ?? []).map((item) => {
    const indexBookkeeping = INDEX_CRITERION.test(item)
    const scopeCheck = !indexBookkeeping && SCOPE_CRITERION.test(item)
    const checks =
      indexBookkeeping || scopeCheck ? [] : extractChecks(item, warnings)
    return { text: item, checks, scopeCheck, indexBookkeeping }
  })

  const stepChecks: PlanCheck[] = []
  for (const line of section(sections, /^steps$/i)?.lines ?? []) {
    const m = /^\*\*Verify\*\*\s*:\s*(.+)$/i.exec(line.trim())
    if (m) stepChecks.push(...extractChecks(m[1], warnings))
  }

  const maintenance = bullets(section(sections, /^maintenance notes$/i)?.lines ?? [])
  const reviewerFocus = maintenance.filter((b) => /reviewer|scrutini[sz]e/i.test(b))

  const driftPaths = stripped.driftPaths.length > 0 ? stripped.driftPaths : scope.inScope
  if (!shaMatch) warnings.push('no "Planned at" commit — drift check disabled')

  return {
    number,
    slug: fromFile.number === number && fromFile.slug ? fromFile.slug : slugify(title),
    title,
    priority: statusField(status, 'Priority'),
    effort: statusField(status, 'Effort'),
    risk: statusField(status, 'Risk'),
    category: statusField(status, 'Category'),
    dependsOn: parsePlanNumbers(statusField(status, 'Depends on')).filter((n) => n !== number),
    plannedAtSha: shaMatch?.[1],
    plannedAtDate: dateMatch?.[1],
    driftPaths,
    why: text(section(sections, /^why this matters$/i)?.lines),
    inScope: scope.inScope,
    outOfScope: scope.outOfScope,
    installCommand: installFromCommands(section(sections, /^commands you will need$/i)?.lines ?? []),
    criteria,
    stepChecks,
    stopConditions: bullets(section(sections, /^stop conditions$/i)?.lines ?? []),
    reviewerFocus,
    body,
    warnings,
  }
}

const INDEX_STATUSES = ['IN PROGRESS', 'TODO', 'DONE', 'BLOCKED', 'REJECTED'] as const

/** Parse the `plans/README.md` "Execution order & status" table. */
export function parsePlanIndex(markdown: string): PlanIndexRow[] {
  const rows: PlanIndexRow[] = []
  let cols: string[] | undefined
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('|')) {
      cols = undefined
      continue
    }
    const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    if (!cols) {
      const lower = cells.map((c) => c.toLowerCase())
      if (lower.includes('plan') && lower.includes('status')) cols = lower
      continue
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue
    const get = (name: string) => cells[cols!.indexOf(name)] ?? ''
    const number = /(\d{3})/.exec(get('plan'))?.[1]
    if (!number) continue
    const rawStatus = get('status').toUpperCase()
    rows.push({
      number,
      title: get('title'),
      status: INDEX_STATUSES.find((s) => rawStatus.startsWith(s)) ?? rawStatus,
      dependsOn: parsePlanNumbers(get('depends on')),
    })
  }
  return rows
}
