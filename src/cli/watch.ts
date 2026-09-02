import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { render } from 'ink'
import { resolveLoopDir } from '../loop/loopConfig.js'
import { formatWatchStatusLine, readWatchView, type WatchPhase } from '../loop/loopWatch.js'
import {
  formatGrindPulseLines,
  readAssistantStreamTail,
  readGrindPulse,
} from '../loop/grindStream.js'
import { clearInkPerformanceBuffer } from './inkProductionEnv.js'
import { parseWatchArgs } from './watchArgs.js'
import { WatchApp } from './watchTui.js'

function readMaxIterations(loopDir: string): number | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(loopDir, 'loop.json'), 'utf8')) as {
      maxIterations?: unknown
    }
    return typeof raw.maxIterations === 'number' ? raw.maxIterations : undefined
  } catch {
    return undefined
  }
}

function shouldUseInk(plain: boolean): boolean {
  return !plain && Boolean(process.stderr.isTTY)
}

function runInkWatch(loopDir: string): Promise<number> {
  return new Promise((resolve) => {
    const maxIterations = readMaxIterations(loopDir)
    const instance = render(createElement(WatchApp, { loopDir, maxIterations }), {
      exitOnCtrlC: false,
      incrementalRendering: true,
    })
    const stop = () => {
      instance.unmount()
      clearInkPerformanceBuffer()
      resolve(0)
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}

function runPlainWatch(loopDir: string): Promise<number> {
  return new Promise((resolve) => {
    const maxIterations = readMaxIterations(loopDir)
    let lastPhase: WatchPhase | undefined
    const poll = () => {
      const status = readWatchView(loopDir, { maxIterations })
      if (status && status.phase !== lastPhase) {
        lastPhase = status.phase
        console.error(formatWatchStatusLine(status))
      }
    }
    poll()
    const timer = setInterval(poll, 1000)
    const stop = () => {
      clearInterval(timer)
      resolve(0)
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}

export async function runWatchCommand(argv: string[]): Promise<number> {
  const parsed = parseWatchArgs(argv)
  if (parsed.kind === 'help') {
    console.log(parsed.text)
    return 0
  }
  if (parsed.kind === 'error') {
    console.error(parsed.message)
    return 1
  }

  const options = parsed.options
  const repoRoot = options.repoRoot ?? process.cwd()
  const loopDir = resolveLoopDir(options.loopDir ?? '.', repoRoot)

  if (options.snapshot || options.pulse) {
    const status = readWatchView(loopDir, {
      maxIterations: readMaxIterations(loopDir),
    })
    if (!status) {
      console.error(`[agent-loop] watch: no watch-status.json or log.ndjson in ${loopDir}`)
      return 1
    }
    if (options.snapshot) {
      console.log('Agent Looper — watch (snapshot)')
      console.log('[GOAL] → [WORKER] → [VERIFY] → [JUDGE]')
      console.log(formatWatchStatusLine(status))
    }
    const grindPulse = readGrindPulse(loopDir, {
      maxIterations: readMaxIterations(loopDir),
    })
    if (grindPulse) {
      if (options.snapshot) {
        console.log('--- pulse ---')
      }
      for (const line of formatGrindPulseLines(grindPulse)) {
        console.log(line)
      }
    }
    const tail = readAssistantStreamTail(loopDir)
    if (tail) {
      if (options.snapshot) console.log('--- stream ---')
      console.log(tail)
    }
    return 0
  }

  return shouldUseInk(options.plain) ? runInkWatch(loopDir) : runPlainWatch(loopDir)
}
