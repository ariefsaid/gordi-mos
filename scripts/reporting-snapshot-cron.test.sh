#!/usr/bin/env bash
# Self-test for scripts/reporting-snapshot-cron.sh: env-file loading, post-sync stream refresh,
# explicit first-run approval, failure reporting, and the notifier keeping the bot token out of argv.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/reporting-snapshot-cron.sh"
tmp="$(mktemp -d -t snapcron.XXXXXX)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /'; }

TOKEN='123456:FAKE-token_ZZ'
mkdir -p "$tmp/bin" "$tmp/root/sync/venv/bin" "$tmp/root/sync/logs" "$tmp/root/scripts"
cat > "$tmp/root/scripts/reporting_snapshot.py" <<'PY'
class SnapshotConfig:
    pass

def run_all_snapshots(_config):
    return {}
PY
cat > "$tmp/bin/curl" <<'SH'
#!/usr/bin/env bash
printf 'argv %s\n' "$*" >> "$CURLLOG"; in="$(cat)"; printf 'stdin %s\n' "$in" >> "$CURLLOG"
f="$(printf '%s' "$in" | sed -n 's/^data-urlencode = "text@\(.*\)"$/\1/p')"; [ -n "$f" ] && printf 'msg %s\n' "$(cat "$f")" >> "$CURLLOG"
SH
cat > "$tmp/root/sync/venv/bin/python" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == */refresh-cafe-stream-items.py ]]; then
  printf 'stream args=%s db=%s\n' "$*" "$CAFE_STREAM_ITEMS_DB_URL" >> "$PYLOG"
  echo cafe >> "$ORDERLOG"
  [ "${FAKE_STREAM_RC:-0}" = 0 ] || exit "$FAKE_STREAM_RC"
  exit 0
fi
if [ "${VERIFY_IMPORT:-0}" = 1 ] && [ "${1:-}" = "-" ]; then
  source_file="$(mktemp)"
  trap 'rm -f "$source_file"' EXIT
  while IFS= read -r line; do
    [ "$line" = 'with open(os.environ["REPORTING_WRITER_CRED_FILE"]) as f:' ] && break
    printf '%s\n' "$line" >> "$source_file"
  done
  printf 'import importlib; print(importlib.import_module(SnapshotConfig.__module__).__file__)\n' >> "$source_file"
  python3 - < "$source_file"
  exit $?
fi
cat >/dev/null
printf 'role=%s ref=%s\n' "$REPORTING_WRITER_ROLE" "$SUPABASE_PROJECT_REF" >> "$PYLOG"
echo snapshot >> "$ORDERLOG"
[ "${FAKE_PY_RC:-0}" = 0 ] || { echo "postgresql://writer:LEAKPW@host/db failed" > "$SNAPSHOT_ROOT/sync/logs/reporting-snapshot.log"; exit "$FAKE_PY_RC"; }
SH
cat > "$tmp/bin/psql" <<'SH'
#!/usr/bin/env bash
printf 'args=%s pgoptions=%s\n' "$*" "${PGOPTIONS:-unset}" >> "$PSQLLOG"
cat >> "$PSQLLOG"
echo catalog >> "$ORDERLOG"
[ "${FAKE_PSQL_RC:-0}" = 0 ] || exit "$FAKE_PSQL_RC"
printf '%s\n' '[{"esb_product_id":"item-1","esb_product_detail_id":"detail-1","category":"Kitchen","has_active_bom_output":false,"is_active":true,"erp_category_type_name":"Inventory"}]'
SH
chmod +x "$tmp/bin/curl" "$tmp/bin/psql" "$tmp/root/sync/venv/bin/python"
echo secret > "$tmp/cred"

mkenv() { # $1 file; $2.. variables to omit
  local f="$1" omit=" ${*:2} " k v
  : > "$f"
  while IFS='=' read -r k v; do
    case "$omit" in *" $k "*) continue ;; esac
    printf '%s=%s\n' "$k" "$v" >> "$f"
  done <<EOT
SNAPSHOT_ROOT=$tmp/root
SUPABASE_PROJECT_REF=fakeref
SUPABASE_POOLER_HOST=pooler.fake.invalid
REPORTING_WRITER_ROLE=fake_writer
REPORTING_ORG_ID=11111111-2222-3333-4444-555555555555
REPORTING_WRITER_CRED_FILE=$tmp/cred
REPORTING_PYTHON=$tmp/root/sync/venv/bin/python
WAREHOUSE_DB_URL=postgresql://fake:FAKE_WAREHOUSE_PW@127.0.0.1:5432/fake
OPS_DB_USER=fake_writer
OPS_DB_HOST=pooler.fake.invalid
OPS_DB_PORT=5432
OPS_DB_NAME=postgres
CAFE_STREAM_ITEMS_ESB_CODE=SYNTH_COMPANY
CAFE_STREAM_ITEMS_BRANCH_MAP=SYNTH_A=synthetic_north,SYNTH_B=synthetic_south
CAFE_STREAM_ITEMS_ORG_SLUG=synthetic-tenant
PGPASSWORD=FAKE_DB_PW
TELEGRAM_BOT_TOKEN=${NOTIFY_TOKEN-$TOKEN}
TELEGRAM_CHAT_ID=${NOTIFY_CHAT-4242}
EOT
}
run() { # env-file-path [ENV=val...]; sets out, rc
  local envfile="$1"; shift
  : > "$tmp/curl.log"; : > "$tmp/py.log"; : > "$tmp/psql.log"; : > "$tmp/order.log"
  out="$(env -i PATH="$tmp/bin:$PATH" HOME="$tmp" CURLLOG="$tmp/curl.log" PYLOG="$tmp/py.log" PSQLLOG="$tmp/psql.log" ORDERLOG="$tmp/order.log" OPS_ENV_FILE="$envfile" "$@" bash "$SCRIPT" 2>&1)"; rc=$?
}
message_is() { grep -Fxq "msg $1" "$tmp/curl.log"; }

echo "fail closed"
run "$tmp/nope.env"
[ "$rc" = 2 ] && [ ! -s "$tmp/py.log" ] && ok "missing env file refuses, snapshot not run" || bad "missing env file: rc=$rc" "$out"
for v in SNAPSHOT_ROOT SUPABASE_PROJECT_REF SUPABASE_POOLER_HOST REPORTING_WRITER_ROLE REPORTING_ORG_ID REPORTING_WRITER_CRED_FILE WAREHOUSE_DB_URL; do
  mkenv "$tmp/e.env" "$v"; run "$tmp/e.env"
  if [ "$rc" = 2 ] && printf '%s' "$out" | grep -q "missing.*$v" && [ ! -s "$tmp/py.log" ]; then ok "missing $v refuses and names it"; else bad "missing $v: rc=$rc" "$out"; fi
done

echo "MOS import path"
mkenv "$tmp/e.env"; run "$tmp/e.env" VERIFY_IMPORT=1
expected_script="$(dirname "$SCRIPT")/reporting_snapshot.py"
if [ "$rc" = 0 ] && printf '%s' "$out" | grep -Fq "$expected_script"; then ok "snapshot imports reporting_snapshot from MOS scripts"; else bad "snapshot import resolved outside MOS scripts: rc=$rc" "$out"; fi

echo "scheduled refresh approval"
for setting in absent 0 true; do
  mkenv "$tmp/e.env" CAFE_STREAM_ITEMS_ESB_CODE CAFE_STREAM_ITEMS_BRANCH_MAP CAFE_STREAM_ITEMS_ORG_SLUG
  if [ "$setting" = absent ]; then run "$tmp/e.env"; else run "$tmp/e.env" CAFE_STREAM_ITEMS_ENABLED="$setting"; fi
  if [ "$rc" = 0 ] && [ "$(cat "$tmp/order.log")" = snapshot ] && [ ! -s "$tmp/psql.log" ] && printf '%s' "$out" | grep -Fq 'disabled pending first-run approval' && message_is "✅ Sales, margin and usage figures are up to date in MOS. No action is needed."; then
    ok "enable setting $setting keeps snapshot running without catalog or refresh"
  else bad "enable setting $setting crossed the approval boundary: rc=$rc" "$out $(cat "$tmp/order.log")"; fi
done
for v in CAFE_STREAM_ITEMS_ESB_CODE CAFE_STREAM_ITEMS_BRANCH_MAP CAFE_STREAM_ITEMS_ORG_SLUG OPS_DB_USER OPS_DB_HOST OPS_DB_PORT OPS_DB_NAME; do
  mkenv "$tmp/e.env" "$v"; run "$tmp/e.env" CAFE_STREAM_ITEMS_ENABLED=1
  if [ "$rc" = 2 ] && printf '%s' "$out" | grep -q "missing.*$v" && [ "$(cat "$tmp/order.log")" = snapshot ] && [ ! -s "$tmp/psql.log" ]; then
    ok "enabled refresh missing $v refuses and names it without blocking snapshot"
  else bad "missing refresh coordinate $v: rc=$rc" "$out"; fi
done

echo "success and failure"
mkenv "$tmp/e.env"
printf 'CAFE_STREAM_ITEMS_ENABLED=1\n' >> "$tmp/e.env"
run "$tmp/e.env"
[ "$rc" = 0 ] && grep -q 'role=fake_writer ref=fakeref' "$tmp/py.log" && ok "full env runs the snapshot with env coordinates" || bad "full env run: rc=$rc" "$out"
[ "$(tr '\n' ' ' < "$tmp/order.log" | sed 's/ $//')" = 'snapshot catalog cafe' ] && ok "scheduled refresh follows the post-sync snapshot and reads the live catalog" || bad "scheduled order was wrong" "$(cat "$tmp/order.log")"
grep -q 'pgoptions=-c default_transaction_read_only=on' "$tmp/psql.log" && ok "catalog read is forced read-only" || bad "catalog read was not forced read-only" "$(cat "$tmp/psql.log")"
grep -q 'join ops.item_units unit' "$tmp/psql.log" && grep -q 'unit.source_active' "$tmp/psql.log" && ok "catalog query gets active detail IDs from item units" || bad "catalog query did not use active item units" "$(cat "$tmp/psql.log")"
grep -Fq -- "-v cafe_org_slug=synthetic-tenant" "$tmp/psql.log" && grep -Fq "where org.slug = :'cafe_org_slug'" "$tmp/psql.log" && ok "catalog tenant comes from the environment as a quoted psql variable" || bad "catalog tenant was not parameterized" "$(cat "$tmp/psql.log")"
grep -q 'item.has_active_bom_output or unit.erp_is_stock' "$tmp/psql.log" && ok "catalog query matches the item-reference eligibility rule" || bad "catalog query included ineligible active Inventory details" "$(cat "$tmp/psql.log")"
grep -q -- '--esb-code SYNTH_COMPANY' "$tmp/py.log" && grep -q -- '--branch-map SYNTH_A=synthetic_north,SYNTH_B=synthetic_south' "$tmp/py.log" && grep -q -- '--apply' "$tmp/py.log" && grep -q -- '--allow-remote' "$tmp/py.log" && ok "scheduled refresh reuses the existing driver with the mapped Café branches" || bad "refresh driver arguments were incomplete" "$(cat "$tmp/py.log")"
grep -q -- '--erp-db-url-env WAREHOUSE_DB_URL' "$tmp/py.log" && grep -q -- '--erp-query-cmd psql -X -qAt -v ON_ERROR_STOP=1' "$tmp/py.log" && ! grep -q 'FAKE_WAREHOUSE_PW' "$tmp/py.log" && ok "warehouse URL stays in the environment, outside process arguments" || bad "warehouse URL appeared in refresh arguments" "$(cat "$tmp/py.log")"
grep -q 'db=postgresql://fake_writer@pooler.fake.invalid:5432/postgres?sslmode=require' "$tmp/py.log" && ! grep -q 'FAKE_DB_PW' "$tmp/py.log" && ok "refresh DB URL is password-free in argv" || bad "refresh target exposed a password" "$(cat "$tmp/py.log")"
message_is "✅ Sales, margin, usage and Café stream lists are up to date in MOS. No action is needed." && ok "success has a plain status message" || bad "success notification" "$(cat "$tmp/curl.log")"
grep '^argv ' "$tmp/curl.log" | grep -qF -e "$TOKEN" -e 4242 && bad "bot token or chat id in curl argv" || ok "bot token and chat id not in curl argv"
grep '^stdin ' "$tmp/curl.log" | grep -qF "bot${TOKEN}" && ok "token reaches curl on stdin" || bad "token not on curl stdin" "$(cat "$tmp/curl.log")"
run "$tmp/e.env" FAKE_PY_RC=1
[ "$rc" = 1 ] && ok "snapshot failure propagates exit code" || bad "failure rc=$rc" "$out"
if message_is "❌ MOS couldn't refresh its sales, margin and usage figures. Money may show older results until the next successful update; please check the reporting connection." && ! grep -q LEAKPW "$tmp/curl.log" && printf '%s' "$out" | grep -Fq "$tmp/root/sync/logs/reporting-snapshot.log"; then ok "snapshot failure message keeps the log path and scrubs credentials"; else bad "snapshot failure notification or log path" "$(cat "$tmp/curl.log") $out"; fi
run "$tmp/e.env" FAKE_STREAM_RC=1
[ "$rc" = 1 ] && ok "stream-usage failure propagates non-zero" || bad "stream-usage failure rc=$rc" "$out"
if message_is "❌ MOS couldn't refresh Café stream usage after the ESB sync. Café Items lists may be stale; please check the reporting connection." && ! grep -q FAKE_DB_PW "$tmp/curl.log"; then ok "stream-usage failure is reported without connection details"; else bad "stream-usage failure notification" "$(cat "$tmp/curl.log") $out"; fi
run "$tmp/e.env" FAKE_PSQL_RC=1
[ "$rc" = 1 ] && printf '%s' "$out" | grep -Fq 'cafe-stream-usage: active catalog read failed' && message_is "❌ MOS couldn't refresh Café stream usage after the ESB sync. Café Items lists may be stale; please check the reporting connection." && ok "catalog read failure is reported and propagates non-zero" || bad "catalog read failure was silent: rc=$rc" "$out $(cat "$tmp/curl.log")"

echo "deploy first-run deferral"
mkenv "$tmp/e.env"; : > "$tmp/curl.log"; : > "$tmp/py.log"; : > "$tmp/psql.log"; : > "$tmp/order.log"
out="$(env -i PATH="$tmp/bin:$PATH" HOME="$tmp" CURLLOG="$tmp/curl.log" PYLOG="$tmp/py.log" PSQLLOG="$tmp/psql.log" ORDERLOG="$tmp/order.log" OPS_ENV_FILE="$tmp/e.env" CAFE_STREAM_ITEMS_ENABLED=1 bash "$SCRIPT" --snapshot-only 2>&1)"; rc=$?
[ "$rc" = 0 ] && grep -q snapshot "$tmp/order.log" && ! grep -q cafe "$tmp/order.log" && ! grep -q catalog "$tmp/order.log" && printf '%s' "$out" | grep -Fq 'cafe-stream-usage deferred for first-run review' && ok "deployment snapshot-only mode leaves the director's first stream run pending" || bad "snapshot-only mode ran the stream refresh: rc=$rc" "$out $(cat "$tmp/order.log")"

echo "notifier unset"
NOTIFY_TOKEN= mkenv "$tmp/e.env"; run "$tmp/e.env"
[ "$rc" = 0 ] && ! grep -q . "$tmp/curl.log" && ok "unset notifier: snapshot runs, curl never called" || bad "unset notifier: rc=$rc" "$(cat "$tmp/curl.log")"

echo "no coordinates tracked"
if grep -nE 'supabase\.com|[0-9a-f]{8}-[0-9a-f]{4}-|CAFE_STREAM_ITEMS_(ESB_CODE|BRANCH_MAP|ORG_SLUG):-|org\.slug = [^:]' "$SCRIPT" >/dev/null; then bad "script still carries a coordinate"; else ok "script carries no host, path, id or uuid literal"; fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
