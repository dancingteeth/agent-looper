import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import { resolveTaskwarriorProject } from '../context/repoContext.js'
import { runCursorAgentPrompt } from '../agents/cursorAgent.js'
import {
  CURSOR_REVIEW_MODEL,
  type CursorSdkModel,
} from '../loop/loopAgentConfig.js'
import { FAILURE_DOMAINS_FILENAME } from '../loop/loopFailureDomain.js'
import {
  readLatestReviewContent,
  resolveLatestReviewPath,
} from '../loop/loopReport.js'
import { createHitlCheckTask } from '../integrations/taskwarrior.js'
import { gitDiffStatSinceBranchBase } from './loopPostReview.js'
import { buildMetaReviewPrompt, type CollectedLoopArtifacts } from './metaReviewPrompt.js'
import { parseReviewMarkdown } from './reviewVerdict.js'

export type { CollectedLoopArtifacts } from './metaReviewPrompt.js'

export function isLoopBundleDir(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'GOAL.md')) && fs.existsSync(path.join(dir, 'loop.json'))
  )
}

export function discoverLoopBundles(inputPaths: string[], repoRoot: string): string[] {
  const found = new Set<string>()

  for (const input of inputPaths) {
    const abs = path.resolve(repoRoot, input)

    if (isLoopBundleDir(abs)) {
      found.add(abs)
      continue
    }

    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      continue
    }

    for (const entry of fs.readdirSync(abs)) {
      const child = path.join(abs, entry)
      try {
        if (fs.statSync(child).isDirectory() && isLoopBundleDir(child)) {
          found.add(path.resolve(child))
        }
      } catch {
        // skip unreadable entries
      }
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b))
}

export function collectLoopArtifacts(
  loopDir: string,
  ctx: RepoContext,
): CollectedLoopArtifacts {
  const relPath = path.relative(ctx.repoRoot, loopDir) || '.'
  const missing: string[] = []
  const diffStat = gitDiffStatSinceBranchBase(ctx)

  let goal: string | undefined
  const goalPath = path.join(loopDir, 'GOAL.md')
  if (fs.existsSync(goalPath)) {
    goal = fs.readFileSync(goalPath, 'utf8').trim()
  } else {
    missing.push('GOAL.md')
  }

  let review: CollectedLoopArtifacts['review']
  const reviewPath = resolveLatestReviewPath(loopDir)
  const reviewContent = readLatestReviewContent(loopDir)
  if (reviewPath && reviewContent) {
    review = { path: reviewPath, content: reviewContent }
  } else {
    missing.push('review.md')
  }

  const logPath = path.join(loopDir, 'log.ndjson')
  let logNdjson: string | undefined
  if (fs.existsSync(logPath)) {
    logNdjson = fs.readFileSync(logPath, 'utf8').trim()
  } else {
    missing.push('log.ndjson')
  }

  const failurePath = path.join(loopDir, FAILURE_DOMAINS_FILENAME)
  let failureDomains: string | undefined
  if (fs.existsSync(failurePath)) {
    failureDomains = fs.readFileSync(failurePath, 'utf8').trim()
  } else {
    missing.push(FAILURE_DOMAINS_FILENAME)
  }

  return {
    loopDir,
    relPath,
    goal,
    review,
    logNdjson,
    failureDomains,
    diffStat,
    missing,
  }
}

const SECTION_HEADING = /^###\s+(.+)\s*$/

export function extractMarkdownSection(text: string, heading: string): string | null {
  const lines = text.split('\n')
  const target = heading.toLowerCase()
  let start = -1

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(SECTION_HEADING)
    if (match && match[1]!.trim().toLowerCase() === target) {
      start = i + 1
      break
    }
  }

  if (start < 0) return null

  const body: string[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!
    if (SECTION_HEADING.test(line)) break
    if (line.trim() === '---') break
    body.push(line)
  }

  return body.join('\n').trim()
}

export function extractHitlFollowUpBullets(text: string): string[] {
  const section = extractMarkdownSection(text, 'HITL follow-ups')
  if (!section) return []

  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean)
}

const TASK_ADD_LINE =
  /^task\s+add\s+project:([a-zA-Z0-9_.-]+)(?:\s+\+\S+)*\s+(?:--\s+)?(['"])(.+)\2\s*$/i

export function parseTaskAddDescription(line: string): { project: string; description: string } | undefined {
  const match = line.match(TASK_ADD_LINE)
  if (!match) return undefined
  return { project: match[1]!, description: match[3]!.trim() }
}

export function createHitlTasksFromFollowUps(
  bullets: string[],
  defaultProject: string,
): string[] {
  const uuids: string[] = []

  for (const bullet of bullets) {
    const parsed = parseTaskAddDescription(bullet)
    const project = parsed?.project ?? defaultProject
    const description =
      parsed?.description ??
      (bullet.replace(/^`task add[^`]*`\s*/, '').trim() || bullet)
    const uuid = createHitlCheckTask(description, project)
    if (uuid) uuids.push(uuid)
  }

  return uuids
}

export type MetaReviewOptions = {
  inputPaths: string[]
  ctx: RepoContext
  outDir?: string
  outputPath?: string
  hitl?: boolean
  taskwarriorProject?: string
  reviewModel?: CursorSdkModel
  verbose?: boolean
}

export type MetaReviewResult = {
  outPath: string
  text: string
  parsed: ReturnType<typeof parseReviewMarkdown>
  loops: CollectedLoopArtifacts[]
  hitlTaskUuids: string[]
}

export function resolveMetaReviewOutputPath(options: {
  outDir?: string
  outputPath?: string
}): string {
  if (options.outputPath) return path.resolve(options.outputPath)
  const outDir = path.resolve(options.outDir ?? process.cwd())
  return path.join(outDir, 'meta-review.md')
}

export async function runMetaReview(options: MetaReviewOptions): Promise<MetaReviewResult> {
  const { ctx, inputPaths } = options
  const loopDirs = discoverLoopBundles(inputPaths, ctx.repoRoot)

  if (loopDirs.length === 0) {
    throw new Error(
      'No loop bundles found — each path must be a bundle (GOAL.md + loop.json) or a parent directory containing bundles',
    )
  }

  const bundles = loopDirs.map((loopDir) => collectLoopArtifacts(loopDir, ctx))

  console.error(
    `[agent-loop-meta-review] included loops: ${bundles.map((b) => b.relPath).join(', ')}`,
  )
  for (const bundle of bundles) {
    if (bundle.missing.length === 0) continue
    console.error(
      `[agent-loop-meta-review] loop=${bundle.relPath} missing: ${bundle.missing.join(', ')}`,
    )
  }

  const prompt = buildMetaReviewPrompt(ctx, bundles)
  const reviewModel = options.reviewModel ?? CURSOR_REVIEW_MODEL
  console.error(`[agent-loop-meta-review] judge model=${reviewModel}`)

  const run = await runCursorAgentPrompt(ctx, prompt, {
    verbose: options.verbose,
    assistantOutput: 'none',
    modelId: reviewModel,
    role: 'review',
    phase: 'review',
  })

  const parsed = parseReviewMarkdown(run.text)
  const outPath = resolveMetaReviewOutputPath(options)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })

  const header = `# Cross-loop meta-review

_Model: ${reviewModel}_
_Generated ${new Date().toISOString()}_
_Loops (${bundles.length}): ${bundles.map((b) => b.relPath).join(', ')}_

`
  const text = `${header}${run.text.trim()}\n`
  fs.writeFileSync(outPath, text, 'utf8')
  console.error(`[agent-loop-meta-review] report written: ${path.relative(ctx.repoRoot, outPath)}`)

  let hitlTaskUuids: string[] = []
  if (options.hitl) {
    const project = resolveTaskwarriorProject(options.taskwarriorProject, ctx.profile)
    const bullets = extractHitlFollowUpBullets(run.text)
    if (bullets.length === 0) {
      console.error('[agent-loop-meta-review] --hitl: no ### HITL follow-ups bullets in judge output')
    } else {
      hitlTaskUuids = createHitlTasksFromFollowUps(bullets, project)
      console.error(
        `[agent-loop-meta-review] --hitl: created ${hitlTaskUuids.length}/${bullets.length} task(s) in project:${project}`,
      )
    }
  }

  return { outPath, text, parsed, loops: bundles, hitlTaskUuids }
}
