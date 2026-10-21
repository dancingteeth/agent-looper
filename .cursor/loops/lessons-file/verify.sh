#!/usr/bin/env bash
# Frozen scoreboard for loop lessons-file. Exit 0 = finish line met.
# Exit 75 = environment problem (parks the loop); any other non-zero = product failure.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

LOOP_DIR=".cursor/loops/lessons-file"
BASE_COMMIT="c4e7195"
ACC_SRC="$LOOP_DIR/acceptance.ts.txt"
ACC_SHA="3ee1f55b657e534decb9801eccf211bccc5818a0b2051e52b6fc86097c5d9208"
ACC_DIR="src/loop/__acceptance__"
ACC_DST="$ACC_DIR/lessonsFile.acceptance.test.ts"
COV_LOG="${TMPDIR:-/tmp}/lessons-file-coverage.log"

step() { echo "[verify] $*"; }
fail() { echo "[verify] FAIL: $*" >&2; exit 1; }
envfail() { echo "VERIFY_CLASS=env"; echo "[verify] ENV: $*" >&2; exit 75; }
cleanup() { rm -f "$ACC_DST"; rmdir "$ACC_DIR" 2>/dev/null || true; }
trap cleanup EXIT

step "0 — toolchain"
command -v pnpm >/dev/null || envfail "pnpm not on PATH"
[[ -d node_modules ]] || envfail "node_modules missing — run pnpm install --frozen-lockfile"
git cat-file -e "$BASE_COMMIT^{commit}" 2>/dev/null || envfail "base commit $BASE_COMMIT not in this clone"

step "1 — frozen acceptance spec is untouched"
[[ -f "$ACC_SRC" ]] || fail "$ACC_SRC is missing"
echo "$ACC_SHA  $ACC_SRC" | sha256sum -c --quiet - || fail "$ACC_SRC was edited (sha256 mismatch)"

step "2 — implementation + your own test files exist"
[[ -f src/loop/loopLessons.ts ]] || fail "src/loop/loopLessons.ts does not exist"
[[ -f src/loop/loopLessons.test.ts ]] || fail "src/loop/loopLessons.test.ts does not exist"

step "3 — typecheck (repo + acceptance spec against the real API)"
mkdir -p "$ACC_DIR"
cp "$ACC_SRC" "$ACC_DST"
pnpm -s typecheck || fail "typecheck failed (the frozen acceptance spec must compile against the API in GOAL.md)"

step "4 — frozen acceptance spec + targeted tests"
pnpm exec vitest run "$ACC_DST" src/loop/loopLessons.test.ts src/loop/loopPrompt.test.ts src/loop/agentLoop.test.ts src/loop/loopFrozenFiles.test.ts src/loop/loopMeta.test.ts src/loop/loopFailureContext.test.ts \
  || fail "acceptance or targeted tests failed"
cleanup

step "5 — full suite with coverage gate (thresholds 81/69/87/80)"
pnpm -s test:coverage > "$COV_LOG" 2>&1 || { tail -60 "$COV_LOG"; fail "pnpm test:coverage failed (a test or a coverage threshold)"; }
tail -5 "$COV_LOG"

step "6 — coverage config unchanged"
git diff --quiet "$BASE_COMMIT" -- vitest.config.ts || fail "vitest.config.ts changed — thresholds/excludes may not move in this loop"

step "7 — wiring greps"
grep -q "loopLessons.js" src/loop/agentLoop.ts || fail "agentLoop.ts does not import loopLessons.js"
grep -q "recordGreenRunLessons" src/loop/agentLoop.ts || fail "agentLoop.ts never calls recordGreenRunLessons"
grep -q "lessons" src/loop/loopPrompt.ts || fail "loopPrompt.ts does not take lessons"
grep -q "lessons:" src/loop/loopConfig.ts || fail "loopConfig.ts has no lessons option"
grep -q "lessons.md" README.md || fail "README.md does not document lessons.md"
grep -q "lessons.md" CHANGELOG.md || fail "CHANGELOG.md has no Unreleased entry mentioning lessons.md"

step "8 — out-of-scope files unchanged"
git diff --quiet "$BASE_COMMIT" -- src/loop/loopFailureContext.ts src/loop/loopMeta.ts || fail "out-of-scope file changed: src/loop/loopFailureContext.ts src/loop/loopMeta.ts"

step "9 — no Gemini/Gemma added (tracked diff + new files)"
added_lines() {
  git diff "$BASE_COMMIT" -- src README.md docs templates | grep '^+' || true
  git ls-files --others --exclude-standard -- src docs templates | while read -r f; do cat "$f"; done
}
if added_lines | grep -qi 'gemini'; then fail "change adds a Gemini reference"; fi
if added_lines | grep -qi 'gemma'; then fail "change adds a Gemma reference"; fi

step "done — lessons-file finish line met"
