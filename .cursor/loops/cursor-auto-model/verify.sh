#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() { echo "[verify] $*"; }

step "1 — typecheck"
pnpm exec tsc --noEmit

step "2 — either Auto wired in loopAgentConfig OR research doc"
if rg -q 'auto|Auto|router' src/loop/loopAgentConfig.ts 2>/dev/null && \
   rg -q 'routed|Auto' src/loop/loopAgentConfig.ts docs/competitive-steal-backlog.md; then
  echo "[verify] Auto opt-in appears in loopAgentConfig — running agent config tests"
  pnpm exec vitest run src/loop/loopAgentConfig.test.ts
elif test -f docs/cursor-auto-router.md && rg -qi 'sdk|blocked|routed' docs/cursor-auto-router.md; then
  echo "[verify] research doc path (SDK not ready)"
  rg -qi 'composer-2.5' docs/cursor-auto-router.md
else
  echo "[verify] FAIL: need Auto wiring with tests OR docs/cursor-auto-router.md" >&2
  exit 1
fi

step "3 — dogfood default still composer-2.5"
rg -q "CURSOR_LOOP_MODEL = 'composer-2.5'" src/loop/loopAgentConfig.ts

step "4 — backlog notes Auto status"
rg -q 'Cursor Auto|Router' docs/competitive-steal-backlog.md

step "done — cursor-auto-model verify passed"
