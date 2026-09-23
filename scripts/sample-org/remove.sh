#!/usr/bin/env bash
# Remove the sample org completely: its photos (Storage API — Storage refuses SQL deletes), its
# logins, and every row. Proves nothing of it is left. Touches no other org.
# Usage: SAMPLE_PSQL='psql "$URL"' SAMPLE_API_URL=https://… SAMPLE_SERVICE_KEY=… remove.sh
set -euo pipefail
: "${SAMPLE_PSQL:?}" "${SAMPLE_API_URL:?}" "${SAMPLE_SERVICE_KEY:?}"
org=5a000000-0000-0000-0000-000000000001
q() { eval "$SAMPLE_PSQL -qAt -v ON_ERROR_STOP=1" <<<"$1"; }
# Photo paths start with the owning org id (mos._signal_photo_signal_id); match on that prefix — the
# helper itself resolves only the CALLER's org, and this script runs with none.
names=$(q "select coalesce(json_agg(name), '[]') from storage.objects where bucket_id = 'signal-photos' and name like '$org/%'")
if [ "$names" != "[]" ]; then
  curl -fsS -X DELETE "$SAMPLE_API_URL/storage/v1/object/signal-photos" \
    -H "apikey: $SAMPLE_SERVICE_KEY" -H "Authorization: Bearer $SAMPLE_SERVICE_KEY" \
    -H 'Content-Type: application/json' -d "{\"prefixes\": $names}" >/dev/null
fi
q "begin;
create temp table sample_logins on commit drop as
  select user_id from shared.people where org_id = '$org' and user_id is not null;
-- These two carry org_id without a cascading foreign key to shared.orgs.
delete from mos.events where org_id = '$org';
delete from mos.task_team_rehome_ledger where org_id = '$org';
delete from shared.orgs where id = '$org';
delete from auth.users where id in (select user_id from sample_logins);
do \$\$ declare r record; n bigint; begin
  for r in select table_schema s, table_name t from information_schema.columns
            where column_name = 'org_id' and table_schema in ('shared','mos','ops','integrations','reporting')
              and (table_schema, table_name) in (select table_schema, table_name from information_schema.tables where table_type = 'BASE TABLE')
  loop
    execute format('select count(*) from %I.%I where org_id = %L', r.s, r.t, '$org') into n;
    if n > 0 then raise exception 'sample rows left in %.%: %', r.s, r.t, n; end if;
  end loop;
  if exists (select 1 from auth.users where email like '%@sample.gordi.test') then
    raise exception 'sample logins left';
  end if;
end \$\$;
commit;"
echo "sample org removed"
