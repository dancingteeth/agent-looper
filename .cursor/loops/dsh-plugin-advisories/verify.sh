#!/usr/bin/env bash
# Frozen scoreboard for loop dsh-plugin-advisories.
# Exit 0 only when the DSH companion guard contract holds. See GOAL.md.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

PLUGIN_DIR="plugins/dsh-agent-looper"
LOOP_DIR=".cursor/loops/dsh-plugin-advisories"
CI_FILE=".github/workflows/ci.yml"

step() { echo "[verify] $*"; }
fail() { echo "[verify] FAIL: $*" >&2; exit 1; }

step "1 — plugin compiles and emits dist (the artifact DSH loads)"
pnpm exec tsc -p "$PLUGIN_DIR/tsconfig.json" || fail "plugin tsc failed"
[[ -f "$PLUGIN_DIR/dist/index.js" ]] || fail "plugin dist/index.js was not emitted"
[[ -f "$PLUGIN_DIR/dist/nested-run.js" ]] || fail "plugin dist/nested-run.js was not emitted"

step "2 — frozen guard + lifecycle probe"
node "$LOOP_DIR/probe.mjs" || fail "frozen probe failed (see cases above)"

step "3 — plugin unit tests"
pnpm exec vitest run "$PLUGIN_DIR" || fail "plugin unit tests failed"

step "4 — dead export removed"
if grep -rq 'dshBashGuardReason' "$PLUGIN_DIR/src"; then
  fail "dshBashGuardReason is still present (uncalled dead code)"
fi

step "5 — CI keeps compiling the plugin"
grep -q 'plugins/dsh-agent-looper/tsconfig.json' "$CI_FILE" \
  || fail "$CI_FILE must compile $PLUGIN_DIR/tsconfig.json"

step "done — dsh-plugin advisories closed"
