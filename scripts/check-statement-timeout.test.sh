#!/usr/bin/env bash
# Self-test for scripts/check-statement-timeout.sh: a fake psql answers, so no database is needed.
set -euo pipefail
cd "$(dirname "$0")/.."

pass=0; fail=0
ok()  { pass=$((pass+1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  FAIL  %s\n' "$1"; }

d=$(mktemp -d -t stmttimeout.XXXXXX); trap 'rm -rf "$d"' EXIT
cat > "$d/psql" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$FAKE_PSQL_ARGV"
printf '%s|%s|%s|%s|%s|%s\n' "$PGUSER" "$PGPASSWORD" "$PGHOST" "${PGPORT:-}" "$PGDATABASE" "${PGSSLMODE:-}" > "$FAKE_PSQL_ENV"
printf '%s|%s\n' "${PGSSLROOTCERT:-}" "${PGCONNECT_TIMEOUT:-}" > "$FAKE_PSQL_ENV2"
[ "${FAKE_PSQL_FAIL:-}" = 1 ] && exit 1
printf '%s\n' "${FAKE_PSQL_OUT:-}"
SH
chmod +x "$d/psql"

URL='postgresql://opsuser:s3cr%40t@db.example.test:6543/appdb?sslmode=require'
expect() { # name want-rc out [env...]
  local name=$1 want=$2 out=$3; shift 3
  set +e
  env DATABASE_URL="$URL" PSQL="$d/psql" FAKE_PSQL_ARGV="$d/argv" FAKE_PSQL_ENV="$d/env" FAKE_PSQL_ENV2="$d/env2" FAKE_PSQL_OUT="$out" "$@" bash scripts/check-statement-timeout.sh >"$d/o" 2>&1
  local rc=$?
  set -e
  if [ "$rc" -eq "$want" ]; then ok "$name"; else bad "$name (rc=$rc, want $want): $(cat "$d/o")"; fi
}

expect "8s passes"                    0 "8s"
expect "bare milliseconds pass"       0 "8000"
expect "30s is exactly the ceiling"   0 "30s"
expect "31s is too high"              1 "31s"
expect "1min is too high"             1 "1min"
expect "0 means unlimited: fails"     1 "0"
expect "unset fails"                  1 ""
expect "garbage fails"                1 "soon"
expect "ceiling is tunable"           1 "8s" MAX_MS=5000
expect "an unreadable database is 2"  2 "8s" FAKE_PSQL_FAIL=1
# The credential travels in the environment, never in the client's arguments.
expect "credential test run" 0 "8s"
if grep -q 's3cr\|opsuser\|example.test' "$d/argv"; then bad "connection details leaked into psql argv: $(cat "$d/argv")"; else ok "no connection detail in psql argv"; fi
if [ "$(cat "$d/env")" = 'opsuser|s3cr@t|db.example.test|6543|appdb|require' ]; then ok "URL split into PG* variables (password decoded)"; else bad "PG* variables wrong: $(cat "$d/env")"; fi
URL='postgresql://u:p@[::1]:5432/db?sslmode=verify-full&sslrootcert=%2Fetc%2Fca.pem&connect_timeout=5'
expect "IPv6 host with several options" 0 "8s"
if [ "$(cat "$d/env")" = 'u|p|::1|5432|db|verify-full' ] && [ "$(cat "$d/env2")" = '/etc/ca.pem|5' ]; then ok "IPv6 host and options mapped to PG* variables"; else bad "options wrong: $(cat "$d/env") $(cat "$d/env2")"; fi
URL='postgresql://u:p@h/db?application_name=x'; expect "an unsupported option is refused, not dropped" 2 "8s"
URL=x; expect "a malformed URL is rejected" 2 "8s"; URL='postgresql://opsuser:s3cr%40t@db.example.test:6543/appdb?sslmode=require'
if env -u DATABASE_URL PSQL="$d/psql" bash scripts/check-statement-timeout.sh >/dev/null 2>&1; then
  bad "no DATABASE_URL should fail"; else ok "no DATABASE_URL fails"; fi

echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
