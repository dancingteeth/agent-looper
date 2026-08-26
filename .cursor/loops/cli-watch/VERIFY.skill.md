---
name: loop-verify
description: Verify the cli-watch live-progress loop. Use when implementing under .cursor/loops/cli-watch/.
---

# cli-watch verification

Hard gate: `loop.json` → `verify` (`bash .cursor/loops/cli-watch/verify.sh`).

## Checklist

1. `pnpm exec tsc --noEmit`
2. `pnpm exec vitest run` on Watch / phase / runArgs tests listed in `verify.sh`
3. `pnpm build`
4. `node dist/cli/run.js watch --help` mentions watch, --snapshot, --plain
5. Copy `fixtures/snapshot-loop/snapshot.ndjson` to a temp `log.ndjson` and run `watch --snapshot` (prints WORKER or VERIFY). Never commit `log.ndjson` under `.cursor/loops/`.

Do not skip the snapshot CLI. Do not require a PTY or a live agent run.
