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
  src/loop/loopConfig.test.ts \
  src/cli/runArgs.test.ts \
  src/loop/agentLoop.test.ts \
  src/usage/loopUsage.test.ts \
  || fail "focused vitest"

step "3 — README documents maxCostUsd"
grep -q 'maxCostUsd' README.md || fail "README.md has no maxCostUsd row"

step "done — cli-max-cost verify passed"
