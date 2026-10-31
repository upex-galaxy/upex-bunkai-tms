#!/usr/bin/env bash
# The Jungla's watcher: blocks with zero model tokens until something needs a gank.
#
# Usage: wait-jungla.sh <since_slack_ts> [end_HH:MM] [max_wait_seconds] [proactive_at_HH:MM|-]
#        wait-jungla.sh --probe     prints the gank JQL, the live count per status and the delta
#                                   against the last pass, writes nothing, exits 0
#   since_slack_ts    only owner messages in the Jungla channel newer than this Slack ts count
#   end_HH:MM         local end of day (default JUNGLA_DAY_END); at that time prints END_OF_DAY
#   max_wait_seconds  prints HEARTBEAT after this long with nothing new (default JUNGLA_MAX_WAIT)
#   proactive_at      local time of the next proactive work block; "-" = none today
#
# Wakes on (a) a pending file in the bridge inbox, (b) a Jira item entering a gank status since the
# last pass, (c) an owner message in the Jungla channel, (d) the proactive clock, (e) END_OF_DAY.
# Output, last line is the verdict. When several things arrive in the same pass the verdict is the
# most urgent one and the JSON carries all of them:
#   INBOX|OWNER|GANK <json {"inbox":[files],"owner":[msgs],"gank":[events]}>  exit 0
#   PROACTIVE                                                               exit 13
#   HEARTBEAT                                                               exit 10
#   END_OF_DAY                                                              exit 11
#   ERROR <detail>                                  exit 12 (6 failures in a row of one source)
#
# Jira is diffed, not counted: jira-seen.json keeps key -> status from the last pass, and only a
# key whose status changed into a gank status fires. With no seen file the first pass seeds it
# silently (the routine's startup audit owns the standing stock). A diff instead of
# `status CHANGED AFTER "<date>"` because that JQL date runs in the Jira profile's timezone and
# misses whatever changed while the watcher was down.
# Slack is skipped, without error, until scripts/slack-channel.sh has written the channel id.
#
# Env (tests): JUNGLA_POLL_SECONDS, JUNGLA_JIRA_POLL_SECONDS, JUNGLA_SLACK_POLL_SECONDS,
#   JUNGLA_MIN_RUNTIME, JUNGLA_STATE_DIR override the defaults.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
_state_override="${JUNGLA_STATE_DIR:-}"
# shellcheck disable=SC1091
. "$SKILL_DIR/jungla.conf"
[ -n "$_state_override" ] && JUNGLA_STATE_DIR="$_state_override" && JUNGLA_INBOX="$_state_override/inbox"
STATE_DIR="$JUNGLA_STATE_DIR"
SEEN="$STATE_DIR/jira-seen.json"

POLL_SECONDS="${JUNGLA_POLL_SECONDS:-5}"
JIRA_POLL="${JUNGLA_JIRA_POLL_SECONDS:-180}"
SLACK_POLL="${JUNGLA_SLACK_POLL_SECONDS:-20}"
# Never report sooner than this after starting: the agent launches the watcher in the background
# and then ends its turn; a watcher that exits before that turn ends leaves the session with no
# background task, and Orca closes the terminal (measured on the Auroras, 2026-09-28).
MIN_RUNTIME="${JUNGLA_MIN_RUNTIME:-25}"
THREAD_WINDOW_DAYS=7

envval() { grep -E "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"; }
JIRA_EMAIL=$(envval ATLASSIAN_EMAIL "$JUNGLA_REPO/.env")
JIRA_TOKEN=$(envval ATLASSIAN_API_TOKEN "$JUNGLA_REPO/.env")
SLACK_TOKEN=$(envval SLACK_MCP_BOT_TOKEN "$JUNGLA_SLACK_ENV")

# --- Jira: current gank set as {key: {status, type}} (paginated) ---
jira_current() {
  local token="" out="{}" page next
  while :; do
    page=$(curl -s --max-time 20 -u "$JIRA_EMAIL:$JIRA_TOKEN" -G "$JUNGLA_JIRA_SITE/rest/api/3/search/jql" \
      --data-urlencode "jql=$JUNGLA_GANK_JQL" --data-urlencode "fields=status,issuetype" \
      --data-urlencode "maxResults=100" ${token:+--data-urlencode "nextPageToken=$token"})
    echo "$page" | jq -e '.issues' >/dev/null 2>&1 || { echo "ERR $(echo "$page" | jq -c '.errorMessages // .' 2>/dev/null | head -c 200)"; return 1; }
    out=$(jq -c -n --argjson a "$out" --argjson p "$page" '$a + ([$p.issues[] | {(.key): {status: .fields.status.name, type: .fields.issuetype.name}}] | add // {})')
    next=$(echo "$page" | jq -r '.nextPageToken // empty')
    [ -n "$next" ] || break
    token="$next"
  done
  echo "$out"
}
# keys whose status differs from the last pass, labelled with their gank kind
jira_delta() { # $1 current, $2 seen
  jq -c -n --argjson cur "$1" --argjson seen "$2" --argjson kinds "$JUNGLA_GANK_KINDS" '
    [$cur | to_entries[] | select(($seen[.key].status // "") != .value.status)
     | {key, type: .value.type, status: .value.status, gank: ($kinds[.value.status] // "other")}]
    | sort_by(.key | ltrimstr("'"$JUNGLA_JIRA_KEY"'-") | tonumber? // 0)'
}

if [ "${1:-}" = "--probe" ]; then
  [ -n "$JIRA_EMAIL" ] && [ -n "$JIRA_TOKEN" ] || { echo "ERROR no ATLASSIAN_EMAIL/ATLASSIAN_API_TOKEN in $JUNGLA_REPO/.env"; exit 12; }
  cur=$(jira_current) || { echo "ERROR jira $cur"; exit 12; }
  seen=$(cat "$SEEN" 2>/dev/null || echo '{}')
  echo "JQL: $JUNGLA_GANK_JQL"
  echo "count: $(echo "$cur" | jq 'length') $(echo "$cur" | jq -c '[.[].status] | group_by(.) | map({(.[0]): length}) | add // {}')"
  echo "seen file: $([ -f "$SEEN" ] && echo "$(jq 'length' "$SEEN") keys" || echo "absent (the first watcher pass seeds it silently)")"
  echo "delta vs seen: $(jira_delta "$cur" "$seen")"
  exit 0
fi

since="${1:?since_slack_ts required (use 0 on a first day with no channel)}"
end_at="${2:-$JUNGLA_DAY_END}"
max_wait="${3:-$JUNGLA_MAX_WAIT}"
proactive_at="${4:--}"

mkdir -p "$STATE_DIR" "$JUNGLA_INBOX/done"
[ -n "$JIRA_EMAIL" ] && [ -n "$JIRA_TOKEN" ] || { echo "ERROR no ATLASSIAN_EMAIL/ATLASSIAN_API_TOKEN in $JUNGLA_REPO/.env"; exit 12; }

epoch_today() { date -j -f "%Y-%m-%d %H:%M" "$(date +%Y-%m-%d) $1" +%s 2>/dev/null || echo 0; }
end_epoch=$(epoch_today "$end_at")
pro_epoch=0; [ "$proactive_at" != "-" ] && pro_epoch=$(epoch_today "$proactive_at")
started=$(date +%s)
last_jira=0; last_slack=0; jira_fail=0; slack_fail=0

slack_api() { curl -s --max-time 15 -H "Authorization: Bearer $SLACK_TOKEN" "https://slack.com/api/$1"; }
# owner messages (top level and thread replies) newer than since
slack_owner_msgs() { # $1 channel id
  local hist found rep more parent oldest
  oldest=$(( $(date +%s) - THREAD_WINDOW_DAYS * 86400 ))
  hist=$(slack_api "conversations.history?channel=$1&oldest=$oldest&limit=100")
  [ "$(echo "$hist" | jq -r '.ok' 2>/dev/null)" = "true" ] || { echo "ERR $(echo "$hist" | jq -c '.error // .' 2>/dev/null | head -c 200)"; return 1; }
  found=$(echo "$hist" | jq -c --argjson owners "$JUNGLA_OWNERS" --arg since "$since" '
    [.messages[] | select(((.subtype // "") == "" or .subtype == "thread_broadcast") and (.user as $u | $owners | index($u)) and ((.ts|tonumber) > ($since|tonumber)))
     | {ts, thread_ts: (.thread_ts // null), user, text, files: ([.files[]?.name])}]')
  for parent in $(echo "$hist" | jq -r --arg since "$since" '.messages[] | select(.latest_reply and ((.latest_reply|tonumber) > ($since|tonumber))) | .ts'); do
    rep=$(slack_api "conversations.replies?channel=$1&ts=$parent&oldest=$since&limit=100")
    more=$(echo "$rep" | jq -c --argjson owners "$JUNGLA_OWNERS" --arg since "$since" --arg parent "$parent" '
      if .ok then [.messages[] | select(.ts != $parent and ((.subtype // "") == "" or .subtype == "thread_broadcast") and (.user as $u | $owners | index($u)) and ((.ts|tonumber) > ($since|tonumber)))
        | {ts, thread_ts: (.thread_ts // null), user, text, files: ([.files[]?.name])}] else [] end')
    found=$(jq -c -n --argjson a "$found" --argjson b "$more" '$a + $b')
  done
  echo "$found" | jq -c 'unique_by(.ts) | sort_by(.ts|tonumber)'
}

report() { # $1 verdict, $2 inbox json, $3 owner json, $4 gank json
  local elapsed=$(( $(date +%s) - started ))
  [ "$elapsed" -lt "$MIN_RUNTIME" ] && sleep $(( MIN_RUNTIME - elapsed ))
  echo "$1 $(jq -c -n --argjson i "$2" --argjson o "$3" --argjson g "$4" '{inbox: $i, owner: $o, gank: $g}')"
  exit 0
}

while true; do
  # liveness beat for the launcher's watchdog (an Orca precheck cannot read other processes' argv)
  touch "$STATE_DIR/watcher.alive" 2>/dev/null
  now=$(date +%s)
  if [ "$end_epoch" -gt 0 ] && [ "$now" -ge "$end_epoch" ]; then echo "END_OF_DAY"; exit 11; fi

  # (a) bridge inbox: pending *.md files, never done/
  inbox="[]"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    sed -n '1,/^---$/{/^---$/!p;}' "$f" 2>/dev/null | sed -n '1,20p' | grep -qE '^status: *pending' || continue
    inbox=$(jq -c -n --argjson a "$inbox" --arg f "$(basename "$f")" '$a + [$f]')
  done < <(find "$JUNGLA_INBOX" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort)

  # (c) owner messages in the Jungla channel
  owner="[]"
  chan=$(cat "$JUNGLA_SLACK_CHANNEL_FILE" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$chan" ] && [ -n "$SLACK_TOKEN" ] && [ $(( now - last_slack )) -ge "$SLACK_POLL" ]; then
    last_slack=$now
    if res=$(slack_owner_msgs "$chan"); then slack_fail=0; owner="$res"
    else slack_fail=$(( slack_fail + 1 )); [ "$slack_fail" -ge 6 ] && { echo "ERROR slack $res"; exit 12; }; fi
  fi

  # (b) Jira ganks, as a delta against the last pass
  gank="[]"
  if [ $(( now - last_jira )) -ge "$JIRA_POLL" ]; then
    last_jira=$now
    if cur=$(jira_current); then
      jira_fail=0
      if [ -f "$SEEN" ]; then gank=$(jira_delta "$cur" "$(cat "$SEEN")"); else echo "seeded $SEEN with $(echo "$cur" | jq 'length') items" >&2; fi
      echo "$cur" > "$SEEN.tmp" && mv "$SEEN.tmp" "$SEEN"
    else
      jira_fail=$(( jira_fail + 1 )); [ "$jira_fail" -ge 6 ] && { echo "ERROR jira $cur"; exit 12; }
    fi
  fi

  if [ "$inbox" != "[]" ]; then report INBOX "$inbox" "$owner" "$gank"; fi
  if [ "$owner" != "[]" ]; then report OWNER "$inbox" "$owner" "$gank"; fi
  if [ "$gank" != "[]" ]; then report GANK "$inbox" "$owner" "$gank"; fi

  if [ "$pro_epoch" -gt 0 ] && [ "$now" -ge "$pro_epoch" ]; then
    elapsed=$(( now - started )); [ "$elapsed" -lt "$MIN_RUNTIME" ] && sleep $(( MIN_RUNTIME - elapsed ))
    echo "PROACTIVE"; exit 13
  fi
  if [ $(( now - started )) -ge "$max_wait" ]; then echo "HEARTBEAT"; exit 10; fi
  sleep "$POLL_SECONDS"
done
