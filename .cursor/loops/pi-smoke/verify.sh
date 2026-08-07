#!/usr/bin/env bash
set -euo pipefail
PROBE=".cursor/loops/pi-smoke/probe.txt"
if [[ ! -f "$PROBE" ]]; then
  echo "[verify] missing $PROBE"
  exit 1
fi
if [[ "$(tr -d '\r' <"$PROBE")" != "pi-smoke-ok" ]]; then
  echo "[verify] expected single line pi-smoke-ok in $PROBE"
  cat -A "$PROBE"
  exit 1
fi
echo "[verify] pi-smoke OK"
exit 0
