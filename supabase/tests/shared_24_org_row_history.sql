-- shared — the organisation row's own change history (#1083) and the org filter on the history
-- read path (#1104). shared.orgs is the tenant root: it has no org_id column, so its history row
-- takes the org from the row's own id, and its history is readable by exactly those who can read
-- the org row (its own members). The read policy filters on the caller's org first, so a
-- reader is never evaluated for another org's history row.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select shared._test_seed_directory();

-- ── the root table's history ─────────────────────────────────────────────────────────────────
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-00000000e1a1', 'History org Z', 'history-z');
select is((select count(*)::int from shared.record_history
           where org_id = '00000000-0000-0000-0000-00000000e1a1' and schema_name = 'shared'
             and table_name = 'orgs' and record_key = '00000000-0000-0000-0000-00000000e1a1'
             and action = 'insert'),
  1, 'inserting an org records one insert row, filed under that org''s own id');

update shared.orgs set name = 'History org Z2' where id = '00000000-0000-0000-0000-00000000e1a1';
select is((select old_value || '>' || new_value from shared.record_history
           where org_id = '00000000-0000-0000-0000-00000000e1a1' and table_name = 'orgs'
             and action = 'update' and field_name = 'name'),
  'History org Z>History org Z2', 'renaming an org records the old and new name');
select is((select count(*)::int from shared.record_history
           where org_id = '00000000-0000-0000-0000-00000000e1a1' and table_name = 'orgs'
             and field_name in ('id', 'created_at', 'updated_at')),
  0, 'the key and the mechanical clocks are not recorded as changes');

create temp table z_before as
  select count(*)::int n from shared.record_history where org_id = '00000000-0000-0000-0000-00000000e1a1';
update shared.orgs set name = name where id = '00000000-0000-0000-0000-00000000e1a1';
select is((select count(*)::int from shared.record_history where org_id = '00000000-0000-0000-0000-00000000e1a1'),
  (select n from z_before), 'a write that changes nothing records nothing');

select is((select reader from shared.record_history_readers where schema_name = 'shared' and table_name = 'orgs'),
  'shared._history_reader_shared_orgs(text, text, jsonb)', 'the organisation table is registered with its own reader');

-- Org A and B history rows the personas below read.
update shared.orgs set name = 'Org A renamed' where id = '00000000-0000-0000-0000-0000000000a1';
update shared.orgs set name = 'Org B renamed' where id = '00000000-0000-0000-0000-0000000000b1';

-- ── read gate: whoever can read the org row ──────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where table_name = 'orgs' and record_key = '00000000-0000-0000-0000-0000000000a1'
             and new_value = 'Org A renamed'),
  1, 'a plain member reads their own org row''s history');
select is((select count(*)::int from shared.record_history
           where table_name = 'orgs' and record_key = '00000000-0000-0000-0000-0000000000b1'),
  0, '...and none of another org''s org-row history');
select is((select shared._history_reader_shared_orgs('00000000-0000-0000-0000-0000000000a1', 'delete', '{}'::jsonb)),
  false, 'the org reader answers false for a delete row (an org delete records none)');
select is((select shared._history_reader_shared_orgs('not-a-uuid', 'update', null)),
  false, 'a malformed key reads as false, not an error');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where table_name = 'orgs' and record_key = '00000000-0000-0000-0000-0000000000a1'),
  0, 'another org''s admin reads none of org A''s org-row history');
select is((select count(*)::int from shared.record_history
           where table_name = 'orgs' and record_key = '00000000-0000-0000-0000-0000000000b1'
             and new_value = 'Org B renamed'),
  1, 'the org-B admin reads org B''s org-row history');
select is((select count(*)::int from shared.record_history
           where table_name = 'orgs' and record_key = '00000000-0000-0000-0000-00000000e1a1'),
  0, 'a third org''s history stays unreadable');
reset role;

-- ── the org filter on the read path ──────────────────────────────────────────────────────────
-- A stub reader that refuses to run for another org's row: the read only succeeds if the policy
-- filters on the caller's org before it dispatches.
create function shared._history_reader_shared_stub(p_record_key text, p_action text, p_snapshot jsonb)
returns boolean language plpgsql stable security invoker set search_path = ''
as $$ begin
  if p_record_key = 'theirs' then raise exception 'reader ran for another org'; end if;
  return true;
end $$;
grant execute on function shared._history_reader_shared_stub(text, text, jsonb) to authenticated;
insert into shared.record_history_readers (schema_name, table_name, reader)
values ('shared', 'stub_org_filter', 'shared._history_reader_shared_stub(text, text, jsonb)');
insert into shared.record_history (org_id, schema_name, table_name, record_key, action) values
  ('00000000-0000-0000-0000-0000000000a1', 'shared', 'stub_org_filter', 'mine', 'insert'),
  ('00000000-0000-0000-0000-0000000000b1', 'shared', 'stub_org_filter', 'theirs', 'insert');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$ select count(*) from shared.record_history where table_name = 'stub_org_filter' $$,
  'an unfiltered history read never dispatches to a reader for another org''s row');
select is((select count(*)::int from shared.record_history where table_name = 'stub_org_filter'),
  1, '...and returns the caller''s own org''s row');
select is((select count(*)::int from shared.record_history where org_id <> '00000000-0000-0000-0000-0000000000a1'),
  0, 'an unfiltered read returns no row of another org');
select cmp_ok((select count(*)::int from shared.record_history), '>', 0, 'the caller still reads their own org''s history');
reset role;

select * from finish();
rollback;
