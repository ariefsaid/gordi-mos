#!/usr/bin/env bash
# Production health check for cron (every 5 minutes). Alerts through the Telegram notifier once
# when a condition starts failing and once when it recovers, never on every run.
#
#   */5 * * * * /path/to/scripts/ops-check.sh >> ~/ops-check.log 2>&1
#
# Checks: database reachable; ERP outbox dead letters; oldest pending/failed outbox row age;
# ERP worker heartbeat age; app URL and auth health endpoint; client-error rows in the last
# 15 minutes (skipped while the log table does not exist). Every coordinate comes from the
# untracked env file (scripts/ops.env.example, OPS_ENV_FILE); a missing value refuses the run.
# Self-test: scripts/ops-check.test.sh
set -u -o pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ops-common.sh
. "$HERE/lib/ops-common.sh" || { echo "ops-check: lib/ops-common.sh missing" >&2; exit 2; }

ops_load_env ops-check || exit 2
ops_require ops-check TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID OPS_DB_HOST OPS_DB_PORT OPS_DB_USER \
  OPS_DB_NAME PGPASSFILE OPS_STATE_DIR OPS_APP_URL OPS_AUTH_HEALTH_URL OPS_ESB_HEARTBEAT_FILE || exit 2

PENDING_MAX_MIN="${OPS_PENDING_MAX_AGE_MIN:-30}"
HEARTBEAT_MAX_MIN="${OPS_ESB_HEARTBEAT_MAX_AGE_MIN:-15}"
CLIENT_ERR_MAX="${OPS_CLIENT_ERROR_THRESHOLD:-20}"
CLIENT_ERR_COL="${OPS_CLIENT_ERROR_TIME_COLUMN:-created_at}"
RETRY_SLEEP="${OPS_PROBE_RETRY_SLEEP:-3}"
ENV_FILTER=""
if [ -n "${OPS_ESB_TARGET_ENV:-}" ]; then
  case "$OPS_ESB_TARGET_ENV" in dry_run|goo|gkid) ENV_FILTER="and target_env = '$OPS_ESB_TARGET_ENV'" ;;
    *) echo "ops-check: OPS_ESB_TARGET_ENV must be dry_run, goo or gkid" >&2; exit 2 ;; esac
fi
if [ -n "${OPS_CLIENT_ERROR_TABLE:-}" ]; then
  [[ "$OPS_CLIENT_ERROR_TABLE" =~ ^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$ ]] || { echo "ops-check: OPS_CLIENT_ERROR_TABLE must be schema.table" >&2; exit 2; }
  [[ "$CLIENT_ERR_COL" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "ops-check: OPS_CLIENT_ERROR_TIME_COLUMN must be a column name" >&2; exit 2; }
fi

umask 077
mkdir -p "$OPS_STATE_DIR" || { echo "ops-check: cannot create OPS_STATE_DIR" >&2; exit 2; }

# ---- alert once per condition: <name>.alert in the state dir means "already alerted" ----
report() { # name status(ok|fail) message
  local name="$1" status="$2" msg="$3" f="$OPS_STATE_DIR/$1.alert"
  if [ "$status" = fail ]; then
    if [ ! -e "$f" ]; then
      printf '%s\n' "$msg" > "$f"
      ops_notify "🚨 ops-check ${name}: ${msg}"
    fi
  elif [ -e "$f" ]; then
    rm -f "$f"
    ops_notify "✅ ops-check ${name} recovered: ${msg}"
  fi
}

sql() { # one scalar; non-zero on failure
  PGCONNECT_TIMEOUT=10 PGOPTIONS='-c statement_timeout=15000' \
    psql -X -At -v ON_ERROR_STOP=1 -h "$OPS_DB_HOST" -p "$OPS_DB_PORT" -U "$OPS_DB_USER" -d "$OPS_DB_NAME" -c "$1" 2>/dev/null </dev/null
}

http_ok() { # url [apikey]; the key rides curl's stdin config, never argv
  local n
  for n in 1 2; do
    { printf 'url = "%s"\n' "$1"; [ -n "${2:-}" ] && printf 'header = "apikey: %s"\n' "$2"
      printf '%s\n' 'fail' 'silent' 'output = "/dev/null"' 'max-time = 10'; } | curl -K - >/dev/null 2>&1 && return 0
    [ "$n" = 1 ] && sleep "$RETRY_SLEEP"
  done
  return 1
}

mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }

# ---- database and outbox ----
if [ "$(sql 'select 1')" = 1 ]; then
  report database ok "reachable"
  n="$(sql "select count(*) from integrations.esb_push where status = 'dead_letter' $ENV_FILTER")"
  if [[ "$n" =~ ^[0-9]+$ ]]; then
    if [ "$n" -gt 0 ]; then report dead_letter fail "$n ERP outbox row(s) dead-lettered"
    else report dead_letter ok "no dead-lettered rows"; fi
  else report dead_letter fail "outbox query failed"; fi

  age="$(sql "select coalesce(floor(extract(epoch from now() - min(created_at)) / 60), 0)::int from integrations.esb_push where status in ('pending','failed') $ENV_FILTER")"
  if [[ "$age" =~ ^[0-9]+$ ]]; then
    if [ "$age" -gt "$PENDING_MAX_MIN" ]; then report pending_age fail "oldest pending ERP row is ${age} min old (limit ${PENDING_MAX_MIN})"
    else report pending_age ok "oldest pending row ${age} min"; fi
  else report pending_age fail "outbox age query failed"; fi

  if [ -n "${OPS_CLIENT_ERROR_TABLE:-}" ]; then
    if [ "$(sql "select to_regclass('${OPS_CLIENT_ERROR_TABLE}') is not null")" = t ]; then
      c="$(sql "select count(*) from ${OPS_CLIENT_ERROR_TABLE} where ${CLIENT_ERR_COL} > now() - interval '15 minutes'")"
      if [[ "$c" =~ ^[0-9]+$ ]]; then
        if [ "$c" -gt "$CLIENT_ERR_MAX" ]; then report client_errors fail "$c client errors in 15 min (limit ${CLIENT_ERR_MAX})"
        else report client_errors ok "$c client errors in 15 min"; fi
      fi
    fi  # table absent: skipped, not an alert
  fi
else
  report database fail "production database unreachable"
fi

# ---- ERP worker heartbeat ----
hb="$(mtime "$OPS_ESB_HEARTBEAT_FILE")"
if [[ "$hb" =~ ^[0-9]+$ ]]; then
  hb_age=$(( ( $(date +%s) - hb ) / 60 ))
  if [ "$hb_age" -gt "$HEARTBEAT_MAX_MIN" ]; then report worker_heartbeat fail "ERP worker last ran ${hb_age} min ago (limit ${HEARTBEAT_MAX_MIN})"
  else report worker_heartbeat ok "ERP worker ran ${hb_age} min ago"; fi
else
  report worker_heartbeat fail "ERP worker heartbeat file missing"
fi

# ---- reachability ----
if http_ok "$OPS_APP_URL"; then report app ok "reachable"; else report app fail "app URL not reachable"; fi
if http_ok "$OPS_AUTH_HEALTH_URL" "${OPS_AUTH_HEALTH_APIKEY:-}"; then report auth ok "health endpoint reachable"
else report auth fail "auth health endpoint not reachable"; fi

exit 0
