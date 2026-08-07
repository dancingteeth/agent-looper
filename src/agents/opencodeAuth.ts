import type { OpencodeClient } from '@opencode-ai/sdk'
export const OPENCODE_GO_PROVIDER_ID = 'opencode-go'

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
    `${parts.join('; ')}; or configure providers with \`opencode /connect\` ` +
    `(~/.local/share/opencode/auth.json). Local Ollama needs no API key.`
  )
}
