#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() { echo "[verify] $*"; }

step "1 — templates exist"
test -f templates/GOAL.computer-use.template.md
test -f templates/verify.computer-use.example.sh
test -x templates/verify.computer-use.example.sh || chmod +x templates/verify.computer-use.example.sh

step "2 — llms.txt lists computer-use templates"
rg -q 'GOAL.computer-use.template.md' llms.txt
rg -q 'verify.computer-use.example.sh' llms.txt

step "3 — docs mention computer-use / visible verify"
rg -q 'computer-use|visible UI' docs/competitive-steal-backlog.md docs/verification-as-skill.md

step "4 — example verify script is runnable (stub)"
bash templates/verify.computer-use.example.sh

step "done — computer-use-verify-example verify passed"
