---
tags:
  - documentation
  - runtimes
  - roadmap
  - codex
  - agents
---
# Codex SDK integration roadmap

Add `runtime: codex` (and `reviewRuntime: codex`) via optional peer
[`@openai/codex-sdk`](https://www.npmjs.com/package/@openai/codex-sdk) so ChatGPT / Codex
users can dogfood Agent Looper without Cursor for implement (and optionally judge).

**Why next:** real demand among friends / ChatGPT subscribers — ahead of Goose (low demand)
and Aider (awkward CLI fit). See [`runtime-map.md`](./runtime-map.md).

**Non-goals for v1:** replace Cursor dogfood default; auto-commit behavior from Codex CLI;
frontier Opus/GPT as *default* worker economics (Codex is opt-in BYO OpenAI).

## Principles (same as other peers)

1. **Dynamic import** — Cursor-only installs never load `@openai/codex-sdk`.
2. **Fresh session per iteration** — no chat memory across outer-loop turns.
3. **Shell verify stays the hard gate** — Codex cannot mark the loop complete.
4. **Mirror Pi / OpenCode wiring** — `WorkerRuntime` → `agentRunner` → `reviewAgentRun` →
   `agent-check` → docs + smoke loop.

Package snapshot (GitHits / npm): `@openai/codex-sdk` ~0.147.x, Apache-2.0, high download
volume; repo [openai/codex](https://github.com/openai/codex). Pin a minimum peer once the
API surface is confirmed in phase 0.

## Phase 0 — Unknowns preflight (chat → freeze)

Discover before coding (see [`unknowns-preflight.md`](./unknowns-preflight.md)):

| Unknown | Why it matters | Done when |
| --- | --- | --- |
| Thread / turn API | Need `cwd` + one-shot prompt + text result | Documented call shape in this file or `docs/codex-runtime.md` draft |
| Auth | Env vs local CLI login | `agent-check codex` can detect key / config |
| Model ids | Default + escalate slug format | Constants in `loopAgentConfig` |
| Usage / cost | `costUsd` / tokens in `log.ndjson` | Map or explicitly `undefined` |
| Auto-git / sandbox | Must not fight harness git / verify | Document constraints; disable or sandbox if needed |
| Streaming | Optional; match `StreamCollector` if cheap | v1 can be non-stream |

**Freeze** into `docs/codex-runtime.md` + this checklist before large diffs.

## Phase 1 — Worker runtime (MVP)

| Area | Work |
| --- | --- |
| Config | `LOOP_RUNTIME_CODEX = 'codex'`; zod enum; defaults + escalate; `isCodexRuntime` |
| Agent | `src/agents/codexAgent.ts` — session, `runPrompt`, dispose; dynamic import |
| Runner | Wire in `agentRunner.ts` (create / dispose / recycle if needed) |
| Check | `agent-check codex` + `pnpm agent:check:codex` |
| Peers | Optional `peerDependencies` + `peerDependenciesMeta` |
| Tests | Unit tests with mocked SDK (no live Codex in CI) |
| Smoke | `.cursor/loops/codex-smoke/` (writes a probe file; like `pi-smoke`) |

### Acceptance

- [x] `runtime: "codex"` runs one implement iteration against mocked SDK in unit tests
- [ ] Live smoke: `pnpm agent:loop run .cursor/loops/codex-smoke --runtime codex` (manual; operator)
- [x] Cursor-only install still typechecks / tests without loading Codex at module eval (dynamic import)
- [x] Missing peer → clear error pointing at `pnpm add -D @openai/codex-sdk`
- [x] `skipGitRepoCheck: true` + Sol default judge documented

### Suggested defaults (revise after phase 0)

| Field | Tentative |
| --- | --- |
| `model` | `gpt-5.6-luna` (cheap; from Codex models.json) |
| `escalateModel` | `gpt-5.6-terra` |
| Auth | `CODEX_API_KEY` / `OPENAI_API_KEY` and/or Codex CLI ChatGPT login |

## Phase 2 — Judge + verify skill

| Area | Work |
| --- | --- |
| Review | `reviewAgentRun` case for `reviewRuntime: "codex"` |
| Verify skill | `loopVerifySkill` path when worker/judge is codex |
| Meta-review | Allow `--review-runtime codex` on `agent-loop-meta-review` |
| Docs | Judge preset in `runtime-map.md` (Codex+Codex, Codex worker + Cursor judge) |

### Acceptance

- [x] `reviewRuntime: "codex"` wired in `reviewAgentRun` / meta-review / verify skill
- [x] Default judge remains Cursor when `reviewRuntime` unset

## Phase 3 — Docs + npm release

| Area | Work |
| --- | --- |
| Docs | Ship `docs/codex-runtime.md`; update README / README.intro / AGENTS peers |
| Map | Move Codex from roadmap → **Shipped** in `runtime-map.md` |
| Plugin | `install-agent-looper` skill mentions optional Codex peer |
| Version | Bump package (e.g. `0.1.11` → `0.2.0` if runtime enum is public surface) |
| Publish | `docs/releasing.md` — trusted publisher; npm gets README + `templates/` |

### Acceptance

- [x] `npm` package version bumped for Codex surface (`0.2.0`)
- [x] CONSUMERS / install skill document optional `@openai/codex-sdk`
- [x] `npm view @dancingteeth/agent-looper version` shows the bump (`0.2.0`)
- [x] README + runtime-map list Codex as shipped

## File touch list (expected)

```text
src/loop/loopAgentConfig.ts          # runtime enum, defaults, assert model
src/loop/loopConfig.ts               # zod
src/agents/codexAgent.ts             # new
src/agents/agentRunner.ts            # wire
src/agents/agentRunner.test.ts
src/review/reviewAgentRun.ts
src/loop/loopVerifySkill.ts
src/cli/check.ts                     # agent-check codex
src/cli/meta-review.ts               # allow review-runtime
src/index.ts                         # exports
src/usage/loopUsage.ts               # pricing if known
package.json                         # peer + scripts + version
docs/codex-runtime.md                # new (from phase 0 freeze)
docs/runtime-map.md                  # shipped row
README.md / README.intro.md / AGENTS.md / CONSUMERS.md
.cursor/loops/codex-smoke/           # GOAL, loop.json, verify.sh
plugins/agent-looper/skills/install-agent-looper/SKILL.md
```

## Risks

| Risk | Mitigation |
| --- | --- |
| SDK churn (fast releases) | Pin min peer; thin adapter; phase 0 freeze API |
| Expensive default models | Cost-minmax defaults; escalate only on stagnation |
| Codex mutates git unexpectedly | Disable auto-commit / document; harness owns git |
| Auth confusing (ChatGPT vs API key) | `agent-check` messages + codex-runtime.md |

## Out of scope (defer)

- Goose / Aider
- Hard-banning Gemini on Codex path (already out of *defaults*; still opt-in elsewhere)
- Shipping full `docs/` tree inside the npm tarball (still GitHub; README + templates ship)

## Implementation order

1. Phase 0 preflight → freeze `docs/codex-runtime.md` skeleton  
2. Phase 1 MVP worker + smoke  
3. Phase 2 judge  
4. Phase 3 docs + version bump + publish  

Do not edit frozen loop `GOAL.md` mid-run; design in chat, then implement.
