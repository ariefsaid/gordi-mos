#!/usr/bin/env bash
# Shared helpers for the operations scripts (ops-check, db-backup, reporting-snapshot-cron,
# deploy-production). Sourced, never executed. Every infrastructure coordinate lives in one
# untracked env file; this repo carries only its placeholder template (scripts/ops.env.example).
#
#   OPS_ENV_FILE   path of the env file (default ~/.config/gordi-ops/ops.env)

OPS_ENV_FILE="${OPS_ENV_FILE:-$HOME/.config/gordi-ops/ops.env}"

# Source the env file; exported so child processes (python, psql) see it. Fail closed if absent.
ops_load_env() {
  local who="${1:-ops}"
  if [ ! -r "$OPS_ENV_FILE" ]; then
    printf '%s: env file not readable (set OPS_ENV_FILE; template: scripts/ops.env.example)\n' "$who" >&2
    return 2
  fi
  set -a
  # shellcheck disable=SC1090
  . "$OPS_ENV_FILE"
  set +a
}

# ops_require WHO VAR...  — lists every unset/empty variable by name, returns 2 if any.
ops_require() {
  local who="$1" v missing=""; shift
  for v in "$@"; do
    [ -n "${!v:-}" ] || missing="$missing $v"
  done
  if [ -n "$missing" ]; then
    printf '%s: refusing to run, missing in %s:%s\n' "$who" "$OPS_ENV_FILE" "$missing" >&2
    return 2
  fi
}

# Remove password-bearing fragments (DSNs, password= pairs, bot-token URLs) from stdin.
ops_scrub() {
  sed -E 's#(postgres(ql)?://[^:/@ ]+:)[^@ ]+(@)#\1****\3#g; s#([Pp]assword=)[^ \&]+#\1****#g; s#(/bot)[0-9]+:[A-Za-z0-9_-]+#\1****#g'
}

# ops_notify MESSAGE — Telegram. The bot token and chat id go to curl on stdin (-K -), never argv;
# the text goes through a private temp file. Returns 0 when not configured (callers that must
# alert call ops_require on the two variables first) and never fails the caller on a send error.
ops_notify() {
  local msg="$1" f
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  f="$(umask 077; mktemp)" || return 0
  printf '%s' "$msg" > "$f"
  printf '%s\n' \
    "url = \"https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage\"" \
    "data = \"chat_id=${TELEGRAM_CHAT_ID}\"" \
    "data-urlencode = \"text@${f}\"" \
    'max-time = 10' 'silent' 'output = "/dev/null"' \
    | curl -K - >/dev/null 2>&1 || true
  rm -f "$f"
  return 0
}
