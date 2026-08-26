import { spawnSync } from 'node:child_process'

/**
 * SDK/CLI presence probe for the worker/judge runtime menu.
 *
 * Deliberately NOT doctor.ts: doctor inspects the installed package dist,
 * repo profile, and model-pricing drift. This module only answers "is the
 * runtime's SDK importable / CLI on PATH" — the same local checks
 * `src/cli/check.ts` runs, minus API-key gating.
 */

export type DetectableRuntime = 'cursor' | 'cline' | 'opencode' | 'pi' | 'codex' | 'dsh'

export type DetectionStatus = 'detected' | 'missing'

export type DetectionResult = Record<DetectableRuntime, DetectionStatus>

/** Injectable seams so unit tests can mock `import` and `which` without a shell. */
export type DetectDeps = {
  importModule?: (specifier: string) => Promise<unknown>
  which?: (binary: string) => boolean
}

interface RuntimeProbe {
  imports: readonly string[]
  bins: readonly string[]
}

const RUNTIME_PROBES: Record<DetectableRuntime, RuntimeProbe> = {
  cursor: { imports: ['@cursor/sdk'], bins: [] },
  cline: { imports: ['@cline/sdk'], bins: [] },
  opencode: { imports: ['@opencode-ai/sdk'], bins: ['opencode'] },
  pi: { imports: ['@earendil-works/pi-coding-agent'], bins: [] },
  codex: { imports: ['@openai/codex-sdk'], bins: ['codex'] },
  dsh: { imports: [], bins: ['dsh'] },
}

function defaultImportModule(specifier: string): Promise<unknown> {
  return import(specifier)
}

function defaultWhich(binary: string): boolean {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', stdio: 'ignore' })
  return !result.error && result.status === 0
}

/**
 * Probe every worker runtime once and return a `detected` / `missing` map.
 * A runtime is `detected` only when every probe (SDK import + CLI on PATH)
 * resolves. Missing runtimes are still reported — never hidden from the menu.
 */
export async function detectLoopRuntimes(deps: DetectDeps = {}): Promise<DetectionResult> {
  const importModule = deps.importModule ?? defaultImportModule
  const which = deps.which ?? defaultWhich
  const result = {} as DetectionResult

  for (const runtime of Object.keys(RUNTIME_PROBES) as DetectableRuntime[]) {
    const probe = RUNTIME_PROBES[runtime]
    let detected = true

    for (const specifier of probe.imports) {
      try {
        await importModule(specifier)
      } catch {
        detected = false
        break
      }
    }

    if (detected) {
      for (const binary of probe.bins) {
        if (!which(binary)) {
          detected = false
          break
        }
      }
    }

    result[runtime] = detected ? 'detected' : 'missing'
  }

  return result
}
