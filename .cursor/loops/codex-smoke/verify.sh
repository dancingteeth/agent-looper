#!/usr/bin/env bash
set -euo pipefail
PROBE=".cursor/loops/codex-smoke/probe.txt"
if [[ ! -f "$PROBE" ]]; then
  echo "[verify] missing $PROBE"
  exit 1
fi
if [[ "$(tr -d '\r' <"$PROBE")" != "codex-smoke-ok" ]]; then
  echo "[verify] expected single line codex-smoke-ok in $PROBE"
  cat -A "$PROBE"
  exit 1
fi
echo "[verify] codex-smoke OK"
exit 0
