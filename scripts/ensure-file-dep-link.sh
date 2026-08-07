#!/usr/bin/env bash
# Ensures the file:../../agent-loop (or file:../agent-loop) checkout exists for a consumer repo.
# Creates a symlink to ~/Projects/agent-loop when the expected sibling path is missing.
set -euo pipefail

CONSUMER_ROOT="${1:-}"
if [[ -z "${CONSUMER_ROOT}" ]]; then
  echo "Usage: ensure-file-dep-link.sh <consumer-repo-root>" >&2
  exit 1
fi

CONSUMER_ROOT="$(cd "${CONSUMER_ROOT}" && pwd)"
PKG_JSON="${CONSUMER_ROOT}/package.json"
if [[ ! -f "${PKG_JSON}" ]]; then
  echo "[ensure-file-dep-link] no package.json in ${CONSUMER_ROOT}" >&2
  exit 1
fi

SPECIFIER="$(node --input-type=module -e "
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('${PKG_JSON}', 'utf8'));
const spec = pkg.devDependencies?.['@dancingteeth/agent-looper']
  ?? pkg.dependencies?.['@dancingteeth/agent-looper'];
if (!spec?.startsWith('file:')) process.exit(2);
process.stdout.write(spec.slice('file:'.length));
")" || {
  echo "[ensure-file-dep-link] @dancingteeth/agent-looper is not a file: dependency — nothing to do" >&2
  exit 0
}

TARGET="${CONSUMER_ROOT}/${SPECIFIER}"
TARGET="$(cd "$(dirname "${TARGET}")" && pwd)/$(basename "${TARGET}")"

if [[ -e "${TARGET}" ]]; then
  echo "[ensure-file-dep-link] already exists: ${TARGET}"
  exit 0
fi

HARNESS="${AGENT_LOOP_CHECKOUT:-${HOME}/Projects/agent-loop}"
if [[ ! -d "${HARNESS}" ]]; then
  echo "[ensure-file-dep-link] harness checkout not found at ${HARNESS}" >&2
  echo "Clone agent-loop there or set AGENT_LOOP_CHECKOUT." >&2
  exit 1
fi

mkdir -p "$(dirname "${TARGET}")"
ln -sf "${HARNESS}" "${TARGET}"
echo "[ensure-file-dep-link] linked ${TARGET} -> ${HARNESS}"
echo "[ensure-file-dep-link] next: cd ${HARNESS} && pnpm install && pnpm build && cd ${CONSUMER_ROOT} && pnpm install"
