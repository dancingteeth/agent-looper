import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from './repoContext.js'
import { defaultBranchRefExists } from './defaultBranch.js'
import { resolveTelegramCredentials } from '../integrations/telegramNotify.js'
import { parseLoopConfig } from '../loop/loopConfig.js'
import { isTrivialVerifyCommand, trivialVerifyWarning } from '../loop/trivialVerify.js'
import { lintVerifyScript, verifyScriptLintWarning } from '../loop/verifyScriptLint.js'
import { applyLoopDefaults } from '../loop/loopDefaults.js'
import type { DetectionResult } from '../cli/detectRuntimes.js'
import type { UserCostPresetMap } from '../loop/costPreset.js'

export type RepoProfileCheck = {
  ok: boolean
  errors: string[]
  warnings: string[]
}

function scanLoopConfigWarnings(
  repoRoot: string,
  defaults: Record<string, unknown> | undefined,
  detection?: DetectionResult,
  costPresets?: UserCostPresetMap,
): string[] {
  const loopsDir = path.join(repoRoot, '.cursor', 'loops')
  const warnings: string[] = []

  let entries: string[]
  try {
    entries = fs.readdirSync(loopsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return warnings
  }

  for (const name of entries) {
    const loopJsonPath = path.join(loopsDir, name, 'loop.json')
    if (!fs.existsSync(loopJsonPath)) continue

    try {
      const raw = JSON.parse(fs.readFileSync(loopJsonPath, 'utf8')) as unknown
      const config = parseLoopConfig(applyLoopDefaults(raw, defaults), { detection, costPresets })
      if (config.taskwarriorUuid && config.syncOnSuccess === false) {
        warnings.push(
          `${path.relative(repoRoot, loopJsonPath)}: taskwarriorUuid is set but syncOnSuccess=false — TW task will not auto-complete (enable reviewGate separately if review should block).`,
        )
      }
      if (isTrivialVerifyCommand(config.verify)) {
        warnings.push(
          trivialVerifyWarning(path.relative(repoRoot, loopJsonPath), config.verify),
        )
      }
      const verifyShPath = path.join(loopsDir, name, 'verify.sh')
      if (fs.existsSync(verifyShPath)) {
        const lint = lintVerifyScript(fs.readFileSync(verifyShPath, 'utf8'))
        if (!lint.ok || lint.warnings.length > 0) {
          warnings.push(verifyScriptLintWarning(path.relative(repoRoot, verifyShPath), lint))
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      warnings.push(
        `${path.relative(repoRoot, loopJsonPath)}: could not parse loop.json (${detail})`,
      )
    }
  }

  return warnings
}

export function validateRepoProfile(
  ctx: RepoContext,
  options?: { detection?: DetectionResult },
): RepoProfileCheck {
  const errors: string[] = []
  const warnings: string[] = [
    ...scanLoopConfigWarnings(
      ctx.repoRoot,
      ctx.profile.defaults,
      options?.detection,
      ctx.profile.costPresets,
    ),
  ]

  const { defaultBranch } = ctx.profile
  if (!defaultBranchRefExists(ctx.repoRoot, defaultBranch)) {
    errors.push(
      `defaultBranch "${defaultBranch}" is not a valid git ref — run agent-loop-init --force or set .cursor/agent-loop.repo.json to your repo default (e.g. master).`,
    )
  }

  if (ctx.profile.telegramNotify && !resolveTelegramCredentials(ctx.profile)) {
    warnings.push(
      'telegramNotify is enabled but bot token or chat id is missing — loop completion reports will not be sent (set AGENT_LOOP_TELEGRAM_* env or telegramNotify.chatId).',
    )
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}

export function formatRepoProfileCheck(check: RepoProfileCheck): string {
  const lines: string[] = []
  for (const error of check.errors) lines.push(`  error: ${error}`)
  for (const warning of check.warnings) lines.push(`  warn: ${warning}`)
  return lines.join('\n')
}
