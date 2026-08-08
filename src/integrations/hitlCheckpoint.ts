import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import { resolveTaskwarriorProject } from '../context/repoContext.js'
import {
  HITL_PROVIDER_COMMAND,
  HITL_PROVIDER_FILE,
  HITL_PROVIDER_GITHUB,
  HITL_PROVIDER_LINEAR,
  HITL_PROVIDER_TASKWARRIOR,
  type HitlCheckpointReason,
  type HitlLoopOverrides,
  resolveHitlConfig,
} from './hitlConfig.js'
import { createHitlCheckTask, formatHitlCheckTaskDescription } from './taskwarrior.js'

export const LINEAR_API_KEY_ENV = 'LINEAR_API_KEY'
export const LINEAR_API_KEY_FALLBACK_ENV = 'AGENT_LOOP_LINEAR_API_KEY'

export type CreateHitlCheckpointInput = {
  description: string
  reason: HitlCheckpointReason
  ctx: RepoContext
  loopDir?: string
  loopOverrides?: HitlLoopOverrides
}

export function hitlLoopOverridesFrom(config: HitlLoopOverrides): HitlLoopOverrides {
  return {
    hitlProvider: config.hitlProvider,
    hitlFileDir: config.hitlFileDir,
    hitlCommand: config.hitlCommand,
    hitlLinearTeam: config.hitlLinearTeam,
    taskwarriorProject: config.taskwarriorProject,
  }
}

export function buildHitlTitle(description: string): string {
  return formatHitlCheckTaskDescription(description)
}

export function buildHitlBody(input: {
  description: string
  reason: HitlCheckpointReason
  loopDir?: string
  projectLabel?: string
}): string {
  const lines = [
    input.description,
    '',
    `Reason: ${input.reason}`,
    ...(input.loopDir ? [`Loop: ${input.loopDir}`] : []),
    ...(input.projectLabel ? [`Project: ${input.projectLabel}`] : []),
  ]
  return lines.join('\n')
}

function slugifyDescription(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'hitl'
}

function lastNonEmptyStdoutLine(output: string): string | undefined {
  const lines = output
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.length > 0 ? lines[lines.length - 1] : undefined
}

function resolveLinearApiKey(): string | undefined {
  return (
    process.env[LINEAR_API_KEY_ENV]?.trim() ||
    process.env[LINEAR_API_KEY_FALLBACK_ENV]?.trim() ||
    undefined
  )
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function linearGraphql(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Linear API HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  return json.data
}

async function resolveLinearTeamId(apiKey: string, teamKeyOrId: string): Promise<string> {
  if (UUID_RE.test(teamKeyOrId)) {
    return teamKeyOrId
  }
  const data = (await linearGraphql(
    apiKey,
    `query($key: String!) { teams(filter: { key: { eq: $key } }, first: 1) { nodes { id } } }`,
    { key: teamKeyOrId },
  )) as { teams?: { nodes?: Array<{ id: string }> } }
  const id = data.teams?.nodes?.[0]?.id
  if (!id) {
    throw new Error(`Linear team not found for key "${teamKeyOrId}"`)
  }
  return id
}

async function createLinearHitlCheckpoint(input: {
  title: string
  body: string
  teamKeyOrId: string
}): Promise<string | undefined> {
  const apiKey = resolveLinearApiKey()
  if (!apiKey) {
    console.error(
      `[agent-loop] warn: Linear HITL skipped — set ${LINEAR_API_KEY_ENV} or ${LINEAR_API_KEY_FALLBACK_ENV}`,
    )
    return undefined
  }
  try {
    const teamId = await resolveLinearTeamId(apiKey, input.teamKeyOrId)
    const data = (await linearGraphql(
      apiKey,
      `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id url identifier }
        }
      }`,
      {
        input: {
          teamId,
          title: input.title,
          description: input.body,
        },
      },
    )) as {
      issueCreate?: { success?: boolean; issue?: { id: string; url?: string; identifier?: string } }
    }
    const issue = data.issueCreate?.issue
    if (!issue) {
      throw new Error('Linear issueCreate returned no issue')
    }
    const label = issue.url ?? issue.identifier ?? issue.id
    console.error(`[agent-loop] created Linear HITL issue: ${label}`)
    return issue.url ?? issue.id
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: could not create Linear HITL issue: ${message}`)
    return undefined
  }
}

function createFileHitlCheckpoint(input: {
  repoRoot: string
  hitlFileDir: string
  title: string
  body: string
  description: string
}): string | undefined {
  try {
    const repoRootResolved = path.resolve(input.repoRoot)
    const dir = path.resolve(repoRootResolved, input.hitlFileDir)
    const relToRoot = path.relative(repoRootResolved, dir)
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      console.error(
        `[agent-loop] warn: hitlFileDir escapes repo root (${input.hitlFileDir}) — skipping file HITL`,
      )
      return undefined
    }
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${slugifyDescription(input.description)}-${stamp}.md`
    const absPath = path.join(dir, filename)
    const content = `# ${input.title}\n\n${input.body}\n`
    fs.writeFileSync(absPath, content, 'utf8')
    const rel = path.relative(input.repoRoot, absPath)
    const id = rel.startsWith('..') ? absPath : rel
    console.error(`[agent-loop] created file HITL checkpoint: ${id}`)
    return id
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: could not create file HITL checkpoint: ${message}`)
    return undefined
  }
}

function createGithubHitlCheckpoint(
  repoRoot: string,
  title: string,
  body: string,
): string | undefined {
  try {
    const output = execFileSync('gh', ['issue', 'create', '--title', title, '--body', body], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const id = lastNonEmptyStdoutLine(output)
    if (id) {
      console.error(`[agent-loop] created GitHub HITL issue: ${id}`)
      return id
    }
    console.error('[agent-loop] created GitHub HITL issue (no URL in stdout)')
    return undefined
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: could not create GitHub HITL issue: ${message}`)
    return undefined
  }
}

function createCommandHitlCheckpoint(input: {
  repoRoot: string
  command: string
  env: NodeJS.ProcessEnv
}): string | undefined {
  try {
    const output = execFileSync(input.command, {
      cwd: input.repoRoot,
      shell: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: input.env,
      maxBuffer: 1024 * 1024,
    })
    const id = lastNonEmptyStdoutLine(output)
    if (id) {
      console.error(`[agent-loop] created HITL checkpoint via command: ${id}`)
      return id
    }
    console.error('[agent-loop] created HITL checkpoint via command (no stdout id)')
    return undefined
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: HITL command failed: ${message}`)
    return undefined
  }
}

/**
 * Create a human-validation checkpoint (provider from repo profile / loop overrides).
 * Non-blocking on failure — returns opaque id/url when known.
 */
export async function createHitlCheckpoint(
  input: CreateHitlCheckpointInput,
): Promise<string | undefined> {
  const { ctx, description, reason, loopDir, loopOverrides } = input
  const resolved = resolveHitlConfig(loopOverrides, ctx.profile)
  const title = buildHitlTitle(description)

  let projectLabel: string | undefined
  if (resolved.provider === HITL_PROVIDER_TASKWARRIOR) {
    try {
      projectLabel = resolveTaskwarriorProject(loopOverrides?.taskwarriorProject, ctx.profile)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[agent-loop] warn: could not create HITL checkpoint: ${message}`)
      return undefined
    }
  } else {
    projectLabel = loopOverrides?.taskwarriorProject ?? ctx.profile.taskwarriorProject
  }

  const body = buildHitlBody({ description, reason, loopDir, projectLabel })

  switch (resolved.provider) {
    case HITL_PROVIDER_TASKWARRIOR:
      return createHitlCheckTask(description, projectLabel!)
    case HITL_PROVIDER_FILE:
      return createFileHitlCheckpoint({
        repoRoot: ctx.repoRoot,
        hitlFileDir: resolved.hitlFileDir,
        title,
        body,
        description,
      })
    case HITL_PROVIDER_GITHUB:
      return createGithubHitlCheckpoint(ctx.repoRoot, title, body)
    case HITL_PROVIDER_LINEAR: {
      if (!resolved.hitlLinearTeam) {
        console.error(
          '[agent-loop] warn: hitlProvider=linear requires hitlLinearTeam in repo profile or loop.json',
        )
        return undefined
      }
      return createLinearHitlCheckpoint({
        title,
        body,
        teamKeyOrId: resolved.hitlLinearTeam,
      })
    }
    case HITL_PROVIDER_COMMAND: {
      if (!resolved.hitlCommand) {
        console.error(
          '[agent-loop] warn: hitlProvider=command requires hitlCommand in repo profile or loop.json',
        )
        return undefined
      }
      return createCommandHitlCheckpoint({
        repoRoot: ctx.repoRoot,
        command: resolved.hitlCommand,
        env: {
          ...process.env,
          HITL_TITLE: title,
          HITL_BODY: body,
          HITL_LOOP_DIR: loopDir ?? '',
          HITL_PROJECT: projectLabel ?? '',
          HITL_REASON: reason,
        },
      })
    }
    default: {
      const _exhaustive: never = resolved.provider
      void _exhaustive
      return undefined
    }
  }
}
