import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assertOpencodeProviderAuthReady,
  bootstrapOpencodeV2ProviderAuth,
  formatOpencodeAuthHint,
  hasOpencodeAuthJsonProvider,
  OPENCODE_PROVIDER_API_KEY_ENV,
  OPENCODE_VERCEL_PROVIDER_ID,
} from './opencodeAuth.js'

describe('opencodeAuth', () => {
  it('formatOpencodeAuthHint names Go, OpenRouter, and Vercel env vars', () => {
    expect(formatOpencodeAuthHint()).toMatch(/OPENCODE_API_KEY/)
    expect(formatOpencodeAuthHint()).toMatch(/OPENROUTER_API_KEY/)
    expect(formatOpencodeAuthHint()).toMatch(/AI_GATEWAY_API_KEY/)
    expect(OPENCODE_PROVIDER_API_KEY_ENV[OPENCODE_VERCEL_PROVIDER_ID]).toBe('AI_GATEWAY_API_KEY')
  })

  it('hasOpencodeAuthJsonProvider reads provider entries without exposing keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-opencode-auth-'))
    const authPath = path.join(dir, 'auth.json')
    fs.writeFileSync(
      authPath,
      JSON.stringify({ 'opencode-go': { type: 'api', key: 'secret-should-not-leak' } }),
      'utf8',
    )
    expect(hasOpencodeAuthJsonProvider('opencode-go', authPath)).toBe(true)
    expect(hasOpencodeAuthJsonProvider('openrouter', authPath)).toBe(false)
    expect(hasOpencodeAuthJsonProvider('opencode-go', path.join(dir, 'missing.json'))).toBe(false)
  })

  it('assertOpencodeProviderAuthReady skips unmanaged providers', () => {
    expect(() =>
      assertOpencodeProviderAuthReady({ providerID: 'ollama', wiredProviders: [] }),
    ).not.toThrow()
  })

  it('assertOpencodeProviderAuthReady accepts wired providers', () => {
    expect(() =>
      assertOpencodeProviderAuthReady({
        providerID: 'opencode-go',
        wiredProviders: ['opencode-go'],
      }),
    ).not.toThrow()
  })

  it('assertOpencodeProviderAuthReady throws when Go is unwired and env/auth missing', () => {
    const prev = process.env.OPENCODE_API_KEY
    const prevAuth = process.env.OPENCODE_AUTH_JSON
    delete process.env.OPENCODE_API_KEY
    process.env.OPENCODE_AUTH_JSON = path.join(os.tmpdir(), 'agent-loop-no-such-auth.json')
    try {
      expect(() =>
        assertOpencodeProviderAuthReady({ providerID: 'opencode-go', wiredProviders: [] }),
      ).toThrow(/not authenticated/)
    } finally {
      if (prev === undefined) delete process.env.OPENCODE_API_KEY
      else process.env.OPENCODE_API_KEY = prev
      if (prevAuth === undefined) delete process.env.OPENCODE_AUTH_JSON
      else process.env.OPENCODE_AUTH_JSON = prevAuth
    }
  })

  it('assertOpencodeProviderAuthReady throws when vercel is unwired and env/auth missing', () => {
    const prev = process.env.AI_GATEWAY_API_KEY
    const prevAuth = process.env.OPENCODE_AUTH_JSON
    delete process.env.AI_GATEWAY_API_KEY
    process.env.OPENCODE_AUTH_JSON = path.join(os.tmpdir(), 'agent-loop-no-such-auth.json')
    try {
      expect(() =>
        assertOpencodeProviderAuthReady({
          providerID: OPENCODE_VERCEL_PROVIDER_ID,
          wiredProviders: [],
        }),
      ).toThrow(/not authenticated/)
    } finally {
      if (prev === undefined) delete process.env.AI_GATEWAY_API_KEY
      else process.env.AI_GATEWAY_API_KEY = prev
      if (prevAuth === undefined) delete process.env.OPENCODE_AUTH_JSON
      else process.env.OPENCODE_AUTH_JSON = prevAuth
    }
  })

  it('assertOpencodeProviderAuthReady accepts vercel when AI_GATEWAY_API_KEY is set', () => {
    const prev = process.env.AI_GATEWAY_API_KEY
    process.env.AI_GATEWAY_API_KEY = 'test-gateway-key'
    try {
      expect(() =>
        assertOpencodeProviderAuthReady({
          providerID: OPENCODE_VERCEL_PROVIDER_ID,
          wiredProviders: [],
        }),
      ).not.toThrow()
    } finally {
      if (prev === undefined) delete process.env.AI_GATEWAY_API_KEY
      else process.env.AI_GATEWAY_API_KEY = prev
    }
  })
})

describe('bootstrapOpencodeV2ProviderAuth', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const clientWith = (existing: Array<{ integrationID: string; active?: boolean; value?: { type: string; key: string } }>) => ({
    credential: { list: vi.fn().mockResolvedValue(existing), create: vi.fn().mockResolvedValue({}) },
  })

  it('reuses a stored key instead of creating a duplicate credential', async () => {
    vi.stubEnv('OPENCODE_API_KEY', 'go-key')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    const client = clientWith([{ integrationID: 'opencode-go', active: true, value: { type: 'key', key: 'go-key' } }])
    expect(await bootstrapOpencodeV2ProviderAuth(client)).toEqual(['opencode-go'])
    expect(client.credential.create).not.toHaveBeenCalled()
  })

  it('creates an active credential for a new env key and reports migrated providers', async () => {
    vi.stubEnv('OPENCODE_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', 'or-key')
    vi.stubEnv('AI_GATEWAY_API_KEY', '')
    const client = clientWith([{ integrationID: 'opencode-go', active: true }])
    expect(await bootstrapOpencodeV2ProviderAuth(client)).toEqual(['opencode-go', 'openrouter'])
    expect(client.credential.create).toHaveBeenCalledWith({
      integrationID: 'openrouter',
      label: 'agent-loop OPENROUTER_API_KEY',
      value: { type: 'key', key: 'or-key' },
      activate: true,
    })
  })
})
