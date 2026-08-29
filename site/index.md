# Agent Looper

> Agent Looper is an open-source fix-until-green harness: your coding agent writes a frozen goal and a determined check, then a fresh worker loops until that check passes — with a budget that actually stops.

You heard looping beats prompting. You install Agent Looper. You tell your agent you just want the feature. It writes the goal, writes a determined check, and runs until that check passes. No hallucinated “done.”

npm: `@dancingteeth/agent-looper` · CLI: `agent-loop` · site: https://looper.dancingteeth.net/

## Which coding agents does Agent Looper work with?

Agent Looper uses the coding agents you already pay for: Cursor, Cline, OpenCode, Pi, Codex, and DSH. It detects what's installed. You or your agent pick the model and provider. OpenCode and Pi can use OpenRouter, Vercel, Ollama, or another OpenAI-compatible router. How-to and default models: [Harnesses](https://looper.dancingteeth.net/harnesses/).

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

A report card, not a chat dump. How often the check sent work back, whether the worker hung, whether the judge bounced it, what it cost, and whether it needed you.

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

### For agent

```
Set up Agent Looper in this repo for the feature I want. I don't want to babysit the grind.

Requirements: Node 22+ and pnpm.

1. Add @dancingteeth/agent-looper and the SDK for the coding agent on this machine. Cursor uses @cursor/sdk. If you're not sure, detect what's installed (Cursor, Cline, OpenCode, Pi, Codex, DSH).
2. Use an API key already on this machine, or run under Doppler. Don't invent keys.
3. Run: pnpm exec agent-loop-init
4. Write GOAL.md for the feature and freeze it. Don't rewrite the goal mid-loop.
5. Write a determined check until `bash verify.sh` is an honest pass/fail that the feature actually works. The model does not get to say done.
6. Start the loop:
   pnpm exec agent-loop run .cursor/loops/<task> --runtime <cursor|cline|opencode|pi|codex|dsh> --review-gate
7. Review skill: blockers come back for the next iteration. Advisory is my call. Don't loop on subjective taste.

Cursor example (swap the SDK, key, and --runtime if this machine isn't Cursor):

pnpm add -D @dancingteeth/agent-looper @cursor/sdk

export CURSOR_API_KEY=…   # or: doppler run -- …

pnpm exec agent-loop-init
# edit .cursor/loops/my-task/GOAL.md
# edit verify.sh until `bash .cursor/loops/my-task/verify.sh` is honest

pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

### For human

```bash
pnpm add -D @dancingteeth/agent-looper @cursor/sdk

export CURSOR_API_KEY=…   # or: doppler run -- …

pnpm exec agent-loop-init
# edit .cursor/loops/my-task/GOAL.md
# edit verify.sh until `bash .cursor/loops/my-task/verify.sh` is honest

pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

## More

- [llms.txt](https://looper.dancingteeth.net/llms.txt)
- [Harnesses](https://looper.dancingteeth.net/harnesses/)
- [Developer resources](https://looper.dancingteeth.net/docs/)
- [GitHub](https://github.com/dancingteeth/agent-looper)
- [npm](https://www.npmjs.com/package/@dancingteeth/agent-looper)
