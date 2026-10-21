# stall-probes — two different workers when a run stalls, keep whichever goes green

Loop `.cursor/loops/stall-probes` on branch `feat/harness2-ideas`, base `c4e7195`.
Run **after** `lessons-file` and `prompt-rules` (same branch). Idea from Harness²
(google-research/harness2, arXiv 2610.14224): contrastive probes. Agent Looper has the
deterministic check Harness² lacks, so "keep the edit that helped" becomes "keep whatever goes
green, else whatever moved the failure".

## Goal

Today a stall only escalates the model (`loopAgentEscalation.ts`) once
`resolveStagnationPolicy` reports `escalationRepeatCount`. Add an opt-in `stallProbes` key
(default `false`). When it is on and the run stalls (repeat count ≥ `escalateAfterStagnation`,
and `stagnationThreshold > 0`), the next iteration is a **probe round** instead of a model
switch, at most once per run:

1. `s0 = port.snapshot()`.
2. Probe A: worker gets the normal prompt + `## Stall probe: procedure hints` (a short
   step-by-step: run the verifier command, read the first failure, smallest fix, re-run). Restore
   frozen files, run verify. If green → keep it, skip B.
3. Otherwise `sA = port.snapshot()`, `port.restore(s0)`, probe B: normal prompt +
   `## Stall probe: repo facts` (verifier command, first non-empty failing line of the last
   verify, the git diff stat). Restore frozen files, run verify.
4. Winner = `pickStallProbeWinner(stalled, outcomes)`: first green; else first whose
   `failureFingerprint` differs from the stalled one; else none. If A wins after B ran →
   `port.restore(sA)`. If none → `port.restore(s0)`. B winning needs no restore.
5. One iteration-log line per probe with `probe: { variant, kept }` (exactly those two keys).
   `lastVerify` becomes the kept probe's verify (or B's when none). A green kept probe goes
   through the normal post-verify path (judge, lessons, sync), not a shortcut.
6. After a probe round, `resolveStagnationPolicy(config, n, true)` returns the old behaviour
   (model escalation), so probes never repeat in a run. `GOAL.md` / `verify.sh` stay frozen
   throughout (existing frozen-file restore after each probe).

Sequential, not parallel: one workspace, restored between probes. The default port is
`createGitWorkspacePort(repoRoot)`; it must not move `HEAD`, leave stash entries, touch
gitignored files, or delete anything under the running loop's bundle dir.

## Required API (the frozen acceptance spec imports exactly this)

```ts
// src/loop/loopConfig.ts
stallProbes: z.boolean().default(false)
// src/loop/loopStagnationPolicy.ts
export type StagnationPolicy = { promptRepeatCount; escalationRepeatCount; probeRepeatCount: number | undefined }
export function resolveStagnationPolicy(config: LoopConfig, repeatCount: number, probesUsed?: boolean): StagnationPolicy
// src/loop/loopStallProbes.ts
export const STALL_PROBE_VARIANTS: readonly ['procedure', 'facts']
export type StallProbeVariant = (typeof STALL_PROBE_VARIANTS)[number]
export interface WorkspacePort<S = unknown> {   // method syntax, so WorkspacePort<{id:number}> is assignable
  snapshot(): S | Promise<S>
  restore(snap: S): void | Promise<void>
}
export function buildStallProbePromptSection(
  variant: StallProbeVariant,
  input: { verifyCommand: string; lastVerify: VerifyResult | null; diffStat: string },
): string
export function pickStallProbeWinner(
  stalled: VerifyResult,
  outcomes: Array<{ variant: StallProbeVariant; verify: VerifyResult }>,
): StallProbeVariant | undefined
export function createGitWorkspacePort(repoRoot: string): WorkspacePort
// src/loop/agentLoop.ts — AgentLoopOptions gains:
workspacePort?: WorkspacePort<any>   // tests inject a fake; default is the git port
```

## Finish line (four parts)

- **Outcome:** an opted-in stalled run tries two differently-guided workers before escalating
  the model, keeps the better workspace deterministically, and logs it.
- **Scoreboard:** `bash .cursor/loops/stall-probes/verify.sh`. Exit `0` is the only success.
- **Permission:** `maxIterations: 10`, `stagnationThreshold: 3`.
- **Budget:** medium. Stop at green. No parallel worktrees, no >2 variants, no LLM scoring, no
  default flip to `true` (Paul decides that after trying it).

## Wiring (name before freeze)

- **EDGE DATA:** `priorFailures`, `lastVerify`, git diff stat, `config.verify`, workspace port.
- **REDUCER:** `verify.sh`: pinned sha256 of `acceptance.ts.txt`, typecheck with the spec
  copied in, the spec + targeted suites, `pnpm test:coverage` (thresholds 81/69/87/80; functions
  at 87.14%, so the port and helpers need real tests), unchanged `vitest.config.ts`, wiring
  greps, new cases in `loopStagnationPolicy.test.ts`, untouched `loopStagnation.ts` /
  `loopMeta.ts`, no Gemini/Gemma added.
- **FAILURE POLICY:** a failing acceptance case is the next task. Never edit `acceptance.ts.txt`,
  `verify.sh`, `GOAL.md`, `loop.json`; never lower thresholds or add coverage excludes.
- **HUMAN GATE:** OpenCode judge (`reviewGate: true`); Paul reviews the branch. No push, no PR.

## Acceptance criteria (verifier-owned)

1. `acceptance.ts.txt` sha256 matches the pin in `verify.sh`.
2. `src/loop/loopStallProbes.ts` and your own `src/loop/loopStallProbes.test.ts` exist.
3. `pnpm typecheck` passes with the spec copied in.
4. The spec passes: default off + old policy unchanged; probes before escalation, escalation
   after; threshold 0 disables; two variants with distinct sections; winner ordering; git port
   restores tracked + untracked, keeps ignored files and HEAD, leaves no stash; in
   `runAgentLoop`: A→restore(s0)→B order, green B kept without restore, green A skips B, A-moved
   restores `sA`, nothing-moved restores `s0` and never probes again, exact probe log lines,
   no port use when off.
5. Targeted suites pass: `loopStallProbes`, `loopStagnationPolicy` (with new cases),
   `loopStagnation`, `agentLoop`, `loopConfig`.
6. `pnpm test:coverage` passes.
7. `vitest.config.ts`, `src/loop/loopStagnation.ts`, `src/loop/loopMeta.ts` unchanged vs `c4e7195`.
8. `agentLoop.ts` imports `loopStallProbes.js` and uses `probeRepeatCount`; `loopConfig.ts` has
   `stallProbes`; README and CHANGELOG (Unreleased) mention `stallProbes`.

## Constraints

- Only `src/loop/**`, `src/index.ts`, `README.md`, `CHANGELOG.md`, `docs/**` may change.
  Don't touch `site/`, `plugins/`, `vitest.config.ts`.
- Keep `lessons` and `prompt-rules` behaviour working if present on the branch.
- No new dependencies (use `git` via `child_process`), no version bump, no Gemini or Gemma.

## Out of scope

- Parallel probes in git worktrees; more than two variants; changing `escalateModel` defaults;
  flipping `stallProbes` on in `.cursor/agent-loop.repo.json`. Release, push, PR.
