#!/usr/bin/env bash
# Verifier for cli-watch — live progress lines + Watch snapshot (no PTY).
set -euo pipefail

BUNDLE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$BUNDLE/../../.." && pwd)"
cd "$ROOT"

fail() { echo "[verify] FAIL: $*" >&2; exit 1; }
step() { echo "[verify] $*"; }

step "1 — typecheck"
pnpm exec tsc --noEmit || fail "tsc --noEmit"

step "2 — focused tests (Watch / phase hook / runArgs dispatch)"
pnpm exec vitest run \
  src/cli/setupTui.test.tsx \
  src/cli/runArgs.test.ts \
  src/loop/agentLoop.test.ts \
  src/cli/watchTui.test.tsx \
  src/loop/loopWatch.test.ts \
  src/cli/watchArgs.test.ts \
  || fail "focused vitest"

step "3 — build CLI"
pnpm build || fail "pnpm build"

RUN="$ROOT/dist/cli/run.js"
[ -f "$RUN" ] || fail "missing $RUN"

step "4 — watch --help"
HELP="$(node "$RUN" watch --help 2>&1 || true)"
echo "$HELP" | grep -qi 'watch' || fail "--help does not mention watch"
echo "$HELP" | grep -qi 'snapshot' || fail "--help does not mention --snapshot"
echo "$HELP" | grep -qiE 'plain' || fail "--help does not mention --plain"

step "5 — watch --snapshot against a fixture log"
# log.ndjson is gitignored under .cursor/loops/** — copy the committed snapshot.ndjson
FIX_SRC="$BUNDLE/fixtures/snapshot-loop/snapshot.ndjson"
[ -f "$FIX_SRC" ] || fail "missing fixture $FIX_SRC"
FIX="$(mktemp -d)"
cp "$FIX_SRC" "$FIX/log.ndjson"
SNAP="$(node "$RUN" watch --snapshot "$FIX" --repo-root "$ROOT" 2>&1)" || fail "watch --snapshot exited non-zero"
rm -rf "$FIX"
echo "$SNAP" | grep -qiE 'WORKER|VERIFY' || {
  echo "[verify] snapshot stdout:"
  echo "$SNAP"
  fail "snapshot output lacks WORKER or VERIFY"
}

step "done — cli-watch verify passed"
