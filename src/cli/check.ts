#!/usr/bin/env node
import { Agent } from '@cursor/sdk'
import { ClineCore } from '@cline/sdk'
import { assertPosixShell } from '../agents/shellPreflight.js'

type Runtime = 'cursor' | 'cline'

function usage(): string {
  return `Usage: agent-check <cursor|cline>

Verifies SDK install and API key env var. Does not call remote APIs.`
}

const target = process.argv[2]?.trim()

if (!target || target === '--help' || target === '-h') {
  console.log(usage())
  process.exit(target ? 0 : 1)
}

if (target !== 'cursor' && target !== 'cline') {
  console.error(usage())
  process.exit(1)
}

await checkRuntime(target)

async function checkRuntime(runtime: Runtime): Promise<void> {
  if (runtime === 'cursor') {
    const key = process.env.CURSOR_API_KEY?.trim()
    if (!key) {
      console.error('[agent-check] CURSOR_API_KEY is not set')
      process.exit(1)
    }
    console.log('[agent-check] @cursor/sdk OK — Agent.create:', typeof Agent.create)
    console.log('[agent-check] CURSOR_API_KEY present (prefix):', `${key.slice(0, 4)}…`)
    return
  }

  const nodeMajor = Number(process.versions.node.split('.')[0] ?? 0)
  if (nodeMajor < 22) {
    console.error(`[agent-check] Node.js 22+ required for @cline/sdk (current: ${process.versions.node})`)
    process.exit(1)
  }

  const key = process.env.CLINE_API_KEY?.trim()
  if (!key) {
    console.error('[agent-check] CLINE_API_KEY is not set')
    process.exit(1)
  }

  await assertPosixShell()
  console.log('[agent-check] @cline/sdk OK — ClineCore.create:', typeof ClineCore.create)
  console.log('[agent-check] CLINE_API_KEY present (prefix):', `${key.slice(0, 4)}…`)
  console.log('[agent-check] shell preflight OK')
}
