#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() { echo "[verify] $*"; }

step "1 — typecheck"
pnpm exec tsc --noEmit

step "2 — focused tests"
pnpm exec vitest run \
  src/loop/loopRisk.test.ts \
  src/loop/loopRiskProfile.test.ts \
  src/review/reviewPrompt.test.ts \
  src/loop/loopConfig.test.ts \
  src/loop/loopPostSuccessReview.test.ts \
  src/loop/agentLoop.test.ts

step "3 — full suite"
pnpm exec vitest run

step "4 — review-preview smoke"
pnpm build
pnpm exec node dist/cli/review-preview.js .cursor/loops/example-fix --repo-root "$REPO_ROOT" | grep -q 'Risk:'

step "done — loop-risk-profiles verify passed"
