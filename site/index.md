# Agent Looper

> Agent Looper is an open-source fix-until-green harness for coding agents. Your agent freezes a goal and a deterministic shell check, then fresh workers loop until that check passes.

Tell your agent what to build and walk away. Progress stays in git instead of an accumulating chat thread, the model cannot grade itself “done,” and the budget cap stops the run when you say so.

npm: `@dancingteeth/agent-looper` · CLI: `agent-loop` · site: https://looper.dancingteeth.net/

## How it works

Your agent writes `GOAL.md` and `verify.sh` before the first turn. The harness freezes both files, restores them if a worker tries to edit the test, and runs fresh worker sessions until `verify.sh` exits 0.

- **Worker:** Starts a fresh session every iteration so failed attempts don't poison the next run. The frozen goal stays cached at the top of the prompt, and progress lives in git.
- **Verifier:** Runs your shell check. Product failures go back to a fresh worker. If your local environment is broken, the loop pauses for you instead of burning tokens on a missing tool.
- **Judge (optional):** Runs after `verify.sh` is green (`--review-gate`). Serious bugs go back for another round, while minor notes stay advisory so subjective taste never forces a loop.
- **You:** Describe the feature, set a budget cap, and let the harness run. You own the finish line and the scoreboard.

## How is Agent Looper different from looping in chat?

- Shell verify is the exit, not the LLM grading itself.
- Fresh context each iteration, not an accumulating chat thread.
- One-repo fix harness, not a team-ops factory.

## Which coding agents does Agent Looper work with?

Cursor, Cline, OpenCode, Pi, Codex, DSH, Muse, and Claude. Agent Looper detects what is installed and uses the subscriptions or keys you already have. OpenCode and Pi can also route through OpenRouter, Vercel, or Ollama. See [Harnesses](https://looper.dancingteeth.net/harnesses/) for setup and default models.

## How do worker and judge presets work?

Pair a cheap, fast worker with a stronger judge instead of burning a frontier model on every turn. Built-in presets include `minmax`, `balanced`, and `cursor` (Composer with Grok `grok-4.7` on Cursor). Leave `reviewRuntime` unset and the optional judge runs on the worker's own runtime—not Cursor by default. Set `reviewRuntime` to `cursor` for a Cursor judge, or configure any worker and judge pair in `loop.json`.

## What happens if the worker gets stuck?

When the same check keeps failing, the harness steps up reasoning effort and then switches to a stronger model. If a worker hangs or times out, it switches right away without waiting for the stuck-check count.

## What if the code is already broken?

Forward loops build a feature and check it. Reverse starts from a red check and repairs the code until it passes. Clean-room mode rebuilds toward the frozen goal from your tests and public API without copying broken internals.

## How do I start a loop from an idea?

- **If you see your coding agent's logo on this page:** describe the feature as a normal prompt and ask your agent to implement it **with Agent Looper**. It sets up the loop and runs until the check is green.
- **If you prefer the terminal:** run `pnpm exec agent-loop-setup` (a one-screen setup wizard) and `pnpm exec agent-loop-prompt` to generate frozen `GOAL.md` and `verify.sh` from your prompt.

## What do I get when a loop finishes?

A report card instead of a chat dump: how many times `verify.sh` rejected the work, whether a worker hung, what the judge flagged, and your **list** (public API rates, including prompt-cache) vs. **billed** spend so `$0` subscription turns still count toward budget caps. To check a running loop, run `agent-loop watch` or ask your agent to use the `check-running-loops` skill.

## Install Agent Looper

Requires Node 22+ and pnpm. Copy the prompt into your coding agent, or run the commands in your terminal.

### For agent

```
Set up Agent Looper in this repo for the feature I want.

Requirements: Node 22+ and pnpm.

1. Add @dancingteeth/agent-looper and the SDK for the coding agent on this machine (Cursor uses @cursor/sdk; detect Cursor, Cline, OpenCode, Pi, Codex, DSH, Muse, or Claude).
2. Keep @dancingteeth/agent-looper in package.json even if you gitignore `.cursor/loops`. Don't only npx it.
3. Use an API key already on this machine. Don't invent keys.
4. Ask me what I want, then implement it with Agent Looper: write GOAL.md and verify.sh, and run the loop until the check is green.
   (Terminal alternative: pnpm exec agent-loop-setup then pnpm exec agent-loop-prompt --out .cursor/loops/<task>.)
5. Start or resume the loop:
   pnpm exec agent-loop run .cursor/loops/<task> --runtime <cursor|cline|opencode|pi|codex|dsh|muse|claude> --review-gate
6. Review skill: blockers come back for the next iteration; advisory notes are my call. Don't loop on subjective taste.

Cursor example:

pnpm add -D @dancingteeth/agent-looper @cursor/sdk
export CURSOR_API_KEY=…
pnpm exec agent-loop-setup
pnpm exec agent-loop-prompt --out .cursor/loops/my-task
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

Agent Looper is free and MIT-licensed. If it saves you time:

1. Keep `@dancingteeth/agent-looper` in public `package.json` even if you gitignore the loop folder.
2. Open an issue or a PR when you hit a gap or a bug: https://github.com/dancingteeth/agent-looper/issues
3. Optional: set `AGENT_LOOPER_TELEMETRY=1` so we see real runs, not just npm downloads (off by default; [Privacy](https://looper.dancingteeth.net/privacy/)).

[Support on Ko-fi](https://ko-fi.com/dancingteeth)

## More

- [llms.txt](https://looper.dancingteeth.net/llms.txt)
- [Harnesses](https://looper.dancingteeth.net/harnesses/)
- [Developer resources](https://looper.dancingteeth.net/docs/)
- [Changelog (0.8.2)](https://github.com/dancingteeth/agent-looper/blob/main/CHANGELOG.md)
- [Embed API](https://github.com/dancingteeth/agent-looper/blob/main/docs/embed-api.md)
- [Security](https://github.com/dancingteeth/agent-looper/blob/main/SECURITY.md)
- [GitHub](https://github.com/dancingteeth/agent-looper)
- [npm](https://www.npmjs.com/package/@dancingteeth/agent-looper)
