#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() { echo "[verify] $*"; }

step "1 — typecheck"
pnpm exec tsc --noEmit

step "2 — focused tests"
pnpm exec vitest run \
  src/review/reviewReproduce.test.ts \
  src/review/reviewReproduceAgent.test.ts \
  src/review/loopPostReview.test.ts \
  src/review/reviewVerdict.test.ts \
  src/loop/loopConfig.test.ts \
  src/loop/agentLoop.test.ts

step "3 — full suite"
pnpm exec vitest run

step "done — reproduce-agent (M2b) verify passed"
