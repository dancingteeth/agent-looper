#!/bin/sh
# Live health of agent-loop / agent-loop-batch. POSIX + macOS/Linux.
# Never trust Cursor terminal "status: running" — always ps + mtime.
set -eu

STALE_SECS="${STALE_SECS:-180}"
HUNG_SECS="${HUNG_SECS:-600}"
REPO="${1:-$(pwd)}"

now_epoch() { date +%s; }

file_mtime_epoch() {
  f="$1"
  if stat -f %m "$f" >/dev/null 2>&1; then
    stat -f %m "$f"
  else
    stat -c %Y "$f"
  fi
}

age_secs() {
  m="$1"
  expr "$(now_epoch)" - "$m"
}

pid_alive() {
  pid="$1"
  [ -n "$pid" ] || return 1
  ps -p "$pid" >/dev/null 2>&1
}

pid_etime() {
  pid="$1"
  ps -p "$pid" -o etime= 2>/dev/null | awk '{print $1}'
}

classify_quiet() {
  age="$1"
  if [ "$age" -ge "$HUNG_SECS" ]; then
    echo HUNG
  elif [ "$age" -ge "$STALE_SECS" ]; then
    echo STALE
  else
    echo FRESH
  fi
}

json_str() {
  # One-line JSON object: extract "key":"value"
  sed -n "s/.*\"$2\":\"\\([^\"]*\\)\".*/\\1/p" "$1" | head -1
}

json_num() {
  sed -n "s/.*\"$2\":[ ]*\\([0-9][0-9]*\\).*/\\1/p" "$1" | head -1
}

repo_slug() {
  printf '%s' "$REPO" | sed 's|^/||; s|/|-|g'
}

# Cursor sometimes hyphenates underscores in the project folder name.
find_term_dir() {
  if [ -n "${CURSOR_TERMINALS_DIR:-}" ] && [ -d "$CURSOR_TERMINALS_DIR" ]; then
    printf '%s' "$CURSOR_TERMINALS_DIR"
    return
  fi
  slug=$(repo_slug)
  cand="$HOME/.cursor/projects/$slug/terminals"
  if [ -d "$cand" ]; then
    printf '%s' "$cand"
    return
  fi
  alt=$(printf '%s' "$slug" | tr '_' '-')
  cand="$HOME/.cursor/projects/$alt/terminals"
  if [ -d "$cand" ]; then
    printf '%s' "$cand"
    return
  fi
  base=$(basename "$REPO" | tr '_' '-')
  set -- "$HOME/.cursor/projects/"*"$base"/terminals
  if [ -d "$1" ] && [ "$#" -eq 1 ]; then
    printf '%s' "$1"
    return
  fi
  printf '%s' "$HOME/.cursor/projects/$slug/terminals"
}

TERM_DIR=$(find_term_dir)

echo "repo=$REPO"
echo "stale_after=${STALE_SECS}s hung_after=${HUNG_SECS}s"
echo "terminals=$TERM_DIR"
echo "--- processes ---"

found_proc=0
# PID only — do not print full command lines (API keys sometimes leak there).
for pat in 'agent-loop-batch' 'agent-loop run'; do
  pids=$(pgrep -f "$pat" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    found_proc=1
    echo "$pids" | while IFS= read -r p; do
      [ -n "$p" ] || continue
      echo "ALIVE pid=$p etime=$(pid_etime "$p") match=$pat"
    done
  fi
done
if [ "$found_proc" -eq 0 ]; then
  echo "NONE (no agent-loop-batch / agent-loop run in process table)"
fi

echo "--- terminal files ---"
term_hits=0
if [ -d "$TERM_DIR" ]; then
  for f in "$TERM_DIR"/*.txt; do
    [ -f "$f" ] || continue
    if ! grep -q 'agent-loop-batch\|agent-loop run\|AGENT_LOOP_DONE' "$f" 2>/dev/null; then
      continue
    fi
    term_hits=1
    pid=$(awk '/^pid:/{print $2; exit}' "$f")
    meta_status=$(awk '/^status:/{print $2; exit}' "$f")
    cmd=$(awk '/^command:/{sub(/^command: /,""); print; exit}' "$f" | cut -c1-120)
    mtime=$(file_mtime_epoch "$f")
    age=$(age_secs "$mtime")
    quiet=$(classify_quiet "$age")
    if pid_alive "$pid"; then
      live=ALIVE
      et=$(pid_etime "$pid")
    else
      live=DEAD
      et="-"
    fi
    done_line=$(grep 'AGENT_LOOP_DONE' "$f" 2>/dev/null | tail -1 || true)
    last_loop=$(grep '\[agent-loop-batch\] loop ' "$f" 2>/dev/null | tail -1 || true)
    last_iter=$(grep '\[agent-loop\] iteration ' "$f" 2>/dev/null | tail -1 || true)
    last_gate=$(grep 'review gate:' "$f" 2>/dev/null | tail -1 || true)
    last_verify=$(grep '\[agent-loop\] iteration .* verify:' "$f" 2>/dev/null | tail -1 || true)

    verdict="$live"
    if [ "$live" = ALIVE ] && [ "$quiet" = HUNG ]; then
      verdict="ALIVE_BUT_HUNG"
    elif [ "$live" = ALIVE ] && [ "$quiet" = STALE ]; then
      verdict="ALIVE_BUT_STALE"
    elif [ "$live" = DEAD ] && [ -n "$done_line" ]; then
      verdict="DONE"
    elif [ "$live" = DEAD ]; then
      verdict="DEAD"
    fi

    echo "file=$(basename "$f") verdict=$verdict pid=$pid ps=$live etime=$et meta_status=$meta_status log_age_s=$age quiet=$quiet"
    echo "  cmd=$cmd"
    [ -n "$last_loop" ] && echo "  $last_loop"
    [ -n "$last_iter" ] && echo "  $last_iter"
    [ -n "$last_verify" ] && echo "  $last_verify"
    [ -n "$last_gate" ] && echo "  $last_gate"
    [ -n "$done_line" ] && echo "  $done_line"
    echo "  (ignore meta_status=$meta_status unless ps=$live matches)"
  done
fi
if [ "$term_hits" -eq 0 ]; then
  echo "NONE matching agent-loop in $TERM_DIR"
fi

echo "--- loop dirs (watch-status.json, else log.ndjson; skip if age ≥ 24h) ---"
LOOP_ROOT="$REPO/.cursor/loops"
if [ -d "$LOOP_ROOT" ]; then
  any=0
  for d in "$LOOP_ROOT"/*/; do
    [ -d "$d" ] || continue
    live="${d}watch-status.json"
    log="${d}log.ndjson"
    src=""
    heartbeat=""
    if [ -f "$live" ]; then
      src="watch-status.json"
      heartbeat="$live"
    elif [ -f "$log" ]; then
      src="log.ndjson"
      heartbeat="$log"
    else
      continue
    fi
    m=$(file_mtime_epoch "$heartbeat")
    age=$(age_secs "$m")
    [ "$age" -lt 86400 ] || continue
    any=1
    name=$(basename "$d")
    extra=""
    if [ "$src" = "watch-status.json" ]; then
      phase=$(json_str "$live" phase)
      iter=$(json_num "$live" iteration)
      max=$(json_num "$live" maxIterations)
      wpid=$(json_num "$live" pid)
      wps="-"
      if [ -n "$wpid" ]; then
        if pid_alive "$wpid"; then
          wps=ALIVE
        else
          wps=DEAD
        fi
      fi
      extra=" phase=${phase:-?} iteration=${iter:-?}/${max:-?} pid=${wpid:-?} ps=$wps"
    fi
    echo "loop=$name source=$src log_age_s=$age quiet=$(classify_quiet "$age")$extra"
  done
  [ "$any" -eq 1 ] || echo "NONE with watch-status.json or log.ndjson newer than 24h"
else
  echo "NONE $LOOP_ROOT"
fi
