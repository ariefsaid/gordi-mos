#!/usr/bin/env bash
# Self-test for scripts/reporting-snapshot-cron.sh: env-file loading, fail-closed refusal, and the
# notifier keeping the bot token out of argv. python and curl are PATH/root shims; no network.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/reporting-snapshot-cron.sh"
tmp="$(mktemp -d -t snapcron.XXXXXX)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /'; }

TOKEN='123456:FAKE-token_ZZ'
mkdir -p "$tmp/bin" "$tmp/root/sync/venv/bin" "$tmp/root/sync/logs"
cat > "$tmp/bin/curl" <<'SH'
#!/usr/bin/env bash
printf 'argv %s\n' "$*" >> "$CURLLOG"; in="$(cat)"; printf 'stdin %s\n' "$in" >> "$CURLLOG"
f="$(printf '%s' "$in" | sed -n 's/^data-urlencode = "text@\(.*\)"$/\1/p')"; [ -n "$f" ] && printf 'msg %s\n' "$(cat "$f")" >> "$CURLLOG"
SH
cat > "$tmp/root/sync/venv/bin/python" <<'SH'
#!/usr/bin/env bash
cat >/dev/null
printf 'role=%s ref=%s\n' "$REPORTING_WRITER_ROLE" "$SUPABASE_PROJECT_REF" >> "$PYLOG"
[ "${FAKE_PY_RC:-0}" = 0 ] || { echo "postgresql://writer:LEAKPW@host/db failed" > "$SNAPSHOT_ROOT/sync/logs/reporting-snapshot.log"; exit "$FAKE_PY_RC"; }
SH
chmod +x "$tmp/bin/curl" "$tmp/root/sync/venv/bin/python"
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
WAREHOUSE_DB_URL=postgresql://fake@127.0.0.1:5432/fake
TELEGRAM_BOT_TOKEN=${NOTIFY_TOKEN-$TOKEN}
TELEGRAM_CHAT_ID=${NOTIFY_CHAT-4242}
EOT
}
run() { # env-file-path [ENV=val...]; sets out, rc
  local envfile="$1"; shift
  : > "$tmp/curl.log"; : > "$tmp/py.log"
  out="$(env -i PATH="$tmp/bin:$PATH" HOME="$tmp" CURLLOG="$tmp/curl.log" PYLOG="$tmp/py.log" OPS_ENV_FILE="$envfile" "$@" bash "$SCRIPT" 2>&1)"; rc=$?
}

echo "fail closed"
run "$tmp/nope.env"
[ "$rc" = 2 ] && [ ! -s "$tmp/py.log" ] && ok "missing env file refuses, snapshot not run" || bad "missing env file: rc=$rc" "$out"
for v in SNAPSHOT_ROOT SUPABASE_PROJECT_REF SUPABASE_POOLER_HOST REPORTING_WRITER_ROLE REPORTING_ORG_ID REPORTING_WRITER_CRED_FILE WAREHOUSE_DB_URL; do
  mkenv "$tmp/e.env" "$v"; run "$tmp/e.env"
  if [ "$rc" = 2 ] && printf '%s' "$out" | grep -q "missing.*$v" && [ ! -s "$tmp/py.log" ]; then ok "missing $v refuses and names it"; else bad "missing $v: rc=$rc" "$out"; fi
done

echo "success and failure"
mkenv "$tmp/e.env"; run "$tmp/e.env"
[ "$rc" = 0 ] && grep -q 'role=fake_writer ref=fakeref' "$tmp/py.log" && ok "full env runs the snapshot with env coordinates" || bad "full env run: rc=$rc" "$out"
grep -q '✅' "$tmp/curl.log" && ok "success notified" || bad "no success notification" "$(cat "$tmp/curl.log")"
grep '^argv ' "$tmp/curl.log" | grep -qF -e "$TOKEN" -e 4242 && bad "bot token or chat id in curl argv" || ok "bot token and chat id not in curl argv"
grep '^stdin ' "$tmp/curl.log" | grep -qF "bot${TOKEN}" && ok "token reaches curl on stdin" || bad "token not on curl stdin" "$(cat "$tmp/curl.log")"
run "$tmp/e.env" FAKE_PY_RC=1
[ "$rc" = 1 ] && ok "snapshot failure propagates exit code" || bad "failure rc=$rc" "$out"
if grep -q '❌' "$tmp/curl.log" && ! grep -q LEAKPW "$tmp/curl.log"; then ok "failure notified with the password scrubbed"; else bad "failure notification missing or leaks" "$(cat "$tmp/curl.log")"; fi

echo "notifier unset"
NOTIFY_TOKEN= mkenv "$tmp/e.env"; run "$tmp/e.env"
[ "$rc" = 0 ] && ! grep -q . "$tmp/curl.log" && ok "unset notifier: snapshot runs, curl never called" || bad "unset notifier: rc=$rc" "$(cat "$tmp/curl.log")"

echo "no coordinates tracked"
if grep -nE 'supabase\.com|gordi-esb-bak|reporting-writer-cred|[0-9a-f]{8}-[0-9a-f]{4}-' "$SCRIPT" >/dev/null; then bad "script still carries a coordinate"; else ok "script carries no host, path, id or uuid literal"; fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
