import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'

describe('buildLoopSystemPrompt', () => {
  it('references agents file and skills glob when AGENTS.md exists', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-prompt-'))
    fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), '# Agents\n')
    const ctx = {
      repoRoot,
      profile: repoProfileSchema.parse({ agentsFile: 'AGENTS.md', skillsGlob: 'skills/*/SKILL.md' }),
    }

    const prompt = buildLoopSystemPrompt(ctx)
    expect(prompt).toContain(repoRoot)
    expect(prompt).toContain('Follow AGENTS.md')
    expect(prompt).toContain('skills/*/SKILL.md')
    expect(prompt).toContain('Do not edit GOAL.md')
  })

  it('falls back when agents file is missing', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-prompt-'))
    const ctx = { repoRoot, profile: repoProfileSchema.parse({}) }

    const prompt = buildLoopSystemPrompt(ctx)
    expect(prompt).toContain('Follow existing repo conventions')
    expect(prompt).not.toContain('Follow AGENTS.md')
  })
})
