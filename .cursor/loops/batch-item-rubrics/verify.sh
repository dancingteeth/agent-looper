#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() { echo "[verify] $*"; }

step "1 — typecheck"
pnpm exec tsc --noEmit

step "2 — focused tests"
pnpm exec vitest run \
  src/loop/loopBatch.test.ts \
  src/loop/loopPrompt.test.ts \
  src/loop/agentLoop.test.ts

step "3 — schema accepts string | {path,rubric}"
pnpm exec vitest run src/loop/loopBatch.test.ts -t 'rubric'

step "done — batch-item-rubrics verify passed"
