#!/usr/bin/env bash
# Self-test for scripts/ops-check.sh. psql and curl are PATH shims driven by FAKE_* variables; no
# network, no database. Each alert case asserts a second run stays silent and recovery fires once.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/ops-check.sh"
tmp="$(mktemp -d -t opscheck.XXXXXX)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /'; }

TOKEN='123456:FAKE-token_ZZ'; APIKEY='fake-api-key-QQ'
mkdir -p "$tmp/bin" "$tmp/state"
cat > "$tmp/bin/psql" <<'SH'
#!/usr/bin/env bash
printf 'argv %s | passfile=%s\n' "$*" "${PGPASSFILE:-}" >> "$PSQLLOG"
case "$*" in
  *"select 1"*) [ "${FAKE_DB_DOWN:-0}" = 1 ] && exit 2; echo 1 ;;
  *dead_letter*) [ "${FAKE_QUERY_FAIL:-}" = dead_letter ] && exit 2; echo "${FAKE_DEAD:-0}" ;;
  *in_flight*) [ "${FAKE_QUERY_FAIL:-}" = in_flight ] && exit 2; echo "${FAKE_IN_FLIGHT:-0}" ;;
  *posted_at*) [ "${FAKE_QUERY_FAIL:-}" = posted_at ] && exit 2; echo "${FAKE_OLD_SENT:-0}" ;;
  *"min(created_at)"*) [ "${FAKE_QUERY_FAIL:-}" = pending_age ] && exit 2; echo "${FAKE_AGE:-0}" ;;
  *to_regclass*) echo "${FAKE_TABLE:-f}" ;;
  *"interval '15 minutes'"*) echo "${FAKE_CLIENT_ERRS:-0}" ;;
esac
SH
cat > "$tmp/bin/curl" <<'SH'
#!/usr/bin/env bash
printf 'argv %s\n' "$*" >> "$CURLLOG"; in="$(cat)"; printf 'stdin %s\n' "$in" >> "$CURLLOG"
case "$in" in
  *api.telegram.org*) f="$(printf '%s' "$in" | sed -n 's/^data-urlencode = "text@\(.*\)"$/\1/p')"; printf 'MSG %s\n' "$(cat "$f")" >> "$CURLLOG"
    if [ -n "${TG_FAIL_ONCE:-}" ] && [ -e "$TG_FAIL_ONCE" ]; then rm -f "$TG_FAIL_ONCE"; exit 22; fi ;;
  *"$FAKE_FAIL_URL"*) [ -n "${FAKE_FAIL_URL:-}" ] && exit 22 ;;
esac
exit 0
SH
chmod +x "$tmp/bin/"*

mkenv() { # $1 file; omit list after
  local f="$1" omit=" ${*:2} " k v
  : > "$f"
  while IFS='=' read -r k v; do
    case "$omit" in *" $k "*) continue ;; esac
    printf '%s=%s\n' "$k" "$v" >> "$f"
  done <<EOT
TELEGRAM_BOT_TOKEN=$TOKEN
TELEGRAM_CHAT_ID=4242
OPS_DB_HOST=db.fake.invalid
OPS_DB_PORT=5432
OPS_DB_USER=fake_reader
OPS_DB_NAME=fakedb
PGPASSFILE=$tmp/pgpass
OPS_STATE_DIR=$tmp/state
OPS_APP_URL=https://app.fake.invalid/
OPS_AUTH_HEALTH_URL=https://auth.fake.invalid/health
OPS_AUTH_HEALTH_APIKEY=$APIKEY
OPS_ESB_HEARTBEAT_FILE=$tmp/heartbeat
OPS_PROBE_RETRY_SLEEP=0
${EXTRA_ENV:-}
EOT
}
fresh_heartbeat() { touch "$tmp/heartbeat"; }
age_heartbeat()   { python3 -c "import os,time,sys; t=time.time()-int(sys.argv[2])*60; os.utime(sys.argv[1],(t,t))" "$tmp/heartbeat" "$1"; }
reset() { rm -rf "$tmp/state"; mkdir -p "$tmp/state"; : > "$tmp/psql.log"; : > "$tmp/curl.log"; fresh_heartbeat; }
run() { # [ENV=val...]; sets out, rc; log of messages in msgs()
  : > "$tmp/curl.log"; : > "$tmp/psql.log"
  out="$(env -i PATH="$tmp/bin:$PATH" HOME="$tmp" CURLLOG="$tmp/curl.log" PSQLLOG="$tmp/psql.log" OPS_ENV_FILE="$tmp/ops.env" "$@" bash "$SCRIPT" 2>&1)"; rc=$?
}
nmsg() { grep -c '^MSG ' "$tmp/curl.log"; }
msgs() { grep '^MSG ' "$tmp/curl.log"; }
has_msg() { msgs | grep -qF -- "$1"; }
message_is() { grep -Fxq "MSG $1" "$tmp/curl.log"; }

# alert lifecycle: bad-env first run alerts once, second run silent, good-env run recovers once
lifecycle() { # name failure-message recovery-message bad-env... -- good-env...
  local name="$1" failure="$2" recovery="$3"; shift 3
  local bads=(); while [ "$1" != -- ]; do bads+=("$1"); shift; done; shift
  run "${bads[@]}"
  if [ "$(nmsg)" = 1 ] && message_is "🚨 $failure"; then ok "$name: alerts once"; else bad "$name: first run" "$(msgs)"; fi
  run "${bads[@]}"
  [ "$(nmsg)" = 0 ] && ok "$name: second run stays silent" || bad "$name: repeated alert" "$(msgs)"
  run "$@"
  if [ "$(nmsg)" = 1 ] && message_is "✅ $recovery"; then ok "$name: recovery alert once"; else bad "$name: recovery" "$(msgs)"; fi
  run "$@"
  [ "$(nmsg)" = 0 ] && ok "$name: quiet after recovery" || bad "$name: alert after recovery" "$(msgs)"
}

echo "fail closed"
mkenv "$tmp/ops.env"; rm -f "$tmp/ops.env"; run
[ "$rc" = 2 ] && [ "$(nmsg)" = 0 ] && ok "missing env file refuses" || bad "missing env file rc=$rc" "$out"
for v in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID OPS_DB_HOST OPS_DB_USER OPS_DB_NAME PGPASSFILE OPS_STATE_DIR OPS_APP_URL OPS_AUTH_HEALTH_URL; do
  mkenv "$tmp/ops.env" "$v"; run
  if [ "$rc" = 2 ] && printf '%s' "$out" | grep -q "missing.*$v" && [ ! -s "$tmp/psql.log" ]; then ok "missing $v refuses and names it"; else bad "missing $v: rc=$rc" "$out"; fi
done

mkenv "$tmp/ops.env"; reset
echo "healthy"
run
[ "$rc" = 0 ] && [ "$(nmsg)" = 0 ] && ok "all healthy: no alert" || bad "healthy run" "$out $(msgs)"
grep -q "passfile=$tmp/pgpass" "$tmp/psql.log" && ok "psql gets the password file, not a password" || bad "psql lacks PGPASSFILE" "$(cat "$tmp/psql.log")"
grep '^argv ' "$tmp/curl.log" | grep -qF -e "$TOKEN" -e "$APIKEY" -e 4242 && bad "token/key in curl argv" || ok "bot token and api key stay out of curl argv"
grep -q "apikey: $APIKEY" "$tmp/curl.log" && ok "api key sent on curl stdin" || bad "api key not sent"

echo "outbox"
reset; lifecycle "dead letters" \
  "Some MOS updates could not be sent to ERP. ERP may be missing recent changes; please review and resend them." \
  "MOS updates are reaching ERP again." FAKE_DEAD=2 -- FAKE_DEAD=0
reset; lifecycle "pending age" \
  "Some MOS updates have waited 45 minutes to reach ERP. ERP may be behind; please check the connection." \
  "MOS updates are reaching ERP on time again." FAKE_AGE=45 -- FAKE_AGE=3
reset; run FAKE_AGE=30; [ "$(nmsg)" = 0 ] && ok "pending age at the limit is not an alert" || bad "boundary" "$(msgs)"
reset; lifecycle "aged in-flight rows" \
  "Some MOS updates are stuck while being sent to ERP. ERP may be missing recent changes; please check the ERP worker." \
  "MOS updates are moving through to ERP again." FAKE_IN_FLIGHT=1 -- FAKE_IN_FLIGHT=0
reset; lifecycle "sent-row retention" \
  "Older MOS updates have not been cleared after reaching ERP. This may use extra storage; please check the cleanup." \
  "Old MOS updates have been cleared." FAKE_OLD_SENT=2 -- FAKE_OLD_SENT=0
for query in dead_letter pending_age in_flight posted_at; do
  reset; run FAKE_QUERY_FAIL="$query"
  case "$query" in
    dead_letter) expected="MOS couldn't check whether ERP updates failed. ERP may be missing recent changes; please check the connection." ;;
    pending_age) expected="MOS couldn't check whether updates are waiting to reach ERP. ERP may be behind; please check the connection." ;;
    in_flight) expected="MOS couldn't check whether updates are stuck on their way to ERP. ERP may be missing changes; please check the ERP worker." ;;
    posted_at) expected="MOS couldn't check whether old ERP updates were cleared. Storage may keep growing; please check the cleanup." ;;
  esac
  [ "$(nmsg)" = 1 ] && message_is "🚨 $expected" \
    && ok "$query query failure uses plain alert" || bad "$query query failure" "$(msgs)"
done
mkenv "$tmp/ops.env"; EXTRA_ENV="OPS_ESB_TARGET_ENV=goo" mkenv "$tmp/ops.env"; reset; run
grep -q "target_env = 'goo'" "$tmp/psql.log" && ok "target env filter reaches the outbox queries" || bad "no target filter" "$(cat "$tmp/psql.log")"
EXTRA_ENV="OPS_ESB_TARGET_ENV=prod_x" mkenv "$tmp/ops.env"; run
[ "$rc" = 2 ] && ok "a bad target env is refused" || bad "bad target env accepted"
mkenv "$tmp/ops.env"

echo "a failed send does not silence the condition"
reset; : > "$tmp/failonce"; run FAKE_DEAD=2 TG_FAIL_ONCE="$tmp/failonce"
[ "$(nmsg)" = 1 ] && [ ! -e "$tmp/state/dead_letter.alert" ] && ok "failed send: no state written" || bad "state written after a failed send" "$(ls "$tmp/state")"
run FAKE_DEAD=2
[ "$(nmsg)" = 1 ] && message_is "🚨 Some MOS updates could not be sent to ERP. ERP may be missing recent changes; please review and resend them." && [ -e "$tmp/state/dead_letter.alert" ] && ok "next run re-sends and records the alert" || bad "alert not retried" "$(msgs)"
run FAKE_DEAD=2; [ "$(nmsg)" = 0 ] && ok "then stays silent" || bad "repeated after success" "$(msgs)"
: > "$tmp/failonce"; run FAKE_DEAD=0 TG_FAIL_ONCE="$tmp/failonce"
[ -e "$tmp/state/dead_letter.alert" ] && ok "failed recovery send keeps the state" || bad "state dropped after a failed recovery send"
run FAKE_DEAD=0
[ "$(nmsg)" = 1 ] && message_is "✅ MOS updates are reaching ERP again." && [ ! -e "$tmp/state/dead_letter.alert" ] && ok "recovery re-sent, then cleared" || bad "recovery not retried" "$(msgs)"

echo "worker heartbeat"
reset; age_heartbeat 60; run
[ "$(nmsg)" = 1 ] && message_is "🚨 The ERP worker hasn't reported in for 60 minutes. Recent MOS updates may not reach ERP; please check the worker." && ok "stale heartbeat alerts" || bad "stale heartbeat" "$(msgs)"
fresh_heartbeat; run
message_is "✅ The ERP worker is reporting in again." && ok "fresh heartbeat recovers" || bad "heartbeat recovery" "$(msgs)"
reset; rm -f "$tmp/heartbeat"; run
message_is "🚨 The ERP worker hasn't reported in. Recent MOS updates may not reach ERP; please check the worker." && ok "missing heartbeat file alerts" || bad "missing heartbeat" "$(msgs)"
mkenv "$tmp/ops.env" OPS_ESB_HEARTBEAT_FILE; reset; run
[ "$(nmsg)" = 1 ] && message_is "🚨 The ERP worker hasn't reported in. Recent MOS updates may not reach ERP; please check the worker." && ok "unset heartbeat path alerts" || bad "unset heartbeat" "$(msgs)"
mkenv "$tmp/ops.env"; fresh_heartbeat; run
[ "$(nmsg)" = 1 ] && message_is "✅ The ERP worker is reporting in again." && ok "configured heartbeat recovers" || bad "heartbeat recovery" "$(msgs)"
EXTRA_ENV="OPS_ESB_HEARTBEAT_FILE=none" mkenv "$tmp/ops.env"; reset; rm -f "$tmp/heartbeat"; run
[ "$(nmsg)" = 0 ] && ok "worker declared not deployed stays quiet" || bad "not-deployed heartbeat" "$(msgs)"
mkenv "$tmp/ops.env"; reset; rm -f "$tmp/heartbeat"; run
EXTRA_ENV="OPS_ESB_HEARTBEAT_FILE=none" mkenv "$tmp/ops.env"; run
message_is "✅ This server is no longer expected to run the ERP worker." && ok "worker removal recovers prior alert" || bad "worker removal recovery" "$(msgs)"
mkenv "$tmp/ops.env"
fresh_heartbeat

echo "backup freshness"
mkdir -p "$tmp/bk"; EXTRA_ENV="OPS_BACKUP_DIR=$tmp/bk" mkenv "$tmp/ops.env"
reset; run
[ "$(nmsg)" = 1 ] && message_is "🚨 No recent database copy is available. A restore may miss recent MOS changes; please check the backup job." && ok "no dump in the backup dir alerts" || bad "no dump" "$(msgs)"
touch "$tmp/bk/mos-20260101T000000Z.dump"; run
message_is "✅ A recent database copy is available again." && ok "a fresh dump recovers" || bad "backup recovery" "$(msgs)"
age_file() { python3 -c "import os,time,sys; t=time.time()-int(sys.argv[2])*3600; os.utime(sys.argv[1],(t,t))" "$1" "$2"; }
age_file "$tmp/bk/mos-20260101T000000Z.dump" 30; run
[ "$(nmsg)" = 1 ] && message_is "🚨 No recent database copy is available. A restore may miss recent MOS changes; please check the backup job." && ok "a 30 h old dump alerts" || bad "stale dump" "$(msgs)"
mkenv "$tmp/ops.env"

echo "reachability"
reset; lifecycle "app" \
  "MOS isn't responding at its usual address. People may be unable to use it; please check MOS." \
  "MOS is responding again." FAKE_FAIL_URL=app.fake.invalid -- FAKE_FAIL_URL=
reset; lifecycle "auth" \
  "The sign-in service isn't responding. People may have trouble signing in; please check the service." \
  "The sign-in service is responding again." FAKE_FAIL_URL=auth.fake.invalid -- FAKE_FAIL_URL=

echo "database down"
reset; run FAKE_DB_DOWN=1 FAKE_DEAD=5
if [ "$(nmsg)" = 1 ] && message_is "🚨 MOS can't reach its database. MOS data may be unavailable; please check the database connection." && ! grep -q dead_letter "$tmp/psql.log"; then ok "db down: one alert, no outbox queries piled on"; else bad "db down" "$(msgs)"; fi
run FAKE_DB_DOWN=0
message_is "✅ MOS can reach its database again." && ok "database recovery is clear" || bad "database recovery" "$(msgs)"

echo "client errors"
EXTRA_ENV="OPS_CLIENT_ERROR_TABLE=app_logs.client_errors" mkenv "$tmp/ops.env"
reset; run FAKE_TABLE=f FAKE_CLIENT_ERRS=999
if [ "$(nmsg)" = 0 ] && ! grep -q "interval '15 minutes'" "$tmp/psql.log"; then ok "missing table: skipped, no alert, no count query"; else bad "missing table" "$(msgs)"; fi
reset; lifecycle "client errors" \
  "The app logged 50 errors in the past 15 minutes. People may have trouble using MOS; please check the app." \
  "MOS errors are back to normal." FAKE_TABLE=t FAKE_CLIENT_ERRS=50 -- FAKE_TABLE=t FAKE_CLIENT_ERRS=2
EXTRA_ENV="OPS_CLIENT_ERROR_TABLE=Bad.Name-x" mkenv "$tmp/ops.env"; run
[ "$rc" = 2 ] && ok "a table name that is not schema.table is refused" || bad "bad table accepted"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
