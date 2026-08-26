#!/usr/bin/env bash
# Smoke-check P3–P8 competitive steals (docs/templates + harness hooks that must still work).
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
echo "== P5 NVIDIA / validated-assistant artifacts =="
require_file templates/verify.ai-assisted.example.sh
require_grep docs/competitive-steal-backlog.md 'P5 — NVIDIA' 'P5 section present'
require_grep templates/LOOP.permissions.example.md 'Model ≠ security|model ≠ security' 'permissions model≠control plane'
require_grep templates/LOOP.permissions.example.md 'Human-only paths|registry' 'permissions human-only / registry installs'
require_grep templates/REVIEWS.md 'not a security sandbox|model ≠' 'REVIEWS judge≠sandbox'
require_grep docs/verification-as-skill.md 'slopsquat|verify\.ai-assisted' 'verification AI-assisted extras'
require_grep README.intro.md 'verify\.ai-assisted|control plane' 'intro links AI-assisted / control plane'

echo
echo "== P6 TrueForge lean-context artifacts =="
require_grep docs/competitive-steal-backlog.md 'P6 — TrueForge' 'P6 section present'
require_grep docs/competitive-steal-backlog.md 'verifyLogMode: "sidecar"' 'P6 sidecar verify row'
require_grep README.md 'verifyLogMode' 'README documents verifyLogMode'
require_grep README.md 'Default stays' 'README keeps sidecar optional / inline default'
require_grep docs/verification-as-skill.md 'Verify log mode' 'verification-as-skill documents sidecar'
require_grep docs/competitive-steal-backlog.md 'Progressive skill disclosure' 'P6 progressive skills row'
require_grep README.md 'skillDisclosure' 'README documents skillDisclosure'
require_grep docs/agent-plugins.md 'skillDisclosure' 'agent-plugins documents index vs inline'
require_grep src/loop/loopSkills.ts 'Skills \(index\)' 'skill index prompt heading'
require_grep docs/competitive-steal-backlog.md 'Same-task runtime cost bench' 'P6 cost bench row'
require_grep docs/competitive-steal-backlog.md 'runtime: trueforge' 'P6 skips TrueForge runtime'
require_grep docs/competitive-steal-backlog.md 'Context compaction' 'P6 skips compaction'
require_grep docs/runtime-map.md 'TrueForge' 'runtime-map skip lists TrueForge'
require_grep src/loop/loopExtensions.ts 'VERIFY_SIDECAR_DIR' 'sidecar writes verify-logs'
require_grep src/loop/loopExtensions.ts 'sidecarPreview' 'sidecar prompt preview'
require_grep docs/competitive-steal-backlog.md 'Replay one frozen run' 'P6 folds Nouri replay-evals'
require_file docs/runtime-cost-bench.md
require_grep docs/runtime-cost-bench.md 'n ≥ 3|n≥3' 'cost-bench n≥3 protocol'
require_grep README.intro.md 'runtime-cost-bench' 'intro links cost bench'
require_grep README.md 'runtime-cost-bench' 'README links cost bench'
require_grep README.md 'four-part finish line' 'README loop bundle four-part GOAL'
require_grep README.md 'optional \*\*golden\*\*|optional golden' 'README mentions golden'
require_grep docs/verification-as-skill.md 'BASELINE_MS' 'verification-as-skill metric revert'
require_grep docs/verification-as-skill.md 'four-part finish line' 'verification-as-skill four-part GOAL'
require_grep docs/verification-as-skill.md 'Golden' 'verification-as-skill golden'

echo
echo "== P7 Nouri / ultraprompt authoring artifacts =="
require_grep docs/competitive-steal-backlog.md 'P7 — Nouri' 'P7 section present'
require_grep docs/competitive-steal-backlog.md 'Revert condition' 'P7 revert-condition row'
require_grep docs/competitive-steal-backlog.md 'Four-part finish line' 'P7 four-part GOAL row'
require_grep docs/competitive-steal-backlog.md 'Optional golden artifact' 'P7 golden-artifact row'
require_grep docs/competitive-steal-backlog.md "Don't stop until utterly perfect" 'P7 skips perfect-until-done'
require_grep docs/competitive-steal-backlog.md 'Ultraprompting skill that writes more prompt' 'P7 skips prompt-writing skill'
require_grep templates/GOAL.template.md 'Finish line \(four parts\)' 'GOAL.template four-part table'
require_grep templates/GOAL.template.md '## Golden' 'GOAL.template Golden section'
require_grep templates/GOAL.metric.template.md '\*\*Revert\*\*' 'metric template revert row'
require_grep templates/verify.metric.example.sh 'BASELINE_MS' 'metric verify baseline/revert'
require_grep templates/GOAL.example.md '## Golden' 'GOAL.example Golden section'
require_grep plugins/agent-looper/skills/design-loop/SKILL.md 'Four-part finish line' 'Cursor design-loop four-part'
require_grep plugins/dsh-agent-looper/skills/design-loop/SKILL.md 'Four-part finish line' 'DSH design-loop four-part'
require_grep docs/unknowns-preflight.md 'Optional \*\*golden\*\*' 'unknowns preflight golden'

echo
echo "== P8 Fowler / Horthy context artifacts =="
require_file templates/RESEARCH.example.md
require_grep docs/competitive-steal-backlog.md 'P8 — Fowler' 'P8 section present'
require_grep docs/competitive-steal-backlog.md 'indexed in the worker prompt' 'P8 RESEARCH.md row'
require_grep docs/competitive-steal-backlog.md 'Incorrect info is worse than missing' 'P8 incorrect-info row'
require_grep docs/competitive-steal-backlog.md 'Steering loop: sensor before prompt' 'P8 steering-loop row'
require_grep docs/competitive-steal-backlog.md 'Research → Plan → Implement as inner-loop' 'P8 skips inner RPI'
require_grep docs/competitive-steal-backlog.md 'Force TDD inside the worker prompt' 'P8 skips TDD-in-prompt'
require_grep docs/competitive-steal-backlog.md '40–60% context-utilization' 'P8 skips utilization gate'
require_grep docs/unknowns-preflight.md 'Brownfield research' 'unknowns preflight brownfield research'
require_grep docs/unknowns-preflight.md 'steer the harness' 'unknowns preflight steering loop'
require_grep templates/GOAL.template.md '## Research \(optional' 'GOAL.template Research section'
require_grep templates/GOAL.example.md '## Research \(optional' 'GOAL.example Research section'
require_grep templates/REVIEWS.md 'do not invent a diagnosis' 'REVIEWS cite-capture not diagnosis'
require_grep templates/REVIEWS.md 'computational check in' 'REVIEWS steering: sensor before law'
require_grep REVIEWS.md 'Repeated worker mistakes belong in' 'dogfood REVIEWS steering'
require_grep ARCHITECTURE.md 'Incorrect injected context' 'ARCHITECTURE context rank'
require_grep README.md '`research`' 'README documents research field'
require_grep README.intro.md 'RESEARCH.md' 'intro links RESEARCH template'
require_grep plugins/agent-looper/skills/design-loop/SKILL.md 'Research' 'Cursor design-loop research'
require_grep plugins/dsh-agent-looper/skills/design-loop/SKILL.md 'Research' 'DSH design-loop research'
require_grep src/loop/loopResearch.ts '## Research \(index\)' 'research index prompt heading'
require_grep src/loop/loopExtensions.ts 'research: z.string' 'loop.json research field'

echo
echo "== Relative links resolve =="
for link in \
  docs/unknowns-preflight.md \
  templates/LOOP.permissions.example.md \
  templates/REVIEWS.md \
  templates/verify.ai-assisted.example.sh \
  docs/competitive-steal-backlog.md \
  docs/runtime-cost-bench.md \
  templates/RESEARCH.example.md
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
    src/loop/loopRiskProfile.test.ts \
    src/loop/loopSkills.test.ts \
    src/loop/loopResearch.test.ts \
    src/loop/loopPrompt.test.ts \
    src/loop/loopConfig.test.ts
  ok 'focused vitest (review embed + run-report + risk profile + skills/research index)'
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
