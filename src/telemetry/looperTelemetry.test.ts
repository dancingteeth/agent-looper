import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  POSTHOG_EU_CAPTURE_URL,
  POSTHOG_KEY_FALLBACK_ENV,
  POSTHOG_PROJECT_API_KEY_ENV,
  TELEMETRY_ENABLED_ENV,
  buildPosthogCaptureBody,
  captureLooperTelemetry,
  isTelemetryEnabled,
  readOrCreateTelemetryDistinctId,
  readPackageVersion,
  resetLooperTelemetryStateForTest,
  resolvePosthogApiKey,
  shouldCaptureTelemetry,
  toTelemetryRuntime,
  trackLooperInit,
} from './looperTelemetry.js'

const envKeys = [TELEMETRY_ENABLED_ENV, POSTHOG_PROJECT_API_KEY_ENV, POSTHOG_KEY_FALLBACK_ENV]

afterEach(() => {
  for (const key of envKeys) delete process.env[key]
  resetLooperTelemetryStateForTest()
  vi.restoreAllMocks()
})

describe('looperTelemetry config', () => {
  it('is disabled by default', () => {
    expect(isTelemetryEnabled({})).toBe(false)
    expect(shouldCaptureTelemetry({})).toBe(false)
  })

  it('enables only with AGENT_LOOPER_TELEMETRY=1 or true', () => {
    process.env[TELEMETRY_ENABLED_ENV] = '1'
    expect(isTelemetryEnabled()).toBe(true)
    process.env[TELEMETRY_ENABLED_ENV] = 'true'
    expect(isTelemetryEnabled()).toBe(true)
    process.env[TELEMETRY_ENABLED_ENV] = 'yes'
    expect(isTelemetryEnabled()).toBe(false)
  })

  it('no-ops when telemetry is on but API key is missing', () => {
    process.env[TELEMETRY_ENABLED_ENV] = '1'
    expect(resolvePosthogApiKey()).toBeUndefined()
    expect(shouldCaptureTelemetry()).toBe(false)
  })

  it('resolves API key from POSTHOG_PROJECT_API_KEY then AGENT_LOOPER_POSTHOG_KEY', () => {
    process.env[POSTHOG_KEY_FALLBACK_ENV] = 'fallback'
    expect(resolvePosthogApiKey()).toBe('fallback')
    process.env[POSTHOG_PROJECT_API_KEY_ENV] = 'primary'
    expect(resolvePosthogApiKey()).toBe('primary')
  })
})

describe('toTelemetryRuntime', () => {
  it('maps cline-pass to cline', () => {
    expect(toTelemetryRuntime('cline-pass')).toBe('cline')
    expect(toTelemetryRuntime('cursor')).toBe('cursor')
  })
})

describe('readPackageVersion', () => {
  it('returns undefined instead of throwing when package.json is missing', () => {
    const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-looper-no-pkg-'))
    try {
      expect(readPackageVersion(missingRoot)).toBeUndefined()
    } finally {
      fs.rmSync(missingRoot, { recursive: true, force: true })
    }
  })
})

describe('buildPosthogCaptureBody', () => {
  it('allows only telemetry-safe property keys', () => {
    const body = buildPosthogCaptureBody({
      apiKey: 'phc_test',
      event: 'looper_run_finished',
      distinctId: 'anon',
      properties: {
        runtime: 'cursor',
        check_passed: true,
        duration_ms: 42,
        review_gate: false,
        package_version: '0.4.4',
        os_platform: 'linux',
        node_major_version: 22,
      },
    })
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: 'looper_run_finished',
      distinct_id: 'anon',
      properties: {
        runtime: 'cursor',
        check_passed: true,
        duration_ms: 42,
        review_gate: false,
        package_version: '0.4.4',
        os_platform: 'linux',
        node_major_version: 22,
        $lib: 'agent-looper',
      },
    })
  })

  it('strips forbidden and sensitive-looking property keys', () => {
    const body = buildPosthogCaptureBody({
      apiKey: 'phc_test',
      event: 'looper_run_started',
      distinctId: 'anon',
      properties: {
        runtime: 'cursor',
        review_gate: true,
        path: '/home/user/secret-repo/.cursor/loops/foo',
        goal: 'Fix the auth bug in GOAL.md',
        token: 'sk-live-not-a-real-key',
        repo_name: 'acme/private-app',
        api_key: 'phc_leaked',
      },
    })
    const props = body.properties as Record<string, unknown>
    expect(props.runtime).toBe('cursor')
    expect(props.review_gate).toBe(true)
    expect(props.$lib).toBe('agent-looper')
    expect(props.path).toBeUndefined()
    expect(props.goal).toBeUndefined()
    expect(props.token).toBeUndefined()
    expect(props.repo_name).toBeUndefined()
    expect(props.api_key).toBeUndefined()
  })
})

describe('captureLooperTelemetry', () => {
  it('POSTs to PostHog EU when enabled', async () => {
    process.env[TELEMETRY_ENABLED_ENV] = '1'
    process.env[POSTHOG_PROJECT_API_KEY_ENV] = 'phc_test'

    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }))
    captureLooperTelemetry({
      event: 'looper_init',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      distinctId: 'anon-1',
    })

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(fetchImpl).toHaveBeenCalledWith(
      POSTHOG_EU_CAPTURE_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    )
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      event: string
      api_key: string
      properties: Record<string, unknown>
    }
    expect(body.event).toBe('looper_init')
    expect(body.api_key).toBe('phc_test')
    expect(body.properties.package_version).toBeTypeOf('string')
    expect(body.properties.repo_name).toBeUndefined()
    expect(body.properties.$lib).toBe('agent-looper')
  })

  it('does not throw when package version lookup fails', async () => {
    process.env[TELEMETRY_ENABLED_ENV] = '1'
    process.env[POSTHOG_PROJECT_API_KEY_ENV] = 'phc_test'
    const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-looper-no-pkg-capture-'))

    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }))
    try {
      expect(() =>
        captureLooperTelemetry({
          event: 'looper_init',
          packageRoot: missingRoot,
          fetchImpl: fetchImpl as unknown as typeof fetch,
          distinctId: 'anon-missing-version',
        }),
      ).not.toThrow()
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
      const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
        properties: Record<string, unknown>
      }
      expect(body.properties.package_version).toBeUndefined()
      expect(body.properties.os_platform).toBeTypeOf('string')
    } finally {
      fs.rmSync(missingRoot, { recursive: true, force: true })
    }
  })

  it('does not throw when capture payload construction fails', () => {
    process.env[TELEMETRY_ENABLED_ENV] = '1'
    process.env[POSTHOG_PROJECT_API_KEY_ENV] = 'phc_test'
    vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('stringify failed')
    })
    expect(() =>
      captureLooperTelemetry({
        event: 'looper_init',
        distinctId: 'anon-stringify-fail',
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
    ).not.toThrow()
  })

  it('does not throw when fetch fails', async () => {
    process.env[TELEMETRY_ENABLED_ENV] = '1'
    process.env[POSTHOG_PROJECT_API_KEY_ENV] = 'phc_test'
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    expect(() =>
      captureLooperTelemetry({
        event: 'looper_init',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        distinctId: 'anon-2',
      }),
    ).not.toThrow()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
  })

  it('trackLooperInit is a no-op when disabled', () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }))
    trackLooperInit()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('readOrCreateTelemetryDistinctId', () => {
  it('creates a persistent anonymous id file', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-looper-telemetry-'))
    const first = readOrCreateTelemetryDistinctId(home)
    const second = readOrCreateTelemetryDistinctId(home)
    expect(first).toBe(second)
    expect(fs.existsSync(path.join(home, '.agent-looper', 'telemetry-id'))).toBe(true)
    fs.rmSync(home, { recursive: true, force: true })
  })
})
