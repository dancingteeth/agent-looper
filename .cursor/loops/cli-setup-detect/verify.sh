#!/usr/bin/env bash
# Verifier for cli-setup-detect. Also re-runs the shipped wizard verifier so
# detect/dump cannot regress --answers fixtures.
set -euo pipefail

BUNDLE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$BUNDLE/../../.." && pwd)"
ALOOP="${AGENT_LOOP_REPO:-$ROOT}"
cd "$ROOT"

fail() { echo "[verify] FAIL: $*" >&2; exit 1; }
step() { echo "[verify] $*"; }

step "0 — existing wizard fixtures still pass"
bash "$ROOT/.cursor/loops/cli-setup-wizard/verify.sh" || fail "cli-setup-wizard verify regressed"

step "1 — typecheck"
pnpm exec tsc --noEmit || fail "tsc --noEmit"

step "2 — focused setup tests"
pnpm exec vitest run \
  src/cli/setup.test.ts \
  src/cli/setupFlow.test.ts \
  src/cli/detectRuntimes.test.ts \
  || fail "focused vitest"

WIZARD="$ALOOP/dist/cli/setup.js"
[ -f "$WIZARD" ] || fail "wizard not built (cli-setup-wizard verify should have built it)"

step "3 — --help mentions dry-run + detect"
HELP="$(node "$WIZARD" --help 2>&1 || true)"
echo "$HELP" | grep -qi 'dry-run' || fail "--help lacks --dry-run"
echo "$HELP" | grep -qiE 'detect' || fail "--help lacks detection wording"

step "4 — --dry-run --answers prints dump and writes nothing"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/answers.json" <<'JSON'
{
  "runtime": "opencode",
  "model": "opencode-go/deepseek-v4-flash",
  "maxIterations": 5,
  "verify": "bash .cursor/loops/example/verify.sh"
}
JSON
mkdir -p "$TMP/out" "$TMP/repo"
if ! (cd "$ROOT" && node "$WIZARD" --dry-run --answers "$TMP/answers.json" --out "$TMP/out" --repo-root "$TMP/repo" >"$TMP/stdout.txt" 2>&1); then
  cat "$TMP/stdout.txt" >&2
  fail "--dry-run --answers exited non-zero"
fi
grep -q '"runtime"' "$TMP/stdout.txt" || {
  cat "$TMP/stdout.txt" >&2
  fail "dry-run stdout has no loop.json dump"
}
[ ! -f "$TMP/out/loop.json" ] || fail "dry-run wrote loop.json"
[ ! -f "$TMP/repo/.cursor/agent-loop.repo.json" ] || fail "dry-run wrote repo profile"

step "done — cli-setup-detect verify passed"
