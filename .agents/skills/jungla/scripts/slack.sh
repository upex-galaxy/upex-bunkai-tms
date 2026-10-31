#!/usr/bin/env bash
# The Jungla's Slack, always as the Aurora bot (SLACK_MCP_BOT_TOKEN, never printed), never with the
# claude.ai Slack connector (that one posts as the owner).
#
#   slack.sh channel
#       resolves the Jungla channel (JUNGLA_SLACK_CHANNEL_NAME): finds it among the channels the bot
#       is in, or creates it private; invites both owners; writes its id to JUNGLA_SLACK_CHANNEL_FILE
#       (the watcher reads it). Prints `CHANNEL <id> members=<n>` or `ERROR <slack error>`.
#       Creating a private channel can be reserved to workspace admins (`restricted_action`,
#       measured 2026-10-30): then an owner creates it and invites the Aurora bot, and this finds it.
#   slack.sh post <text_file> [thread_ts]
#       posts the file's text, prefixed with JUNGLA_SLACK_PREFIX on top-level messages, and prints
#       `POSTED <ts>` after reading the message back from the channel.
set -uo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$SKILL_DIR/jungla.conf"
TOKEN=$(grep -E '^SLACK_MCP_BOT_TOKEN=' "$JUNGLA_SLACK_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'")
[ -n "$TOKEN" ] || { echo "ERROR no SLACK_MCP_BOT_TOKEN in $JUNGLA_SLACK_ENV"; exit 12; }
get() { curl -s --max-time 15 -H "Authorization: Bearer $TOKEN" "https://slack.com/api/$1"; }
post() { curl -s --max-time 15 -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json; charset=utf-8' "https://slack.com/api/$1" -d "$2"; }

case "${1:?usage: slack.sh channel|post ...}" in
  channel)
    id=$(get "users.conversations?types=private_channel,public_channel&limit=1000&exclude_archived=true" \
      | jq -r --arg n "$JUNGLA_SLACK_CHANNEL_NAME" '.channels[]? | select(.name == $n) | .id' | head -1)
    if [ -z "$id" ]; then
      r=$(post conversations.create "$(jq -c -n --arg n "$JUNGLA_SLACK_CHANNEL_NAME" '{name: $n, is_private: true}')")
      id=$(echo "$r" | jq -r '.channel.id // empty')
      [ -n "$id" ] || { echo "ERROR conversations.create: $(echo "$r" | jq -r '.error')"; exit 12; }
    fi
    users=$(echo "$JUNGLA_OWNERS" | jq -r 'join(",")')
    inv=$(post conversations.invite "$(jq -c -n --arg c "$id" --arg u "$users" '{channel: $c, users: $u}')")
    # already_in_channel is the normal answer on a re-run
    if [ "$(echo "$inv" | jq -r '.ok')" != "true" ] && [ "$(echo "$inv" | jq -r '.error')" != "already_in_channel" ]; then
      echo "WARN invite: $(echo "$inv" | jq -c '{error, errors}')"
    fi
    mkdir -p "$(dirname "$JUNGLA_SLACK_CHANNEL_FILE")"
    echo "$id" > "$JUNGLA_SLACK_CHANNEL_FILE"
    members=$(get "conversations.members?channel=$id" | jq -c --argjson o "$JUNGLA_OWNERS" '[.members[]? | select(. as $m | $o | index($m))] | length')
    echo "CHANNEL $id owners_in=$members"
    ;;
  post)
    file="${2:?text_file}"; thread="${3:-}"
    chan=$(cat "$JUNGLA_SLACK_CHANNEL_FILE" 2>/dev/null | tr -d '[:space:]')
    [ -n "$chan" ] || { echo "ERROR no channel yet: run slack.sh channel"; exit 12; }
    text=$(cat "$file")
    [ -z "$thread" ] && text="*$JUNGLA_SLACK_PREFIX*
$text"
    body=$(jq -c -n --arg c "$chan" --arg t "$text" --arg th "$thread" \
      '{channel: $c, text: $t, blocks: [{type: "section", text: {type: "mrkdwn", text: $t}}]} + (if $th == "" then {} else {thread_ts: $th} end)')
    r=$(post chat.postMessage "$body")
    ts=$(echo "$r" | jq -r '.ts // empty')
    [ -n "$ts" ] || { echo "ERROR chat.postMessage: $(echo "$r" | jq -r '.error')"; exit 12; }
    back=$(get "conversations.history?channel=$chan&latest=$ts&inclusive=true&limit=1" | jq -r '.messages[0].ts // empty')
    [ "$back" = "$ts" ] && echo "POSTED $ts" || echo "POSTED $ts (not read back yet)"
    ;;
  *) echo "usage: slack.sh channel|post ..."; exit 2 ;;
esac
