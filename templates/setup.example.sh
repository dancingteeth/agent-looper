#!/usr/bin/env bash
# Optional harness bootstrap — run once before the first worker.
# Point loop.json `setup` at this file, or name it setup.sh beside GOAL.md.
# Failure parks the loop (status waiting) and does not spawn a worker.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "VERIFY_CLASS=env missing $1" >&2
    exit 75
  fi
}

need node
# need pnpm
# pnpm install --frozen-lockfile

echo "[setup] toolchain ok"
