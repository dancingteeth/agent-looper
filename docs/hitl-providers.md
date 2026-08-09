# HITL checkpoint providers

Human-in-the-loop (HITL) checkpoints are **create-only** and **non-blocking**: the harness tries to open a durable record for a human, logs a warning on failure, and continues. The opaque id returned (when any) is stored as `hitlCheckTaskUuid` on loop results — e.g. a Taskwarrior UUID, file path, GitHub/Linear issue URL, or `command` stdout.

**Taskwarrior is the default `hitlProvider`.** Prefer `file`, `github`, `linear`, or `command` when you do not run TW. Completion alerts (Telegram, webhook, PR comment, `notifyCommand`) are separate — see below.

Triggers:

- `hitlCheck` in `loop.json` after a **successful** loop (post-verify / post-review)
- `reviewGateHitl: true` when the review gate **exhausts** cycles (instead of a hard fail only)
- **Notify fallback:** when the loop ends **incomplete**, Telegram notify was configured, and the failure report did not land → HITL with reason `notify_failed`
- `hitlOnFailure: true` → HITL on every incomplete run (reason `loop_failure`), even when Telegram succeeded

`taskwarriorUuid` + mark-done on success remains **Taskwarrior-specific** (linked goal task), independent of `hitlProvider`.

## Configuration

Set defaults in `.cursor/agent-loop.repo.json`; optional per-loop overrides in `loop.json` (loop wins).

| Field | Default | Purpose |
| --- | --- | --- |
| `hitlProvider` | `taskwarrior` | `taskwarrior` \| `file` \| `github` \| `linear` \| `command` |
| `hitlFileDir` | `.cursor/hitl` | Directory (relative to repo root) for `file` provider |
| `hitlCommand` | — | Shell command for `command` provider |
| `hitlLinearTeam` | — | Linear team **key** (e.g. `ENG`) or team UUID when `hitlProvider` is `linear` |
| `taskwarriorProject` | — | Required when `hitlProvider` is `taskwarrior` and a HITL checkpoint fires |
| `hitlOnFailure` | `false` | Open a HITL checkpoint when the loop ends incomplete |
| `requireNotify` | `false` | Abort before run if Telegram preflight (`getMe`) fails (also `--require-notify`) |

## Providers

### `taskwarrior` (default)

Example / legacy default: `task add` with `+hitl` and `+manual` tags. Requires resolvable `taskwarriorProject`. Switch `hitlProvider` if you do not use Taskwarrior.

### `file`

Writes `{hitlFileDir}/{slug}-{iso-timestamp}.md` under the repo root. Returns the relative path when possible.

### `github`

Runs `gh issue create --title … --body …` (requires `gh` on PATH and auth). Returns the issue URL from stdout.

### `linear`

GraphQL `issueCreate` against `https://api.linear.app/graphql` (no Linear SDK).

- Auth: `LINEAR_API_KEY` or `AGENT_LOOP_LINEAR_API_KEY`
- Team: `hitlLinearTeam`
- Returns issue URL when present, else issue id

### `command`

Runs `hitlCommand` via shell in the repo root (similar to `syncCommand`). Environment:

| Variable | Content |
| --- | --- |
| `HITL_TITLE` | Short title (`HITL Check: …`) |
| `HITL_BODY` | Description, reason, loop path, project |
| `HITL_LOOP_DIR` | Loop directory when known |
| `HITL_PROJECT` | Resolved project label |
| `HITL_REASON` | `post_success` \| `review_gate` \| `loop_failure` \| `notify_failed` |

The **last non-empty line of stdout** is treated as the checkpoint id. Empty stdout still counts as success (log-only).

`hitlCommand` is included in the shell-trust gate (`--trust-config` / `AGENT_LOOP_TRUST_CONFIG`) alongside `verify` and `syncCommand`.

Example:

```json
{
  "hitlProvider": "command",
  "hitlCommand": "gh issue create --title \"$HITL_TITLE\" --body \"$HITL_BODY\""
}
```

## Validation at create time

- `taskwarrior` + HITL trigger → need resolvable `taskwarriorProject`
- `command` + HITL trigger → need `hitlCommand`
- `linear` + HITL trigger → need `hitlLinearTeam` and API key in env
- `file` / `github` → no Taskwarrior project required

## Completion notify without Telegram (`notifyCommand` / webhook / PR)

Completion **alerts** are not HITL checkpoints. Prefer for Cloud Agents / CI:

- **`notifyWebhook`** + `AGENT_LOOP_NOTIFY_WEBHOOK_URL` (JSON POST)
- **`notifyPrComment: true`** — `gh pr comment` on the open PR after the loop
- **`notifyCommand`** — optional shell with `LOOP_*` env (non-blocking; shell-trust gated)
- **Telegram** — still supported; failure to deliver can open HITL (`notify_failed`)

Optional shell in `.cursor/agent-loop.repo.json` or per-loop / per-batch `notifyCommand`. Runs on every CLI exit with `LOOP_*` env.

## Export packs

`.cursor/loop-exports/<slug>/` is the commit-friendly audit surface (in-loop reviews/logs stay gitignored). Default `exportPack: true`. See README.
