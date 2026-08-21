#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { repoProfilePath, repoProfileSchema } from '../context/repoProfile.js'
import {
  CURSOR_LOOP_MODEL,
  CURSOR_REVIEW_MODEL,
  CURSOR_WORKER_MODEL,
  DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
  DEFAULT_CLINE_PASS_ESCALATE_MODEL,
  DEFAULT_CODEX_ESCALATE_MODEL,
  DEFAULT_CODEX_REVIEW_MODEL,
  DEFAULT_DSH_ESCALATE_MODEL,
  DEFAULT_DSH_REVIEW_MODEL,
  DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
  DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  DEFAULT_PI_ESCALATE_MODEL,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_REASONING_EFFORTS,
  defaultModelForRuntime,
  type LoopRuntime,
} from '../loop/loopAgentConfig.js'
import { loopConfigSchema, parseLoopConfig } from '../loop/loopConfig.js'

const WORKER_RUNTIMES = [
  'cursor',
  'cline-pass',
  'cline',
  'opencode',
  'pi',
  'codex',
  'dsh',
] as const

const JUDGE_RUNTIMES = [
  'cursor',
  'cline-pass',
  'cline',
  'opencode',
  'pi',
  'codex',
  'dsh',
] as const

const HITL_PROVIDERS = [
  'taskwarrior',
  'file',
  'github',
  'linear',
  'command',
] as const

const LOOP_CONFIG_KEYS = new Set(Object.keys(loopConfigSchema.shape))

type CliOptions = {
  answersPath?: string
  outDir: string
  repoRoot: string
}

function usage(): string {
  return `Usage: agent-loop-setup [options]

Interactive walkthrough that writes a valid loop.json for a new loop bundle
(and optionally patches .cursor/agent-loop.repo.json), then prints the
agent-check and agent-loop run commands (plus --review-runtime when a judge
runtime is configured).

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
                            fields (optional "profile" object patches the repo profile)
  --out <loop-dir>          Directory to write loop.json (default: current directory)
  --repo-root <path>        Repo whose .cursor/agent-loop.repo.json gets patched
                            (default: current directory)
  --help                    Show this help`
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { outDir: process.cwd(), repoRoot: process.cwd() }
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

/** Judge default per reviewRuntime (mirrors the schema's resolveReviewAgent defaults). */
function reviewModelHint(reviewRuntime: string, workerRuntime: string): string {
  switch (reviewRuntime) {
    case LOOP_RUNTIME_CURSOR:
      return workerRuntime === LOOP_RUNTIME_CURSOR ? CURSOR_REVIEW_MODEL : CURSOR_WORKER_MODEL
    case 'opencode':
      return DEFAULT_OPENCODE_GO_REVIEW_MODEL
    case LOOP_RUNTIME_DSH:
      return DEFAULT_DSH_REVIEW_MODEL
    case 'codex':
      return DEFAULT_CODEX_REVIEW_MODEL
    default:
      return defaultModelForRuntime(reviewRuntime as LoopRuntime)
  }
}

/** Print the agent-check / agent-loop run commands (step 8). Always printed. */
function printNextSteps(config: Record<string, unknown>, outDir: string): void {
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
    printNextSteps(config, outDir)
    return 1
  }

  let profile: Record<string, unknown> | undefined
  if (answers.profile !== undefined) {
    if (
      typeof answers.profile !== 'object' ||
      answers.profile === null ||
      Array.isArray(answers.profile)
    ) {
      console.error('[agent-loop-setup] invalid loop config: answers.profile must be a JSON object')
      printNextSteps(config, outDir)
      return 1
    }
    try {
      profile = mergeAndValidateProfile(repoRoot, answers.profile as Record<string, unknown>)
    } catch (err) {
      console.error(`[agent-loop-setup] invalid repo profile patch: ${errMessage(err)}`)
      printNextSteps(config, outDir)
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

  if (profile !== undefined) {
    try {
      writeProfile(repoRoot, profile)
    } catch (err) {
      console.error(`[agent-loop-setup] cannot patch repo profile: ${errMessage(err)}`)
      return 1
    }
  }

  console.error(
    `[agent-loop-setup] configured runtime=${parsed.runtime} ` +
      `reviewRuntime=${parsed.reviewRuntime ?? '(unset → cursor)'} ` +
      `maxIterations=${parsed.maxIterations}`,
  )
  printNextSteps(config, outDir)
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

async function runInteractive(outDir: string, repoRoot: string): Promise<number> {
  const rl = readline.createInterface({ input, output })
  const answers: Record<string, unknown> = {}
  const profile: Record<string, unknown> = {}

  /** Rejects any pending prompt when stdin closes (EOF) so interactive mode aborts cleanly. */
  const stdinClosed = new Promise<never>((_, reject) => {
    rl.on('close', () => reject(new Error('stdin closed (EOF) — interactive setup aborted')))
  })
  const ask = async (prompt: string, dflt?: string): Promise<string> => {
    const suffix = dflt !== undefined ? ` [${dflt}]` : ''
    const line = await Promise.race([
      rl.question(`${prompt}${suffix} `),
      stdinClosed,
    ])
    return line.trim() === '' && dflt !== undefined ? dflt : line.trim()
  }
  const askBool = async (prompt: string, dflt: boolean): Promise<boolean> => {
    const line = await ask(`${prompt} (y/n)`, dflt ? 'y' : 'n')
    if (/^y(es)?$/i.test(line)) return true
    if (/^n(o)?$/i.test(line)) return false
    return dflt
  }
  const askChoice = async (
    prompt: string,
    choices: readonly string[],
    dflt: string,
  ): Promise<string> => {
    const line = await ask(prompt, dflt)
    return choices.includes(line) ? line : dflt
  }
  const askNumber = async (
    prompt: string,
    dflt: number,
    min: number,
    max: number,
  ): Promise<number> => {
    const line = await ask(prompt, String(dflt))
    const n = Number(line)
    return Number.isInteger(n) && n >= min && n <= max ? n : dflt
  }

  try {
    console.log('agent-loop-setup — interactive loop bundle setup')
    console.log('(press Enter to accept the default shown in brackets)')

    // 1) Worker runtime + models
    const runtime = await askChoice('Worker runtime', WORKER_RUNTIMES, 'cursor')
    answers.runtime = runtime
    const defaultModel = defaultModelForRuntime(runtime as LoopRuntime)
    const model = await ask(`Worker model (Enter = ${defaultModel})`)
    if (model !== '') answers.model = model

    const escalateDefaults: Record<string, string> = {
      'cline-pass': DEFAULT_CLINE_PASS_ESCALATE_MODEL,
      cline: DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
      opencode: DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
      pi: DEFAULT_PI_ESCALATE_MODEL,
      codex: DEFAULT_CODEX_ESCALATE_MODEL,
      dsh: DEFAULT_DSH_ESCALATE_MODEL,
      cursor: CURSOR_LOOP_MODEL,
    }
    if (runtime !== LOOP_RUNTIME_CURSOR) {
      const escalateModel = await ask(
        `Escalate model on stagnation (Enter = ${escalateDefaults[runtime] ?? defaultModel})`,
      )
      if (escalateModel !== '') answers.escalateModel = escalateModel
    }
    answers.escalateAfterStagnation = await askNumber('Escalate after N identical failures', 2, 1, 10)

    if (runtime === LOOP_RUNTIME_CLINE_PASS || runtime === LOOP_RUNTIME_CLINE) {
      const effort = await askChoice('Cline reasoning effort', LOOP_REASONING_EFFORTS, 'none')
      if (effort !== 'none') answers.reasoningEffort = effort
      const escalateEffort = await askChoice(
        'Cline escalate reasoning effort',
        LOOP_REASONING_EFFORTS,
        'none',
      )
      if (escalateEffort !== 'none') answers.escalateReasoningEffort = escalateEffort
    }

    // 2) Judge
    const reviewRuntime = await askChoice('Judge runtime (reviewRuntime)', JUDGE_RUNTIMES, 'cursor')
    answers.reviewRuntime = reviewRuntime
    const reviewModel = await ask(
      `Judge model (Enter = default ${reviewModelHint(reviewRuntime, runtime)})`,
    )
    if (reviewModel !== '') answers.reviewModel = reviewModel
    answers.reviewGate = await askBool('Enable review gate (reviewGate)', false)
    answers.maxReviewCycles = await askNumber('Max review cycles (maxReviewCycles)', 2, 1, 5)
    const pqr = await askChoice('Post-quality review (auto|true|false)', ['auto', 'true', 'false'], 'auto')
    if (pqr === 'true') answers.postQualityReview = true
    else if (pqr === 'false') answers.postQualityReview = false
    else answers.postQualityReview = 'auto'
    answers.reviewRisk = await askChoice(
      'Review risk (auto|high|medium|low)',
      ['auto', 'high', 'medium', 'low'],
      'auto',
    )
    const secondary = await askChoice(
      'Secondary review runtime (none|cline-pass|cline)',
      ['none', 'cline-pass', 'cline'],
      'none',
    )
    if (secondary !== 'none') answers.reviewSecondaryRuntime = secondary

    // 3) Verify
    let verify = ''
    while (verify === '') {
      verify = await ask('Verify command (required, e.g. bash .cursor/loops/<name>/verify.sh)')
    }
    answers.verify = verify
    const verifyMode = await askChoice('Verify mode (command|skill)', ['command', 'skill'], 'command')
    answers.verifyMode = verifyMode
    if (verifyMode === 'skill') {
      const verifySkill = await ask('Verify skill path (VERIFY.skill.md)')
      if (verifySkill !== '') answers.verifySkill = verifySkill
    }
    const finalVerify = await ask('Final verify command (optional)')
    if (finalVerify !== '') answers.finalVerify = finalVerify

    // 4) Loop control
    answers.maxIterations = await askNumber('Max iterations (maxIterations)', 8, 1, 50)
    answers.stagnationThreshold = await askNumber('Stagnation threshold (identical failures)', 3, 0, 10)
    answers.mode = await askChoice('Loop mode (forward|reverse)', ['forward', 'reverse'], 'forward')
    answers.pauseAfterIteration = await askBool('Pause after each iteration', false)
    answers.trustConfig = await askBool('Trust this loop.json (trustConfig)', false)

    // 5) Notify / Telegram (token stays in env — never read or printed here)
    answers.notifyTelegram = await askBool('Send completion report to Telegram', true)
    answers.telegramAttachReview = await askBool('Attach latest review.md to Telegram', true)
    answers.requireNotify = await askBool('Abort if Telegram preflight fails (requireNotify)', false)
    const notifyCommand = await ask('Custom notifyCommand (optional)')
    if (notifyCommand !== '') answers.notifyCommand = notifyCommand
    const telegram: Record<string, unknown> = {}
    const chatId = await ask('Telegram chatId (profile telegramNotify.chatId; optional)')
    if (chatId !== '') telegram.chatId = chatId
    telegram.onSuccess = await askBool('Telegram notify on success', true)
    telegram.onFailure = await askBool('Telegram notify on failure', true)
    telegram.attachReview = await askBool('Telegram attach review', true)
    profile.telegramNotify = telegram

    // 6) Git / PR / completion
    const defaultBranch = await ask('Repo default branch (profile defaultBranch, diff base)', 'main')
    if (defaultBranch !== '') profile.defaultBranch = defaultBranch
    answers.notifyPrComment = await askBool('Comment on open PR after exit (notifyPrComment)', false)
    answers.completionSignal = await askBool('Emit AGENT_LOOP_DONE on stdout', true)
    answers.exportPack = await askBool('Export artifacts to .cursor/loop-exports', true)
    answers.exportRunReport = await askBool('Write run-report.md', true)
    answers.exportTranscript = await askBool('Record transcript.ndjson', true)
    answers.syncOnSuccess = await askBool('Run profile syncCommand after success', true)

    // 7) HITL
    const hitlProvider = await askChoice('HITL provider', HITL_PROVIDERS, 'taskwarrior')
    answers.hitlProvider = hitlProvider
    answers.hitlOnFailure = await askBool('Open HITL checkpoint on incomplete loop', false)
    answers.reviewGateHitl = await askBool('Escalate exhausted review gate to a human', false)
    const uuid = await ask('Taskwarrior UUID (taskwarriorUuid; optional — UUID only)')
    if (uuid !== '') answers.taskwarriorUuid = uuid
  } finally {
    rl.close()
  }

  if (Object.keys(profile).length > 0) answers.profile = profile
  return runWizard(answers, outDir, repoRoot)
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
      process.exitCode = await runInteractive(options.outDir, options.repoRoot)
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
