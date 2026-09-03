#!/usr/bin/env node
import './inkProductionEnv.js'
import fs from 'node:fs'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { repoProfilePath, repoProfileSchema, loadRepoProfile } from '../context/repoProfile.js'
import {
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  resolveLoopAgent,
  resolveReviewAgent,
} from '../loop/loopAgentConfig.js'
import { pickLoopDefaults } from '../loop/loopDefaults.js'
import { loopConfigSchema, parseLoopConfig } from '../loop/loopConfig.js'
import {
  assertUserCostPresetName,
  type CostPresetStack,
  type UserCostPresetMap,
} from '../loop/costPreset.js'
import { detectLoopRuntimes, type DetectionResult } from './detectRuntimes.js'
import { defaultIndexForValue, formatMenu, parseMenuSelection, type MenuChoice } from './setupMenus.js'
import { collectSetupAnswers, SetupDeclinedError, type SetupPrompts } from './setupFlow.js'
import { createInkPrompts } from './setupTui.js'

const LOOP_CONFIG_KEYS = new Set(Object.keys(loopConfigSchema.shape))

type CliOptions = {
  answersPath?: string
  outDir: string
  repoRoot: string
  plain: boolean
  dryRun: boolean
}

function usage(): string {
  return `Usage: agent-loop-setup [options]

Interactive walkthrough that writes repo loop defaults into
.cursor/agent-loop.repo.json (runtime, models, review, notify, …) and a
loop.json for --out (verify + this bundle’s snapshot). Later sparse
loop.json files inherit those defaults; explicit loop.json keys win.
Then prints agent-check and agent-loop run. Interactive mode is an Ink TUI
(arrow keys + enter) on a TTY. Model lists match the runtime you just picked.
Pass --plain for numbered menus (CI / no TTY / screen readers).
Before the cost-preset menu, the wizard detects which runtimes are actually
installed (SDK import + CLI on PATH, same checks as agent-check) and annotates
runtime choices detected / missing. Missing runtimes stay selectable.

Cost preset: minmax (efficiency — cheap capable worker + strongest included
  judge; Grok whenever Cursor is installed) | balanced | cursor (Composer + Grok)
  | saved names from profile.costPresets (OpenRouter :free stacks show as hosted
  $0, not minmax) | custom (pick worker and judge; optionally save as a named preset).
  Default is minmax.
Worker runtimes: cursor | cline-pass | cline | opencode | pi | codex | dsh | muse | claude
Judge (review): reviewRuntime (cursor | cline-pass | cline | opencode | pi | codex | dsh | muse | claude),
  reviewModel (omit for runtime defaults: cursor grok-4.6 / composer-2.5, opencode
  opencode-go/deepseek-v4-pro, dsh deepseek-official/deepseek-v4-pro, codex gpt-5.6-sol,
  muse muse-spark-1.2, claude opus),
  reviewGate, maxReviewCycles, postQualityReview, reviewRisk,
  reviewSecondaryRuntime (any review runtime; unset = off),
  reviewSecondaryModel (omit for that runtime’s judge default),
Verify: verify command, verifyMode (command|skill), verifySkill, finalVerify
Loop control: maxIterations, stagnationThreshold, mode (forward|reverse),
  pauseAfterIteration, trustConfig
Notify / Telegram: notifyTelegram (off skips chatId / attach / requireNotify);
  notifyCommand; if sending: telegramAttachReview, requireNotify,
  profile telegramNotify chatId / onSuccess / onFailure / attachReview
Git / PR / completion: notifyPrComment (gh pr comment), profile defaultBranch,
  completionSignal, exportPack, exportRunReport, exportTranscript, syncOnSuccess

Options:
  --answers <answers.json>  Non-interactive answers: JSON object mirroring loop.json
                            fields (optional "profile" object patches telegram/branch;
                            runtime/models always go to profile.defaults).
                            Or { "saveCostPreset": "<name>", runtime, model,
                            reviewRuntime, reviewModel } with no verify to write
                            profile.costPresets only. Include verify to also write loop.json.
  --out <loop-dir>          Directory to write loop.json (default: current directory)
  --repo-root <path>        Repo whose .cursor/agent-loop.repo.json gets defaults
                            (default: current directory)
  --plain                   Numbered menus instead of the Ink TUI
  --dry-run                 Detect runtimes and print the loop.json + repo-profile
                            that would be written, then exit without writing anything
  --help                    Show this help`
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const SETUP_CLI_BASENAMES = new Set(['agent-loop-setup', 'setup.js'])

function realpathOrResolve(filePath: string): string {
  try {
    return fs.realpathSync(filePath)
  } catch {
    return path.resolve(filePath)
  }
}

/**
 * True when this module is the process entry (bin shim, symlink, or `node dist/cli/setup.js`).
 * False when tests import `./setup.js` (argv[1] is vitest).
 */
export function isSetupCliEntry(argv1: string | undefined, moduleUrl: string): boolean {
  if (argv1 === undefined || argv1 === '') return false
  const modulePath = fileURLToPath(moduleUrl)
  if (realpathOrResolve(argv1) === realpathOrResolve(modulePath)) return true
  const base = path.basename(argv1).replace(/\.(cmd|ps1|exe)$/i, '')
  return SETUP_CLI_BASENAMES.has(base)
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outDir: process.cwd(),
    repoRoot: process.cwd(),
    plain: false,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--':
        break
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
      case '--dry-run':
        options.dryRun = true
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
    if (key === 'profile' || key === 'saveCostPreset' || key === 'setCostPresetDefault') continue
    if (!LOOP_CONFIG_KEYS.has(key)) {
      console.error(`[agent-loop-setup] warn: ignoring unknown loop.json field "${key}"`)
      continue
    }
    if (value !== undefined) config[key] = value
  }
  return config
}

/** Print the agent-check / agent-loop run commands after a successful write. */
export function formatNextStepsLines(
  config: Record<string, unknown>,
  outDir: string,
  repoRoot: string,
  wroteProfile: boolean,
): string[] {
  const runtime = typeof config.runtime === 'string' ? config.runtime : LOOP_RUNTIME_CURSOR
  const checkRuntime = runtime === LOOP_RUNTIME_CLINE_PASS ? 'cline' : runtime
  const lines = [
    '',
    'Next steps:',
    `  agent-check ${checkRuntime}`,
    `  agent-loop-prompt --out ${outDir}`,
  ]
  const runCmd = [`agent-loop run ${outDir}`]
  if (typeof config.reviewRuntime === 'string' && config.reviewRuntime !== '') {
    runCmd.push(`--review-runtime ${config.reviewRuntime}`)
  }
  lines.push(`  ${runCmd.join(' ')}`)
  if (wroteProfile) {
    lines.push(`  Repo defaults: ${repoProfilePath(repoRoot)}`)
  }
  return lines
}

function printNextSteps(
  config: Record<string, unknown>,
  outDir: string,
  repoRoot: string,
  wroteProfile: boolean,
): void {
  for (const line of formatNextStepsLines(config, outDir, repoRoot, wroteProfile)) {
    console.log(line)
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

function existingCostPresetsRecord(existing: Record<string, unknown>): UserCostPresetMap {
  const raw = existing.costPresets
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  return { ...raw }
}

function freezeCostPresetStack(
  answers: Record<string, unknown>,
  detection?: DetectionResult,
): CostPresetStack {
  const parsed = parseLoopConfig(
    {
      verify: 'true',
      runtime: answers.runtime,
      model: answers.model,
      escalateModel: answers.escalateModel,
      reviewRuntime: answers.reviewRuntime,
      reviewModel: answers.reviewModel,
    },
    { detection },
  )
  const worker = resolveLoopAgent(parsed)
  const judge = resolveReviewAgent(parsed)
  const stack: CostPresetStack = {
    runtime: worker.runtime,
    model: worker.model,
    reviewRuntime: judge.runtime,
    reviewModel: judge.model,
  }
  if (typeof parsed.escalateModel === 'string') {
    stack.escalateModel = parsed.escalateModel
  }
  return stack
}

function printSavedPresetNextSteps(name: string, repoRoot: string, setAsDefault: boolean): void {
  console.log('')
  console.log(`Saved costPreset "${name}" in ${repoProfilePath(repoRoot)}`)
  console.log('Use it from a sparse loop.json:')
  console.log(`  { "verify": "bash .cursor/loops/<name>/verify.sh", "costPreset": "${name}" }`)
  if (setAsDefault) {
    console.log(`Repo defaults.costPreset is now "${name}".`)
  }
}

/**
 * Write only profile.costPresets (optional defaults.costPreset). No loop.json.
 */
export function runSaveCostPreset(
  answers: Record<string, unknown>,
  repoRoot: string,
  options: { dryRun?: boolean; detection?: DetectionResult } = {},
): number {
  const nameRaw = answers.saveCostPreset
  if (typeof nameRaw !== 'string') {
    console.error('[agent-loop-setup] saveCostPreset must be a string name')
    return 1
  }
  const name = nameRaw.trim()
  try {
    assertUserCostPresetName(name)
  } catch (err) {
    console.error(`[agent-loop-setup] ${errMessage(err)}`)
    return 1
  }

  let stack: CostPresetStack
  try {
    stack = freezeCostPresetStack(answers, options.detection)
  } catch (err) {
    console.error(`[agent-loop-setup] invalid cost preset stack: ${errMessage(err)}`)
    return 1
  }

  const setAsDefault = answers.setCostPresetDefault === true
  const existing = loadExistingProfile(repoRoot)
  const costPresets = { ...existingCostPresetsRecord(existing), [name]: stack }
  const patch: Record<string, unknown> = { costPresets }
  if (setAsDefault) {
    patch.defaults = { ...existingDefaultsRecord(existing), costPreset: name }
  }

  let profile: Record<string, unknown>
  try {
    profile = mergeAndValidateProfile(repoRoot, patch)
  } catch (err) {
    console.error(`[agent-loop-setup] invalid repo profile patch: ${errMessage(err)}`)
    return 1
  }

  console.log('[agent-loop-setup] would write:')
  console.log('--- .cursor/agent-loop.repo.json ---')
  console.log(JSON.stringify(profile, null, 2))
  if (options.dryRun) {
    console.log('[agent-loop-setup] dry-run — nothing written')
    return 0
  }

  try {
    writeProfile(repoRoot, profile)
  } catch (err) {
    console.error(`[agent-loop-setup] cannot patch repo profile: ${errMessage(err)}`)
    return 1
  }
  printSavedPresetNextSteps(name, repoRoot, setAsDefault)
  return 0
}

/**
 * Shared pipeline for answers + interactive modes. Validates everything with the
 * real schema BEFORE writing, so a rejected config never leaves a loop.json behind.
 * Prints the exact loop.json object and repo-profile patch before any write; with
 * `dryRun` it stops there and writes nothing.
 */
export function runWizard(
  answers: Record<string, unknown>,
  outDir: string,
  repoRoot: string,
  options: { dryRun?: boolean; detection?: DetectionResult; costPresets?: UserCostPresetMap } = {},
): number {
  if (typeof answers.saveCostPreset === 'string' && answers.verify === undefined) {
    return runSaveCostPreset(answers, repoRoot, {
      dryRun: options.dryRun,
      detection: options.detection,
    })
  }

  const config = pickLoopConfigFields(answers)

  let costPresets = options.costPresets
  let catalogPatch: UserCostPresetMap | undefined
  if (typeof answers.saveCostPreset === 'string') {
    const name = answers.saveCostPreset.trim()
    try {
      assertUserCostPresetName(name)
      const stack = freezeCostPresetStack(answers, options.detection)
      catalogPatch = { ...existingCostPresetsRecord(loadExistingProfile(repoRoot)), [name]: stack }
      costPresets = catalogPatch
    } catch (err) {
      console.error(`[agent-loop-setup] invalid cost preset stack: ${errMessage(err)}`)
      return 1
    }
  }

  let parsed: { runtime: string; reviewRuntime?: string; maxIterations: number }
  try {
    parsed = parseLoopConfig(config, { detection: options.detection, costPresets })
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
  if (Object.keys(defaults).length > 0 || profilePatch !== undefined || catalogPatch !== undefined) {
    try {
      const existing = loadExistingProfile(repoRoot)
      profile = mergeAndValidateProfile(repoRoot, {
        ...(profilePatch ?? {}),
        ...(catalogPatch !== undefined ? { costPresets: catalogPatch } : {}),
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

  console.log('[agent-loop-setup] would write:')
  console.log('--- loop.json ---')
  console.log(JSON.stringify(config, null, 2))
  if (profile !== undefined) {
    console.log('--- .cursor/agent-loop.repo.json ---')
    console.log(JSON.stringify(profile, null, 2))
  }
  if (options.dryRun) {
    console.log('[agent-loop-setup] dry-run — nothing written')
    return 0
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

async function runAnswersMode(
  answersPath: string,
  outDir: string,
  repoRoot: string,
  dryRun: boolean,
): Promise<number> {
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
  const detection = await detectLoopRuntimes()
  const costPresets = loadRepoProfile(repoRoot).costPresets
  return runWizard(answers as Record<string, unknown>, outDir, repoRoot, { dryRun, detection, costPresets })
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

async function runInteractive(
  outDir: string,
  repoRoot: string,
  plain: boolean,
  dryRun: boolean,
): Promise<number> {
  const detection = await detectLoopRuntimes()
  const costPresets = loadRepoProfile(repoRoot).costPresets
  if (shouldUseTui(plain)) {
    const answers = await collectSetupAnswers(createInkPrompts(), outDir, detection, costPresets)
    return runWizard(answers, outDir, repoRoot, { dryRun, detection, costPresets })
  }

  const rl = readline.createInterface({ input, output })
  try {
    console.log('agent-loop-setup — numbered menus (--plain or no TTY)')
    console.log('Type the number of an option (or press Enter for the default). Do not type slugs.')
    const answers = await collectSetupAnswers(createPlainPrompts(rl), outDir, detection, costPresets)
    return runWizard(answers, outDir, repoRoot, { dryRun, detection, costPresets })
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
    process.exitCode = await runAnswersMode(options.answersPath, options.outDir, options.repoRoot, options.dryRun)
  } else {
    try {
      process.exitCode = await runInteractive(options.outDir, options.repoRoot, options.plain, options.dryRun)
    } catch (err) {
      if (err instanceof SetupDeclinedError) {
        console.log("Ok. Ask your agent to set defaults or edit loop.json.")
        process.exitCode = 0
        return
      }
      console.error(`[agent-loop-setup] ${errMessage(err)}`)
      process.exitCode = 1
    }
  }
}

if (isSetupCliEntry(process.argv[1], import.meta.url)) {
  await main()
}

export { usage }
