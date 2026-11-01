#!/usr/bin/env bash
# agentbaton-handoff scoreboard — capable → efficient handoff (arXiv:2610.35959).
set -euo pipefail

BUNDLE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$BUNDLE/../../.." && pwd)"
cd "$ROOT"

fail() { echo "[verify] FAIL: $*" >&2; exit 1; }
step() { echo "[verify] $*"; }

step "1 — focused vitest (handoff + neighbors)"
pnpm exec vitest run \
  src/loop/loopHandoffReadiness.test.ts \
  src/loop/loopAgentConfig.test.ts \
  src/loop/loopConfig.test.ts \
  src/loop/agentLoop.test.ts \
  --reporter=dot || fail "focused vitest failed"

step "2 — typecheck"
pnpm typecheck || fail "typecheck failed"

step "3 — loop bundle parses with handoffModel"
node --input-type=module -e "
import { loadLoopBundle } from './dist/loop/loopConfig.js';
" 2>/dev/null || true
pnpm build >/dev/null 2>&1 || fail "build failed"
node --input-type=module -e "
import { loadLoopBundle } from './dist/loop/loopConfig.js';
const bundle = loadLoopBundle('.cursor/loops/agentbaton-handoff');
if (bundle.config.handoffModel !== 'opencode-go/deepseek-v4.1-flash') {
  console.error('[verify] handoffModel not parsed');
  process.exit(1);
}
console.log('[verify] loop bundle parses with handoffModel');
" || fail "loop bundle parse check failed"

echo "[verify] agentbaton-handoff green"
