#!/usr/bin/env bash
# Metric-grind verify — exit 0 only when measured value meets THRESHOLD.
# Pair with templates/GOAL.metric.template.md. Customize MEASURE + THRESHOLD.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# --- configure ---
THRESHOLD_MS="${THRESHOLD_MS:-50}"
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
echo "[verify] measured=${VALUE} threshold_ms=${THRESHOLD_MS}"

step "2 — compare"
# bc if available; else integer-only awk
awk -v v="$VALUE" -v t="$THRESHOLD_MS" 'BEGIN {
  if (v+0 <= t+0) exit 0;
  print "[verify] FAIL: " v " > " t > "/dev/stderr";
  exit 1
}'

step "done — metric under threshold"
