import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from './repoContext.js'
import { defaultBranchRefExists } from './defaultBranch.js'
import { resolveTelegramCredentials } from '../integrations/telegramNotify.js'
import { parseLoopConfig } from '../loop/loopConfig.js'

export type RepoProfileCheck = {
  ok: boolean
  errors: string[]
  warnings: string[]
}

function scanLoopConfigWarnings(repoRoot: string): string[] {
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
      const config = parseLoopConfig(raw)
      if (config.taskwarriorUuid && config.syncOnSuccess === false) {
        warnings.push(
          `${path.relative(repoRoot, loopJsonPath)}: taskwarriorUuid is set but syncOnSuccess=false — TW task will not auto-complete (enable reviewGate separately if review should block).`,
        )
      }
    } catch {
      warnings.push(`${path.relative(repoRoot, loopJsonPath)}: could not parse loop.json`)
    }
  }

  return warnings
}

export function validateRepoProfile(ctx: RepoContext): RepoProfileCheck {
  const errors: string[] = []
  const warnings: string[] = [...scanLoopConfigWarnings(ctx.repoRoot)]

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
