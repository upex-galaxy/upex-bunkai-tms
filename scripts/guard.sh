#!/usr/bin/env bash
# guard.sh: run a command and kill its whole process tree when it exceeds a
# memory or time budget. macOS and Linux, bash 3.2+, no extra dependencies.
#
#   scripts/guard.sh [--] <command> [args...]
#
# Why not `ulimit -v` / `ulimit -m`: macOS ignores both, and `bun test --timeout`
# is enforced on the JS event loop, so a test stuck in a synchronous render loop
# never reaches it. This guard samples from OUTSIDE the process instead.
#
# Environment (all optional):
#   GUARD_MAX_RSS_MB   total RSS of the tree, in MB          (default 3072)
#   GUARD_TIMEOUT_S    wall-clock limit, in seconds          (default 120; 0 = off)
#   GUARD_POLL_S       sampling interval, in seconds         (default 1)
#   GUARD_GRACE_S      SIGTERM -> SIGKILL grace, in seconds  (default 2)
#   GUARD_RSS_EXIT     exit code when the RSS limit fires    (default 137)
#   GUARD_TIMEOUT_EXIT exit code when the time limit fires   (default 124)
#   GUARD_KEEP_STDIN   1 = pass stdin through (default: stdin is /dev/null)
#   GUARD_QUIET        1 = no summary line on a normal exit
#
# Exit status: the command's own status when it finishes by itself;
# GUARD_RSS_EXIT / GUARD_TIMEOUT_EXIT when the guard killed it (with a
# "[guard] KILLED: ..." line on stderr); 130/143 when the guard itself got
# SIGINT/SIGTERM (the tree is killed first).
#
# Every local test run goes through this script: Bunkai rule GUARDED-TESTS in
# .agents/instructions/agent-project.md.
#
# Caveats: RSS is resident memory. On macOS, pages already compressed or
# swapped out do not count, so keep the limit well under physical RAM (the
# default trips long before swap). A descendant that calls setsid() AND loses
# its parent escapes both the process-group and the parent-chain walk.

set -u

MAX_RSS_MB=${GUARD_MAX_RSS_MB:-3072}
TIMEOUT_S=${GUARD_TIMEOUT_S:-120}
POLL_S=${GUARD_POLL_S:-1}
GRACE_S=${GUARD_GRACE_S:-2}
RSS_EXIT=${GUARD_RSS_EXIT:-137}
TIMEOUT_EXIT=${GUARD_TIMEOUT_EXIT:-124}

log() { printf '[guard] %s\n' "$*" >&2; }

for v in MAX_RSS_MB TIMEOUT_S GRACE_S RSS_EXIT TIMEOUT_EXIT; do
  eval "val=\$$v"
  case $val in ''|*[!0-9]*) log "invalid $v=$val (non-negative integer expected)"; exit 2 ;; esac
done
case $POLL_S in ''|*[!0-9.]*) log "invalid GUARD_POLL_S=$POLL_S"; exit 2 ;; esac

[ "${1:-}" = "--" ] && shift
if [ $# -eq 0 ]; then
  log "usage: guard.sh [--] <command> [args...]"
  exit 2
fi

MAX_RSS_KB=$((MAX_RSS_MB * 1024))

# Job control gives the background job its own process group (pgid = its pid),
# so orphans the command leaves behind are still findable and killable.
set -m
if [ "${GUARD_KEEP_STDIN:-0}" = "1" ]; then
  "$@" &
else
  "$@" </dev/null &
fi
CHILD=$!
set +m

# Prints "<total_rss_kb>:<pid> <pid> ..." for the child, every descendant
# reachable through the parent chain, and every member of its process group.
tree() {
  ps -A -o pid= -o ppid= -o pgid= -o rss= 2>/dev/null | awk -v root="$CHILD" -v me="$$" '
    { pid[NR]=$1; ppid[NR]=$2; pgid[NR]=$3; rss[NR]=$4; n=NR }
    END {
      inc[root]=1
      for (i=1; i<=n; i++) if (pgid[i]==root) inc[pid[i]]=1
      changed=1
      while (changed) {
        changed=0
        for (i=1; i<=n; i++) if (!(pid[i] in inc) && (ppid[i] in inc)) { inc[pid[i]]=1; changed=1 }
      }
      total=0; list=""
      for (i=1; i<=n; i++) if ((pid[i] in inc) && pid[i]!=me) { total+=rss[i]; list=list" "pid[i] }
      sub(/^ /, "", list)
      print total ":" list
    }'
}

alive() {
  # A reaped child fails kill -0; a zombie is not "alive" for our purposes.
  kill -0 "$CHILD" 2>/dev/null || return 1
  case $(ps -o stat= -p "$CHILD" 2>/dev/null) in Z*|'') return 1 ;; esac
  return 0
}

kill_tree() {
  # Snapshot first: once the leader dies its children reparent and the
  # parent-chain walk loses them, the process group does not.
  local snap pids
  snap=$(tree); pids=${snap#*:}
  kill -TERM -- "-$CHILD" 2>/dev/null
  [ -n "$pids" ] && kill -TERM $pids 2>/dev/null
  local waited=0
  while [ "$waited" -lt "$((GRACE_S * 10))" ]; do
    snap=$(tree); [ -z "${snap#*:}" ] && break   # no pids left
    sleep 0.1; waited=$((waited + 1))
  done
  kill -KILL -- "-$CHILD" 2>/dev/null
  [ -n "$pids" ] && kill -KILL $pids 2>/dev/null
  snap=$(tree); [ -n "${snap#*:}" ] && kill -KILL ${snap#*:} 2>/dev/null
  wait "$CHILD" 2>/dev/null
}

on_signal() {
  log "received $1: killing the command's process tree"
  kill_tree
  exit "$2"
}
trap 'on_signal SIGINT 130' INT
trap 'on_signal SIGTERM 143' TERM
trap 'on_signal SIGHUP 129' HUP

START=$SECONDS
PEAK_KB=0
REASON=""

while alive; do
  snap=$(tree)
  rss_kb=${snap%%:*}
  [ "$rss_kb" -gt "$PEAK_KB" ] && PEAK_KB=$rss_kb
  elapsed=$((SECONDS - START))
  if [ "$rss_kb" -gt "$MAX_RSS_KB" ]; then
    REASON="memory: tree RSS $((rss_kb / 1024)) MB > limit ${MAX_RSS_MB} MB after ${elapsed}s"
    CODE=$RSS_EXIT
    break
  fi
  if [ "$TIMEOUT_S" -gt 0 ] && [ "$elapsed" -ge "$TIMEOUT_S" ]; then
    REASON="time: ${elapsed}s >= limit ${TIMEOUT_S}s (tree RSS $((rss_kb / 1024)) MB)"
    CODE=$TIMEOUT_EXIT
    break
  fi
  sleep "$POLL_S"
done

if [ -n "$REASON" ]; then
  pids=${snap#*:}
  kill_tree
  log "KILLED ($REASON). Command: $*"
  log "pids killed:${pids:+ $pids} | peak RSS $((PEAK_KB / 1024)) MB | exit $CODE"
  exit "$CODE"
fi

wait "$CHILD"
RC=$?

# The command finished; anything it left in its process group is an orphan.
leftover=$(tree); leftover=${leftover#*:}
if [ -n "$leftover" ]; then
  log "command exited; killing leftover processes: $leftover"
  kill_tree
fi

[ "${GUARD_QUIET:-0}" = "1" ] || log "done: exit $RC, $((SECONDS - START))s, peak RSS $((PEAK_KB / 1024)) MB"
exit "$RC"
