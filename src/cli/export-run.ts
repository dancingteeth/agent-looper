#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import { resolveLoopAgent, resolveReviewAgent } from '../loop/loopAgentConfig.js'
import { loadLoopBundle, resolveLoopDir } from '../loop/loopConfig.js'
import {
  reconstructAgentLoopResultFromLog,
  readTranscriptEvents,
  TRANSCRIPT_FILENAME,
  writeRunReportArtifacts,
} from '../loop/loopRunReport.js'
import { parseRepoRootFlag } from './shared.js'

const { remaining, repoRoot } = parseRepoRootFlag(process.argv.slice(2))
const loopArg = remaining.find((a) => !a.startsWith('-'))

if (!loopArg || remaining.includes('--help') || remaining.includes('-h')) {
  console.log(`Usage: agent-loop-export-run <loop-dir> [--repo-root <path>]

Regenerate run-report.md (and transcript.ndjson when enabled) from loop bundle artifacts.
Reads log.ndjson for iteration timeline; optionally merges existing transcript.ndjson.`)
  process.exit(loopArg ? 0 : 1)
}

const ctx = resolveRepoContext({ repoRoot })
const loopDir = resolveLoopDir(loopArg, ctx.repoRoot)
const bundle = loadLoopBundle(loopDir)
const result = reconstructAgentLoopResultFromLog(bundle.logPath, { config: bundle.config })
const workerModel = resolveLoopAgent(bundle.config).model
const reviewAgent = resolveReviewAgent(bundle.config)
const transcriptPath = path.join(loopDir, TRANSCRIPT_FILENAME)
const transcriptEvents = readTranscriptEvents(transcriptPath)

console.error(
  `[agent-loop-export-run] loop=${path.relative(ctx.repoRoot, loopDir)} iterations=${result.iterations} complete=${result.complete}`,
)

const { reportPath, transcriptPath: writtenTranscript } = writeRunReportArtifacts({
  ctx,
  loopDir,
  goal: bundle.goal,
  config: bundle.config,
  result,
  workerModel,
  reviewRuntime: reviewAgent.runtime,
  reviewModel: reviewAgent.model,
  runtime: bundle.config.runtime,
  transcriptEvents: transcriptEvents.length > 0 ? transcriptEvents : undefined,
})

console.log(`\nReport written: ${path.relative(ctx.repoRoot, reportPath)}`)
if (writtenTranscript) {
  console.log(`Transcript written: ${path.relative(ctx.repoRoot, writtenTranscript)}`)
}
