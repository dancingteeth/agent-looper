#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() { echo "[verify] $*"; }

step "1 — typecheck"
pnpm exec tsc --noEmit

step "2 — focused tests"
pnpm exec vitest run \
  src/loop/loopPostSuccessReview.test.ts \
  src/loop/agentLoop.test.ts \
  src/review/loopPostReview.test.ts

step "3 — full suite"
pnpm exec vitest run

step "done — post-success-review extract verify passed"
