# DSH companion bash guard — close the advisory set

Loop `.cursor/loops/dsh-plugin-advisories` on branch `session/dsh-plugin-advisories`.
Findings come from the 2026-09-10 unified code review of `plugins/dsh-agent-looper/` (recorded in
"Advisory work items" below). This bundle is frozen: do not edit `GOAL.md`, `probe.ts`, or
`verify.sh` — the loop re-reads them every iteration.

## Goal

Make the DSH companion plugin's bash guard and registration lifecycle truthful, inside
`plugins/dsh-agent-looper/` only:

1. **No false negatives on grinds.** Deny every *foreground* grind entrypoint this repo ships —
   `agent-loop run`, `agent-loop-batch`, `node dist/cli/run*.js`, and the TS source entrypoint —
   including when the command reaches the shell through a *command-consuming* heredoc
   (`bash <<'EOF' … EOF`, `sh -s <<EOF`) or a shell wrapper (`bash -c "…"`, `eval`).
2. **No false negatives on secrets.** Deny the reads the plugin's own denial text names, including
   the canonical `~/.doppler.yaml` (today only `~/.doppler/.doppler.yaml` matches) and any reader
   tool, not just `cat`/`head`/`tail`.
3. **No false positives on mentions.** Reading or editing text that merely *contains* the string
   `agent-loop run` (`rg`, `git log --grep=`, `sed -i`, writing a `package.json` heredoc) must be
   allowed — a denied doc read is a bug, not a guardrail.
4. **Registrations are released.** `apply()` must hang every DSH registration (prompt section,
   tool guard, 4 skills, `loop-scaffold` command) off the calling context's disposal
   (`ctx.effect(...)`, a `dispose` listener, or an equivalent disposer) so a reload cannot
   duplicate the `plugin:agent-looper` prompt section — DSH documents a duplicate section name as
   a throw.
5. **A missing `skillsDir` is loud.** `apply()` warns through `ctx.logger` instead of silently
   registering zero skills.

## Finish line (four parts)

- **Outcome:** the guard contract below holds, the plugin typechecks, and the dead export is gone.
- **Scoreboard:** `bash .cursor/loops/dsh-plugin-advisories/verify.sh` — exit `0` is the only
  success signal. `probe.ts` is frozen and asserts the contract directly against the plugin's
  guard module; do not weaken, skip, or rewrite it.
- **Permission:** `maxIterations: 8`, `stagnationThreshold: 3`. Stop and report if the same probe
  failure repeats three iterations.
- **Loop budget:** this is a bounded hardening loop, not a rewrite. Stop when the probe is green,
  the plugin typechecks, the plugin's own unit tests pass, the dead export is deleted, and CI
  covers the plugin build. Do **not** keep polishing prose, renaming modules, or adding
  speculative rules once those are green.

## Wiring (name before freeze)

- **EDGE DATA:** the `bash` / `pwsh` tool invocation string (`execution.arguments.command`) that
  DSH passes to `ctx.tools.guard`, plus `plugin.json`-free static inputs: the bundled
  `skills/*/SKILL.md` files and the `Config` object (`skillsDir`, `agentLoopBinary`,
  `blockNestedRun`).
- **REDUCER:** `bash .cursor/loops/dsh-plugin-advisories/verify.sh` — frozen probe + plugin
  typecheck + plugin unit tests + structural assertions. Exit code is the verdict.
- **FAILURE POLICY:** a probe failure is the worker's next task; never edit `probe.ts` to match
  the code. If a case is genuinely unimplementable, stop and report which case and why instead of
  removing it. Keep `run_in_background: true` commands allowed — background is the sanctioned path.
- **HUMAN GATE:** the residual judge (OpenCode Go `opencode-go/glm-5.3`, plus the repo-default
  Cursor Grok 4.6 second judge) reads this GOAL + the diff; `reviewGate: true` reopens the worker
  on gating blockers. The human merges.

## Acceptance criteria (verifier-owned)

Success is determined **only** by `verify.sh`, which runs these numbered steps:

1. `pnpm exec tsc -p plugins/dsh-agent-looper/tsconfig.json --noEmit` — the plugin compiles
   (this was previously unverifiable: root tsconfigs include only `src/**`).
2. `node --experimental-strip-types .cursor/loops/dsh-plugin-advisories/probe.ts` — the frozen
   guard + lifecycle contract, including:
   - deny: `agent-loop run …`, `pnpm exec agent-loop run …`, `agent-loop-batch …`,
     `node dist/cli/run-batch.js …`, `pnpm exec tsx src/cli/run.ts …`,
     `bash -c "agent-loop run …"`, `bash <<'EOF' … agent-loop run … EOF`, `sh -s <<EOF …`
   - allow: `agent-loop --help`, `agent-loop-init`, a `cat > package.json <<'EOF'` heredoc that
     mentions the script, `rg "agent-loop run" docs/`, `git log --grep="agent-loop run"`,
     `sed -i "s|agent-loop run|x|" README.md`
   - allow: any of the above with bash `run_in_background: true`
   - deny for the `pwsh` tool name as well as `bash`
   - deny: `cat ~/.doppler.yaml`, `grep TOKEN ~/.doppler.yaml`,
     `grep -r token ~/.doppler/.doppler.yaml`, `cat …/.dsh/.credentials.yaml`,
     `awk 1 …/.dsh/.credentials.yaml`, `doppler secrets`, `DOPPLER_TOKEN=…`,
     a python read of `opencode/auth.json`, `bash <<'EOF' … cat .credentials.yaml … EOF`
   - allow: `doppler run --project agent-looper --config dev -- agent-check opencode`
   - lifecycle: `apply()` registers 1 section + 1 guard + 4 skills + 1 command, and releasing the
     context disposes all 6; a missing `skillsDir` produces a `ctx.logger.warn`
3. `pnpm exec vitest run plugins/dsh-agent-looper` — the plugin's own unit tests pass (extend
   them; do not delete or weaken existing cases).
4. `dshBashGuardReason` no longer appears under `plugins/dsh-agent-looper/src` (dead export).
5. `.github/workflows/ci.yml` compiles the plugin (`plugins/dsh-agent-looper/tsconfig.json`), so
   step 1 is durable in CI and not just local.

## Advisory work items (all five, in one loop)

1. **Heredoc false negative** — `withoutHeredoc()` (`src/nested-run.ts`) drops everything after the
   first `<<`, so an *executed* heredoc (`bash <<'EOF' … agent-loop run … EOF`) bypasses both
   guards, while doc-writing heredocs must stay allowed. Distinguish the consumer
   (`bash`/`sh`/`zsh`/`node`/`python` = executed) from a data write (`cat`/`tee` to a file).
2. **Missed secret paths** — `~/.doppler.yaml` (the first path the denial text names) does not
   match `(?:^|[/\s])\.doppler\.yaml\b`; the `.doppler.yaml` rule also omits the reader tools the
   `.credentials.yaml` rule already accepts.
3. **Missed grind entrypoints** — `agent-loop-batch` and `node dist/cli/run-batch.js` are shipped
   bins (`package.json`) and are unguarded, as is the TS source entrypoint.
4. **Mention vs invocation** — the substring test denies `rg`/`git log`/`sed` lines that only
   mention the CLI. Require a command position (or a wrapper such as `bash -c`, `eval`, `pnpm exec`)
   instead of a bare substring hit.
5. **Lifecycle + noise removal** — hang registrations off `ctx.effect`/`dispose` (keep
   `blockNestedRun` honored), warn on a missing `skillsDir`, delete the uncalled
   `dshBashGuardReason`, and keep the module's real entrypoints (`isAgentLoopRunCommand`,
   `isSecretDumpCommand`, `nestedAgentLoopRunReason`, `secretDumpReason`, `apply`) exported from
   their current paths so the frozen probe keeps resolving.

## Constraints

- Only `plugins/dsh-agent-looper/**`, `.github/workflows/ci.yml`, and the plugin's own tests/docs
  may change. Keep the plugin free of `@deepseek-ai/dsh*` dependencies (peer `cordis` only) — the
  bundle must stay loadable without the harness installed.
- Keep the public guard functions exported from `plugins/dsh-agent-looper/src/nested-run.ts` with
  their current names and signatures.
- Preserve `run_in_background: true` as the allowed grind path, and keep `agent-loop --help`
  foreground-allowed.
- No new dependencies. No `any` casts at the DSH boundary; keep `AgentLooperContext` explicit.
- Prefer deleting branches/regexes over adding a second overlapping matcher.

## Out of scope

- Implementing the advisories outside the plugin (repo-wide model defaults, `.cursor/agent-loop.repo.json`).
- Installing/loading the plugin into a live `dsh web` session, or editing `~/.dsh/**`.
- Rewriting the plugin's skill prose, or touching `plugins/agent-looper/` (Cursor companion).
- Re-litigating the reviewed findings; the frozen probe defines the contract.
