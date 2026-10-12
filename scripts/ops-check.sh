#!/usr/bin/env bash
# Production health check for cron (every 5 minutes). Alerts through the Telegram notifier once
# when a condition starts failing and once when it recovers, never on every run.
#
#   */5 * * * * /path/to/scripts/ops-check.sh >> ~/ops-check.log 2>&1
#
# Checks: database reachable; ERP outbox dead letters, claimable-row age, expired leases and
# sent-row retention; ERP worker heartbeat age (required); newest nightly dump (when
# OPS_BACKUP_DIR is set); app URL and auth health endpoint; client-error rows in the last
# 15 minutes (skipped while the log table does not exist). Every coordinate comes from the
# untracked env file (scripts/ops.env.example, OPS_ENV_FILE); a missing value refuses the run.
# Self-test: scripts/ops-check.test.sh
set -u -o pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ops-common.sh
. "$HERE/lib/ops-common.sh" || { echo "ops-check: lib/ops-common.sh missing" >&2; exit 2; }

ops_load_env ops-check || exit 2
ops_require ops-check TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID OPS_DB_HOST OPS_DB_PORT OPS_DB_USER \
  OPS_DB_NAME PGPASSFILE OPS_STATE_DIR OPS_APP_URL OPS_AUTH_HEALTH_URL || exit 2

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
# The state changes only after the send succeeded, so a failed Telegram send is retried on the
# next run instead of silencing the condition.
report() { # name status(ok|fail) message [recovery message]
  local name="$1" status="$2" msg="$3" recovery="${4:-$3}" f="$OPS_STATE_DIR/$1.alert"
  if [ "$status" = fail ]; then
    if [ ! -e "$f" ] && ops_notify "🚨 $msg"; then
      printf '%s\n' "$msg" > "$f"
    fi
  elif [ -e "$f" ] && ops_notify "✅ $recovery"; then
    rm -f "$f"
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
  report database ok "MOS can reach its database again."
  n="$(sql "select count(*) from integrations.esb_push where status = 'dead_letter' $ENV_FILTER")"
  if [[ "$n" =~ ^[0-9]+$ ]]; then
    if [ "$n" -gt 0 ]; then report dead_letter fail \
      "Some MOS updates could not be sent to ERP. ERP may be missing recent changes; please review and resend them." \
      "MOS updates are reaching ERP again."
    else report dead_letter ok "MOS updates are reaching ERP again."; fi
  else report dead_letter fail \
    "MOS couldn't check whether ERP updates failed. ERP may be missing recent changes; please check the connection." \
    "MOS updates are reaching ERP again."; fi

  age="$(sql "select coalesce(floor(extract(epoch from now() - min(created_at)) / 60), 0)::int from integrations.esb_push where status = 'pending' and (next_attempt_at is null or next_attempt_at <= now()) $ENV_FILTER")"
  if [[ "$age" =~ ^[0-9]+$ ]]; then
    if [ "$age" -gt "$PENDING_MAX_MIN" ]; then report pending_age fail \
      "Some MOS updates have waited ${age} minutes to reach ERP. ERP may be behind; please check the connection." \
      "MOS updates are reaching ERP on time again."
    else report pending_age ok "MOS updates are reaching ERP on time again."; fi
  else report pending_age fail \
    "MOS couldn't check whether updates are waiting to reach ERP. ERP may be behind; please check the connection." \
    "MOS updates are reaching ERP on time again."; fi

  stuck="$(sql "select count(*) from integrations.esb_push where status = 'in_flight' and locked_at < now() - interval '10 minutes' $ENV_FILTER")"
  if [[ "$stuck" =~ ^[0-9]+$ ]]; then
    if [ "$stuck" -gt 0 ]; then report in_flight fail \
      "Some MOS updates are stuck while being sent to ERP. ERP may be missing recent changes; please check the ERP worker." \
      "MOS updates are moving through to ERP again."
    else report in_flight ok "MOS updates are moving through to ERP again."; fi
  else report in_flight fail \
    "MOS couldn't check whether updates are stuck on their way to ERP. ERP may be missing changes; please check the ERP worker." \
    "MOS updates are moving through to ERP again."; fi

  old_sent="$(sql "select count(*) from integrations.esb_push where status = 'posted' and posted_at < now() - interval '30 days' $ENV_FILTER")"
  if [[ "$old_sent" =~ ^[0-9]+$ ]]; then
    if [ "$old_sent" -gt 0 ]; then report sent_retention fail \
      "Older MOS updates have not been cleared after reaching ERP. This may use extra storage; please check the cleanup." \
      "Old MOS updates have been cleared."
    else report sent_retention ok "Old MOS updates have been cleared."; fi
  else report sent_retention fail \
    "MOS couldn't check whether old ERP updates were cleared. Storage may keep growing; please check the cleanup." \
    "Old MOS updates have been cleared."; fi

  if [ -n "${OPS_CLIENT_ERROR_TABLE:-}" ]; then
    if [ "$(sql "select to_regclass('${OPS_CLIENT_ERROR_TABLE}') is not null")" = t ]; then
      c="$(sql "select count(*) from ${OPS_CLIENT_ERROR_TABLE} where ${CLIENT_ERR_COL} > now() - interval '15 minutes'")"
      if [[ "$c" =~ ^[0-9]+$ ]]; then
        if [ "$c" -gt "$CLIENT_ERR_MAX" ]; then report client_errors fail \
          "The app logged ${c} errors in the past 15 minutes. People may have trouble using MOS; please check the app." \
          "MOS errors are back to normal."
        else report client_errors ok "MOS errors are back to normal."; fi
      fi
    fi  # table absent: skipped, not an alert
  fi
else
  report database fail "MOS can't reach its database. MOS data may be unavailable; please check the database connection." \
    "MOS can reach its database again."
fi

# ---- ERP worker heartbeat is required: an unset path is itself a deployment alert ----
if [ -z "${OPS_ESB_HEARTBEAT_FILE:-}" ]; then
  report worker_heartbeat fail \
    "The ERP worker hasn't reported in. Recent MOS updates may not reach ERP; please check the worker." \
    "The ERP worker is reporting in again."
elif [ "$OPS_ESB_HEARTBEAT_FILE" = none ]; then
  report worker_heartbeat ok "This server is no longer expected to run the ERP worker."
else
  hb="$(mtime "$OPS_ESB_HEARTBEAT_FILE")"
  if [[ "$hb" =~ ^[0-9]+$ ]]; then
    hb_age=$(( ( $(date +%s) - hb ) / 60 ))
    if [ "$hb_age" -gt "$HEARTBEAT_MAX_MIN" ]; then report worker_heartbeat fail \
      "The ERP worker hasn't reported in for ${hb_age} minutes. Recent MOS updates may not reach ERP; please check the worker." \
      "The ERP worker is reporting in again."
    else report worker_heartbeat ok "The ERP worker is reporting in again."; fi
  else
    report worker_heartbeat fail \
      "The ERP worker hasn't reported in. Recent MOS updates may not reach ERP; please check the worker." \
      "The ERP worker is reporting in again."
  fi
fi

# ---- nightly backup present (cron that dies silently is the failure db-backup.sh cannot report) ----
if [ -n "${OPS_BACKUP_DIR:-}" ]; then
  max_h="${OPS_BACKUP_MAX_AGE_HOURS:-26}"
  if [ -n "$(find "$OPS_BACKUP_DIR" -maxdepth 1 -type f -name 'mos-*.dump' -mmin "-$((max_h * 60))" 2>/dev/null | head -n 1)" ]; then
    report backup ok "A recent database copy is available again."
  else report backup fail \
    "No recent database copy is available. A restore may miss recent MOS changes; please check the backup job." \
    "A recent database copy is available again."; fi
fi

# ---- reachability ----
if http_ok "$OPS_APP_URL"; then report app ok "MOS is responding again."
else report app fail "MOS isn't responding at its usual address. People may be unable to use it; please check MOS." \
  "MOS is responding again."; fi
if http_ok "$OPS_AUTH_HEALTH_URL" "${OPS_AUTH_HEALTH_APIKEY:-}"; then report auth ok "The sign-in service is responding again."
else report auth fail "The sign-in service isn't responding. People may have trouble signing in; please check the service." \
  "The sign-in service is responding again."; fi

exit 0
