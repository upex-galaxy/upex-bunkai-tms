#!/bin/bash
# watch-pr.sh <pr-number> [max-minutes] [since-comment-id]
#
# Zero-token wait for a cloud worker. Run it in the BACKGROUND (`run_in_background`), so the conductor is
# woken by its exit. The worker reports through PR comments (the Orca mailbox does not exist in the cloud):
# a comment whose first line starts with STATUS, MIGRATION-READY, DONE or BLOCKED.
#
# Exit codes (the last output line says which):
#   0  ATTENTION  a new non-bot comment starts with MIGRATION-READY, DONE, BLOCKED, STOP or contains MISSING
#                 (the lines `NEW <id> <first line>` list every new comment seen)
#   10 QUIET      max-minutes passed with nothing needing attention (relaunch it)
#   11 STUCK      no new comment and no push to the PR branch for CF_STUCK_MIN minutes (default 60)
#
# `since-comment-id` defaults to the newest comment id at start, so only NEW comments count. The last seen
# id is kept in $CF_ESTADO/pr-<n>.lastid (CF_ESTADO default ~/.upex/cloud-fleet) so a relaunch does not
# replay old comments. Polls every CF_POLL_SEC seconds (default 300) with `gh api` (REST).
#
# Variables: CF_REPO (default: the repo of the current checkout), CF_ESTADO, CF_POLL_SEC, CF_STUCK_MIN.
set -u
[ $# -ge 1 ] || { echo "Usage: watch-pr.sh <pr-number> [max-minutes] [since-comment-id]" >&2; exit 2; }
PR=$1; MAXMIN=${2:-100}
ESTADO=${CF_ESTADO:-$HOME/.upex/cloud-fleet}; mkdir -p "$ESTADO"
REPO=${CF_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)}
[ -n "$REPO" ] || { echo "Cannot resolve the repo (set CF_REPO=owner/name)" >&2; exit 2; }
POLL=${CF_POLL_SEC:-300}; STUCK=$(( ${CF_STUCK_MIN:-60} * 60 ))
STATE="$ESTADO/pr-$PR.lastid"

if [ -n "${3:-}" ]; then seen=$3
elif [ -s "$STATE" ]; then seen=$(cat "$STATE")
else seen=$(gh api "repos/$REPO/issues/$PR/comments" --jq '.[-1].id // 0' 2>/dev/null); seen=${seen:-0}; fi
echo "$seen" > "$STATE"

branch=$(gh api "repos/$REPO/pulls/$PR" --jq .head.ref 2>/dev/null)
head_of() { gh api "repos/$REPO/pulls/$PR" --jq .head.sha 2>/dev/null; }
lasthead=$(head_of); lastact=$(date +%s); deadline=$(( $(date +%s) + MAXMIN * 60 ))

while :; do
  out=$(gh api "repos/$REPO/issues/$PR/comments" --jq ".[] | select(.id > $seen and .user.type != \"Bot\") | \"\(.id)\t\(.body | split(\"\n\")[0] | .[0:160])\"" 2>/dev/null)
  if [ -n "$out" ]; then
    lastact=$(date +%s)
    printf '%s\n' "$out" | while IFS=$'\t' read -r id first; do echo "NEW $id $first"; done
    seen=$(printf '%s\n' "$out" | tail -1 | cut -f1); echo "$seen" > "$STATE"
    if printf '%s\n' "$out" | grep -qE $'\t(MIGRATION-READY|DONE|BLOCKED|STOP)|MISSING'; then echo "ATTENTION"; exit 0; fi
  fi
  h=$(head_of); [ -n "$h" ] && [ "$h" != "$lasthead" ] && { lasthead=$h; lastact=$(date +%s); }
  [ $(( $(date +%s) - lastact )) -gt "$STUCK" ] && { echo "STUCK (no comment or push for $((STUCK/60)) min on ${branch:-the PR branch})"; exit 11; }
  [ "$(date +%s)" -ge "$deadline" ] && { echo "QUIET ($MAXMIN min)"; exit 10; }
  sleep "$POLL"
done
