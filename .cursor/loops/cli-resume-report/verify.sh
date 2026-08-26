#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

fail() { echo "[verify] FAIL: $*" >&2; exit 1; }
step() { echo "[verify] $*"; }

step "1 — typecheck"
pnpm exec tsc --noEmit || fail "tsc --noEmit"

step "2 — focused tests"
pnpm exec vitest run \
  src/loop/loopReport.test.ts \
  src/loop/loopRunReport.test.ts \
  src/integrations/telegramNotify.test.ts \
  src/loop/loopFailureDomain.test.ts \
  || fail "focused vitest"

step "done — cli-resume-report verify passed"
