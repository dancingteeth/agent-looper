#!/usr/bin/env bash
# Smoke-check P3/P4 competitive steals (docs/templates + harness hooks that must still work).
# Usage: bash scripts/check-steal-backlog.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fail=0

ok() { printf 'OK  %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fail=1; }

require_file() {
  if [[ -f "$1" ]]; then ok "file $1"
  else bad "missing $1"
  fi
}

require_grep() {
  local file="$1" pattern="$2" label="$3"
  if [[ -f "$file" ]] && grep -Eq "$pattern" "$file"; then ok "$label"
  else bad "$label ($file ~ /$pattern/)"
  fi
}

echo "== P4 Agent Behavior artifacts =="
require_file templates/REVIEWS.md
require_grep templates/REVIEWS.md 'Specs ≠ prompts|Specs != prompts' 'specs≠prompts in templates/REVIEWS.md'
require_grep templates/REVIEWS.md '\*\*Intent\*\*' 'five-dimension Intent in templates/REVIEWS.md'
require_grep templates/REVIEWS.md '\*\*Evidence\*\*' 'five-dimension Evidence'
require_grep templates/REVIEWS.md '\*\*Recovery\*\*' 'five-dimension Recovery'
require_grep templates/REVIEWS.md '\*\*NA\*\*|as \*\*NA\*\*' 'NA language in templates/REVIEWS.md'
require_grep AGENTS.md 'retire ones the worker stops failing|Project-specific laws' 'prompt-diet covers REVIEWS laws'
require_grep README.intro.md 'Specs ≠ prompts|Specs != prompts' 'specs≠prompts in README.intro.md'
require_grep REVIEWS.md 'five-dimension|Specs ≠ prompts|judge standard' 'dogfood REVIEWS.md points at P4'

echo
echo "== P3 Linear governance artifacts =="
require_file templates/LOOP.permissions.example.md
require_file docs/unknowns-preflight.md
require_grep docs/unknowns-preflight.md 'Prove in chat' 'prove→freeze section'
require_grep docs/unknowns-preflight.md 'draft' 'draft-until-freeze language'
require_grep templates/LOOP.permissions.example.md 'default-deny|Default-deny|\*\*Deny\*\*' 'permissions default-deny'
require_grep templates/LOOP.permissions.example.md 'MCP' 'permissions mentions MCP'
require_grep README.intro.md 'run-report\.md' 'run-report as audit surface in intro'
require_grep README.intro.md 'LOOP\.permissions' 'permissions template linked from intro'
require_grep docs/competitive-steal-backlog.md 'P3 — M9' 'P3 section present'
require_grep docs/competitive-steal-backlog.md 'P4 — Agent Behavior' 'P4 section present'

echo
echo "== Relative links resolve =="
for link in \
  docs/unknowns-preflight.md \
  templates/LOOP.permissions.example.md \
  templates/REVIEWS.md \
  docs/competitive-steal-backlog.md
do
  require_file "$link"
done

echo
echo "== Harness hooks (executable) =="
if command -v pnpm >/dev/null 2>&1; then
  pnpm exec vitest run \
    src/review/loopPostReview.test.ts \
    src/review/reviewPrompt.test.ts \
    src/loop/loopRunReport.test.ts \
    src/loop/loopRiskProfile.test.ts
  ok 'focused vitest (review embed + run-report + risk profile)'
else
  bad 'pnpm not found — skip vitest'
fi

# Dogfood REVIEWS.md must still load for this repo (judge path).
if [[ -f REVIEWS.md ]] && grep -q 'Loop risk inference' REVIEWS.md; then
  ok 'dogfood REVIEWS.md has Loop risk inference (auto review)'
else
  bad 'dogfood REVIEWS.md missing Loop risk inference'
fi

# export-run CLI present in package bins
if grep -q 'agent-loop-export-run' package.json; then
  ok 'agent-loop-export-run bin declared'
else
  bad 'agent-loop-export-run missing from package.json bins'
fi

echo
if [[ "$fail" -ne 0 ]]; then
  echo "check-steal-backlog: FAILED"
  exit 1
fi
echo "check-steal-backlog: PASSED"
