#!/usr/bin/env node
import { assertPosixShell } from '../agents/shellPreflight.js'

type Runtime = 'cursor' | 'cline' | 'opencode'

function usage(): string {
  return `Usage: agent-check <cursor|cline|opencode>

Verifies SDK install and API key env var. Does not call remote APIs.`
}

const target = process.argv[2]?.trim()

if (!target || target === '--help' || target === '-h') {
  console.log(usage())
  process.exit(target ? 0 : 1)
}

if (target !== 'cursor' && target !== 'cline' && target !== 'opencode') {
  console.error(usage())
  process.exit(1)
}

await checkRuntime(target)

async function checkRuntime(runtime: Runtime): Promise<void> {
  if (runtime === 'cursor') {
    const { Agent } = await import('@cursor/sdk')
    const key = process.env.CURSOR_API_KEY?.trim()
    if (!key) {
      console.error('[agent-check] CURSOR_API_KEY is not set')
      process.exit(1)
    }
    console.log('[agent-check] @cursor/sdk OK — Agent.create:', typeof Agent.create)
    console.log('[agent-check] CURSOR_API_KEY present (prefix):', `${key.slice(0, 4)}…`)
    return
  }

  if (runtime === 'opencode') {
    const nodeMajor = Number(process.versions.node.split('.')[0] ?? 0)
    if (nodeMajor < 22) {
      console.error(
        `[agent-check] Node.js 22+ required for @opencode-ai/sdk (current: ${process.versions.node})`,
      )
      process.exit(1)
    }

    const goKey = process.env.OPENCODE_API_KEY?.trim()
    const openRouterKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!goKey && !openRouterKey) {
      console.error(
        '[agent-check] Set OPENCODE_API_KEY (Go) and/or OPENROUTER_API_KEY (BYOK), ' +
          'or use local Ollama via opencode /connect — https://opencode.ai/docs/providers/',
      )
      process.exit(1)
    }

    let createOpencode: unknown
    try {
      ;({ createOpencode } = await import('@opencode-ai/sdk'))
    } catch {
      console.error('[agent-check] @opencode-ai/sdk is not installed (pnpm add -D @opencode-ai/sdk)')
      process.exit(1)
    }

    await assertPosixShell()

    const { spawnSync } = await import('node:child_process')
    const which = spawnSync('opencode', ['--version'], { encoding: 'utf8' })
    if (which.error || which.status !== 0) {
      console.error(
        '[agent-check] `opencode` CLI not on PATH. Install with: pnpm add -D opencode-ai\n' +
          '  If pnpm skipped scripts: node node_modules/opencode-ai/postinstall.mjs',
      )
      process.exit(1)
    }

    console.log('[agent-check] @opencode-ai/sdk OK — createOpencode:', typeof createOpencode)
    console.log('[agent-check] opencode CLI:', (which.stdout || which.stderr).trim().split('\n')[0])
    if (goKey) {
      console.log('[agent-check] OPENCODE_API_KEY present (prefix):', `${goKey.slice(0, 4)}…`)
    }
    if (openRouterKey) {
      console.log('[agent-check] OPENROUTER_API_KEY present (prefix):', `${openRouterKey.slice(0, 4)}…`)
    }
    console.log('[agent-check] shell preflight OK')
    return
  }

  const { ClineCore } = await import('@cline/sdk')
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
