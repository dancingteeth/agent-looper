# DSH companion guard — close the residual bypasses

Loop `.cursor/loops/dsh-plugin-guard-hardening` on branch `session/dsh-plugin-advisories`,
on top of `2ce5309` (loop `dsh-plugin-advisories`, verify green, judge verdict ADVISORY).
Findings come from that loop's two judges plus a measured pre-freeze probe.

## Goal

Close the residual bypasses in the DSH companion's bash guard and finish the registration
lifecycle, inside `plugins/dsh-agent-looper/` only. Measured on the parent commit, each of these
currently **fails open**:

1. **Wrapped / prefixed grinds** — `doppler run --project … -- agent-loop run <loop>`, `env
   agent-loop run …`, `bash -lc "…"`, `bash --login -c "…"`, and executed heredocs whose consumer
   is prefixed (`sudo bash <<'EOF'`, `env bash <<'EOF'`). The `doppler run … --` form is the repo's
   own documented grind command and the `agent:loop` npm script — it must be denied in the
   foreground exactly like a bare invocation.
2. **Command substitution** — `OUT=$(agent-loop run <loop>)` and the backtick form execute
   unguarded (the old substring guard caught these; the tokenizer regression let them through).
3. **Secret copy-out** — `cp`, `mv`, `rsync`, `install` of a secret path materialize the secret
   unguarded; the file rule must fire for any tool that touches the path.
4. **`agent-loop-batch --help`** — currently denied; `--help` must stay allowed for every shipped
   entrypoint, matching `agent-loop --help`.
5. **Command disposer** — `loop-scaffold` is registered outside `ctx.effect`, so its disposer is
   dropped. All **seven** registrations (prompt section, tool guard, 4 skills, command) must be
   released on disposal.

## Finish line (four parts)

- **Outcome:** the extended guard contract holds, the previous loop's contract still holds, and
  the plugin typechecks.
- **Scoreboard:** `bash .cursor/loops/dsh-plugin-guard-hardening/verify.sh` — exit `0` is the only
  success signal. It runs **two** frozen probes: this loop's `probe.mjs` (full contract, including
  the new cases) and the previous loop's `.cursor/loops/dsh-plugin-advisories/probe.mjs` as a
  regression gate.
- **Permission:** `maxIterations: 6`, `stagnationThreshold: 3`. If the same probe case fails three
  iterations, stop and report.
- **Loop budget:** bounded hardening, not a rewrite. Stop when both probes are green, the plugin
  typechecks, its unit tests pass, and CI still compiles the plugin. Do not restyle prose, rename
  modules, or add matching rules beyond the cases below.

## Wiring (name before freeze)

- **EDGE DATA:** the `bash` / `pwsh` tool invocation string (`execution.arguments.command`) plus
  `Config` (`skillsDir`, `agentLoopBinary`, `blockNestedRun`).
- **REDUCER:** `verify.sh` — two probes, plugin `tsc` (emits `dist/`, the artifact DSH loads),
  plugin unit tests, structural assertions. Exit code is the verdict.
- **FAILURE POLICY:** a probe failure is the next task; never edit either probe's cases to match
  the code. A case that is genuinely unimplementable is reported, not deleted.
- **HUMAN GATE:** residual judge (OpenCode Go `opencode-go/glm-5.3` primary; repo-default Cursor
  `grok-4.6` secondary), `reviewGate: true`. The human merges and releases.

## Acceptance criteria (verifier-owned)

`verify.sh` runs, in order:

1. `pnpm exec tsc -p plugins/dsh-agent-looper/tsconfig.json` — compiles and emits `dist/`.
2. `node .cursor/loops/dsh-plugin-guard-hardening/probe.mjs` — the full contract, including:
   - deny: `OUT=$(agent-loop run …)`, the backtick form, `sudo bash <<'EOF' … EOF`,
     `env bash <<'EOF' … EOF`, `bash -lc "agent-loop run …"`,
     `bash --login -c "agent-loop run …"`, `env agent-loop run …`,
     `doppler run --project agent-looper --config dev -- agent-loop run …`
   - deny (unchanged from the previous loop): bare/`pnpm exec` invocation, `agent-loop-batch`,
     `node dist/cli/run-batch.js`, `tsx src/cli/run.ts`, `bash -c "…"`, executed
     `bash`/`sh -s` heredocs, the `pwsh` tool name
   - allow: `agent-loop --help`, `agent-loop-batch --help`, `agent-loop-init`, a data heredoc
     writing `package.json`, `rg "agent-loop run" docs/`, `git log --grep="agent-loop run"`, a
     commit message mentioning it, `sed -i "s|agent-loop run|x|" README.md`, `sudo ls /tmp`,
     `echo "$(date)"`, and any denied command with `run_in_background: true`
   - secret deny: `cp`/`mv`/`rsync`/`install` of `~/.doppler.yaml` or `~/.dsh/.credentials.yaml`,
     plus the previous loop's cases (`cat`/`grep`/`awk` reads, `doppler secrets`,
     `DOPPLER_TOKEN=…`, `opencode/auth.json`, an executed heredoc, a command substitution)
   - secret allow: `doppler run --project agent-looper --config dev -- agent-check opencode`,
     `cat ~/.dsh/settings.yaml`, `cat .cursor/agent-loop.repo.json`, `ls ~/.dsh/`
   - lifecycle: exactly the 7 registration tags are released on disposal (1 section, 1 guard,
     4 skills, 1 command), and a missing `skillsDir` warns through `ctx.logger`
3. `node .cursor/loops/dsh-plugin-advisories/probe.mjs` — the previous contract still holds.
   **Sanctioned one-line correction:** that probe is now a regression artifact from a completed
   loop, so update only its lifecycle expectation from `6` to `7` and add a comment noting this
   loop supersedes the count. Do not touch any other case in that file.
4. `pnpm exec vitest run plugins/dsh-agent-looper` — plugin unit tests pass; extend them for the
   new cases, do not delete or weaken existing ones.
5. `dshBashGuardReason` still absent from `plugins/dsh-agent-looper/src`.
6. `.github/workflows/ci.yml` still compiles `plugins/dsh-agent-looper/tsconfig.json`.

## Constraints

- Only `plugins/dsh-agent-looper/**`, `.github/workflows/ci.yml`, and the one sanctioned count fix
  in `.cursor/loops/dsh-plugin-advisories/probe.mjs` may change. Never edit this loop's `GOAL.md`,
  `probe.mjs`, or `verify.sh`.
- Keep the existing single command-position design: unwrap shells and substitutions, then skip
  leading builtins/wrappers (`sudo`, `env`, `command`, `doppler run … --`) before classifying the
  head. Prefer one prepass over a second overlapping matcher.
- Keep the public functions exported from `plugins/dsh-agent-looper/src/nested-run.ts` with their
  current names and signatures (`probe.mjs` imports them).
- No new dependencies. Keep `run_in_background: true` and `--help` allowed. Fails safe, not open.

## Out of scope

- The release itself (version bump, CHANGELOG, publish) — the human owns it after this loop.
- Live `dsh web` reload smoke: not verifiable from a headless worker; the human runs it.
- Broadening secret-mention heuristics (for example `git log --grep="doppler secrets"`), which
  fail safe today.
- Rewriting the plugin's skill prose or touching `plugins/agent-looper/`.
