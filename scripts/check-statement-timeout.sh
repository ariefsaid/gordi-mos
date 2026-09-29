#!/usr/bin/env bash
# Verify the data API's per-request time limit on ONE environment: the `authenticated` role must
# carry a statement_timeout, at most MAX_MS (default 30000). App and agent tokens both run as that
# role, so the limit bounds every data-API request. Read-only; the caller supplies the target.
#
#   DATABASE_URL=<postgres connection string> bash scripts/check-statement-timeout.sh
#   MAX_MS=8000 ... to tighten the ceiling.
#
# Exit 0 = set and within the ceiling; 1 = unset, unparsable or too high; 2 = cannot read.
# The connection string never appears in output or in the client's arguments: it is split into the
# standard PG* environment variables. PSQL overrides the client (the self-test does).
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to the target connection string}"
MAX_MS="${MAX_MS:-30000}"
PSQL="${PSQL:-psql}"

# A database-specific setting beats a cluster-wide one (pg_db_role_setting.setdatabase = 0).
read -r -d '' SQL <<'SQL' || true
select substring(cfg from '^statement_timeout=(.*)$')
  from pg_db_role_setting s
  join pg_roles r on r.oid = s.setrole
  cross join lateral unnest(s.setconfig) cfg
 where r.rolname = 'authenticated'
   and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
   and cfg like 'statement_timeout=%'
 order by s.setdatabase desc
 limit 1
SQL
url_re='^postgres(ql)?://([^:@/]*)(:([^@]*))?@([^:/?]*)(:([0-9]+))?/([^?]*)(\?(.*))?$'
if ! [[ "$DATABASE_URL" =~ $url_re ]]; then
  echo "DATABASE_URL must look like postgresql://user:password@host:port/database" >&2; exit 2
fi
decode() { printf '%b' "${1//%/\\x}"; }
export PGUSER PGPASSWORD PGHOST PGDATABASE
PGUSER=$(decode "${BASH_REMATCH[2]}"); PGPASSWORD=$(decode "${BASH_REMATCH[4]}")
PGHOST=${BASH_REMATCH[5]}; PGDATABASE=$(decode "${BASH_REMATCH[8]}")
[ -n "${BASH_REMATCH[7]}" ] && export PGPORT=${BASH_REMATCH[7]}
query=${BASH_REMATCH[10]}
[[ "$query" =~ (^|&)sslmode=([a-z-]+) ]] && export PGSSLMODE=${BASH_REMATCH[2]}
raw=$("$PSQL" -X -A -t -v ON_ERROR_STOP=1 -c "$SQL") \
  || { echo "cannot read the role settings" >&2; exit 2; }
raw=$(printf '%s' "$raw" | tr -d '[:space:]')

if [ -z "$raw" ]; then
  echo "FAIL: authenticated has no statement_timeout" >&2; exit 1
fi

# Postgres accepts a bare number (ms) or a number with ms|s|min|h|d.
re='^([0-9]+)(ms|s|min|h|d)?$'
if [[ "$raw" =~ $re ]]; then
  n=${BASH_REMATCH[1]}
  case "${BASH_REMATCH[2]:-ms}" in
    ms) ms=$n ;; s) ms=$((n * 1000)) ;; min) ms=$((n * 60000)) ;;
    h) ms=$((n * 3600000)) ;; d) ms=$((n * 86400000)) ;;
  esac
else
  echo "FAIL: unrecognised statement_timeout '$raw'" >&2; exit 1
fi

# 0 means "no limit" in Postgres.
if [ "$ms" -eq 0 ] || [ "$ms" -gt "$MAX_MS" ]; then
  echo "FAIL: authenticated statement_timeout is ${raw} (${ms} ms; ceiling ${MAX_MS} ms, 0 = unlimited)" >&2
  exit 1
fi
echo "ok: authenticated statement_timeout is ${raw} (${ms} ms, ceiling ${MAX_MS} ms)"
