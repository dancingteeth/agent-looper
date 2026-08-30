#!/usr/bin/env bash
# Measurable verification for the DSH companion plugin loop.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

PLUGIN_DIR="plugins/dsh-agent-looper"
PKG="$PLUGIN_DIR/package.json"
PATCH="$PLUGIN_DIR/cordis.patch.yml"
DOCS="docs/dsh-plugin.md"

step() { echo "[verify] $*"; }
fail() { echo "[verify] FAIL: $*" >&2; exit 1; }

need_file() {
  [[ -f "$1" ]] || fail "missing file: $1"
}

step "1 — bundle layout"
need_file "$PKG"
need_file "$PATCH"
need_file "$PLUGIN_DIR/README.md"
need_file "$DOCS"

step "2 — package.json is a DSH bundle (not the CLI package)"
command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ "$(jq -r '.name' "$PKG")" == "@dancingteeth/dsh-agent-looper" ]] \
  || fail "package name must be @dancingteeth/dsh-agent-looper"
[[ "$(jq -r '.type' "$PKG")" == "module" ]] || fail "package type must be module"
[[ "$(jq -r '.dsh.bundle.patch' "$PKG")" == "./cordis.patch.yml" ]] \
  || fail "dsh.bundle.patch must be ./cordis.patch.yml"
jq -e '.keywords | index("dsh-plugin")' "$PKG" >/dev/null \
  || fail "keywords must include dsh-plugin"

step "3 — root CLI package must not depend on DSH"
jq -e '.dependencies["@deepseek-ai/dsh"]' package.json >/dev/null 2>&1 \
  && fail "root package.json must not depend on @deepseek-ai/dsh"
jq -e '.dependencies["@deepseek-ai/deepseek-harness"]' package.json >/dev/null 2>&1 \
  && fail "root package.json must not depend on @deepseek-ai/deepseek-harness"
jq -e '.dsh.bundle' package.json >/dev/null 2>&1 \
  && fail "root package.json must not declare dsh.bundle (CLI package ≠ DSH bundle)"

step "4 — cordis.patch.yml inserts agent-looper"
grep -q 'id: agent-looper' "$PATCH" || fail "$PATCH must insert id: agent-looper"
grep -q '@dancingteeth/dsh-agent-looper' "$PATCH" \
  || fail "$PATCH row name must be @dancingteeth/dsh-agent-looper"

step "5 — entry exports name, apply, inject"
entry="$(jq -r '.main // .exports["."].import // empty' "$PKG")"
if [[ -z "$entry" || "$entry" == "null" ]]; then
  if [[ -f "$PLUGIN_DIR/src/index.ts" ]]; then
    entry="src/index.ts"
  else
    fail "package.json needs main/exports, or src/index.ts"
  fi
fi
# Resolve entry relative to the plugin package.
if [[ "$entry" != /* ]]; then
  entry_path="$PLUGIN_DIR/$entry"
else
  entry_path="$entry"
fi
need_file "$entry_path"
[[ "$entry" == *.js ]] || fail "DSH loader cannot import TypeScript; main must be .js (got $entry)"
grep -q 'export const name' "$entry_path" || fail "$entry_path must export const name"
grep -q 'export function apply' "$entry_path" || grep -q 'export const apply' "$entry_path" \
  || fail "$entry_path must export apply"
grep -q "inject" "$entry_path" || fail "$entry_path must declare inject"
grep -q "skills" "$entry_path" || fail "$entry_path inject must include skills"
grep -q "commands" "$entry_path" || fail "$entry_path inject must include commands"
grep -q "systemPrompt" "$entry_path" || fail "$entry_path inject must include systemPrompt"
grep -q "tools" "$entry_path" || fail "$entry_path inject must include tools"

step "6 — companion skills + command present in source"
grep_src() {
  grep -R -q --include='*.ts' --include='*.js' --include='*.mjs' "$1" "$PLUGIN_DIR"
}
grep_src 'design-loop' || fail "must register skill design-loop"
grep_src 'install-agent-looper' || fail "must register skill install-agent-looper"
grep_src 'review-gate' || fail "must register skill review-gate"
grep_src 'check-running-loops' || fail "must expose skill check-running-loops"
grep_src 'run-loop-in-dsh' || fail "must register skill run-loop-in-dsh"
grep_src 'loop-scaffold' || fail "must register command loop-scaffold"
grep_src 'plugin:agent-looper' || fail "must register system prompt plugin:agent-looper"

step "6b — shared skills materialized as real files (no symlinks)"
node "$PLUGIN_DIR/scripts/materialize-skills.mjs"
node --input-type=module -e "
  import { verifyMaterializedSkillsLayout } from './$PLUGIN_DIR/scripts/skills-layout.mjs';
  verifyMaterializedSkillsLayout();
"
native="$PLUGIN_DIR/skills/run-loop-in-dsh"
[[ -d "$native" && ! -L "$native" ]] || fail "$native must be a real directory (DSH-only skill)"
need_file "$native/SKILL.md"
for skill in design-loop install-agent-looper review-gate check-running-loops; do
  entry="$PLUGIN_DIR/skills/$skill"
  [[ -d "$entry" && ! -L "$entry" ]] || fail "$entry must be a materialized directory (not a symlink)"
  need_file "$PLUGIN_DIR/skills/$skill/SKILL.md"
done

step "7 — docs cross-links"
grep -q 'dsh-plugin.md' docs/cursor-marketplace-plugin.md \
  || fail "docs/cursor-marketplace-plugin.md must link docs/dsh-plugin.md"
grep -q 'dsh-plugin.md' docs/agent-plugins.md \
  || fail "docs/agent-plugins.md must link docs/dsh-plugin.md"
grep -qi 'dsh plugin' "$DOCS" || grep -q 'dsh plugin --profile' "$DOCS" \
  || fail "$DOCS must document dsh plugin install"

step "8 — unit tests (mocked ctx, no live dsh)"
pnpm test:dsh-plugin:deps
test_count="$(find "$PLUGIN_DIR" \( -name '*.test.ts' -o -name '*.test.js' -o -name '*.test.mjs' \) | wc -l | tr -d ' ')"
[[ "$test_count" -gt 0 ]] || fail "need at least one unit test under $PLUGIN_DIR"
pnpm exec vitest run "$PLUGIN_DIR"
node --test "$PLUGIN_DIR/scripts/skills-pack.test.mjs"

step "done — dsh-plugin verify passed"
