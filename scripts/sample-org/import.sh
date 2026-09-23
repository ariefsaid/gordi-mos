#!/usr/bin/env bash
# Load a sample-org payload (built by build.sh) into a database, in one transaction, then set the
# sample logins' password through the auth admin API — never in SQL, so it reaches no database log.
# Refuses when the sample org already exists or when anything lands outside it.
# Usage: SAMPLE_PSQL='psql "$URL"' SAMPLE_API_URL=https://… SAMPLE_SERVICE_KEY=… SAMPLE_PASSWORD=… import.sh <sample-org.sql>
set -euo pipefail
payload="${1:?usage: import.sh <sample-org.sql>}"
: "${SAMPLE_PSQL:?}" "${SAMPLE_API_URL:?}" "${SAMPLE_SERVICE_KEY:?}"
: "${SAMPLE_PASSWORD:?set SAMPLE_PASSWORD (the sample logins use it; it is never written anywhere)}"
[ "${#SAMPLE_PASSWORD}" -ge 12 ] || { echo "SAMPLE_PASSWORD must be at least 12 characters" >&2; exit 1; }
org=5a000000-0000-0000-0000-000000000001
{
  printf '%s\n' '\set ON_ERROR_STOP 1' 'begin;' \
    "do \$\$ begin if exists (select 1 from shared.orgs where id = '$org') then raise exception 'the sample org already exists — run remove.sh first'; end if; end \$\$;" \
    'set local session_replication_role = replica;'
  cat "$payload"
  cat <<SQL

set local session_replication_role = origin;
do \$\$ declare n int; begin
  select count(*) into n from shared.people where (org_id = '$org') <> (email like '%@sample.gordi.test');
  if n > 0 then raise exception 'sample import mixed orgs: % person row(s) on the wrong side', n; end if;
  select count(*) into n from auth.users u join shared.people p on p.user_id = u.id
   where (p.org_id = '$org') <> (u.email like '%@sample.gordi.test');
  if n > 0 then raise exception 'sample import mixed orgs: % login(s) on the wrong side', n; end if;
end \$\$;
commit;
SQL
} | eval "$SAMPLE_PSQL -q"
ids=$(eval "$SAMPLE_PSQL -qAt" <<<"select u.id from auth.users u join shared.people p on p.user_id = u.id where p.org_id = '$org'")
body=$(python3 -c 'import json, os; print(json.dumps({"password": os.environ["SAMPLE_PASSWORD"]}))')
n=0
for id in $ids; do
  curl -fsS -X PUT "$SAMPLE_API_URL/auth/v1/admin/users/$id" -H "apikey: $SAMPLE_SERVICE_KEY" \
    -H "Authorization: Bearer $SAMPLE_SERVICE_KEY" -H 'Content-Type: application/json' --data @- <<<"$body" >/dev/null
  n=$((n + 1))
done
echo "sample org imported; $n logins given the supplied password"
