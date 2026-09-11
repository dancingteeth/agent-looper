import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readRepoJson<T>(relative: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')) as T
}

const pkg = readRepoJson<{ bin: Record<string, string> }>('../../package.json')

describe('package.json bin', () => {
  // npm 11.19 reports `./`-prefixed bin targets as "invalid and removed" on publish; bare paths pass clean.
  it('uses bare relative targets that npm publishes unchanged', () => {
    for (const [name, target] of Object.entries(pkg.bin)) {
      expect(target, name).toMatch(/^dist\/cli\/[a-z-]+\.js$/)
    }
  })
})
