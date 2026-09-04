---
tags:
  - documentation
  - agents
---
# Security Policy

This is the security policy for `@dancingteeth/agent-looper`. See `docs/embed-api.md` for the
embed contract and semver rules; this file covers vulnerability reporting and threat model.

## Supported versions

Security fixes land on the current release line only — this project is pre-1.0 and does not
maintain long-lived backport branches.

| Version | Supported |
| --- | --- |
| 0.5.x | Yes |
| < 0.5.0 | No |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a suspected vulnerability — use one of the two
private channels below instead:

- Email: **security@dancingteeth.net**
- GitHub private advisory: https://github.com/dancingteeth/agent-looper/security/advisories/new

Include the affected version, a reproduction (loop bundle, `verify.sh`, or command sequence),
and the impact you believe it has. If the report involves credentials or secrets, do not include
the raw values — describe what leaked and how.

## Response targets

- **Acknowledgement:** within 2 business days of a report landing in either channel.
- **Initial triage (confirm or request more info):** within 5 business days.
- **Fix or published advisory:** within 30 days for high-severity issues, best-effort for lower
  severity, coordinated with the reporter if the timeline needs to move.

## Scope and threat model

This package runs a shell `verify` (and optional `finalVerify` / `syncCommand`) command via
`shell: true` — those are **host-authored commands from `loop.json`**, not sandboxed, and a
malicious or compromised `loop.json` is equivalent to arbitrary shell execution in the checkout
it runs against. That is why `trustConfig` exists: it is an explicit opt-in flag (`loop.json`
`trustConfig: true`, `--trust-config`, or `AGENT_LOOP_TRUST_CONFIG=1`) that marks a bundle's
shell commands as reviewed, and `--require-trust-config` / `AGENT_LOOP_REQUIRE_TRUST_CONFIG=1`
aborts a run that has not been marked trusted. In scope for a report: anything that lets a loop
bundle escape its intended repo/worktree, exfiltrate secrets without the shell commands the
bundle already declares, or bypass the `trustConfig` gate itself. Out of scope: the fact that a
trusted `verify.sh` can run arbitrary shell — that is the documented, opt-in threat model, not a
vulnerability. See `README.md` § Threat model for the full trust-gate behavior.

## Coordinated disclosure

We ask reporters for a **90 days** embargo from first report before public disclosure, to allow
time to ship a fix or published advisory. We will credit reporters (or keep them anonymous, on
request) in the advisory once it is public.
