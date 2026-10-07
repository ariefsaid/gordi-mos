#!/usr/bin/env bash
# Shared helpers for the operations scripts (ops-check, db-backup, reporting-snapshot-cron,
# deploy-production, deploy-staging). Sourced, never executed. Every infrastructure coordinate lives in one
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
# alert call ops_require on the two variables first), otherwise curl's exit status, so a caller
# that records "alerted" can do so only after the send worked. Callers under `set -e` that must
# not stop on a failed send use `|| true`.
ops_notify() {
  local msg="$1" f rc
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  f="$(umask 077; mktemp)" || return 1
  printf '%s' "$msg" > "$f"
  printf '%s\n' \
    "url = \"https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage\"" \
    "data = \"chat_id=${TELEGRAM_CHAT_ID}\"" \
    "data-urlencode = \"text@${f}\"" \
    'max-time = 10' 'silent' 'fail' 'output = "/dev/null"' \
    | curl -K - >/dev/null 2>&1
  rc=$?
  rm -f "$f"
  return "$rc"
}

# ---- connection-string handling shared by the deploy scripts ----
SECRETS=()

# ops_predeploy_dump DIR LABEL CONN COMMIT — create and verify the recovery dump before DB push.
# Sets OPS_PREDEPLOY_DUMP_PATH on success.
ops_predeploy_dump() {
  local dir="$1" label="$2" conn="$3" commit="$4" dump partial errf listing entries
  OPS_PREDEPLOY_DUMP_PATH=""
  umask 077
  mkdir -p "$dir" || { printf '%s: cannot create backup directory\n' "$label" >&2; return 1; }
  dump="$dir/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$commit.dump"
  partial="$dump.partial"
  errf="$(mktemp)" || { printf '%s: cannot create dump error file\n' "$label" >&2; return 1; }
  listing="$errf.list"
  printf 'Taking a fresh dump before the push...\n'
  if ! pg_dump --format=custom --no-password -d "$conn" -f "$partial" 2>"$errf" </dev/null; then
    ops_redact < "$errf" >&2
    rm -f "$partial" "$listing" "$errf"
    printf '✗ %s: pre-push dump failed — nothing was pushed\n' "$label" >&2
    return 1
  fi
  if ! pg_restore --list "$partial" >"$listing" 2>/dev/null </dev/null; then
    rm -f "$partial" "$listing" "$errf"
    printf '✗ %s: pre-push dump does not list — nothing was pushed\n' "$label" >&2
    return 1
  fi
  entries="$(grep -vc '^;' "$listing" || true)"
  if ! [[ "$entries" =~ ^[0-9]+$ ]] || [ "$entries" -eq 0 ]; then
    rm -f "$partial" "$listing" "$errf"
    printf '✗ %s: pre-push dump does not list — nothing was pushed\n' "$label" >&2
    return 1
  fi
  if ! mv "$partial" "$dump"; then
    rm -f "$partial" "$listing" "$errf"
    printf '✗ %s: pre-push dump could not be finalized — nothing was pushed\n' "$label" >&2
    return 1
  fi
  rm -f "$listing" "$errf"
  OPS_PREDEPLOY_DUMP_PATH="$dump"
  printf 'Dump verified (%s entries): %s\n' "$entries" "$dump"
}

# Replace every secret-bearing fragment (SECRETS) in the text read from stdin.
ops_redact() {
  local line s
  while IFS= read -r line || [ -n "$line" ]; do
    for s in "${SECRETS[@]}"; do line="${line//"$s"/<redacted>}"; done
    printf '%s\n' "$line"
  done
}

# ops_conn_from_url URL — sets CONN (the URL without its password) and exports PGPASSWORD (decoded),
# so the password never appears in argv (visible to every local user in `ps`); libpq and the
# supabase CLI read PGPASSWORD. Adds every secret-bearing fragment to SECRETS for ops_redact.
ops_conn_from_url() {
  local url="$1" rest hostpart host userinfo="" user pass="" s
  rest="${url#*://}"; hostpart="${rest#*@}"; host="${hostpart%%[:/?]*}"
  case "$rest" in *@*) userinfo="${rest%%@*}" ;; esac
  user="${userinfo%%:*}"; case "$userinfo" in *:*) pass="${userinfo#*:}" ;; esac
  CONN="$url"; PGPASSWORD=""
  if [ -n "$pass" ]; then
    CONN="${url%%://*}://${user}@${hostpart}"
    PGPASSWORD="$(printf '%b' "${pass//\%/\\x}")"
    export PGPASSWORD
  fi
  for s in "$url" "$userinfo" "$pass" "$PGPASSWORD" "$user" "$host"; do [ "${#s}" -ge 3 ] && SECRETS+=("$s"); done
  return 0
}
