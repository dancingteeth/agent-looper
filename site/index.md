# Agent Looper

> Agent Looper is an open-source fix-until-green harness: your coding agent writes a frozen goal and a determined check, then a fresh worker loops until that check passes — with a budget that actually stops.

You heard looping beats prompting. You install Agent Looper. You tell your agent you just want the feature. It writes the goal, writes a determined check, and runs until that check passes. No hallucinated “done.”

npm: `@dancingteeth/agent-looper` · CLI: `agent-loop` · site: https://looper.dancingteeth.net/

## Which coding agents does Agent Looper work with?

Agent Looper uses the coding agents you already pay for: Cursor, Cline, OpenCode, Pi, Codex, DSH, Muse, and Claude. It detects what's installed. You or your agent pick the model and provider. OpenCode and Pi can use OpenRouter, Vercel, Ollama, or another OpenAI-compatible router. How-to and default models: [Harnesses](https://looper.dancingteeth.net/harnesses/).

## How do Agent Looper worker and judge presets work?

Named presets: minmax (efficiency — cheap capable worker, strongest included judge), balanced (spend more on the worker, same judge), cursor (stay on Cursor: Composer + Grok). Or you, your agent, or Looper wires a pair from what's installed. The pair stays for the whole loop. Not Auto.

## How does Agent Looper keep cost down for indie builders?

Agent Looper is how indie builders get to handoff or production-ready without burning a frontier model on every loop. Cheap harness subscriptions you already have, a worker/judge pair that minmaxes cost, and a budget that actually stops.

## What happens if Agent Looper's worker is stuck?

Starts cheap. Same check keeps failing → more thinking, then a stronger model. If the worker hangs or times out, it switches right away — it does not wait for the stuck-check count. Not Auto. A planned ladder.

## What if the code is already broken?

Forward implements, then checks. Reverse starts from a red check and repairs. Clean-room: rebuild toward the frozen goal from tests and the public API. Don't copy the broken internals.

## How do I know if a loop is still alive?

The IDE job list will lie. Ask your agent to use the check-running-loops skill. It looks at the harness process, not a spinner that stays green after the process died.

## What do I get when a loop finishes?

A report card, not a chat dump. How often the check sent work back, whether the worker hung, whether the judge bounced it, **list** and **billed** spend when they differ, and whether it needed you.

## How do I start a loop from an idea?

Two paths:

1. **If you see your coding agent's logo on this page** — type your idea as a normal prompt, and ask it to implement the feature **with Agent Looper**. It sets up the loop and keeps grinding until the check is green.

2. **If you like the terminal** — set worker and judge with `pnpm exec agent-loop-setup`, then use `pnpm exec agent-loop-prompt` to type your idea and start the run.

The check stays the finish line.

## What do the spend numbers mean?

Watch and the report card show two numbers when they differ: **list** (public API rates, including prompt-cache) and **billed** (what the runtime invoice says). `$0` on a subscription quota is billed `$0`, not “free.” Budget caps use billed when you are on PAYG and list when the invoice is `$0`.

## How is Agent Looper different from looping in chat?

- Shell verify is the exit, not the LLM grading itself.
- Fresh context each iteration, not an accumulating chat thread.
- One-repo fix harness, not a team-ops factory.

## Install Agent Looper

Node 22+, pnpm.

1. Add `@dancingteeth/agent-looper` and the SDK for your coding agent (Cursor: `@cursor/sdk`).
2. Export an API key for your coding agent.
3. **Agent path:** type your idea and ask it to implement the feature with Agent Looper. **Terminal path:** `pnpm exec agent-loop-setup`, then `pnpm exec agent-loop-prompt --out .cursor/loops/my-task` to type your idea and start.
4. Run until the check is green — or let your agent keep grinding.

### For agent

```
Set up Agent Looper in this repo for the feature I want. I don't want to babysit the grind.

Requirements: Node 22+ and pnpm.

1. Add @dancingteeth/agent-looper and the SDK for the coding agent on this machine. Cursor uses @cursor/sdk. If you're not sure, detect what's installed (Cursor, Cline, OpenCode, Pi, Codex, DSH, Muse, Claude).
2. Keep @dancingteeth/agent-looper in package.json even if you gitignore `.cursor/loops`. Don't only npx it.
3. Use an API key already on this machine. Don't invent keys.
4. Ask me what I want, then implement it with Agent Looper — set up the loop, write GOAL.md and verify.sh, and keep grinding until the check is green.
   Or if I'm in the terminal: pnpm exec agent-loop-setup then pnpm exec agent-loop-prompt --out .cursor/loops/<task>.
   Manual fallback: pnpm exec agent-loop-init and edit GOAL.md + verify.sh yourself.
5. Start or resume the loop:
   pnpm exec agent-loop run .cursor/loops/<task> --runtime <cursor|cline|opencode|pi|codex|dsh|muse|claude> --review-gate
6. Review skill: blockers come back for the next iteration. Advisory is my call. Don't loop on subjective taste.

Cursor example (swap the SDK, key, and --runtime if this machine isn't Cursor):

pnpm add -D @dancingteeth/agent-looper @cursor/sdk

export CURSOR_API_KEY=…

pnpm exec agent-loop-setup
pnpm exec agent-loop-prompt --out .cursor/loops/my-task
# or manually: pnpm exec agent-loop-init and edit GOAL.md + verify.sh

pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

### For human

```bash
pnpm add -D @dancingteeth/agent-looper @cursor/sdk
# keep @dancingteeth/agent-looper in package.json even if .cursor/loops is gitignored — don't only npx it

export CURSOR_API_KEY=…

pnpm exec agent-loop-setup
pnpm exec agent-loop-prompt --out .cursor/loops/my-task
# or manually: pnpm exec agent-loop-init and edit GOAL.md + verify.sh

pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

## If this is useful

This tool is free. We keep building it when the community actually uses it and tells us when it's broken.

1. Keep `@dancingteeth/agent-looper` in public `package.json` even if you gitignore the loop folder. Don't only npx it.
2. Open an issue or a PR when you hit a gap or a bug — https://github.com/dancingteeth/agent-looper/issues
3. Optional: `AGENT_LOOPER_TELEMETRY=1` so we see real runs, not just npm noise. Off by default. [Privacy](https://looper.dancingteeth.net/privacy/).

[Support on Ko-fi](https://ko-fi.com/dancingteeth)

## More

- [llms.txt](https://looper.dancingteeth.net/llms.txt)
- [Harnesses](https://looper.dancingteeth.net/harnesses/)
- [Developer resources](https://looper.dancingteeth.net/docs/)
- [GitHub](https://github.com/dancingteeth/agent-looper)
- [npm](https://www.npmjs.com/package/@dancingteeth/agent-looper)
