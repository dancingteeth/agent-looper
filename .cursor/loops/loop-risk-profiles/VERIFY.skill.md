# Verify — loop-risk-profiles

Measurable checks for configurable loopRisk profiles (TW `de4144f2-…`).

1. `pnpm exec tsc --noEmit`
2. `pnpm exec vitest run src/loop/loopRisk*.test.ts src/review/reviewPrompt.test.ts`
3. `pnpm exec vitest run` (full suite)
4. `agent-loop-review-preview` prints `Risk:` for example-fix loop

On any failure: fix → rerun verify.sh. No partial handoff.
