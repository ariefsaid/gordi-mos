#!/usr/bin/env bash
# Load a sample-org payload (built by build.sh) into a database, in one transaction.
# Refuses when the sample org already exists or when anything lands outside it.
# Usage: SAMPLE_PSQL='psql "$URL"' SAMPLE_PASSWORD=… import.sh <sample-org.sql>
set -euo pipefail
payload="${1:?usage: import.sh <sample-org.sql>}"
: "${SAMPLE_PSQL:?set SAMPLE_PSQL to the psql command for the target database}"
: "${SAMPLE_PASSWORD:?set SAMPLE_PASSWORD (the sample accounts sign in with it; never stored)}"
[ "${#SAMPLE_PASSWORD}" -ge 12 ] || { echo "SAMPLE_PASSWORD must be at least 12 characters" >&2; exit 1; }
{
  cat <<'SQL'
\set ON_ERROR_STOP 1
begin;
do $$ begin
  if exists (select 1 from shared.orgs where id = '5a000000-0000-0000-0000-000000000001') then
    raise exception 'the sample org already exists — run remove.sh first';
  end if;
end $$;
set local session_replication_role = replica;
SQL
  cat "$payload"
  cat <<'SQL'

set local session_replication_role = origin;
do $$ declare n int; begin
  select count(*) into n from shared.people
   where (org_id = '5a000000-0000-0000-0000-000000000001') <> (email like '%@sample.gordi.test');
  if n > 0 then raise exception 'sample import mixed orgs: % person row(s) on the wrong side', n; end if;
  select count(*) into n from auth.users u join shared.people p on p.user_id = u.id
   where (p.org_id = '5a000000-0000-0000-0000-000000000001') <> (u.email like '%@sample.gordi.test');
  if n > 0 then raise exception 'sample import mixed orgs: % login(s) on the wrong side', n; end if;
end $$;
commit;
SQL
} | eval "$SAMPLE_PSQL -q -v sample_password=\"\$SAMPLE_PASSWORD\""
echo "sample org imported"
