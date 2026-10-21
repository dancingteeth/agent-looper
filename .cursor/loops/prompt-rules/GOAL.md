# prompt-rules — state facts, guard the deliverable, no plain-text tool calls

Loop `.cursor/loops/prompt-rules` on branch `feat/harness2-ideas`, base `c4e7195`.
Run **after** `lessons-file` (same branch). Ideas from Harness² (google-research/harness2,
arXiv 2610.14224) prompt rules: give the agent the fact itself, not instructions for finding it;
use a hook so the agent can't stop before the deliverable exists; teach it never to write tool
calls as text (their example went from 60 to 100, which matters most for cheap worker models).

## Goal

Three changes to the worker prompt and loop, all deterministic:

1. **Facts, stated.** `buildAgentLoopPrompt` renders a `## Facts` section in the stable head
   (before `## Workspace (git)`, byte-identical across iterations) with the exact verifier
   command (`config.verify`) and each configured deliverable path. `agentLoop.ts` passes
   `verifyCommand: config.verify` and `deliverables: config.deliverables`.
2. **Deliverable guard (the "hook").** New optional `loop.json` keys `deliverables: string[]`
   (repo-relative files) and `deliverableNudges` (int 0–5, default 2). After a worker call
   returns and **before** verify runs, if any deliverable is missing or empty, the harness calls
   the worker again with the same prompt plus a `## Deliverables missing` section listing them,
   up to `deliverableNudges` times. Then the verifier runs as usual and decides. No deliverables
   configured means exactly one worker call per iteration (unchanged behaviour). Runtime-neutral:
   it lives in `agentLoop.ts`, not in one runtime's hook API.
3. **No plain-text tool calls.** Add a 7th rule to `LOOP_SAFETY_RULES`,
   `renderLoopPromptRulesSection` and `renderLoopSystemPromptSafetyLines` (keep all three in
   sync): never write a tool call as plain text; call tools through the tool interface. Add a
   detector; when the previous worker reply contained pseudo tool calls, the next iteration's
   prompt (volatile tail) gets a `PLAIN_TEXT_TOOL_CALL_HEADING` section explaining that text is
   not executed.

## Required API (the frozen acceptance spec imports exactly this)

```ts
// src/loop/loopPrompt.ts — LoopPromptInput gains:
verifyCommand?: string
deliverables?: string[]
// src/loop/loopConfig.ts — loopConfigSchema gains:
deliverables: z.array(z.string().min(1)).optional()
deliverableNudges: z.number().int().min(0).max(5).default(2)
// src/loop/loopDeliverables.ts
export function missingDeliverables(repoRoot: string, deliverables: readonly string[]): string[] // missing OR empty file, input order
export function buildDeliverableNudgeSection(missing: readonly string[]): string               // heading "## Deliverables missing"
// src/loop/loopToolCallText.ts
export const PLAIN_TEXT_TOOL_CALL_HEADING: string   // starts with "## "
export function detectPlainTextToolCalls(text: string): boolean
```

The detector must flag `<tool_call>`, `<function=name>`, `[TOOL_CALLS]`, a ```` ```tool_code ````
fence, and JSON objects shaped `{"name"|"tool": "...", "arguments"|"parameters": ...}`. It must
**not** flag ordinary prose (including the words "tool call"), TS objects with a `name` key, or
a `package.json`-style JSON block.

## Finish line (four parts)

- **Outcome:** worker prompts state the verify command and deliverables; missing deliverables get
  bounded nudges before verify; pseudo tool calls are taught against and flagged next round.
- **Scoreboard:** `bash .cursor/loops/prompt-rules/verify.sh`. Exit `0` is the only success.
- **Permission:** `maxIterations: 8`, `stagnationThreshold: 3`.
- **Budget:** small/medium. Stop at green. No per-runtime hook plugins, no LLM-based detection,
  no prompt rewrite beyond the three items.

## Wiring (name before freeze)

- **EDGE DATA:** `config.verify`, `config.deliverables`, the worker's reply text, files on disk.
- **REDUCER:** `verify.sh`: pinned sha256 of `acceptance.ts.txt`, typecheck with the spec copied
  in, the spec + targeted suites, `pnpm test:coverage` (thresholds 81/69/87/80; functions are at
  87.14%, so every new function needs tests), unchanged `vitest.config.ts`, wiring greps,
  untouched stagnation files, no Gemini/Gemma added.
- **FAILURE POLICY:** a failing acceptance case is the next task. Never edit
  `acceptance.ts.txt`, `verify.sh`, `GOAL.md`, `loop.json`; never lower thresholds or add
  coverage excludes; update existing tests that pin the rule count instead of deleting them.
- **HUMAN GATE:** OpenCode judge (`reviewGate: true`); Paul reviews the branch. No push, no PR.

## Acceptance criteria (verifier-owned)

1. `acceptance.ts.txt` sha256 matches the pin in `verify.sh`.
2. `src/loop/loopToolCallText.ts`, `src/loop/loopDeliverables.ts` and your own
   `loopToolCallText.test.ts` / `loopDeliverables.test.ts` exist.
3. `pnpm typecheck` passes with the spec copied in.
4. The spec passes: Facts section in the stable head with command + deliverables; head
   unchanged across iterations; `runAgentLoop` prompt carries `config.verify`; rule present in
   rules/safety list/system prompt with numbered count = `LOOP_SAFETY_RULES.length`; detector
   positives/negatives; warning only after a pseudo-tool-call reply; nudge before verify until the
   file exists; nudges capped by `deliverableNudges`, then verify decides; default 2 and no
   change without deliverables.
5. Targeted suites pass: `loopToolCallText`, `loopDeliverables`, `loopPrompt`,
   `loopSystemPrompt`, `agentLoop`.
6. `pnpm test:coverage` passes.
7. `vitest.config.ts`, `src/loop/loopStagnationPolicy.ts`, `src/loop/loopAgentEscalation.ts`
   unchanged vs `c4e7195`.
8. `agentLoop.ts` imports both new modules and passes `verifyCommand: config.verify`;
   `loopConfig.ts` has `deliverableNudges`; README documents `deliverables`; CHANGELOG
   Unreleased mentions `deliverables`.

## Constraints

- Only `src/loop/**`, `src/agents/loopSystemPrompt*`, `src/index.ts`, `README.md`,
  `CHANGELOG.md`, `docs/**` may change. Don't touch `site/`, `plugins/`, `vitest.config.ts`.
- Keep the prompt's stable-head / volatile-tail split (cache prefix). Keep `lessons` from the
  `lessons-file` loop working if it is present on the branch.
- No new dependencies, no version bump, no Gemini or Gemma anywhere.

## Out of scope

- Runtime-native stop hooks (OpenCode plugin, Claude Code hooks): possible follow-up.
- Stall probes (loop `stall-probes`). Release, push, PR.
