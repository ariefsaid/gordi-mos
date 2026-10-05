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
  *dead_letter*) echo "${FAKE_DEAD:-0}" ;;
  *"min(created_at)"*) echo "${FAKE_AGE:-0}" ;;
  *to_regclass*) echo "${FAKE_TABLE:-f}" ;;
  *"interval '15 minutes'"*) echo "${FAKE_CLIENT_ERRS:-0}" ;;
esac
SH
cat > "$tmp/bin/curl" <<'SH'
#!/usr/bin/env bash
printf 'argv %s\n' "$*" >> "$CURLLOG"; in="$(cat)"; printf 'stdin %s\n' "$in" >> "$CURLLOG"
case "$in" in
  *api.telegram.org*) f="$(printf '%s' "$in" | sed -n 's/^data-urlencode = "text@\(.*\)"$/\1/p')"; printf 'MSG %s\n' "$(cat "$f")" >> "$CURLLOG" ;;
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

# alert lifecycle: bad-env first run alerts once, second run silent, good-env run recovers once
lifecycle() { # name needle bad-env... -- good-env...
  local name="$1" needle="$2"; shift 2
  local bads=(); while [ "$1" != -- ]; do bads+=("$1"); shift; done; shift
  run "${bads[@]}"
  if [ "$(nmsg)" = 1 ] && has_msg "$needle"; then ok "$name: alerts once"; else bad "$name: first run" "$(msgs)"; fi
  run "${bads[@]}"
  [ "$(nmsg)" = 0 ] && ok "$name: second run stays silent" || bad "$name: repeated alert" "$(msgs)"
  run "$@"
  if [ "$(nmsg)" = 1 ] && has_msg "recovered"; then ok "$name: recovery alert once"; else bad "$name: recovery" "$(msgs)"; fi
  run "$@"
  [ "$(nmsg)" = 0 ] && ok "$name: quiet after recovery" || bad "$name: alert after recovery" "$(msgs)"
}

echo "fail closed"
mkenv "$tmp/ops.env"; rm -f "$tmp/ops.env"; run
[ "$rc" = 2 ] && [ "$(nmsg)" = 0 ] && ok "missing env file refuses" || bad "missing env file rc=$rc" "$out"
for v in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID OPS_DB_HOST OPS_DB_USER OPS_DB_NAME PGPASSFILE OPS_STATE_DIR OPS_APP_URL OPS_AUTH_HEALTH_URL OPS_ESB_HEARTBEAT_FILE; do
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
reset; lifecycle "dead letters" "dead-lettered" FAKE_DEAD=2 -- FAKE_DEAD=0
reset; lifecycle "pending age" "oldest pending" FAKE_AGE=45 -- FAKE_AGE=3
reset; run FAKE_AGE=30; [ "$(nmsg)" = 0 ] && ok "pending age at the limit is not an alert" || bad "boundary" "$(msgs)"
mkenv "$tmp/ops.env"; EXTRA_ENV="OPS_ESB_TARGET_ENV=goo" mkenv "$tmp/ops.env"; reset; run
grep -q "target_env = 'goo'" "$tmp/psql.log" && ok "target env filter reaches the outbox queries" || bad "no target filter" "$(cat "$tmp/psql.log")"
EXTRA_ENV="OPS_ESB_TARGET_ENV=prod_x" mkenv "$tmp/ops.env"; run
[ "$rc" = 2 ] && ok "a bad target env is refused" || bad "bad target env accepted"
mkenv "$tmp/ops.env"

echo "worker heartbeat"
reset; age_heartbeat 60; run
[ "$(nmsg)" = 1 ] && has_msg "last ran" && ok "stale heartbeat alerts" || bad "stale heartbeat" "$(msgs)"
fresh_heartbeat; run
has_msg "recovered" && ok "fresh heartbeat recovers" || bad "heartbeat recovery" "$(msgs)"
reset; rm -f "$tmp/heartbeat"; run
has_msg "heartbeat file missing" && ok "missing heartbeat file alerts" || bad "missing heartbeat" "$(msgs)"
fresh_heartbeat

echo "reachability"
reset; lifecycle "app" "app URL" FAKE_FAIL_URL=app.fake.invalid -- FAKE_FAIL_URL=
reset; lifecycle "auth" "auth health" FAKE_FAIL_URL=auth.fake.invalid -- FAKE_FAIL_URL=

echo "database down"
reset; run FAKE_DB_DOWN=1 FAKE_DEAD=5
if [ "$(nmsg)" = 1 ] && has_msg "unreachable" && ! grep -q dead_letter "$tmp/psql.log"; then ok "db down: one alert, no outbox queries piled on"; else bad "db down" "$(msgs)"; fi

echo "client errors"
EXTRA_ENV="OPS_CLIENT_ERROR_TABLE=app_logs.client_errors" mkenv "$tmp/ops.env"
reset; run FAKE_TABLE=f FAKE_CLIENT_ERRS=999
if [ "$(nmsg)" = 0 ] && ! grep -q "interval '15 minutes'" "$tmp/psql.log"; then ok "missing table: skipped, no alert, no count query"; else bad "missing table" "$(msgs)"; fi
reset; lifecycle "client errors" "client errors" FAKE_TABLE=t FAKE_CLIENT_ERRS=50 -- FAKE_TABLE=t FAKE_CLIENT_ERRS=2
EXTRA_ENV="OPS_CLIENT_ERROR_TABLE=Bad.Name-x" mkenv "$tmp/ops.env"; run
[ "$rc" = 2 ] && ok "a table name that is not schema.table is refused" || bad "bad table accepted"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
