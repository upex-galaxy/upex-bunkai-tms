#!/usr/bin/env bash
# The Jungla's side of the tutor bridge (contract: ~/.upex/bridges/tutor-jungla.md).
#
#   bridge.sh write <answer|review-request> <KEY|nokey> <body_file> [edition] [slack_channel] [slack_thread_ts]
#       writes <AAAA-MM-DDTHHMM>-<kind>-<KEY>.md into the tutor's inbox, header per the contract,
#       body copied from body_file (an `answer` body must start with `re: <original file name>`).
#       Prints the path written.
#   bridge.sh done <inbox_file> <done|failed> <one-line summary or reason>
#       stamps `status: done <HH:MM> · <summary>` (or `failed <HH:MM>: <reason>`) in the header of a
#       file from the Jungla's inbox and moves it to inbox/done/. Prints the new path.
#   bridge.sh pending
#       lists the Jungla's pending inbox files, oldest first.
#   bridge.sh sent [n]
#       the last n files the tutor already processed from the Jungla (her done/), with their status.
#
# No personal data in any file: the slack_thread_ts identifies the person.
set -uo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$SKILL_DIR/jungla.conf"

cmd="${1:?usage: bridge.sh write|done|pending|sent ...}"; shift
case "$cmd" in
  write)
    kind="${1:?kind}"; key="${2:?key}"; body="${3:?body_file}"; edition="${4:-}"; chan="${5:-}"; thread="${6:-}"
    case "$kind" in answer|review-request) ;; *) echo "bridge: the Jungla only writes answer or review-request (got $kind)"; exit 2;; esac
    [ -f "$body" ] || { echo "bridge: no body file $body"; exit 2; }
    if [ "$kind" = "answer" ] && ! head -1 "$body" | grep -q '^re: '; then echo "bridge: an answer body must start with 're: <original file>'"; exit 2; fi
    mkdir -p "$JUNGLA_TUTOR_INBOX/done"
    out="$JUNGLA_TUTOR_INBOX/$(date +%Y-%m-%dT%H%M)-$kind-$key.md"
    [ -e "$out" ] && out="${out%.md}-$(date +%S).md"
    {
      echo "---"
      echo "kind: $kind"
      echo "key: $key"
      [ -n "$edition" ] && echo "edition: $edition"
      [ -n "$chan" ] && echo "slack_channel: $chan"
      [ -n "$thread" ] && echo "slack_thread_ts: \"$thread\""
      echo "from: $JUNGLA_ID"
      echo "created: $(date +%Y-%m-%dT%H:%M%z | sed -E 's/([0-9]{2})([0-9]{2})$/\1:\2/')"
      echo "status: pending"
      echo "---"
      cat "$body"
    } > "$out.tmp" && mv "$out.tmp" "$out"
    echo "$out"
    ;;
  done)
    f="${1:?inbox_file}"; verdict="${2:?done|failed}"; note="${3:?summary}"
    [ -f "$f" ] || f="$JUNGLA_INBOX/$(basename "$f")"
    [ -f "$f" ] || { echo "bridge: no such inbox file $1"; exit 2; }
    case "$verdict" in
      done) line="status: done $(date +%H:%M) · $note" ;;
      failed) line="status: failed $(date +%H:%M): $note" ;;
      *) echo "bridge: verdict is done or failed"; exit 2 ;;
    esac
    mkdir -p "$JUNGLA_INBOX/done"
    # replace the status line inside the YAML header only (the first --- ... --- block)
    awk -v line="$line" 'NR==1 && $0=="---" {h=1; print; next} h && $0=="---" {h=0; print; next} h && /^status:/ {print line; next} {print}' "$f" > "$f.tmp" \
      && mv "$f.tmp" "$JUNGLA_INBOX/done/$(basename "$f")" && rm -f "$f"
    echo "$JUNGLA_INBOX/done/$(basename "$f")"
    ;;
  pending)
    for f in $(find "$JUNGLA_INBOX" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort); do
      sed -n '2,20p' "$f" | grep -qE '^status: *pending' && echo "$f"
    done
    ;;
  sent)
    n="${1:-10}"
    for f in $(ls -t "$JUNGLA_TUTOR_INBOX/done/"*"-answer-"*.md "$JUNGLA_TUTOR_INBOX/done/"*"-review-request-"*.md 2>/dev/null | head -"$n"); do
      echo "$(basename "$f") | $(grep -m1 '^status:' "$f")"
    done
    ;;
  *) echo "bridge: unknown command $cmd"; exit 2 ;;
esac
