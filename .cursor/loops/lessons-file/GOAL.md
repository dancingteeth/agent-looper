# lessons-file — keep proven facts from green runs for the next run

Loop `.cursor/loops/lessons-file` on branch `feat/harness2-ideas`, base `c4e7195` (0.8.2 + site).
Idea from Harness² (google-research/harness2, arXiv 2610.14224): an improvement record that
survives tasks. Agent Looper already has the deterministic check Harness² lacks, so a fact is
"proven" only when the run it came from went **green**.

## Goal

After a run whose verifier goes green, the harness writes `.cursor/loops/<name>/lessons.md`
with the loop's verify command and the "gotchas" that run overcame (the first non-empty output
line of each verifier failure before green, deduped, newest kept, size-capped). The next run of
the same loop reads it and puts it in every worker prompt, in the stable prompt head (before
`## Workspace (git)`) so the provider prefix cache keeps working. Failed or parked runs never
write it. Workers can't edit it: `lessons.md` joins `FROZEN_LOOP_BASENAMES`. A `lessons`
boolean in `loop.json` turns read and write on or off together. It defaults to `false`
(opt-in: set `"lessons": true`), per Paul in chat 2026-10-21 19:15 (review of #47); it was
originally specified as default `true`.

Canonical paths: new `src/loop/loopLessons.ts` (+ `src/loop/loopLessons.test.ts`),
`src/loop/loopPrompt.ts` (`LoopPromptInput.lessons?: string`), `src/loop/agentLoop.ts`
(read before iteration 1, write on the `complete: true` path only), `src/loop/loopConfig.ts`
(`lessons: z.boolean().default(false)` — opt-in, per Paul in chat 2026-10-21 19:15), `src/loop/loopFrozenFiles.ts`, `README.md`
(bundle layout + config table), `CHANGELOG.md` (Unreleased).

Code fact that shaped this goal: `failure-context.md` is **not** deleted after every run. It is
the meta-loop's probe→fix handoff, cleared only at the start of each meta cycle
(`loopMeta.ts` → `clearFailureContext`). Leave that mechanism alone; lessons are a new,
separate file.

## Required API (the frozen acceptance spec imports exactly this)

```ts
// src/loop/loopLessons.ts
export const LESSONS_FILENAME = 'lessons.md'
export const LESSONS_MAX_CHARS: number          // hard cap on file length; pick ~4000–8000
export function lessonsPath(loopDir: string): string
export function readLessons(loopDir: string): string | undefined   // undefined if absent/blank
export function recordGreenRunLessons(
  loopDir: string,
  run: { verifyCommand: string; iterations: number; failuresOvercome: VerifyResult[] },
): void   // merge + dedupe + cap; verify command appears once; newest gotchas win
export function buildLessonsPromptSection(lessons: string): string // heading: "## Lessons from earlier green runs"
```

`agentLoop.ts` passes `config.verify` as `verifyCommand` (not the mocked result's `command`)
and the run's verifier failures as `failuresOvercome`. Deterministic text only, no LLM call.

## Finish line (four parts)

- **Outcome:** green runs leave a bounded, deduped `lessons.md`; the next run's worker prompts
  include it; failed runs and `lessons: false` leave it untouched; workers can't plant it.
- **Scoreboard:** `bash .cursor/loops/lessons-file/verify.sh`. Exit `0` is the only success.
- **Permission:** `maxIterations: 8`, `stagnationThreshold: 3`.
- **Budget:** small feature. Stop once verify is green. Don't add lesson ranking, LLM
  summaries, repo-wide lesson sharing, or a CLI command.

## Wiring (name before freeze)

- **EDGE DATA:** `VerifyResult[]` from the run (`priorFailures`), `config.verify`, the loop dir.
- **REDUCER:** `verify.sh`: pinned sha256 of `acceptance.ts.txt`, typecheck with the spec copied
  into `src/loop/__acceptance__/`, the spec + targeted vitest files, `pnpm test:coverage`
  (thresholds 81/69/87/80, functions currently 87.14%, so new code needs tests), unchanged
  `vitest.config.ts`, wiring greps, untouched meta-loop files, no Gemini/Gemma added.
- **FAILURE POLICY:** a failing acceptance case is the next task. Never edit
  `acceptance.ts.txt`, `verify.sh`, `GOAL.md` or `loop.json`; never lower coverage thresholds or
  add coverage excludes.
- **HUMAN GATE:** OpenCode judge (`reviewGate: true`); Paul reviews the branch. No push, no PR.

## Acceptance criteria (verifier-owned)

1. `.cursor/loops/lessons-file/acceptance.ts.txt` sha256 matches the pin in `verify.sh`.
2. `src/loop/loopLessons.ts` and your own `src/loop/loopLessons.test.ts` exist.
3. `pnpm typecheck` passes with the spec copied in (the API above compiles).
4. The spec passes: file name and frozen membership; blank/absent → `undefined`; verify command +
   first failure line recorded; idempotent; ≤ `LESSONS_MAX_CHARS` after 50 runs with newest kept;
   prompt section sits before `## Workspace (git)` and is absent without lessons;
   `runAgentLoop` writes after green, not after failure, keeps prior lessons on failure, feeds
   them into every prompt, honours `lessons: false`, and fails a visit that plants `lessons.md`.
5. Targeted suites pass: `loopLessons`, `loopPrompt` (incl. the stable-head test), `agentLoop`,
   `loopFrozenFiles`, `loopMeta`, `loopFailureContext`.
6. `pnpm test:coverage` passes (whole suite + thresholds).
7. `vitest.config.ts`, `src/loop/loopFailureContext.ts`, `src/loop/loopMeta.ts` unchanged vs `c4e7195`.
8. `agentLoop.ts` imports `loopLessons.js` and calls `recordGreenRunLessons`; `loopConfig.ts`
   has a `lessons:` option; `README.md` documents lessons; `CHANGELOG.md` mentions `lessons.md`.

## Constraints

- Only `src/loop/**` (+ their tests), `src/index.ts` (optional re-exports), `README.md`,
  `CHANGELOG.md`, `docs/**` may change. Don't touch `site/`, `plugins/`, `vitest.config.ts`.
- No new dependencies. Don't bump the version or publish.
- Don't add `lessons.md` to `.gitignore`; it is meant to be committable.
- No Gemini or Gemma anywhere (defaults, fallbacks, examples).

## Out of scope

- Repo-level lessons shared between loops; LLM-written lessons; stall probes and prompt rules
  (separate loops `stall-probes` and `prompt-rules`).
- Release, push, PR.
