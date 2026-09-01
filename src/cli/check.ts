#!/usr/bin/env node
import { OPENCODE_PROVIDER_API_KEY_ENV } from '../agents/opencodeAuth.js'
import { assertOpencodeAgentSkillsReadable } from '../agents/opencodeSkillPreflight.js'
import { assertPosixShell } from '../agents/shellPreflight.js'

type Runtime = 'cursor' | 'cline' | 'opencode' | 'pi' | 'codex' | 'dsh' | 'muse'

function usage(): string {
  return `Usage: agent-check <cursor|cline|opencode|pi|codex|dsh|muse>

Verifies SDK install and API key env var. Does not call remote APIs.
Muse also spawns local \`muse serve\` for the SDK handshake, then closes it.`
}

const target = process.argv[2]?.trim()

if (!target || target === '--help' || target === '-h') {
  console.log(usage())
  process.exit(target ? 0 : 1)
}

if (
  target !== 'cursor' &&
  target !== 'cline' &&
  target !== 'opencode' &&
  target !== 'pi' &&
  target !== 'codex' &&
  target !== 'dsh' &&
  target !== 'muse'
) {
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

    const presentKeys = Object.entries(OPENCODE_PROVIDER_API_KEY_ENV).flatMap(([, envName]) => {
      const key = process.env[envName]?.trim()
      return key ? [{ envName, key }] : []
    })
    if (presentKeys.length === 0) {
      const envList = [...new Set(Object.values(OPENCODE_PROVIDER_API_KEY_ENV))].join(' / ')
      console.error(
        `[agent-check] Set ${envList} (Go / OpenRouter / Vercel AI Gateway), ` +
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
    try {
      assertOpencodeAgentSkillsReadable()
    } catch (err) {
      console.error('[agent-check]', err instanceof Error ? err.message : err)
      process.exit(1)
    }

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
    for (const { envName, key } of presentKeys) {
      console.log(`[agent-check] ${envName} present (prefix):`, `${key.slice(0, 4)}…`)
    }
    console.log('[agent-check] shell preflight OK')
    console.log('[agent-check] ~/.agents/skills SKILL.md links OK')
    return
  }

  if (runtime === 'pi') {
    const nodeMajor = Number(process.versions.node.split('.')[0] ?? 0)
    if (nodeMajor < 22) {
      console.error(
        `[agent-check] Node.js 22+ required for @earendil-works/pi-coding-agent (current: ${process.versions.node})`,
      )
      process.exit(1)
    }

    const piAuthEnv = [
      'OPENROUTER_API_KEY',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_API_KEY',
    ] as const
    const present = piAuthEnv.filter((name) => Boolean(process.env[name]?.trim()))
    if (present.length === 0) {
      console.error(
        '[agent-check] Set at least one provider API key (e.g. OPENROUTER_API_KEY) or run `pi` /connect — https://pi.dev/docs',
      )
      process.exit(1)
    }

    let createAgentSession: unknown
    try {
      ;({ createAgentSession } = await import('@earendil-works/pi-coding-agent'))
    } catch {
      console.error(
        '[agent-check] @earendil-works/pi-coding-agent is not installed (pnpm add -D @earendil-works/pi-coding-agent)',
      )
      process.exit(1)
    }

    await assertPosixShell()
    console.log('[agent-check] @earendil-works/pi-coding-agent OK — createAgentSession:', typeof createAgentSession)
    console.log('[agent-check] provider keys present:', present.join(', '))
    console.log('[agent-check] shell preflight OK')
    return
  }

  if (runtime === 'codex') {
    const nodeMajor = Number(process.versions.node.split('.')[0] ?? 0)
    if (nodeMajor < 18) {
      console.error(
        `[agent-check] Node.js 18+ required for @openai/codex-sdk (current: ${process.versions.node})`,
      )
      process.exit(1)
    }

    let Codex: unknown
    try {
      ;({ Codex } = await import('@openai/codex-sdk'))
    } catch {
      console.error('[agent-check] @openai/codex-sdk is not installed (pnpm add -D @openai/codex-sdk)')
      process.exit(1)
    }

    await assertPosixShell()

    const { spawnSync } = await import('node:child_process')
    const which = spawnSync('codex', ['--version'], { encoding: 'utf8' })
    if (which.error || which.status !== 0) {
      console.error(
        '[agent-check] `codex` CLI not on PATH. Installing @openai/codex-sdk should pull @openai/codex;\n' +
          '  ensure its bin is linked (pnpm add -D @openai/codex-sdk).',
      )
      process.exit(1)
    }

    const codexKey = process.env.CODEX_API_KEY?.trim()
    const openAiKey = process.env.OPENAI_API_KEY?.trim()
    if (codexKey) {
      console.log('[agent-check] CODEX_API_KEY present (prefix):', `${codexKey.slice(0, 4)}…`)
    } else if (openAiKey) {
      console.log('[agent-check] OPENAI_API_KEY present (prefix):', `${openAiKey.slice(0, 4)}…`)
    } else {
      console.log(
        '[agent-check] no CODEX_API_KEY/OPENAI_API_KEY — will rely on Codex CLI ChatGPT login (~/.codex)',
      )
    }

    console.log('[agent-check] @openai/codex-sdk OK — Codex:', typeof Codex)
    console.log('[agent-check] codex CLI:', (which.stdout || which.stderr).trim().split('\n')[0])
    console.log('[agent-check] shell preflight OK')
    return
  }

  if (runtime === 'dsh') {
    const { nodeMeetsDshMinimum, DSH_MIN_NODE_MAJOR, DSH_MIN_NODE_MINOR } = await import(
      '../agents/dshAgent.js'
    )
    if (!nodeMeetsDshMinimum()) {
      console.error(
        `[agent-check] Node.js ${DSH_MIN_NODE_MAJOR}.${DSH_MIN_NODE_MINOR}+ required for DSH headless (current: ${process.versions.node})`,
      )
      process.exit(1)
    }

    await assertPosixShell()
    const { spawnSync } = await import('node:child_process')
    const which = spawnSync('dsh', ['--version'], { encoding: 'utf8' })
    if (which.error || which.status !== 0) {
      console.error(
        '[agent-check] `dsh` CLI not on PATH. Install DeepSeek Harness (`npx @deepseek-ai/dsh`). ' +
          'The Agent Looper package does not depend on `@deepseek-ai/dsh`.',
      )
      process.exit(1)
    }

    const key = process.env.DEEPSEEK_API_KEY?.trim()
    if (key) {
      console.log('[agent-check] DEEPSEEK_API_KEY present (prefix):', `${key.slice(0, 4)}…`)
    } else {
      console.log(
        '[agent-check] no DEEPSEEK_API_KEY — will rely on DSH credentials (`dsh` settings / credentials-local)',
      )
    }

    console.log('[agent-check] dsh CLI:', (which.stdout || which.stderr).trim().split('\n')[0])
    console.log('[agent-check] shell preflight OK')
    return
  }

  if (runtime === 'muse') {
    const nodeMajor = Number(process.versions.node.split('.')[0] ?? 0)
    if (nodeMajor < 20) {
      console.error(
        `[agent-check] Node.js 20+ required for @muse-code/sdk (current: ${process.versions.node})`,
      )
      process.exit(1)
    }

    let MuseClient: unknown
    try {
      ;({ MuseClient } = await import('@muse-code/sdk'))
    } catch {
      console.error('[agent-check] @muse-code/sdk is not installed (pnpm add -D @muse-code/sdk)')
      process.exit(1)
    }

    await assertPosixShell()

    const { spawnSync } = await import('node:child_process')
    const which = spawnSync('muse', ['--version'], { encoding: 'utf8' })
    if (which.error || which.status !== 0) {
      console.error(
        '[agent-check] `muse` CLI not on PATH. Install Muse Code (https://dev.meta.ai/docs/muse-code).',
      )
      process.exit(1)
    }

    const metaKey = process.env.META_API_KEY?.trim()
    if (metaKey) {
      console.log('[agent-check] META_API_KEY present (prefix):', `${metaKey.slice(0, 4)}…`)
    } else {
      console.log(
        '[agent-check] no META_API_KEY — will rely on Muse Code CLI login (`muse` / ~/.muse)',
      )
    }

    console.log('[agent-check] @muse-code/sdk OK — MuseClient:', typeof MuseClient)
    console.log('[agent-check] muse CLI:', (which.stdout || which.stderr).trim().split('\n')[0])

    const { probeMuseServeHandshake } = await import('../agents/museAgent.js')
    const { fingerprint } = await probeMuseServeHandshake(process.cwd())
    if (fingerprint) {
      console.log('[agent-check] muse serve handshake schema=', fingerprint)
    } else {
      console.log('[agent-check] muse serve handshake OK')
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
