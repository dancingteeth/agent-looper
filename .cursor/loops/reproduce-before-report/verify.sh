#!/usr/bin/env bash
# Dogfood verifier for reproduce-before-report (M2 phase 2a).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() {
  echo "[verify] $*"
}

step "1 — typecheck"
pnpm exec tsc --noEmit

step "2 — review + config unit tests"
pnpm exec vitest run \
  src/review/reviewVerdict.test.ts \
  src/review/reviewReproduce.test.ts \
  src/review/loopPostReview.test.ts \
  src/loop/loopConfig.test.ts \
  src/loop/agentLoop.test.ts

step "3 — full suite smoke (harness integrity)"
pnpm exec vitest run

step "done — reproduce-before-report verify passed"
