import fs from 'node:fs'
import path from 'node:path'
import type { VerifyResult } from './loopVerify.js'

export const LESSONS_FILENAME = 'lessons.md'
export const LESSONS_MAX_CHARS = 6000

const GOTCHA_PREFIX = '- '

export function lessonsPath(loopDir: string): string {
  return path.join(loopDir, LESSONS_FILENAME)
}

export function readLessons(loopDir: string): string | undefined {
  const filePath = lessonsPath(loopDir)
  if (!fs.existsSync(filePath)) return undefined
  const text = fs.readFileSync(filePath, 'utf8').trim()
  return text || undefined
}

function firstOutputLine(verify: VerifyResult): string | undefined {
  const combined = [verify.stdout, verify.stderr].join('\n')
  for (const line of combined.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function extractGotchas(text: string): string[] {
  const gotchas: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith(GOTCHA_PREFIX)) {
      gotchas.push(trimmed.slice(GOTCHA_PREFIX.length).trim())
    }
  }
  return gotchas
}

function dedupeNewestFirst(lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out
}

function formatLessonsFile(verifyCommand: string, gotchas: string[]): string {
  const bullets = gotchas.map((g) => `${GOTCHA_PREFIX}${g}`).join('\n')
  return `# Lessons from green runs

Verify command: \`${verifyCommand}\`

${bullets}
`
}

/** Drop the oldest gotchas until the file fits; the verify command is passed in, not re-parsed. */
function formatWithinMaxChars(verifyCommand: string, gotchas: string[], maxChars: number): string {
  const kept = [...gotchas]
  while (kept.length > 0 && formatLessonsFile(verifyCommand, kept).length > maxChars) {
    kept.pop()
  }
  return formatLessonsFile(verifyCommand, kept)
}

export function recordGreenRunLessons(
  loopDir: string,
  run: { verifyCommand: string; iterations: number; failuresOvercome: VerifyResult[] },
): void {
  const newGotchas = run.failuresOvercome
    .map(firstOutputLine)
    .filter((line): line is string => line !== undefined)

  const existing = readLessons(loopDir)
  const priorGotchas = existing ? extractGotchas(existing) : []
  const merged = dedupeNewestFirst([...newGotchas, ...priorGotchas])

  const body = formatWithinMaxChars(run.verifyCommand, merged, LESSONS_MAX_CHARS)

  fs.mkdirSync(loopDir, { recursive: true })
  fs.writeFileSync(lessonsPath(loopDir), body, 'utf8')
}

export function buildLessonsPromptSection(lessons: string): string {
  return `## Lessons from earlier green runs

${lessons.trim()}

`
}
