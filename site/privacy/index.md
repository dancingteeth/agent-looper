# Agent Looper privacy

The Agent Looper marketing site at https://looper.dancingteeth.net/ is a static site we host. We use first-party PostHog on EU cloud (`eu.i.posthog.com` / eu.posthog.com) in **cookieless** mode: no advertising cookies and no local or session storage for analytics. We only send `$pageview` (page views), `install_copy_clicked` when you successfully copy an install snippet with the Copy button, and `grok_bot_add_clicked` when you open the public Grok Bot from the Harnesses page. Autocapture is off, we do not call `identify`, and session replay is disabled. We do not sell this data.

Copy-to-clipboard on the install snippet uses the browser clipboard API in your session only — that is separate from analytics.

The Agent Looper npm package (`@dancingteeth/agent-looper`) runs on your machine against coding-agent SDKs you configure. API keys, loop folders, `GOAL.md`, verify output, and git history stay in your environment and with the providers you already pay (Cursor, Cline, OpenCode, Pi, Codex, DSH, Muse, OpenRouter, and so on). This site does not proxy those calls.

CLI telemetry is separate from this site: it is opt-in (`AGENT_LOOPER_TELEMETRY=1`) and sends anonymous usage events from your machine when you enable it.

Issues and pull requests on https://github.com/dancingteeth/agent-looper are public on GitHub under GitHub’s privacy policy. npm downloads are subject to npm’s privacy policy.

If this page is wrong, treat that as a bug and open an issue.
