#!/usr/bin/env bash
# Metric-grind verify — exit 0 only when measured value meets THRESHOLD.
# Pair with templates/GOAL.metric.template.md. Customize MEASURE + THRESHOLD.
# Optional BASELINE_MS: fail (revert signal) when measured is worse than baseline (lower-is-better).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# --- configure (lower-is-better) ---
THRESHOLD_MS="${THRESHOLD_MS:-50}"
# Optional: fail (signal revert) when measured is worse than the pre-loop baseline.
BASELINE_MS="${BASELINE_MS:-}"
# Replace with your real measurement (must print a single integer/float on stdout):
MEASURE_CMD="${MEASURE_CMD:-echo 999}"

step() {
  echo "[verify] $*"
}

step "1 — measure"
VALUE="$(eval "$MEASURE_CMD" | tr -d '[:space:]')"
if [[ -z "$VALUE" || ! "$VALUE" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "[verify] FAIL: measure did not produce a number (got: ${VALUE:-empty})" >&2
  exit 1
fi
echo "[verify] measured=${VALUE} threshold_ms=${THRESHOLD_MS}${BASELINE_MS:+ baseline_ms=${BASELINE_MS}}"

if [[ -n "$BASELINE_MS" ]]; then
  step "2 — revert if worse than baseline"
  awk -v v="$VALUE" -v b="$BASELINE_MS" 'BEGIN {
    if (v+0 > b+0) {
      print "[verify] FAIL: " v " worse than baseline " b " — revert the last change" > "/dev/stderr";
      exit 1
    }
    exit 0
  }'
fi

step "3 — compare to threshold"
awk -v v="$VALUE" -v t="$THRESHOLD_MS" 'BEGIN {
  if (v+0 <= t+0) exit 0;
  print "[verify] FAIL: " v " > " t > "/dev/stderr";
  exit 1
}'

step "done — metric under threshold"
