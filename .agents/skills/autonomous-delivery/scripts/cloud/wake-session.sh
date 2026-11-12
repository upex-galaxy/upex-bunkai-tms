#!/bin/bash
# wake-session.sh <session_url> [message]
# wake-session.sh --check [url]
#
# Writes a message into a Claude Code cloud session FROM THE WEB of claude.ai, with the owner's
# Playwright profile `claude-ai`. Why: a session created with `claude --cloud` from a terminal does not
# receive the tools of the claude.ai connectors (Supabase, Atlassian, ...), not even when you write to it
# with `claude -p ... --cloud <id>`. A message typed in the web UI attaches them (known Claude Code cloud
# bug; measured 2026-10-15 in the webapp `cloud-fleet` skill, and again 2026-11-11 on Bunkai BK-507).
#
# Adapted from `upexgalaxy-webapp/.agents/skills/cloud-fleet/scripts/despertar.sh` (translated, generic
# default message). The measured sequence: open WITH a window (headless is stopped by Cloudflare "Just a
# moment...") -> wait until the title stops being the challenge -> if the URL lands on /login the profile
# lost its session -> fill the composer by role (the ref changes on every load) -> re-read the text and
# compare -> send (the key leaves the message QUEUED when the session is mid-turn) -> screenshot -> close.
#
# --check opens the URL (default https://claude.ai/code), only checks Cloudflare and the login, and closes
# without writing anything. Use it before launching a worker.
#
# Exit codes:
#   0  message sent (with --check: the profile has a session)
#   1  wrong usage, or the browser did not open
#   2  the profile has no session: the OWNER signs in, in the headed window an agent opens for them; an
#      agent never types credentials
#   3  Cloudflare (or any challenge) was not passed within CF_DESPERTAR_DESAFIO_SEG seconds
#   4  the composer did not appear, or did not accept the text
#   5  another run holds the profile (lock) and it was not released within CF_DESPERTAR_CANDADO_SEG seconds
#
# One browser at a time on the profile: noclobber lock at ~/.upex/playwright-profiles/claude-ai.lock (PID
# inside; an orphan lock cleans itself). It opens a VISIBLE window for about 20 to 60 s on the owner's screen.
#
# Variables:
#   CF_ESTADO                  state folder; the log goes to $CF_ESTADO/despertar.log and the screenshots to
#                              $CF_ESTADO/despertar/. Default: ~/.upex/cloud-fleet
#   CF_DESPERTAR_PERFIL        profile folder. Default: ~/.upex/playwright-profiles/claude-ai
#   CF_DESPERTAR_DESAFIO_SEG   max wait for the Cloudflare challenge. Default: 60
#   CF_DESPERTAR_COMPOSER_SEG  max wait for the composer. Default: 30
#   CF_DESPERTAR_CANDADO_SEG   max wait for the lock. Default: 300
#   CF_DESPERTAR_COMPOSER      force one composer selector
#   CF_DESPERTAR_TECLA         send key. Default: Meta+Enter (queues the message; plain Enter interrupts a
#                              session that is mid-turn)
set -u

SESION=claude-ai
PERFIL=${CF_DESPERTAR_PERFIL:-$HOME/.upex/playwright-profiles/claude-ai}
LOCK=$HOME/.upex/playwright-profiles/claude-ai.lock
ESTADO=${CF_ESTADO:-$HOME/.upex/cloud-fleet}
DESAFIO_SEG=${CF_DESPERTAR_DESAFIO_SEG:-60}
COMPOSER_SEG=${CF_DESPERTAR_COMPOSER_SEG:-30}
CANDADO_SEG=${CF_DESPERTAR_CANDADO_SEG:-300}
# The composer label changed over time ("Instrucciones", then a send hint); several selectors are tried in
# order and the first that accepts the text wins.
COMPOSERES=("${CF_DESPERTAR_COMPOSER:-getByRole('textbox', { name: 'Instrucciones' })}" "getByRole('textbox').last()" "locator('[contenteditable=\"true\"]').last()")
COMPOSER=${COMPOSERES[0]}
TECLA=${CF_DESPERTAR_TECLA:-Meta+Enter}
LOGIN_RE='/login|/magic-link|accounts\.google\.com'
DESAFIO_RE='just a moment|un momento|checking your browser|attention required'
MENSAJE_DEFAULT='Message from the conductor, typed from the web so this session receives the claude.ai connectors. Keep following your brief from where you are, without ending your turn. If a Supabase or Atlassian connector shows up in your tools, do NOT apply migrations or write to Jira through it: the conductor owns both. Post your next STATUS comment on the PR when you reach the next phase.'

COMPROBAR=0
if [ "${1:-}" = "--check" ]; then COMPROBAR=1; shift; URL=${1:-https://claude.ai/code}; MSG=""
else
  [ $# -ge 1 ] && [ $# -le 2 ] || { echo "Usage: wake-session.sh <session_url> [message] | wake-session.sh --check [url]" >&2; exit 1; }
  URL=$1; MSG=${2:-$MENSAJE_DEFAULT}
fi
case "$URL" in https://claude.ai/*) ;; *) echo "The URL must be on https://claude.ai/: $URL" >&2; exit 1 ;; esac
SID=$(printf '%s' "$URL" | grep -o 'session_[A-Za-z0-9]*' | head -1); SID=${SID:-no-session}

mkdir -p "$ESTADO/despertar" || exit 1
LOGF="$ESTADO/despertar.log"
log() { echo "$(date -u +%FT%TZ) $SID $*" >> "$LOGF"; echo "$*" >&2; }

# playwright-cli binds the session to the working directory: always run from this script's repo root
AQUI=$(cd "$(dirname "$0")" && pwd)
RAIZ=$(git -C "$AQUI" rev-parse --show-toplevel 2>/dev/null) || RAIZ=$AQUI
cd "$RAIZ" || exit 1

pw() { playwright-cli -s="$SESION" "$@"; }
# --raw eval returns the value as JSON; this turns it into plain text
valor() { pw --raw eval "$@" 2>/dev/null | python3 -c 'import json,sys
s = sys.stdin.read().strip()
try: v = json.loads(s)
except Exception: v = s
print(v if isinstance(v, str) else json.dumps(v))'; }
plano() { printf '%s' "$1" | tr -s '[:space:]' ' ' | sed -e 's/^ //' -e 's/ $//'; }

ABIERTO=0; CANDADO=0
limpiar() {
  [ "$ABIERTO" = 1 ] && pw close >/dev/null 2>&1
  [ "$CANDADO" = 1 ] && rm -f "$LOCK"
}
trap limpiar EXIT
trap 'log "interrupted"; exit 1' INT TERM

captura() { pw screenshot --filename="$ESTADO/despertar/$SID-$(date -u +%Y%m%dT%H%M%SZ)-$1.png" >/dev/null 2>&1; }

# 1 · lock: one browser at a time on the profile
fin=$(( $(date +%s) + CANDADO_SEG ))
while :; do
  if ( set -o noclobber; echo "$$ $(date +%s) $URL" > "$LOCK" ) 2>/dev/null; then CANDADO=1; break; fi
  otro=$(awk '{print $1; exit}' "$LOCK" 2>/dev/null)
  if [ -n "$otro" ] && ! kill -0 "$otro" 2>/dev/null; then rm -f "$LOCK"; continue; fi   # orphan lock
  [ "$(date +%s)" -ge "$fin" ] && { log "lock held by PID ${otro:-?} after $CANDADO_SEG s: not opening"; exit 5; }
  sleep 5
done

[ -d "$PERFIL" ] || { log "profile $PERFIL does not exist: the owner has to sign in (headed)"; exit 2; }
if playwright-cli list 2>/dev/null | grep -q -- "$SESION"; then
  log "a browser is already open with -s=$SESION outside this script (maybe the login window): not opening another"; exit 5
fi

# 2 · open with a window (Cloudflare stops headless)
log "opening $URL (headed)"
pw open "$URL" --profile="$PERFIL" --headed --browser=chrome >/dev/null 2>&1 || { log "open failed"; exit 1; }
ABIERTO=1

# 3 · Cloudflare challenge
fin=$(( $(date +%s) + DESAFIO_SEG )); titulo=""
while :; do
  titulo=$(valor "document.title")
  if [ -n "$titulo" ] && ! printf '%s' "$titulo" | grep -E -i -q "$DESAFIO_RE"; then break; fi
  [ "$(date +%s)" -ge "$fin" ] && { captura desafio; log "challenge not passed after $DESAFIO_SEG s (title: «${titulo}»)"; exit 3; }
  sleep 5
done

# 4 · is there a session?
href=$(valor "location.href")
if printf '%s' "$href" | grep -E -q "$LOGIN_RE"; then
  captura login; log "the profile has no session ($href): the owner has to sign in in the profile window"; exit 2
fi
if [ "$COMPROBAR" = 1 ]; then log "check OK: title «${titulo}», $href"; exit 0; fi

# 4b · the "Enable notifications" dialog covers the page (seen 2026-10-25 and 2026-10-29): close it if present
pw click "getByText('No me lo vuelvas a preguntar')" >/dev/null 2>&1 || pw click "getByRole('button', { name: 'Ahora no' })" >/dev/null 2>&1 || true

# 5 · type in the composer (found by role: the ref changes on every load)
esperado=$(plano "$MSG"); fin=$(( $(date +%s) + COMPOSER_SEG )); escrito=""
while :; do
  for c in "${COMPOSERES[@]}"; do
    if pw fill "$c" "$MSG" >/dev/null 2>&1; then
      escrito=$(plano "$(valor "el => el.innerText || el.value || ''" "$c")")
      if [ "$escrito" = "$esperado" ]; then COMPOSER=$c; break 2; fi
    fi
  done
  [ "$(date +%s)" -ge "$fin" ] && {
    captura composer
    if [ -z "$escrito" ]; then log "the composer did not appear in $COMPOSER_SEG s with any selector ($href)"
    else log "the composer did not keep the requested text: «${escrito:0:120}…»"; fi
    exit 4; }
  sleep 5
done

# 6 · send
pw press "$TECLA" >/dev/null 2>&1 || { captura enter; log "press $TECLA failed"; exit 4; }
sleep 3
resto=$(plano "$(valor "el => el.innerText || el.value || ''" "$COMPOSER")")
captura enviado
if [ -n "$resto" ]; then log "$TECLA sent, but the composer still has text («${resto:0:80}…»): look at the screenshot"
else log "message sent (${#MSG} characters)"; fi
exit 0
