# HITL checkpoint providers

Human-in-the-loop (HITL) checkpoints are **create-only** and **non-blocking**: the harness tries to open a durable record for a human, logs a warning on failure, and continues. The opaque id returned (when any) is stored as `hitlCheckTaskUuid` on loop results — it may be a Taskwarrior UUID, file path, GitHub issue URL, Linear issue URL, or command stdout.

Triggers:

- `hitlCheck` in `loop.json` after a **successful** loop (post-verify / post-review)
- `reviewGateHitl: true` when the review gate **exhausts** cycles (instead of a hard fail only)

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

## Providers

### `taskwarrior` (default)

Same behavior as before: `task add` with `+hitl` and `+manual` tags. Requires resolvable `taskwarriorProject`.

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
| `HITL_REASON` | `post_success` or `review_gate` |

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
