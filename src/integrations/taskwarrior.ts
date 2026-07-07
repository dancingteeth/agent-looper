import { execFileSync } from 'node:child_process'
import { z } from 'zod'

/** Stable Taskwarrior key — numeric IDs are recycled; always use UUID in loop.json. */
export const taskwarriorUuidSchema = z.string().uuid()

/** Taskwarrior `project:` tag — no spaces (matches `task add project:foo` syntax). */
export const taskwarriorProjectSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'taskwarriorProject must not contain spaces')

/** Short label for manual validation after one loop or a batch of related loops. */
export const hitlCheckDescriptionSchema = z.string().trim().min(1).max(500)

export const HITL_CHECK_TASK_PREFIX = 'HITL Check: '

export function formatHitlCheckTaskDescription(description: string): string {
  return `${HITL_CHECK_TASK_PREFIX}${hitlCheckDescriptionSchema.parse(description)}`
}

export function buildHitlCheckTaskArgs(
  description: string,
  taskwarriorProject: string,
): [string, ...string[]] {
  const text = formatHitlCheckTaskDescription(description)
  return ['add', `project:${taskwarriorProject}`, '+hitl', '+manual', text]
}

function escapeTaskDescriptionFilter(text: string): string {
  return `/${text.replace(/[\\/]/g, '\\$&')}/`
}

function lookupHitlTaskUuid(description: string, taskwarriorProject: string): string | undefined {
  const text = formatHitlCheckTaskDescription(description)
  try {
    const uuid = execFileSync(
      'task',
      [
        `project:${taskwarriorProject}`,
        '+hitl',
        '+manual',
        'status:pending',
        escapeTaskDescriptionFilter(text),
        '_uuid',
        'limit:1',
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    ).trim()
    return uuid || undefined
  } catch {
    return undefined
  }
}

/** Create a human-validation checkpoint in Taskwarrior. Non-blocking on failure. */
export function createHitlCheckTask(description: string, taskwarriorProject: string): string | undefined {
  const text = formatHitlCheckTaskDescription(description)
  try {
    execFileSync('task', buildHitlCheckTaskArgs(description, taskwarriorProject), {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    const uuid = lookupHitlTaskUuid(description, taskwarriorProject)
    if (uuid) {
      console.error(`[agent-loop] created HITL check task uuid:${uuid}: ${text}`)
      return uuid
    }
    console.error(`[agent-loop] created HITL check task: ${text}`)
    return undefined
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: could not create HITL check task: ${message}`)
    return undefined
  }
}

export function markTaskwarriorDoneByUuid(uuid: string): void {
  const parsed = taskwarriorUuidSchema.parse(uuid)
  try {
    execFileSync('task', [`uuid:${parsed}`, 'done'], { encoding: 'utf8', stdio: 'pipe' })
    console.error(`[agent-loop] task uuid:${parsed} done`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: could not mark task uuid:${parsed} done: ${message}`)
  }
}

/** Run repo-profile syncCommand after success. Non-blocking on failure. */
export function runTaskwarriorSync(syncCommand: string, repoRoot: string): void {
  try {
    console.error(`[agent-loop] syncing Taskwarrior (${syncCommand})`)
    const output = execFileSync(syncCommand, {
      cwd: repoRoot,
      shell: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    })
    const line = output.trim().split('\n').pop()
    if (line) console.error(`[agent-loop] ${line}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: sync failed (non-blocking): ${message}`)
  }
}
