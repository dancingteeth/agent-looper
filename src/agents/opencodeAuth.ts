import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { OpencodeClient } from '@opencode-ai/sdk'

export const OPENCODE_GO_PROVIDER_ID = 'opencode-go'

/** Provider ids the harness can wire via `auth.set` from env. */
export const OPENCODE_PROVIDER_API_KEY_ENV: Readonly<Record<string, string>> = {
  [OPENCODE_GO_PROVIDER_ID]: 'OPENCODE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
}

function unwrapAuthSet(
  result: { data?: boolean; error?: unknown },
  providerId: string,
): void {
  if (result.error) {
    const message =
      result.error instanceof Error
        ? result.error.message
        : typeof result.error === 'object' && result.error !== null && 'message' in result.error
          ? String((result.error as { message: unknown }).message)
          : String(result.error)
    throw new Error(`OpenCode auth.set(${providerId}) failed: ${message}`)
  }
}

export function resolveOpencodeAuthJsonPath(): string {
  const override = process.env.OPENCODE_AUTH_JSON?.trim()
  if (override) return path.resolve(override)
  return path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json')
}

/** True when `~/.local/share/opencode/auth.json` (or OPENCODE_AUTH_JSON) has an entry for providerId. */
export function hasOpencodeAuthJsonProvider(
  providerId: string,
  authPath: string = resolveOpencodeAuthJsonPath(),
): boolean {
  try {
    const raw = fs.readFileSync(authPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false
    const entry = (parsed as Record<string, unknown>)[providerId]
    return typeof entry === 'object' && entry !== null
  } catch {
    return false
  }
}

/**
 * Push API keys from env into the ephemeral OpenCode server (same as `/connect` for API providers).
 * Returns provider ids that were wired; Ollama and auth.json-only setups may still work with an empty list.
 */
export async function bootstrapOpencodeProviderAuth(
  client: OpencodeClient,
  directory: string,
): Promise<string[]> {
  const wired: string[] = []
  for (const [providerId, envName] of Object.entries(OPENCODE_PROVIDER_API_KEY_ENV)) {
    const key = process.env[envName]?.trim()
    if (!key) continue
    const result = await client.auth.set({
      path: { id: providerId },
      body: { type: 'api', key },
      query: { directory },
    })
    unwrapAuthSet(result, providerId)
    wired.push(providerId)
  }
  return wired
}

export function formatOpencodeAuthHint(): string {
  const parts = Object.entries(OPENCODE_PROVIDER_API_KEY_ENV).map(
    ([provider, env]) => `${env} (${provider})`,
  )
  return (
    `Set ${parts.join(' and/or ')}; or configure providers with \`opencode /connect\` ` +
    `(~/.local/share/opencode/auth.json). Local Ollama needs no API key.`
  )
}

/**
 * Fail fast for harness-managed providers (Go / OpenRouter) when neither env nor auth.json
 * can authenticate the provider used by this iteration's model.
 */
export function assertOpencodeProviderAuthReady(input: {
  providerID: string
  wiredProviders: readonly string[]
}): void {
  const envName = OPENCODE_PROVIDER_API_KEY_ENV[input.providerID]
  if (!envName) return
  if (input.wiredProviders.includes(input.providerID)) return
  if (process.env[envName]?.trim()) return
  if (hasOpencodeAuthJsonProvider(input.providerID)) return
  throw new Error(
    `OpenCode provider "${input.providerID}" is not authenticated. ${formatOpencodeAuthHint()}`,
  )
}
