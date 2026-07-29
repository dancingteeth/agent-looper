#!/usr/bin/env bash
# Computer-use / visible UI verify — shell floor + optional UI hooks.
# Pair with templates/GOAL.computer-use.template.md.
#
# Default: headless-safe stub (CI without display). Set RUN_UI=1 and wire
# PLAYWRIGHT_CMD or COMPUTER_USE_CMD when driving a real browser locally.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# --- configure ---
# Shell floor marker: replace with your fast guard (unit test, grep, file check).
SHELL_FLOOR_CMD="${SHELL_FLOOR_CMD:-test -f templates/GOAL.computer-use.template.md}"

# Optional UI hooks (skipped unless RUN_UI=1 and command is set):
#   PLAYWRIGHT_CMD='npx playwright test e2e/smoke.spec.ts'
#   COMPUTER_USE_CMD='./scripts/computer-use-verify.sh'  # your Cursor/computer-use wrapper
RUN_UI="${RUN_UI:-0}"
PLAYWRIGHT_CMD="${PLAYWRIGHT_CMD:-}"
COMPUTER_USE_CMD="${COMPUTER_USE_CMD:-}"

step() {
  echo "[verify] $*"
}

step "1 — shell floor (always)"
if ! eval "$SHELL_FLOOR_CMD"; then
  echo "[verify] FAIL: shell floor check failed" >&2
  exit 1
fi
echo "[verify] shell floor passed"

step "2 — visible UI hooks (optional)"
if [[ "$RUN_UI" != "1" ]]; then
  echo "[verify] SKIP UI — RUN_UI!=1 (headless CI default)"
elif [[ -n "$PLAYWRIGHT_CMD" ]]; then
  echo "[verify] running Playwright: $PLAYWRIGHT_CMD"
  eval "$PLAYWRIGHT_CMD"
elif [[ -n "$COMPUTER_USE_CMD" ]]; then
  echo "[verify] running computer-use: $COMPUTER_USE_CMD"
  eval "$COMPUTER_USE_CMD"
else
  echo "[verify] SKIP UI — RUN_UI=1 but no PLAYWRIGHT_CMD or COMPUTER_USE_CMD set"
fi

step "done — computer-use verify passed (shell floor met)"
