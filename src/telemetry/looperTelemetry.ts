import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LoopRuntime } from '../loop/loopAgentConfig.js'

export const TELEMETRY_ENABLED_ENV = 'AGENT_LOOPER_TELEMETRY'
export const POSTHOG_PROJECT_API_KEY_ENV = 'POSTHOG_PROJECT_API_KEY'
export const POSTHOG_KEY_FALLBACK_ENV = 'AGENT_LOOPER_POSTHOG_KEY'
export const POSTHOG_EU_CAPTURE_URL = 'https://eu.i.posthog.com/capture/'

const TELEMETRY_EVENTS = ['looper_init', 'looper_run_started', 'looper_run_finished'] as const
export type LooperTelemetryEvent = (typeof TELEMETRY_EVENTS)[number]

const ALLOWED_PROPERTY_KEYS = new Set([
  'package_version',
  'runtime',
  'os_platform',
  'node_major_version',
  'check_passed',
  'duration_ms',
  'review_gate',
])

export type TelemetryRuntime = 'cursor' | 'cline' | 'opencode' | 'pi' | 'codex' | 'dsh'

export type LooperTelemetryProperties = {
  package_version?: string
  runtime?: TelemetryRuntime
  os_platform?: string
  node_major_version?: number
  check_passed?: boolean
  duration_ms?: number
  review_gate?: boolean
}

let cachedPackageVersion: string | undefined
const cachedDistinctIds = new Map<string, string>()

function truthyEnv(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

export function isTelemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthyEnv(env[TELEMETRY_ENABLED_ENV]?.trim())
}

export function resolvePosthogApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const primary = env[POSTHOG_PROJECT_API_KEY_ENV]?.trim()
  if (primary) return primary
  const fallback = env[POSTHOG_KEY_FALLBACK_ENV]?.trim()
  return fallback || undefined
}

export function shouldCaptureTelemetry(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTelemetryEnabled(env) && Boolean(resolvePosthogApiKey(env))
}

/** Map loop runtime ids to telemetry-safe runtime labels. */
export function toTelemetryRuntime(runtime: LoopRuntime): TelemetryRuntime {
  if (runtime === 'cline-pass') return 'cline'
  return runtime
}

export function readPackageVersion(packageRoot?: string): string | undefined {
  if (cachedPackageVersion) return cachedPackageVersion
  try {
    const root =
      packageRoot ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
    const raw = fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    const version = (JSON.parse(raw) as { version?: string }).version?.trim()
    if (!version) return undefined
    cachedPackageVersion = version
    return version
  } catch {
    return undefined
  }
}

export function baseTelemetryProperties(input?: {
  packageRoot?: string
}): LooperTelemetryProperties {
  const packageVersion = readPackageVersion(input?.packageRoot)
  return {
    ...(packageVersion ? { package_version: packageVersion } : {}),
    os_platform: process.platform,
    node_major_version: Number.parseInt(process.version.slice(1).split('.')[0] ?? '', 10),
  }
}

/** @internal Resets module caches between unit tests. */
export function resetLooperTelemetryStateForTest(): void {
  cachedPackageVersion = undefined
  cachedDistinctIds.clear()
}

function sanitizeProperties(
  properties: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) continue
    if (value === undefined) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  return out
}

export function telemetryDistinctIdPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.agent-looper', 'telemetry-id')
}

/** Stable anonymous id for aggregate CLI usage — never sent as a path. */
export function readOrCreateTelemetryDistinctId(homeDir: string = os.homedir()): string {
  const cached = cachedDistinctIds.get(homeDir)
  if (cached) return cached
  const idPath = telemetryDistinctIdPath(homeDir)
  try {
    const existing = fs.readFileSync(idPath, 'utf8').trim()
    if (existing) {
      cachedDistinctIds.set(homeDir, existing)
      return existing
    }
  } catch {
    // missing file — create below
  }
  const id = crypto.randomUUID()
  try {
    fs.mkdirSync(path.dirname(idPath), { recursive: true })
    fs.writeFileSync(idPath, `${id}\n`, { encoding: 'utf8', mode: 0o600 })
  } catch {
    // fail open — still use ephemeral id for this process
  }
  cachedDistinctIds.set(homeDir, id)
  return id
}

export function buildPosthogCaptureBody(input: {
  apiKey: string
  event: LooperTelemetryEvent
  distinctId: string
  properties: Record<string, unknown>
}): Record<string, unknown> {
  return {
    api_key: input.apiKey,
    event: input.event,
    distinct_id: input.distinctId,
    properties: {
      ...sanitizeProperties(input.properties),
      $lib: 'agent-looper',
    },
  }
}

export type CaptureLooperTelemetryInput = {
  event: LooperTelemetryEvent
  properties?: LooperTelemetryProperties
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  distinctId?: string
  /** Override package root for version lookup (tests / advanced installs). */
  packageRoot?: string
  now?: () => number
}

/**
 * Fire-and-forget PostHog capture. Never throws; telemetry must not block the CLI.
 */
export function captureLooperTelemetry(input: CaptureLooperTelemetryInput): void {
  try {
    const env = input.env ?? process.env
    if (!shouldCaptureTelemetry(env)) return

    const apiKey = resolvePosthogApiKey(env)
    if (!apiKey) return

    const properties: Record<string, unknown> = {
      ...baseTelemetryProperties({ packageRoot: input.packageRoot }),
      ...input.properties,
    }

    const body = buildPosthogCaptureBody({
      apiKey,
      event: input.event,
      distinctId: input.distinctId ?? readOrCreateTelemetryDistinctId(),
      properties,
    })

    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') return

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2_000)
    timeout.unref()

    void fetchImpl(POSTHOG_EU_CAPTURE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      keepalive: true,
    })
      .catch(() => {
        // fail open
      })
      .finally(() => {
        clearTimeout(timeout)
      })
  } catch {
    // fail open — version lookup, distinct-id IO, JSON.stringify, etc.
  }
}

export function trackLooperInit(): void {
  captureLooperTelemetry({ event: 'looper_init' })
}

export function trackLooperRunStarted(input: { runtime: LoopRuntime; reviewGate: boolean }): void {
  captureLooperTelemetry({
    event: 'looper_run_started',
    properties: {
      runtime: toTelemetryRuntime(input.runtime),
      review_gate: input.reviewGate,
    },
  })
}

export function trackLooperRunFinished(input: {
  runtime: LoopRuntime
  reviewGate: boolean
  durationMs: number
  checkPassed?: boolean
}): void {
  captureLooperTelemetry({
    event: 'looper_run_finished',
    properties: {
      runtime: toTelemetryRuntime(input.runtime),
      review_gate: input.reviewGate,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      ...(input.checkPassed === undefined ? {} : { check_passed: input.checkPassed }),
    },
  })
}
