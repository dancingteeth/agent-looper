# Agent Looper

> Agent Looper is an open-source fix-until-green harness: your coding agent writes a frozen goal and a determined check, then a fresh worker loops until that check passes — with a budget that actually stops.

You heard looping beats prompting. You install Agent Looper. You tell your agent you just want the feature. It writes the goal, writes a determined check, and runs until that check passes. No hallucinated “done.”

npm: `@dancingteeth/agent-looper` · CLI: `agent-loop` · site: https://looper.dancingteeth.net/

## Which coding agents does Agent Looper work with?

Agent Looper uses the coding agents you already pay for: Cursor, Cline, OpenCode, Pi, Codex, and DSH. It detects what's installed. You or your agent pick the model and provider. OpenCode and Pi can use OpenRouter, Vercel, Ollama, or another OpenAI-compatible router.

## How do Agent Looper worker and judge presets work?

Agent Looper ships named worker/judge presets, or it (or your agent) wires a pair from what's installed. Easy work gets a cheap worker and a strong judge. Work that matters gets a heavier pair. The pair stays for the whole loop.

## How does Agent Looper keep cost down for indie builders?

Agent Looper is how indie builders get to handoff or production-ready without burning a frontier model on every loop. Cheap harness subscriptions you already have, a worker/judge pair that minmaxes cost, and a budget that actually stops.

## What happens if Agent Looper's worker is stuck?

Agent Looper starts with the cheap worker. If the same check keeps failing, it steps up thinking where the harness supports it, then switches to a stronger model. Not Auto — a planned ladder after a stuck check, not a new pick every turn.

## How is Agent Looper different from looping in chat?

- Shell verify is the exit, not the LLM grading itself.
- Fresh context each iteration, not an accumulating chat thread.
- One-repo fix harness, not a team-ops factory.

## Install Agent Looper

Node 22+, pnpm.

1. Add `@dancingteeth/agent-looper` and the SDK for your coding agent (Cursor: `@cursor/sdk`).
2. Export an API key, or run under Doppler.
3. Run `pnpm exec agent-loop-init`.
4. Edit `GOAL.md` and `verify.sh` until `bash verify.sh` is an honest determined check.
5. Run `pnpm exec agent-loop run` until that check is green.

```bash
pnpm add -D @dancingteeth/agent-looper @cursor/sdk
export CURSOR_API_KEY=…
pnpm exec agent-loop-init
pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

## More

- [llms.txt](https://looper.dancingteeth.net/llms.txt)
- [Developer resources](https://looper.dancingteeth.net/docs/)
- [GitHub](https://github.com/dancingteeth/agent-looper)
- [npm](https://www.npmjs.com/package/@dancingteeth/agent-looper)
