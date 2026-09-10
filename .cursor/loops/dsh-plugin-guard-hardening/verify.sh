#!/usr/bin/env bash
# Frozen scoreboard for loop dsh-plugin-guard-hardening.
# Exit 0 only when the extended guard contract holds AND the previous loop's contract still holds.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

PLUGIN_DIR="plugins/dsh-agent-looper"
LOOP_DIR=".cursor/loops/dsh-plugin-guard-hardening"
PREV_PROBE=".cursor/loops/dsh-plugin-advisories/probe.mjs"
CI_FILE=".github/workflows/ci.yml"

step() { echo "[verify] $*"; }
fail() { echo "[verify] FAIL: $*" >&2; exit 1; }

step "1 — plugin compiles and emits dist (the artifact DSH loads)"
pnpm exec tsc -p "$PLUGIN_DIR/tsconfig.json" || fail "plugin tsc failed"
[[ -f "$PLUGIN_DIR/dist/index.js" ]] || fail "plugin dist/index.js was not emitted"
[[ -f "$PLUGIN_DIR/dist/nested-run.js" ]] || fail "plugin dist/nested-run.js was not emitted"

step "2 — frozen guard + lifecycle probe (extended contract)"
node "$LOOP_DIR/probe.mjs" || fail "extended probe failed (see cases above)"

step "3 — previous loop's probe (regression gate; lifecycle count corrected to 7)"
node "$PREV_PROBE" || fail "regression probe failed (see cases above)"

step "4 — plugin unit tests"
pnpm exec vitest run "$PLUGIN_DIR" || fail "plugin unit tests failed"

step "5 — dead export stays removed"
if grep -rq 'dshBashGuardReason' "$PLUGIN_DIR/src"; then
  fail "dshBashGuardReason is present again (uncalled dead code)"
fi

step "6 — CI keeps compiling the plugin"
grep -q 'plugins/dsh-agent-looper/tsconfig.json' "$CI_FILE" \
  || fail "$CI_FILE must compile $PLUGIN_DIR/tsconfig.json"

step "done — residual guard bypasses closed"
