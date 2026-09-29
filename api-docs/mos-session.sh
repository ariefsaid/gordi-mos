#!/usr/bin/env bash
# mos-session.sh — sign in to MOS as yourself and call api_v1 operations from this shell.
#
#   export MOS_API_URL='<SUPABASE_URL>'   # the data API base, no trailing slash
#   export MOS_ANON_KEY='<ANON_KEY>'      # the project's public anon key (not a secret)
#   source api-docs/mos-session.sh        # works in bash and zsh; do not execute it, source it
#   mos_signin                            # asks for your email and password (input hidden)
#   mos_call whoami
#   TEAM=$(mos_call list_teams '{"q":"Kitchen"}' 2>/dev/null | mos_one_id team)
#   mos_call create_task '{"title":"Order oat milk","team_id":"<uuid>", ...}'
#   mos_signout
#
# The password is read once, sent to the sign-in endpoint on stdin (never in a command's arguments),
# and never stored. The session
# token and refresh token live only in this shell's memory (plain variables, not exported, so child
# processes do not inherit them); nothing is written to a file. `mos_signout` clears them.
# Needs curl and jq.

_mos_need() {
  command -v curl >/dev/null 2>&1 || { echo "mos-session: curl is required" >&2; return 1; }
  command -v jq >/dev/null 2>&1 || { echo "mos-session: jq is required" >&2; return 1; }
  [ -n "${MOS_API_URL:-}" ] || { echo "mos-session: set MOS_API_URL first" >&2; return 1; }
  [ -n "${MOS_ANON_KEY:-}" ] || { echo "mos-session: set MOS_ANON_KEY first" >&2; return 1; }
}

# Prints one line: hidden when stdin is a terminal, otherwise the first stdin line.
_mos_read_secret() {
  local prompt="$1" value=""
  if [ -t 0 ]; then
    printf '%s' "$prompt" >&2
    stty -echo 2>/dev/null
    IFS= read -r value
    stty echo 2>/dev/null
    printf '\n' >&2
  else
    IFS= read -r value
  fi
  printf '%s' "$value"
}

# _mos_json_body k1 v1 [k2 v2] — prints {"k1":v1,...}. Values go to jq on stdin (printf is a shell
# builtin), so a password or token never appears in any process's argument list.
_mos_json_body() {
  local out="{" sep="" k v
  while [ "$#" -ge 2 ]; do
    k="$1"; v="$(printf '%s' "$2" | jq -Rs .)"
    out="$out$sep\"$k\":$v"; sep=","; shift 2
  done
  printf '%s}' "$out"
}

_mos_store_session() {
  local body="$1" token refresh
  token="$(printf '%s' "$body" | jq -r '.access_token // empty')"
  refresh="$(printf '%s' "$body" | jq -r '.refresh_token // empty')"
  [ -n "$token" ] || return 1
  MOS_ACCESS_TOKEN="$token"
  MOS_REFRESH_TOKEN="$refresh"
}

# mos_signin [email] — password grant as yourself.
mos_signin() {
  _mos_need || return 1
  local email="${1:-}" password reply
  if [ -z "$email" ]; then
    if [ -t 0 ]; then printf 'Email: ' >&2; IFS= read -r email; else IFS= read -r email; fi
  fi
  password="$(_mos_read_secret 'Password: ')"
  reply="$(_mos_json_body email "$email" password "$password" \
    | curl -sS -X POST "$MOS_API_URL/auth/v1/token?grant_type=password" \
        -H "apikey: $MOS_ANON_KEY" -H 'Content-Type: application/json' --data-binary @-)"
  password=""
  if _mos_store_session "$reply"; then
    echo "signed in as $email" >&2
  else
    echo "sign-in failed: $(printf '%s' "$reply" | jq -r '.msg // .error_description // .message // "no session returned"')" >&2
    return 1
  fi
}

# mos_refresh — new session from the refresh token (tokens last about an hour).
mos_refresh() {
  _mos_need || return 1
  [ -n "${MOS_REFRESH_TOKEN:-}" ] || { echo "mos-session: not signed in" >&2; return 1; }
  local reply
  reply="$(_mos_json_body refresh_token "$MOS_REFRESH_TOKEN" \
    | curl -sS -X POST "$MOS_API_URL/auth/v1/token?grant_type=refresh_token" \
        -H "apikey: $MOS_ANON_KEY" -H 'Content-Type: application/json' --data-binary @-)"
  _mos_store_session "$reply" || { echo "mos-session: refresh failed; run mos_signin again" >&2; return 1; }
}

# mos_call <operation> [json-body] — POST to /rest/v1/rpc/<operation> with the api_v1 profile.
# Prints the response body on stdout and "HTTP <status>" on stderr; returns non-zero unless 2xx.
# A 401 means the session expired: run mos_refresh in your main shell (not inside $(...), where the
# new token would be lost), then repeat the call.
mos_call() {
  _mos_need || return 1
  local op="${1:?usage: mos_call <operation> [json-body]}" body="${2:-}" out status
  [ -n "$body" ] || body='{}'
  [ -n "${MOS_ACCESS_TOKEN:-}" ] || { echo "mos-session: not signed in; run mos_signin" >&2; return 1; }
  out="$(printf '%s' "$body" | curl -sS -X POST "$MOS_API_URL/rest/v1/rpc/$op" \
    -H @<(printf 'apikey: %s\nAuthorization: Bearer %s\n' "$MOS_ANON_KEY" "$MOS_ACCESS_TOKEN") \
    -H 'Content-Type: application/json' -H 'Content-Profile: api_v1' -H 'Accept-Profile: api_v1' \
    --data-binary @- -w $'\n%{http_code}')"
  status="${out##*$'\n'}"
  printf '%s\n' "${out%$'\n'*}"
  echo "HTTP $status" >&2
  case "$status" in 2??) return 0 ;; *) return 1 ;; esac
}

# mos_one_id <what> — reads a list result on stdin ({items: [...]}) and prints the id of the single
# item; fails with a message when there are none or several, so a lookup is never guessed.
mos_one_id() {
  jq -er --arg what "${1:-record}" '.items | if length == 1 then .[0].id else error("\($what): \(length) matches, expected exactly 1") end'
}

# mos_signout — forget the session in this shell.
mos_signout() {
  MOS_ACCESS_TOKEN=""
  MOS_REFRESH_TOKEN=""
  echo "signed out (session cleared from this shell)" >&2
}
