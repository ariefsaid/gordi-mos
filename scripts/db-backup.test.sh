#!/usr/bin/env bash
# Self-test for scripts/db-backup.sh: missing-env refusal, verified dump, retention, failure alerts.
# pg_dump, pg_restore and curl are PATH shims; no database, no network.
set -uo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/scripts/db-backup.sh"
tmp="$(mktemp -d -t dbbackup.XXXXXX)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /'; }

TOKEN='123456:FAKE-token_ZZ'
BK="$tmp/backups"; mkdir -p "$tmp/bin"
cat > "$tmp/bin/pg_dump" <<'SH'
#!/usr/bin/env bash
printf 'argv %s | passfile=%s\n' "$*" "${PGPASSFILE:-}" >> "$DUMPLOG"
if [ "${FAKE_DUMP_FAIL:-0}" = 1 ]; then echo "connection to postgresql://backup:LEAKPW@host/db refused" >&2; exit 1; fi
out=""; while [ $# -gt 0 ]; do [ "$1" = -f ] && out="$2"; shift; done
echo "PGDMP fake dump" > "$out"
SH
cat > "$tmp/bin/pg_restore" <<'SH'
#!/usr/bin/env bash
if [ "${FAKE_LIST_EMPTY:-0}" = 1 ]; then echo "pg_restore: error: unsupported version" >&2; exit 1; fi
printf '; Archive created\n; dbname: fake\n1; 2615 1 SCHEMA - mos owner\n2; 1259 2 TABLE mos tasks owner\n'
SH
cat > "$tmp/bin/curl" <<'SH'
#!/usr/bin/env bash
in="$(cat)"; printf 'argv %s\n' "$*" >> "$CURLLOG"
f="$(printf '%s' "$in" | sed -n 's/^data-urlencode = "text@\(.*\)"$/\1/p')"; printf 'MSG %s\n' "$(cat "$f")" >> "$CURLLOG"
SH
chmod +x "$tmp/bin/"*

mkenv() { # $1 file; omitted names after
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
OPS_DB_USER=fake_backup
OPS_DB_NAME=fakedb
PGPASSFILE=$tmp/pgpass
OPS_BACKUP_DIR=$BK
${EXTRA_ENV:-}
EOT
}
run() { : > "$tmp/dump.log"; : > "$tmp/curl.log"
  out="$(env -i PATH="$tmp/bin:$PATH" HOME="$tmp" DUMPLOG="$tmp/dump.log" CURLLOG="$tmp/curl.log" OPS_ENV_FILE="$tmp/ops.env" "$@" bash "$SCRIPT" 2>&1)"; rc=$?; }
age() { python3 -c "import os,time,sys; t=time.time()-int(sys.argv[2])*86400; os.utime(sys.argv[1],(t,t))" "$1" "$2"; }
msgs() { grep -c '^MSG ' "$tmp/curl.log"; }
dumps() { ls "$BK" 2>/dev/null | grep -c '^mos-.*\.dump$'; }

echo "fail closed"
rm -f "$tmp/ops.env"; run
[ "$rc" = 2 ] && [ ! -s "$tmp/dump.log" ] && ok "missing env file refuses" || bad "missing env file rc=$rc" "$out"
for v in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID OPS_DB_HOST OPS_DB_NAME PGPASSFILE OPS_BACKUP_DIR OPS_DB_USER; do
  mkenv "$tmp/ops.env" "$v"; run
  if [ "$rc" = 2 ] && printf '%s' "$out" | grep -q "missing.*$v" && [ ! -s "$tmp/dump.log" ]; then ok "missing $v refuses and names it"; else bad "missing $v: rc=$rc" "$out"; fi
done
EXTRA_ENV="OPS_BACKUP_KEEP_DAYS=0" mkenv "$tmp/ops.env"; run
[ "$rc" = 2 ] && [ ! -s "$tmp/dump.log" ] && ok "a keep period below one day is refused" || bad "keep=0 accepted" "$out"

echo "good run"
mkenv "$tmp/ops.env"; mkdir -p "$BK"
: > "$BK/mos-20200101T000000Z.dump"; age "$BK/mos-20200101T000000Z.dump" 20
: > "$BK/mos-20200301T000000Z.dump"; age "$BK/mos-20200301T000000Z.dump" 5
: > "$BK/notes.txt"; age "$BK/notes.txt" 40
run
[ "$rc" = 0 ] && ok "exits 0" || bad "good run rc=$rc" "$out"
new="$(ls "$BK" | grep -E '^mos-[0-9]{8}T[0-9]{6}Z\.dump$' | tail -1)"
[ -s "$BK/$new" ] && ok "a verified dump is in place" || bad "no new dump" "$(ls "$BK")"
ls "$BK" | grep -q partial && bad "a .partial file is left behind" || ok "no .partial file left"
[ ! -e "$BK/mos-20200101T000000Z.dump" ] && ok "a 20-day-old dump is pruned (14-day keep)" || bad "old dump kept"
[ -e "$BK/mos-20200301T000000Z.dump" ] && ok "a 5-day-old dump is kept" || bad "recent dump pruned"
[ -e "$BK/notes.txt" ] && ok "files that are not dumps are never pruned" || bad "unrelated file pruned"
[ "$(msgs)" = 0 ] && ok "success is silent" || bad "success alerted"
grep -q -- '--no-password' "$tmp/dump.log" && grep -q "passfile=$tmp/pgpass" "$tmp/dump.log" && ok "pg_dump reads the password file and is told never to prompt" || bad "pg_dump args" "$(cat "$tmp/dump.log")"
grep -qiE 'password|postgresql://' <(grep '^argv' "$tmp/dump.log" | sed 's/--no-password//') && bad "credential-looking text in pg_dump argv" || ok "no credential in pg_dump argv"
# The 5-day-old dump survived the 14-day keep; a 2-day keep must prune it. (Not the fresh dump: a second
# run in the same second writes the same file name and resets its age.)
EXTRA_ENV="OPS_BACKUP_KEEP_DAYS=2" mkenv "$tmp/ops.env"; run
[ ! -e "$BK/mos-20200301T000000Z.dump" ] && ok "OPS_BACKUP_KEEP_DAYS is honoured" || bad "keep days ignored"

echo "failures"
mkenv "$tmp/ops.env"; rm -f "$BK"/*; : > "$BK/mos-20200101T000000Z.dump"; age "$BK/mos-20200101T000000Z.dump" 30
run FAKE_LIST_EMPTY=1
if [ "$rc" = 1 ] && [ "$(msgs)" = 1 ] && [ "$(dumps)" = 1 ] && [ -e "$BK/mos-20200101T000000Z.dump" ] && ! ls "$BK" | grep -q partial; then
  ok "unlistable dump: alert, no new dump kept, old dumps NOT pruned"; else bad "verify failure handling" "rc=$rc msgs=$(msgs) $(ls "$BK")"; fi
run FAKE_DUMP_FAIL=1
if [ "$rc" = 1 ] && [ "$(msgs)" = 1 ] && ! grep -q LEAKPW "$tmp/curl.log" && [ -e "$BK/mos-20200101T000000Z.dump" ]; then
  ok "pg_dump failure: one alert, password scrubbed, old dumps kept"; else bad "dump failure handling" "rc=$rc $(cat "$tmp/curl.log")"; fi
grep '^argv' "$tmp/curl.log" | grep -qF -e "$TOKEN" -e 4242 && bad "token in curl argv" || ok "bot token stays out of curl argv"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
