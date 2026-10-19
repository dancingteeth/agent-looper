import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { OpencodeClient } from '@opencode-ai/sdk'

export const OPENCODE_GO_PROVIDER_ID = 'opencode-go'

/** OpenCode native Vercel AI Gateway provider id (`vercel/…` model slugs). */
export const OPENCODE_VERCEL_PROVIDER_ID = 'vercel'

/** Provider ids the harness can wire via `auth.set` from env. */
export const OPENCODE_PROVIDER_API_KEY_ENV: Readonly<Record<string, string>> = {
  [OPENCODE_GO_PROVIDER_ID]: 'OPENCODE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  [OPENCODE_VERCEL_PROVIDER_ID]: 'AI_GATEWAY_API_KEY',
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

type OpencodeV2CredentialEntry = {
  integrationID: string
  active?: boolean
  value?: { type?: string; key?: string }
}

export type OpencodeV2CredentialClient = {
  credential: {
    list: () => Promise<readonly OpencodeV2CredentialEntry[]>
    create: (input: {
      integrationID: string
      label?: string
      value: { type: 'key'; key: string }
      activate?: boolean
    }) => Promise<unknown>
  }
}

/**
 * OpenCode 2.x keeps keys in its credential store (v1 `auth.json` is migrated on first boot),
 * which persists across servers. Only add an env key that is not stored yet, so repeated loops
 * do not pile up duplicates. Returns every harness provider with an active credential.
 */
export async function bootstrapOpencodeV2ProviderAuth(
  client: OpencodeV2CredentialClient,
): Promise<string[]> {
  const existing = await client.credential.list()
  const ready = new Set(existing.filter((entry) => entry.active !== false).map((entry) => entry.integrationID))
  for (const [providerId, envName] of Object.entries(OPENCODE_PROVIDER_API_KEY_ENV)) {
    const key = process.env[envName]?.trim()
    if (!key) continue
    const stored = existing.some(
      (entry) => entry.integrationID === providerId && entry.active !== false && entry.value?.key === key,
    )
    if (stored) continue
    try {
      await client.credential.create({
        integrationID: providerId,
        label: `agent-loop ${envName}`,
        value: { type: 'key', key },
        activate: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`OpenCode credential.create(${providerId}) failed: ${message}`)
    }
    ready.add(providerId)
  }
  return Object.keys(OPENCODE_PROVIDER_API_KEY_ENV).filter((providerId) => ready.has(providerId))
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
 * Fail fast for harness-managed providers (Go / OpenRouter / Vercel AI Gateway)
 * when neither env nor auth.json can authenticate the provider used by this iteration's model.
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
