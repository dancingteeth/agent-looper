#!/usr/bin/env bash
# Measurable verification for this loop — invoked by loop.json "verify".
# Customize each step; any failure must exit non-zero.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() {
  echo "[verify] $*"
}

step "1 — replace with your fast guard (unit test, lint, grep)"
# Example:
# pnpm vitest run src/path/to.test.ts

step "2 — replace with typecheck/build if needed"
# Example:
# pnpm exec tsc --noEmit

step "3 — optional integration/smoke"
# Example:
# curl -fsS http://localhost:3000/health

step "done — all checks passed (edit this script before relying on it)"
