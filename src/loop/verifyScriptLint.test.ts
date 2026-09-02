import { describe, expect, it } from 'vitest'
import {
  lintVerifyScript,
  splitGrepAlternatives,
} from './verifyScriptLint.js'

const MUSEUM2_HOLES = `#!/usr/bin/env bash
set -euo pipefail
TITLES='Compact Disc Player|Beige Desktop|Candybar Phone|VHS Video Recorder|Handheld LCD Game'
grep -qE "$TITLES" src/index.html || { echo "index.html missing a frozen title"; exit 1; }
while IFS= read -r cap; do
  text="\${cap#caption: \\"}"
  if [ "\${#text}" -lt 80 ]; then echo too short; exit 1; fi
done < <(grep -oE 'caption: "[^"]+"' src/catalog.ts)
n="$(grep -c 'it(' "$tf")"
test "$n" -ge 2 || exit 1
echo OK
`

describe('splitGrepAlternatives', () => {
  it('splits on | outside character classes', () => {
    expect(splitGrepAlternatives('click|pointerdown')).toEqual(['click', 'pointerdown'])
    expect(splitGrepAlternatives('a[b|c]d|e')).toEqual(['a[b|c]d', 'e'])
  })
})

describe('lintVerifyScript', () => {
  it('allows two-way event ORs and per-id loops', () => {
    const source = `
grep -qE 'addEventListener\\("?(click|pointerdown)' src/main.ts
for id in cd-player crt-pc; do
  grep -q "id: \\"$id\\"" src/catalog.ts || exit 1
done
`
    const result = lintVerifyScript(source)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('errors on museum2 title-OR and caption extractor', () => {
    const result = lintVerifyScript(MUSEUM2_HOLES)
    expect(result.ok).toBe(false)
    expect(result.errors.some((line) => /A\|B\|C/.test(line))).toBe(true)
    expect(result.errors.some((line) => /caption|wrapped/i.test(line))).toBe(true)
    expect(result.warnings.some((line) => /it\(/.test(line))).toBe(true)
  })

  it('errors on inline title OR without a variable', () => {
    const result = lintVerifyScript(
      `grep -qE 'Compact Disc Player|Candybar Phone|Handheld LCD Game' src/index.html\n`,
    )
    expect(result.ok).toBe(false)
  })

  it('passes a honest loop-over-titles reducer', () => {
    const result = lintVerifyScript(`
for title in "Compact Disc Player" "Candybar Phone"; do
  grep -q "$title" src/index.html || exit 1
done
`)
    expect(result.ok).toBe(true)
  })
})
