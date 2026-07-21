#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() { echo "[verify] $*"; }

step "1 — typecheck"
pnpm exec tsc --noEmit

step "2 — focused tests"
pnpm exec vitest run \
  src/review/metaReview.test.ts \
  src/review/metaReviewPrompt.test.ts \
  src/cli/meta-review.test.ts \
  src/review/loopPostReview.test.ts \
  src/loop/loopConfig.test.ts

step "3 — full suite"
pnpm exec vitest run

step "4 — CLI help smoke"
node dist/cli/meta-review.js --help >/dev/null

step "done — meta-review (M5) verify passed"
