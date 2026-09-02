#!/usr/bin/env node
import './inkProductionEnv.js'
import fs from 'node:fs'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import {
  assertFreezeReady,
  assertPreviewTrusted,
  formatRunHandoffCommand,
  loadLoopConfigForPrompt,
  readDraftSnapshot,
  resolvePromptPaths,
  runScaffoldAgent,
  spawnLoopRun,
  spawnPreviewDetached,
  waitForChildExit,
  type DraftStreamState,
} from './promptFlow.js'
import { detectLoopRuntimes } from './detectRuntimes.js'
import { parsePromptArgs, type PromptCliOptions } from './promptArgs.js'
import {
  confirmFreezeInk,
  readIdeaInk,
  renderDraftInk,
  showDoneInk,
  watchChildInk,
} from './promptTui.js'

const PROMPT_CLI_BASENAMES = new Set(['agent-loop-prompt', 'prompt.js'])

function realpathOrResolve(filePath: string): string {
  try {
    return fs.realpathSync(filePath)
  } catch {
    return path.resolve(filePath)
  }
}

export function isPromptCliEntry(argv1: string | undefined, moduleUrl: string): boolean {
  if (argv1 === undefined || argv1 === '') return false
  const modulePath = fileURLToPath(moduleUrl)
  if (realpathOrResolve(argv1) === realpathOrResolve(modulePath)) return true
  const base = path.basename(argv1).replace(/\.(cmd|ps1|exe)$/i, '')
  return PROMPT_CLI_BASENAMES.has(base)
}

function shouldUseInk(plain: boolean): boolean {
  return !plain && Boolean(process.stderr.isTTY)
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function readIdeaPlain(): Promise<string> {
  const rl = readline.createInterface({ input, output })
  try {
    console.log('agent-loop-prompt — type your idea (end with ctrl+d or empty line + ctrl+d)')
    const lines: string[] = []
    for (;;) {
      const line = await rl.question(lines.length === 0 ? '> ' : '  ')
      if (line === '' && lines.length > 0) break
      lines.push(line)
    }
    const text = lines.join('\n').trim()
    if (!text) throw new Error('empty prompt')
    return text
  } finally {
    rl.close()
  }
}

async function confirmFreezePlain(yes: boolean): Promise<'run' | 'edit' | 'abort'> {
  if (yes) return 'run'
  const rl = readline.createInterface({ input, output })
  try {
    const answer = await rl.question('Freeze and run? [Y/n/e=edit] ')
    const trimmed = answer.trim().toLowerCase()
    if (trimmed === '' || trimmed === 'y' || trimmed === 'yes') return 'run'
    if (trimmed === 'e' || trimmed === 'edit') return 'edit'
    if (trimmed === 'n' || trimmed === 'no' || trimmed === 'abort') return 'abort'
    return 'run'
  } finally {
    rl.close()
  }
}

async function executePromptFlow(options: PromptCliOptions): Promise<number> {
  const { repoRoot, loopDir } = resolvePromptPaths(options)
  const useInk = shouldUseInk(options.plain)

  const idea =
    options.prompt?.trim() ||
    (useInk ? await readIdeaInk() : await readIdeaPlain())

  let draftUi: ReturnType<typeof renderDraftInk> | undefined
  let draftState: DraftStreamState = { assistantTail: '', files: [] }
  const getDraftState = () => draftState

  if (useInk) {
    draftUi = renderDraftInk(() => undefined, getDraftState)
  } else {
    console.error('[agent-loop-prompt] drafting bundle…')
  }

  try {
    await runScaffoldAgent(loopDir, repoRoot, idea, {
      onUpdate: (state) => {
        draftState = state
        if (!useInk) {
          if (state.files.length > 0) {
            console.error(`[agent-loop-prompt] files: ${state.files.join(', ')}`)
          }
          return
        }
        draftUi?.update()
      },
    })
  } finally {
    draftUi?.unmount()
  }

  assertFreezeReady(loopDir)
  const snapshot = readDraftSnapshot(loopDir)

  if (!useInk) {
    console.log('')
    console.log('Draft ready:')
    console.log(`  files: ${snapshot.files.join(', ')}`)
    console.log(`  verify: ${snapshot.verifyCommand}`)
    if (snapshot.preview) console.log(`  preview: ${snapshot.preview}`)
    console.log(snapshot.goalPreview.split('\n').slice(0, 6).join('\n'))
    console.log('')
  }

  const freezeChoice = useInk
    ? options.yes
      ? 'run'
      : await confirmFreezeInk(snapshot)
    : await confirmFreezePlain(options.yes)

  if (freezeChoice === 'abort') {
    console.log('Aborted — bundle left on disk for edits.')
    return 0
  }
  if (freezeChoice === 'edit') {
    console.log(`Edit files in ${loopDir}, then:`)
    console.log(`  ${formatRunHandoffCommand(loopDir, repoRoot)}`)
    return 0
  }

  if (options.noRun) {
    console.log('Frozen. Next:')
    console.log(`  ${formatRunHandoffCommand(loopDir, repoRoot)}`)
    return 0
  }

  const config = loadLoopConfigForPrompt(loopDir, await detectLoopRuntimes())
  const { child, logPath, bundleLabel } = spawnLoopRun(loopDir, repoRoot)
  if (!useInk) {
    console.error(`[agent-loop-prompt] watching ${bundleLabel} (log: ${logPath})`)
  }

  const exitCode =
    useInk
      ? await watchChildInk(loopDir, child, config.maxIterations)
      : await waitForChildExit(child)

  if (useInk) {
    await showDoneInk(exitCode, exitCode === 0 ? config.preview : undefined)
  } else {
    console.error(`[agent-loop-prompt] run exited ${exitCode}`)
  }

  if (exitCode === 0 && config.preview) {
    try {
      assertPreviewTrusted({
        cwd: repoRoot,
        preview: config.preview,
        trustConfig: config.trustConfig,
      })
      spawnPreviewDetached(config.preview, repoRoot)
      console.error(`[agent-loop-prompt] preview started: ${config.preview}`)
    } catch (err) {
      console.error(`[agent-loop-prompt] preview not started: ${errMessage(err)}`)
    }
  }

  return exitCode === 0 ? 0 : 1
}

async function main(): Promise<void> {
  const parsed = parsePromptArgs(process.argv.slice(2))
  if (parsed.kind === 'help') {
    console.log(parsed.text)
    return
  }
  if (parsed.kind === 'error') {
    console.error(parsed.message)
    process.exitCode = 1
    return
  }

  try {
    process.exitCode = await executePromptFlow(parsed.options)
  } catch (err) {
    if (errMessage(err) === 'prompt aborted') {
      console.log('Aborted.')
      process.exitCode = 0
      return
    }
    console.error(`[agent-loop-prompt] ${errMessage(err)}`)
    process.exitCode = 1
  }
}

if (isPromptCliEntry(process.argv[1], import.meta.url)) {
  await main()
}

export { executePromptFlow }
