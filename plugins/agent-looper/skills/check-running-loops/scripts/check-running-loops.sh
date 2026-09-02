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
  [ -n "$m" ] || { echo 0; return 0; }
  now=$(now_epoch)
  if [ "$now" -le "$m" ]; then
    echo 0
    return 0
  fi
  echo $((now - m))
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
  sed -n "s/.*\"$2\":\"\\([^\"]*\\)\".*/\\1/p" "$1" 2>/dev/null | head -1 || true
}

json_num() {
  sed -n "s/.*\"$2\":[ ]*\\([0-9][0-9]*\\).*/\\1/p" "$1" 2>/dev/null | head -1 || true
}

repo_slug() {
  printf '%s' "$REPO" | sed 's|^/||; s|/|-|g'
}

PROJECTS_DIR="${CURSOR_PROJECTS_DIR:-$HOME/.cursor/projects}"

# Cursor sometimes hyphenates underscores in the project folder name.
find_term_dir() {
  if [ -n "${CURSOR_TERMINALS_DIR:-}" ] && [ -d "$CURSOR_TERMINALS_DIR" ]; then
    printf '%s' "$CURSOR_TERMINALS_DIR"
    return
  fi
  slug=$(repo_slug)
  cand="$PROJECTS_DIR/$slug/terminals"
  if [ -d "$cand" ]; then
    printf '%s' "$cand"
    return
  fi
  alt=$(printf '%s' "$slug" | tr '_' '-')
  cand="$PROJECTS_DIR/$alt/terminals"
  if [ -d "$cand" ]; then
    printf '%s' "$cand"
    return
  fi
  base=$(basename "$REPO" | tr '_' '-')
  set -- "$PROJECTS_DIR/"*"$base"/terminals
  if [ -d "$1" ] && [ "$#" -eq 1 ]; then
    printf '%s' "$1"
    return
  fi
  printf '%s' "$PROJECTS_DIR/$slug/terminals"
}

term_cwd() {
  awk '
    /^cwd:/ {
      sub(/^cwd: */, "")
      gsub(/^"/, "")
      gsub(/"$/, "")
      print
      exit
    }
  ' "$1"
}

term_belongs_to_repo() {
  f="$1"
  cwd=$(term_cwd "$f")
  [ "$cwd" = "$REPO" ] && return 0
  grep -F "$REPO" "$f" >/dev/null 2>&1
}

emit_term_file() {
  f="$1"
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
}

scan_term_dir() {
  dir="$1"
  require_repo="$2"
  [ -d "$dir" ] || return 0
  for f in "$dir"/*.txt; do
    [ -f "$f" ] || continue
    if ! grep -q 'agent-loop-batch\|agent-loop run\|AGENT_LOOP_DONE' "$f" 2>/dev/null; then
      continue
    fi
    if [ "$require_repo" = 1 ]; then
      term_belongs_to_repo "$f" || continue
    fi
    term_hits=$((term_hits + 1))
    emit_term_file "$f"
  done
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
scan_term_dir "$TERM_DIR" 0
if [ -z "${CURSOR_TERMINALS_DIR:-}" ]; then
  echo "--- sibling terminal files ---"
  sib_hits=0
  for d in "$PROJECTS_DIR"/*/terminals; do
    [ -d "$d" ] || continue
    [ "$d" = "$TERM_DIR" ] && continue
    before=$term_hits
    scan_term_dir "$d" 1
    if [ "$term_hits" -gt "$before" ]; then
      sib_hits=1
    fi
  done
  if [ "$sib_hits" -eq 0 ]; then
    echo "NONE matching this repo in $PROJECTS_DIR/*/terminals"
  fi
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
    cfg="${d}loop.json"
    runtime=""
    if [ -f "$cfg" ]; then
      runtime=$(awk -F '"' '{
        for (i = 1; i < NF; i++) {
          if ($i == "runtime") { print $(i + 2); exit }
        }
      }' "$cfg") || true
    fi
    extra=" runtime=${runtime:-defaults}"
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
      extra="$extra phase=${phase:-?} iteration=${iter:-?}/${max:-?} pid=${wpid:-?} ps=$wps"
    fi
    echo "loop=$name source=$src log_age_s=$age quiet=$(classify_quiet "$age")$extra"
  done
  [ "$any" -eq 1 ] || echo "NONE with watch-status.json or log.ndjson newer than 24h"
else
  echo "NONE $LOOP_ROOT"
fi
