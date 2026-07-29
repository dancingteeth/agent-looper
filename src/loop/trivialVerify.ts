/**
 * Soft check for placeholder verify commands that cannot gate a real loop.
 * Warn-only — tests and scaffolds often use `true` intentionally.
 */
export function isTrivialVerifyCommand(verify: string): boolean {
  const normalized = verify.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized) return true

  const trivial = new Set([
    'true',
    ': ',
    ':',
    'true;',
    '/bin/true',
    '/usr/bin/true',
    'exit 0',
    'exit 0;',
    'true && true',
    'true || true',
    'echo ok',
    'echo "ok"',
    "echo 'ok'",
  ])

  if (trivial.has(normalized)) return true
  if (/^(true\s*;\s*)+$/.test(normalized)) return true
  if (/^exit\s+0\s*;?$/.test(normalized)) return true

  return false
}

export function trivialVerifyWarning(loopLabel: string, verify: string): string {
  return (
    `${loopLabel}: verify "${verify}" looks trivial — ` +
    `prefer a measurable verify.sh (exit 0 only when the finish line is met). ` +
    `See docs/unknowns-preflight.md and templates/verify.example.sh.`
  )
}
