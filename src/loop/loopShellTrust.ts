const SUSPICIOUS_SHELL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'curl', pattern: /\bcurl\b/i },
  { label: 'wget', pattern: /\bwget\b/i },
  { label: 'pipe-to-sh', pattern: /\|\s*sh\b/i },
  { label: 'backticks', pattern: /`[^`]+`/ },
  { label: 'command-substitution', pattern: /\$\([^)]+\)/ },
]

export type ShellCommandWarning = {
  label: string
  command: string
  suspicious: string[]
}

export function collectShellCommandWarnings(input: {
  verify?: string
  finalVerify?: string
  syncCommand?: string | null
}): ShellCommandWarning[] {
  const entries: Array<{ label: string; command: string }> = []
  if (input.verify) entries.push({ label: 'verify', command: input.verify })
  if (input.finalVerify) entries.push({ label: 'finalVerify', command: input.finalVerify })
  if (input.syncCommand) entries.push({ label: 'syncCommand', command: input.syncCommand })

  return entries.map(({ label, command }) => ({
    label,
    command,
    suspicious: SUSPICIOUS_SHELL_PATTERNS.filter(({ pattern }) => pattern.test(command)).map(
      ({ label: patternLabel }) => patternLabel,
    ),
  }))
}

export function warnShellCommandsFromConfig(input: {
  cwd: string
  verify?: string
  finalVerify?: string
  syncCommand?: string | null
  skipSync?: boolean
}): void {
  const warnings = collectShellCommandWarnings({
    verify: input.verify,
    finalVerify: input.finalVerify,
    syncCommand: input.skipSync ? null : input.syncCommand,
  })

  if (warnings.length === 0) return

  console.error(
    `[agent-loop] config shell commands will run with shell: true in ${input.cwd}`,
  )
  for (const warning of warnings) {
    console.error(`  ${warning.label}: ${warning.command}`)
    if (warning.suspicious.length > 0) {
      console.error(
        `    suspicious pattern(s): ${warning.suspicious.join(', ')} — review this checkout before trusting config`,
      )
    }
  }
}
