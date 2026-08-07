#!/usr/bin/env bash
# Optional extras for loops whose worker may invent deps or touch secrets.
# Copy steps into verify.sh / finalVerify — keep the fixed floor first.
# Source pattern: NVIDIA “validated coding assistant” (CI outside the model).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

step() {
  echo "[verify] $*"
}

step "0 — fixed floor (always keep these)"
# pnpm vitest run path/to.test.ts
# pnpm exec tsc --noEmit

step "1 — secret scan (when the loop may touch credentials)"
# gitleaks detect --source . --no-git -v
# or: rg -n 'AKIA[0-9A-Z]{16}|BEGIN (RSA |OPENSSH )?PRIVATE KEY' --glob '!node_modules/**'

step "2 — hallucinated / brand-new dependency (slopsquatting) check"
# Prefer a maintained scanner when available, pinned:
#   pnpm dlx dep-hallucinator@<pin> scan package.json
#   # or: slopgate scan . --added-only --base-ref origin/main
# Minimal fallback — fail if lockfile was not updated with package.json:
# if git diff --name-only origin/main...HEAD | grep -qE 'package\.json$'; then
#   git diff --name-only origin/main...HEAD | grep -qE 'pnpm-lock\.yaml|package-lock\.json|yarn\.lock' \
#     || { echo '[verify] package.json changed without lockfile'; exit 1; }
# fi

step "3 — block VCS / URL package installs in the diff (optional)"
# if git diff origin/main...HEAD -- 'package.json' '**/package.json' \
#   | grep -E '^\+.*"\s*(git\+|https?://|file:)'; then
#   echo '[verify] non-registry package install in diff'
#   exit 1
# fi

step "done — enable only the steps this loop needs"
