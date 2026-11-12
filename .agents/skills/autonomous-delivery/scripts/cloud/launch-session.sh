#!/bin/bash
# launch-session.sh <key> <prompt-file>
#
# Launches ONE Claude Code cloud session (a cloud worker) for a ticket, from the CURRENT checkout, with
# the cloud environment chosen for this launch only. The session clones the remote on the branch this
# checkout is on, so launch from the integration branch (the worker cuts its own feature branch).
#
#   * `claude --cloud` needs a TTY: `script -q <log>` provides one and keeps the output in a log.
#   * The environment goes through `--settings '{"remote":{"defaultEnvironmentId":"env_..."}}'`, so the
#     owner's user-level default (`/remote-env`, `~/.claude/settings.json`) is never touched. Measured
#     2026-11-11: the session ran in the requested environment (screenshot of the session panel).
#   * `--permission-mode auto` goes BEFORE `--cloud` (the text must follow `--cloud` directly).
#     `--dangerously-skip-permissions`, `--model` and `--effort` do not reach the cloud.
#   * The prompt IS the brief (the PBI cache and `.session/` are gitignored, so a file would not travel).
#   * As soon as the URL exists it is appended to sessions.txt and the session is woken from the web
#     (wake-session.sh), which is what attaches the claude.ai connectors. CF_WAKE=0 skips the wake-up.
#
# sessions.txt (`key url epoch`) is the durable record: never delete it, it is how a session is resumed
# from claude.ai/code days later.
#
# Variables:
#   CF_ESTADO    required. State folder: sessions.txt and launches/<key>.log (outside the repo)
#   CF_ENV_ID    the cloud environment id (`env_...`); or CF_ENV_FILE, a file holding it
#   CF_MODO      permission mode. Default: auto
#   CF_WAKE      1 (default) = call wake-session.sh after creating the session
#   CF_WAKE_MSG  message for wake-session.sh. Default: its own
set -u
: "${CF_ESTADO:?CF_ESTADO is required (state folder, outside the repo)}"
[ $# -eq 2 ] || { echo "Usage: launch-session.sh <key> <prompt-file>" >&2; exit 2; }
KEY=$1; PROMPT_FILE=$2
[ -s "$PROMPT_FILE" ] || { echo "Prompt file missing or empty: $PROMPT_FILE" >&2; exit 2; }
ENV_ID=${CF_ENV_ID:-}
[ -z "$ENV_ID" ] && [ -n "${CF_ENV_FILE:-}" ] && ENV_ID=$(tr -d '[:space:]' < "$CF_ENV_FILE" 2>/dev/null)
case "$ENV_ID" in env_*) ;; *) echo "Set CF_ENV_ID or CF_ENV_FILE to an Anthropic-hosted environment id (env_...)" >&2; exit 2 ;; esac
MODO=${CF_MODO:-auto}
AQUI=$(cd "$(dirname "$0")" && pwd)
L="$CF_ESTADO/launches"; mkdir -p "$L"
S="$CF_ESTADO/sessions.txt"
[ -s "$S" ] || echo "# key url epoch - durable record of cloud sessions: never delete (used to resume a session by hand)" >> "$S"

git fetch -q origin 2>/dev/null
BRANCH=$(git branch --show-current)
git rev-parse -q --verify "origin/$BRANCH" >/dev/null || { echo "Branch $BRANCH is not on origin: the session clones the remote" >&2; exit 1; }
LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse "origin/$BRANCH")
[ "$LOCAL" = "$REMOTE" ] || echo "WARNING: local $BRANCH differs from origin/$BRANCH; the session will see origin" >&2

LOG="$L/$KEY.log"
[ -f "$LOG" ] && mv "$LOG" "$L/$KEY.attempt$(ls "$L/$KEY".attempt*.log 2>/dev/null | wc -l | tr -d ' ' | awk '{print $1+1}').log"
P=$(cat "$PROMPT_FILE")
SETTINGS=$(printf '{"remote":{"defaultEnvironmentId":"%s"}}' "$ENV_ID")
(script -q "$LOG" claude --settings "$SETTINGS" --permission-mode "$MODO" --cloud "$P" </dev/null >/dev/null 2>&1 &)
for _ in $(seq 1 30); do sleep 3; grep -a -q "Created cloud session" "$LOG" 2>/dev/null && break; done
URL=$(LC_ALL=C tr -d '\r' < "$LOG" 2>/dev/null | grep -a -o 'https://claude.ai/code/session_[A-Za-z0-9]*' | head -1)
[ -n "$URL" ] || echo "$KEY: no URL after 90 s, look at $LOG" >&2
echo "$KEY ${URL:-NO-URL} $(date +%s)" | tee -a "$S"
if [ -n "$URL" ] && [ "${CF_WAKE:-1}" != 0 ]; then
  CF_ESTADO="$CF_ESTADO" bash "$AQUI/wake-session.sh" "$URL" ${CF_WAKE_MSG:+"$CF_WAKE_MSG"} >> "$L/$KEY.wake.log" 2>&1
  rc=$?
  echo "$KEY wake=$rc (0 sent, 2 no login, 3 Cloudflare, 4 no composer, 5 lock; detail in $CF_ESTADO/despertar.log)"
  [ "$rc" = 2 ] && echo "$KEY: the claude-ai profile has no session. The owner has to sign in (headed window)" >&2
fi
exit 0
