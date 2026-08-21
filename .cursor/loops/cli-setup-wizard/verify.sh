#!/usr/bin/env bash
# Verifier for the cli-setup-wizard loop.
# The wizard is implemented in this checkout (AGENT_LOOP_REPO, default: repo
# root that contains this bundle) as src/cli/setup.ts → dist/cli/setup.js
# (bin agent-loop-setup), mirroring agent-loop-init.
# Every schema check uses the REAL loopConfigSchema (parseLoopConfig) from
# dist — the version that accepts the dsh runtime.
set -euo pipefail

BUNDLE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$BUNDLE/../../.." && pwd)"
ALOOP="${AGENT_LOOP_REPO:-$ROOT}"
WIZARD="$ALOOP/dist/cli/setup.js"

fail() { echo "[verify] FAIL: $*" >&2; exit 1; }

# ---- preflight --------------------------------------------------------------
[ -d "$ALOOP" ] || fail "agent-looper checkout missing at $ALOOP (set AGENT_LOOP_REPO)"
[ -f "$ALOOP/src/cli/setup.ts" ] || fail "wizard source missing: $ALOOP/src/cli/setup.ts"
if [ ! -f "$WIZARD" ]; then
  echo "[verify] building agent-loop (pnpm build) to produce $WIZARD ..."
  (cd "$ALOOP" && pnpm build >/dev/null 2>&1) || fail "pnpm build in $ALOOP failed"
fi
[ -f "$WIZARD" ] || fail "wizard not built at $WIZARD"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---- 1) --help lists runtimes incl dsh + review/notify/git -------------------
HELP="$("$WIZARD" --help 2>&1 || true)"
echo "$HELP" | grep -qiE '\bdsh\b' || fail "--help does not list the dsh runtime"
echo "$HELP" | grep -qiE 'review' || fail "--help has no review flag/prompt"
echo "$HELP" | grep -qiE 'notify|telegram' || fail "--help has no notify/telegram flag/prompt"
echo "$HELP" | grep -qiE 'git|pr|branch|comment' || fail "--help has no git/PR flag/prompt"
echo "[verify] ok: --help lists dsh + review/notify/git"

# validator: parse a written loop.json with the real schema from the checkout
validate_loopjson() { # $1 = path to loop.json
  node --input-type=module -e "
    import { parseLoopConfig } from 'file://$ALOOP/dist/loop/loopConfig.js';
    import fs from 'node:fs';
    const raw = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const c = parseLoopConfig(raw);
    console.log(JSON.stringify({
      runtime: c.runtime,
      reviewRuntime: c.reviewRuntime ?? null,
      reviewModel: c.reviewModel ?? null,
      notifyTelegram: c.notifyTelegram,
      notifyPrComment: c.notifyPrComment ?? null,
    }));
  " "$1" 2>&1
}

run_fixture() { # $1 = answers.json path, $2 = out dir → runs wizard, returns exit code
  (cd "$ROOT" && node "$WIZARD" --answers "$1" --out "$2" >"$TMP/stdout.txt" 2>&1)
}

# ---- 2+3) fixture walk: dsh runtime + dsh reviewRuntime, NO reviewModel -------
cat > "$TMP/answers-dsh.json" <<'JSON'
{
  "runtime": "dsh",
  "reviewRuntime": "dsh",
  "model": "deepseek-official/deepseek-v4-flash",
  "escalateModel": "deepseek-official/deepseek-v4-pro",
  "maxIterations": 5,
  "verify": "bash .cursor/loops/example/verify.sh"
}
JSON
mkdir -p "$TMP/out-dsh"
if ! run_fixture "$TMP/answers-dsh.json" "$TMP/out-dsh"; then
  echo "[verify] wizard fixture stdout:"
  cat "$TMP/stdout.txt" >&2
  fail "fixture walk (dsh) exited non-zero"
fi
[ -f "$TMP/out-dsh/loop.json" ] || fail "fixture walk (dsh) wrote no loop.json"
RESULT="$(validate_loopjson "$TMP/out-dsh/loop.json")" || fail "dsh loop.json rejected by real loopConfigSchema.parse"
echo "$RESULT" | grep -q '"runtime":"dsh"' || { echo "[verify] parsed: $RESULT"; fail "dsh fixture runtime != dsh"; }
echo "$RESULT" | grep -q '"reviewRuntime":"dsh"' || { echo "[verify] parsed: $RESULT"; fail "dsh fixture reviewRuntime != dsh"; }
echo "$RESULT" | grep -q '"reviewModel":null' || { echo "[verify] parsed: $RESULT"; fail "dsh fixture must not set reviewModel"; }
grep -q '"reviewModel"' "$TMP/out-dsh/loop.json" && { echo "[verify] written loop.json:"; cat "$TMP/out-dsh/loop.json"; fail "written loop.json contains a reviewModel key"; }
echo "[verify] ok: dsh fixture writes schema-valid loop.json (runtime+reviewRuntime dsh, no reviewModel)"

# ---- 4) fixture with notifyTelegram false / notifyPrComment true --------------
cat > "$TMP/answers-notify.json" <<'JSON'
{
  "runtime": "opencode",
  "model": "opencode-go/deepseek-v4-flash",
  "notifyTelegram": false,
  "notifyPrComment": true,
  "maxIterations": 5,
  "verify": "bash .cursor/loops/example/verify.sh"
}
JSON
mkdir -p "$TMP/out-notify"
run_fixture "$TMP/answers-notify.json" "$TMP/out-notify" || fail "fixture walk (notify) exited non-zero"
[ -f "$TMP/out-notify/loop.json" ] || fail "fixture walk (notify) wrote no loop.json"
RESULT="$(validate_loopjson "$TMP/out-notify/loop.json")" || fail "notify loop.json rejected by real schema"
echo "$RESULT" | grep -q '"notifyTelegram":false' || { echo "[verify] parsed: $RESULT"; fail "written loop.json notifyTelegram != false"; }
echo "$RESULT" | grep -q '"notifyPrComment":true' || { echo "[verify] parsed: $RESULT"; fail "written loop.json notifyPrComment != true"; }
echo "[verify] ok: notify fixture writes notifyTelegram=false + notifyPrComment=true"

# ---- 5) reject unknown runtime / Fast cursor review models --------------------
cat > "$TMP/answers-bad.json" <<'JSON'
{
  "runtime": "banana",
  "maxIterations": 5,
  "verify": "bash .cursor/loops/example/verify.sh"
}
JSON
mkdir -p "$TMP/out-bad"
if run_fixture "$TMP/answers-bad.json" "$TMP/out-bad"; then
  echo "[verify] fixture stdout:"; cat "$TMP/stdout.txt" >&2
  fail "wizard accepted unknown runtime 'banana' (should exit non-zero)"
fi
[ ! -f "$TMP/out-bad/loop.json" ] || fail "wizard wrote loop.json for unknown runtime"

cat > "$TMP/answers-fast.json" <<'JSON'
{
  "runtime": "cursor",
  "model": "composer-2.5",
  "reviewRuntime": "cursor",
  "reviewModel": "composer-fast-1",
  "maxIterations": 5,
  "verify": "bash .cursor/loops/example/verify.sh"
}
JSON
mkdir -p "$TMP/out-fast"
if run_fixture "$TMP/answers-fast.json" "$TMP/out-fast"; then
  echo "[verify] fixture stdout:"; cat "$TMP/stdout.txt" >&2
  fail "wizard accepted Fast cursor review model (should exit non-zero)"
fi
[ ! -f "$TMP/out-fast/loop.json" ] || fail "wizard wrote loop.json for Fast cursor review model"
echo "[verify] ok: unknown runtime and Fast cursor review models rejected"

# ---- 6) fixture stdout prints agent-check + agent-loop run --------------------
grep -q 'agent-check' "$TMP/stdout.txt" || { echo "[verify] stdout:"; cat "$TMP/stdout.txt"; fail "wizard stdout lacks 'agent-check'"; }
grep -q 'agent-loop run' "$TMP/stdout.txt" || { echo "[verify] stdout:"; cat "$TMP/stdout.txt"; fail "wizard stdout lacks 'agent-loop run'"; }
echo "[verify] ok: wizard prints agent-check + agent-loop run"

echo "[verify] PASS: cli-setup-wizard CLI present, schema-valid fixtures, rejections enforced"
