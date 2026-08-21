---
name: loop-verify-dsh-plugin
description: Verify the DeepSeek Harness companion plugin for Agent Looper.
---

# Verify — dsh-plugin

## Rules

1. Verifier wins — exit `0` from `verify.sh` only.
2. Fail → fix → rerun.
3. No partial handoff.
4. Scope: `plugins/dsh-agent-looper/` Cordis bundle + docs. No `runtime: dsh`, no live `dsh web`.

## Checklist

```bash
bash .cursor/loops/dsh-plugin/verify.sh
```
