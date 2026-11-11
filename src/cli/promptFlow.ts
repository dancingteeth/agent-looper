import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveRepoContext } from '../context/repoContext.js'
import { runOneShotAgentPrompt } from '../agents/oneShotAgentRun.js'
import { resolveReviewAgent } from '../loop/loopAgentConfig.js'
import { applyLoopDefaults } from '../loop/loopDefaults.js'
import {
  parseLoopConfig,
  resolveLoopDir,
  type LoopConfig,
} from '../loop/loopConfig.js'
import {
  detectLoopRuntimes,
  type DetectionResult,
} from './detectRuntimes.js'
import {
  loadLoopCostPresetsForDir,
  loadLoopDefaultsForDir,
} from '../context/repoProfile.js'
import { assertShellConfigTrusted } from '../loop/loopShellTrust.js'
import { StreamCollector } from '../stream/streamCollect.js'
import { formatPreflightMessage, validateGoalPreflight } from '../loop/loopPreflight.js'
import { formatLoopResumeCommand } from '../loop/loopResumeCommand.js'
import { parseLoopCompletionSignalLine } from '../integrations/loopCompletionSignal.js'
import {
  formatVerifyScriptLintMessage,
  lintVerifyScript,
} from '../loop/verifyScriptLint.js'
import { buildScaffoldPrompt, SCAFFOLD_BUNDLE_FILES, SCAFFOLD_SESSION_TIMEOUT_MS } from './promptScaffold.js'
import type { PromptCliOptions } from './promptArgs.js'

export type DraftSnapshot = {
  files: string[]
  goalPreview: string
  verifyCommand: string
  preview?: string
}

export type DraftStreamState = {
  assistantTail: string
  toolLine?: string
  files: string[]
}

export type FreezeChoice = 'run' | 'edit' | 'abort'

const ASSISTANT_TAIL_CHARS = 1200

export function loadLoopConfigForPrompt(
  loopDir: string,
  detection?: DetectionResult,
): LoopConfig {
  const configPath = path.join(loopDir, 'loop.json')
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing loop.json in ${loopDir} — run agent-loop-setup --out first`)
  }
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown
  const defaults = loadLoopDefaultsForDir(loopDir)
  const costPresets = loadLoopCostPresetsForDir(loopDir)
  return parseLoopConfig(applyLoopDefaults(raw, defaults), { costPresets, detection })
}

export function listScaffoldFiles(loopDir: string): string[] {
  return SCAFFOLD_BUNDLE_FILES.filter((name) => fs.existsSync(path.join(loopDir, name)))
}

export function readDraftSnapshot(loopDir: string): DraftSnapshot {
  const config = loadLoopConfigForPrompt(loopDir)
  const goalPath = path.join(loopDir, 'GOAL.md')
  const goalPreview = fs.existsSync(goalPath)
    ? fs.readFileSync(goalPath, 'utf8').split('\n').slice(0, 10).join('\n').trim()
    : '(GOAL.md not written yet)'
  return {
    files: listScaffoldFiles(loopDir),
    goalPreview,
    verifyCommand: config.verify,
    preview: config.preview,
  }
}

export function assertFreezeReady(loopDir: string): void {
  const goalPath = path.join(loopDir, 'GOAL.md')
  const verifyPath = path.join(loopDir, 'verify.sh')
  if (!fs.existsSync(goalPath) || !fs.readFileSync(goalPath, 'utf8').trim()) {
    throw new Error('Scaffold did not write GOAL.md — cannot freeze')
  }
  if (!fs.existsSync(verifyPath)) {
    throw new Error('Scaffold did not write verify.sh — cannot freeze')
  }
  const preflight = validateGoalPreflight(fs.readFileSync(goalPath, 'utf8'))
  if (!preflight.ok) {
    throw new Error(
      `Scaffold GOAL.md failed harness preflight:\n${formatPreflightMessage(preflight)}\nAdd ## Acceptance criteria before freeze.`,
    )
  }
  const lint = lintVerifyScript(fs.readFileSync(verifyPath, 'utf8'))
  for (const warning of lint.warnings) {
    console.error(`[agent-loop-prompt] verify.sh warn: ${warning}`)
  }
  if (!lint.ok) {
    throw new Error(
      `Scaffold verify.sh failed freeze lint:\n${formatVerifyScriptLintMessage(lint)}\nLoop over required titles/ids; assert rituals, not gameable greps.`,
    )
  }
}

export function scaffoldFreezeReady(loopDir: string): boolean {
  try {
    assertFreezeReady(loopDir)
    return true
  } catch {
    return false
  }
}

export function trimAssistantTail(text: string): string {
  if (text.length <= ASSISTANT_TAIL_CHARS) return text
  return `…${text.slice(-ASSISTANT_TAIL_CHARS)}`
}

export async function runScaffoldAgent(
  loopDir: string,
  repoRoot: string,
  idea: string,
  callbacks: {
    onUpdate?: (state: DraftStreamState) => void
    verbose?: boolean
  } = {},
): Promise<void> {
  if (scaffoldFreezeReady(loopDir)) {
    console.error('[agent-loop-prompt] spec files already freeze-ready — skipping judge')
    return
  }
  const ctx = resolveRepoContext({ repoRoot })
  const detection = await detectLoopRuntimes()
  const config = loadLoopConfigForPrompt(loopDir, detection)
  // Spec + verify are the law; use the judge, not the cheap implementer.
  const agent = resolveReviewAgent(config)
  const collector = new StreamCollector({ phase: 'review' })
  let assistantTail = ''
  const abort = new AbortController()
  console.error(
    `[agent-loop-prompt] scaffold judge=${agent.runtime}/${agent.model} timeout=${Math.round(SCAFFOLD_SESSION_TIMEOUT_MS / 1000)}s`,
  )

  const emit = () => {
    callbacks.onUpdate?.({
      assistantTail,
      toolLine: collector.events.at(-1)?.detail,
      files: listScaffoldFiles(loopDir),
    })
    if (scaffoldFreezeReady(loopDir) && !abort.signal.aborted) {
      console.error('[agent-loop-prompt] spec files ready — stopping scaffold judge')
      abort.abort()
    }
  }

  const poll = setInterval(emit, 500)
  try {
    await runOneShotAgentPrompt(
      ctx,
      buildScaffoldPrompt(path.relative(repoRoot, loopDir) || '.', idea),
      agent,
      {
        phase: 'scaffold',
        verbose: callbacks.verbose,
        collector,
        timeoutMs: SCAFFOLD_SESSION_TIMEOUT_MS,
        signal: abort.signal,
        onAssistantText: (chunk) => {
          assistantTail = trimAssistantTail(assistantTail + chunk)
          emit()
        },
      },
    )
    emit()
  } catch (err) {
    if (scaffoldFreezeReady(loopDir)) return
    throw err
  } finally {
    clearInterval(poll)
  }
}

export function resolveAgentLoopRunBin(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'run.js')
}

export function spawnLoopRun(
  loopDir: string,
  repoRoot: string,
): { child: ChildProcess; logPath: string; logOffset: number; bundleLabel: string } {
  const bundleLabel = path.relative(repoRoot, loopDir) || '.'
  const logPath = path.join(loopDir, 'prompt-run.log')
  fs.mkdirSync(loopDir, { recursive: true })
  const logFd = fs.openSync(logPath, 'a')
  /** Log is append-only across runs; readers start here to see only this run. */
  const logOffset = fs.fstatSync(logFd).size
  const child = spawn(process.execPath, [resolveAgentLoopRunBin(), 'run', bundleLabel], {
    cwd: repoRoot,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  })
  child.on('exit', () => {
    try {
      fs.closeSync(logFd)
    } catch {
      // log fd may already be closed
    }
  })
  return { child, logPath, logOffset, bundleLabel }
}

/** Trust-gate preview at the execute site — `agent-loop run` does not exec this shell. */
export function assertPreviewTrusted(input: {
  cwd: string
  preview: string
  trustConfig?: boolean
  env?: NodeJS.ProcessEnv
}): void {
  assertShellConfigTrusted({
    cwd: input.cwd,
    preview: input.preview,
    trustConfig: input.trustConfig,
    env: input.env,
  })
}

export function spawnPreviewDetached(command: string, cwd: string): ChildProcess {
  const child = spawn(command, {
    cwd,
    shell: true,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return child
}

export function formatRunHandoffCommand(
  loopDir: string,
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const bundleLabel = path.relative(repoRoot, loopDir) || '.'
  return formatLoopResumeCommand(bundleLabel, env)
}

const RUN_FAILURE_REASON_MAX = 400

/**
 * Why the spawned run ended, from this run's slice of prompt-run.log:
 * the `AGENT_LOOP_DONE` reason when present, else the last `failed:` / error line,
 * else the last non-empty line. One line, capped — the full log stays on disk.
 */
export function readRunFailureReason(logPath: string, logOffset = 0): string | undefined {
  let text: string
  try {
    const buf = fs.readFileSync(logPath)
    text = buf.subarray(Math.min(logOffset, buf.length)).toString('utf8')
  } catch {
    return undefined
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  let reason: string | undefined
  for (let i = lines.length - 1; i >= 0 && reason === undefined; i--) {
    reason = parseLoopCompletionSignalLine(lines[i]!)?.reason
  }
  reason ??= [...lines].reverse().find((line) => /\bfailed:|^(Error|TypeError)\b/.test(line))
  reason ??= lines.at(-1)
  if (reason === undefined) return undefined
  reason = reason.replace(/^\[agent-loop\]\s*(failed:\s*)?(Error:\s*)?/, '').trim()
  if (reason.length === 0) return undefined
  return reason.length > RUN_FAILURE_REASON_MAX
    ? `${reason.slice(0, RUN_FAILURE_REASON_MAX - 1)}…`
    : reason
}

export async function waitForChildExit(child: ChildProcess): Promise<number> {
  if (child.exitCode !== null) return child.exitCode
  return await new Promise<number>((resolve) => {
    child.once('exit', (code) => resolve(code ?? 1))
  })
}

export function resolvePromptPaths(options: PromptCliOptions): {
  repoRoot: string
  loopDir: string
} {
  const repoRoot = path.resolve(options.repoRoot)
  const loopDir = resolveLoopDir(options.outDir, repoRoot)
  return { repoRoot, loopDir }
}
