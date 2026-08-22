#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { repoProfilePath, repoProfileSchema } from '../context/repoProfile.js'
import {
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
} from '../loop/loopAgentConfig.js'
import { pickLoopDefaults } from '../loop/loopDefaults.js'
import { loopConfigSchema, parseLoopConfig } from '../loop/loopConfig.js'
import { defaultIndexForValue, formatMenu, parseMenuSelection, type MenuChoice } from './setupMenus.js'
import { collectSetupAnswers, type SetupPrompts } from './setupFlow.js'
import { createInkPrompts } from './setupTui.js'

const LOOP_CONFIG_KEYS = new Set(Object.keys(loopConfigSchema.shape))

type CliOptions = {
  answersPath?: string
  outDir: string
  repoRoot: string
  plain: boolean
}

function usage(): string {
  return `Usage: agent-loop-setup [options]

Interactive walkthrough that writes repo loop defaults into
.cursor/agent-loop.repo.json (runtime, models, review, notify, …) and a
loop.json for --out (verify + this bundle’s snapshot). Later sparse
loop.json files inherit those defaults; explicit loop.json keys win.
Then prints agent-check and agent-loop run. Interactive mode is an Ink TUI
(arrow keys + enter) on a TTY. Model lists are scoped to the runtime you
just picked (a DSH slug is never offered as a Cursor judge).
Pass --plain for numbered menus (CI / no TTY / screen readers).

Worker runtimes: cursor | cline-pass | cline | opencode | pi | codex | dsh
Judge (review): reviewRuntime (cursor | cline-pass | cline | opencode | pi | codex | dsh),
  reviewModel (omit for runtime defaults: cursor grok-4.6 / composer-2.5, opencode
  opencode-go/deepseek-v4-pro, dsh deepseek-official/deepseek-v4-pro, codex gpt-5.6-sol),
  reviewGate, maxReviewCycles, postQualityReview, reviewRisk, reviewSecondaryRuntime
Verify: verify command, verifyMode (command|skill), verifySkill, finalVerify
Loop control: maxIterations, stagnationThreshold, mode (forward|reverse),
  pauseAfterIteration, trustConfig
Notify / Telegram: notifyTelegram, telegramAttachReview, requireNotify,
  notifyCommand; profile telegramNotify chatId / onSuccess / onFailure / attachReview
Git / PR / completion: notifyPrComment (gh pr comment), profile defaultBranch,
  completionSignal, exportPack, exportRunReport, exportTranscript, syncOnSuccess

Options:
  --answers <answers.json>  Non-interactive answers: JSON object mirroring loop.json
                            fields (optional "profile" object patches telegram/branch;
                            runtime/models always go to profile.defaults)
  --out <loop-dir>          Directory to write loop.json (default: current directory)
  --repo-root <path>        Repo whose .cursor/agent-loop.repo.json gets defaults
                            (default: current directory)
  --plain                   Numbered menus instead of the Ink TUI
  --help                    Show this help`
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { outDir: process.cwd(), repoRoot: process.cwd(), plain: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--answers':
        options.answersPath = argv[++i]
        if (!options.answersPath) throw new Error('--answers requires a JSON file path')
        break
      case '--out':
        options.outDir = argv[++i]
        if (!options.outDir) throw new Error('--out requires a directory path')
        break
      case '--repo-root':
        options.repoRoot = argv[++i]
        if (!options.repoRoot) throw new Error('--repo-root requires a path')
        break
      case '--plain':
        options.plain = true
        break
      default:
        throw new Error(`unknown option: ${arg}`)
    }
  }
  return options
}

/** Keep only fields the real loopConfigSchema defines (never invent fields). */
export function pickLoopConfigFields(answers: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(answers)) {
    if (key === 'profile') continue
    if (!LOOP_CONFIG_KEYS.has(key)) {
      console.error(`[agent-loop-setup] warn: ignoring unknown loop.json field "${key}"`)
      continue
    }
    if (value !== undefined) config[key] = value
  }
  return config
}

/** Print the agent-check / agent-loop run commands after a successful write. */
function printNextSteps(
  config: Record<string, unknown>,
  outDir: string,
  repoRoot: string,
  wroteProfile: boolean,
): void {
  const runtime = typeof config.runtime === 'string' ? config.runtime : LOOP_RUNTIME_CURSOR
  const checkRuntime = runtime === LOOP_RUNTIME_CLINE_PASS ? 'cline' : runtime
  console.log('')
  console.log('Next steps:')
  console.log(`  agent-check ${checkRuntime}`)
  const runCmd = [`agent-loop run ${outDir}`]
  if (typeof config.reviewRuntime === 'string' && config.reviewRuntime !== '') {
    runCmd.push(`--review-runtime ${config.reviewRuntime}`)
  }
  console.log(`  ${runCmd.join(' ')}`)
  if (wroteProfile) {
    console.log(`  Repo defaults: ${repoProfilePath(repoRoot)}`)
  }
}

function loadExistingProfile(repoRoot: string): Record<string, unknown> {
  const profilePath = repoProfilePath(repoRoot)
  if (!fs.existsSync(profilePath)) return {}
  return JSON.parse(fs.readFileSync(profilePath, 'utf8')) as Record<string, unknown>
}

/** Merge a profile patch over the existing repo profile and validate with the real schema. */
function mergeAndValidateProfile(
  repoRoot: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...loadExistingProfile(repoRoot), ...patch }
  return repoProfileSchema.parse(merged) as Record<string, unknown>
}

function existingDefaultsRecord(existing: Record<string, unknown>): Record<string, unknown> {
  const raw = existing.defaults
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  return { ...raw }
}

function writeProfile(repoRoot: string, profile: Record<string, unknown>): void {
  const profilePath = repoProfilePath(repoRoot)
  fs.mkdirSync(path.dirname(profilePath), { recursive: true })
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
  console.error(`[agent-loop-setup] patched ${profilePath}`)
}

/**
 * Shared pipeline for answers + interactive modes. Validates everything with the
 * real schema BEFORE writing, so a rejected config never leaves a loop.json behind.
 */
export function runWizard(answers: Record<string, unknown>, outDir: string, repoRoot: string): number {
  const config = pickLoopConfigFields(answers)

  let parsed: { runtime: string; reviewRuntime?: string; maxIterations: number }
  try {
    parsed = parseLoopConfig(config)
  } catch (err) {
    console.error(`[agent-loop-setup] invalid loop config: ${errMessage(err)}`)
    return 1
  }

  const defaults = pickLoopDefaults(config)
  let profilePatch: Record<string, unknown> | undefined
  if (answers.profile !== undefined) {
    if (
      typeof answers.profile !== 'object' ||
      answers.profile === null ||
      Array.isArray(answers.profile)
    ) {
      console.error('[agent-loop-setup] invalid loop config: answers.profile must be a JSON object')
      return 1
    }
    profilePatch = answers.profile as Record<string, unknown>
  }

  let profile: Record<string, unknown> | undefined
  if (Object.keys(defaults).length > 0 || profilePatch !== undefined) {
    try {
      const existing = loadExistingProfile(repoRoot)
      profile = mergeAndValidateProfile(repoRoot, {
        ...(profilePatch ?? {}),
        defaults: {
          ...existingDefaultsRecord(existing),
          ...existingDefaultsRecord(profilePatch ?? {}),
          ...defaults,
        },
      })
    } catch (err) {
      console.error(`[agent-loop-setup] invalid repo profile patch: ${errMessage(err)}`)
      return 1
    }
  }

  if (profile !== undefined) {
    try {
      writeProfile(repoRoot, profile)
    } catch (err) {
      console.error(`[agent-loop-setup] cannot patch repo profile: ${errMessage(err)}`)
      return 1
    }
  }

  const loopJsonPath = path.join(outDir, 'loop.json')
  try {
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(loopJsonPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  } catch (err) {
    console.error(`[agent-loop-setup] cannot write loop.json: ${errMessage(err)}`)
    return 1
  }
  console.error(`[agent-loop-setup] wrote ${loopJsonPath}`)

  console.error(
    `[agent-loop-setup] configured runtime=${parsed.runtime} ` +
      `reviewRuntime=${parsed.reviewRuntime ?? '(unset → cursor)'} ` +
      `maxIterations=${parsed.maxIterations}`,
  )
  printNextSteps(config, outDir, repoRoot, profile !== undefined)
  return 0
}

function runAnswersMode(answersPath: string, outDir: string, repoRoot: string): number {
  let answers: unknown
  try {
    answers = JSON.parse(fs.readFileSync(answersPath, 'utf8'))
  } catch (err) {
    console.error(`[agent-loop-setup] cannot read answers from ${answersPath}: ${errMessage(err)}`)
    return 1
  }
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    console.error('[agent-loop-setup] --answers must contain a JSON object')
    return 1
  }
  return runWizard(answers as Record<string, unknown>, outDir, repoRoot)
}

function createPlainPrompts(rl: readline.Interface): SetupPrompts {
  const stdinClosed = new Promise<never>((_, reject) => {
    rl.on('close', () => reject(new Error('stdin closed (EOF) — interactive setup aborted')))
  })
  const readLine = async (prompt: string): Promise<string> =>
    Promise.race([rl.question(prompt), stdinClosed])

  return {
    async select(heading, blurb, choices, defaultValue) {
      const defaultIndex = defaultIndexForValue(choices, defaultValue)
      for (;;) {
        console.log(formatMenu(heading, blurb, choices, defaultIndex))
        const line = await readLine('> ')
        const selected = parseMenuSelection(line, choices.length, defaultIndex)
        if (selected === null) {
          console.log(`Type a number from 1 to ${choices.length}, or press Enter for the default.`)
          continue
        }
        const choice: MenuChoice | undefined = choices[selected]
        if (!choice) continue
        return choice.value
      }
    },
    async text(prompt, dflt) {
      const suffix = dflt !== undefined ? ` [${dflt}]` : ''
      const line = await readLine(`${prompt}${suffix} `)
      return line.trim() === '' && dflt !== undefined ? dflt : line.trim()
    },
  }
}

function shouldUseTui(plain: boolean): boolean {
  return !plain && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)
}

async function runInteractive(outDir: string, repoRoot: string, plain: boolean): Promise<number> {
  if (shouldUseTui(plain)) {
    const answers = await collectSetupAnswers(createInkPrompts(), outDir)
    return runWizard(answers, outDir, repoRoot)
  }

  const rl = readline.createInterface({ input, output })
  try {
    console.log('agent-loop-setup — numbered menus (--plain or no TTY)')
    console.log('Type the number of an option (or press Enter for the default). Do not type slugs.')
    const answers = await collectSetupAnswers(createPlainPrompts(rl), outDir)
    return runWizard(answers, outDir, repoRoot)
  } finally {
    rl.close()
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    return
  }
  let options: CliOptions
  try {
    options = parseArgs(argv)
  } catch (err) {
    console.error(`[agent-loop-setup] ${errMessage(err)}`)
    console.error(usage())
    process.exitCode = 1
    return
  }
  if (options.answersPath !== undefined) {
    process.exitCode = runAnswersMode(options.answersPath, options.outDir, options.repoRoot)
  } else {
    try {
      process.exitCode = await runInteractive(options.outDir, options.repoRoot, options.plain)
    } catch (err) {
      console.error(`[agent-loop-setup] ${errMessage(err)}`)
      process.exitCode = 1
    }
  }
}

const invokedAsCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedAsCli) {
  await main()
}

export { usage }
