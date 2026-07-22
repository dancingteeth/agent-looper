const SUSPICIOUS_SHELL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'curl', pattern: /\bcurl\b/i },
  { label: 'wget', pattern: /\bwget\b/i },
  { label: 'pipe-to-sh', pattern: /\|\s*sh\b/i },
  { label: 'backticks', pattern: /`[^`]+`/ },
  { label: 'command-substitution', pattern: /\$\([^)]+\)/ },
]

export const AGENT_LOOP_TRUST_CONFIG_ENV = 'AGENT_LOOP_TRUST_CONFIG'
export const AGENT_LOOP_REQUIRE_TRUST_CONFIG_ENV = 'AGENT_LOOP_REQUIRE_TRUST_CONFIG'

export type ShellCommandWarning = {
  label: string
  command: string
  suspicious: string[]
}

export type ShellTrustInput = {
  cwd: string
  verify?: string
  finalVerify?: string
  syncCommand?: string | null
  skipSync?: boolean
  /** CLI --trust-config or loop.json trustConfig */
  trustConfig?: boolean
  /** CLI --require-trust-config */
  requireTrustConfig?: boolean
  env?: NodeJS.ProcessEnv
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

function truthyEnv(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

export function isShellConfigTrusted(input: Pick<ShellTrustInput, 'trustConfig' | 'env'>): boolean {
  if (input.trustConfig) return true
  const env = input.env ?? process.env
  return truthyEnv(env[AGENT_LOOP_TRUST_CONFIG_ENV])
}

export function isTrustConfigRequired(
  input: Pick<ShellTrustInput, 'requireTrustConfig' | 'env'>,
): boolean {
  if (input.requireTrustConfig) return true
  const env = input.env ?? process.env
  return truthyEnv(env[AGENT_LOOP_REQUIRE_TRUST_CONFIG_ENV])
}

export function formatTrustConfigRequiredError(input: ShellTrustInput): string {
  const warnings = collectShellCommandWarnings({
    verify: input.verify,
    finalVerify: input.finalVerify,
    syncCommand: input.skipSync ? null : input.syncCommand,
  })

  const lines = [
    '[agent-loop] shell commands from loop.json / repo profile were not trusted.',
    `Review commands below, then re-run with --trust-config or set ${AGENT_LOOP_TRUST_CONFIG_ENV}=1`,
    `Strict mode: ${AGENT_LOOP_REQUIRE_TRUST_CONFIG_ENV}=1 or --require-trust-config`,
    `Commands run with shell: true in ${input.cwd}:`,
  ]

  for (const warning of warnings) {
    lines.push(`  ${warning.label}: ${warning.command}`)
    if (warning.suspicious.length > 0) {
      lines.push(`    suspicious pattern(s): ${warning.suspicious.join(', ')}`)
    }
  }

  return lines.join('\n')
}

export function assertShellConfigTrusted(input: ShellTrustInput): void {
  warnShellCommandsFromConfig(input)

  const required = isTrustConfigRequired(input)
  const trusted = isShellConfigTrusted(input)
  if (required && !trusted) {
    throw new Error(formatTrustConfigRequiredError(input))
  }
}

export function warnShellCommandsFromConfig(input: ShellTrustInput): void {
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

  if (!isShellConfigTrusted(input)) {
    console.error(
      `[agent-loop] tip: pass --trust-config after reviewing commands (or ${AGENT_LOOP_TRUST_CONFIG_ENV}=1)`,
    )
  }
}
