-- Change history for the organisation row, and an org filter on the history read path.
--
-- 1. shared.orgs is the tenant root: it has no org_id column, it IS the org. The generic writer
--    (shared._record_history_write) now takes the history row's org from the row's own `id` when
--    the table is shared.orgs, and from `org_id` everywhere else. The org-delete guard uses the
--    same value, so deleting an org still writes nothing for the cascade and the org's history
--    (including its own org-row history) cascades away with it. The organisation table is
--    registered with its own reader: whoever can read the org row (its own members) can read its
--    history. The reader answers false for a delete row; an org delete records none.
-- 2. shared.record_history's read policy filters on the caller's org before it dispatches to a
--    table's reader, so an unfiltered read never evaluates a reader for another org's row. The
--    one exception is a person's own shared.people row, which the people reader admits by
--    identity while the password-rotation gate holds the org claim at NULL.
--
-- Same signatures, same definer posture, same grants.
--
-- DOWN:
--   drop trigger record_history_orgs on shared.orgs;
--   delete from shared.record_history_readers where (schema_name, table_name) = ('shared', 'orgs');
--   drop function shared._history_reader_shared_orgs(text, text, jsonb);
--   drop policy record_history_select on shared.record_history;
--   create policy record_history_select on shared.record_history
--     for select to authenticated
--     using (shared.can_read_history_record(schema_name, table_name, record_key, action, old_row_snapshot));
--   then re-run `create or replace function shared._record_history_write()` from
--   20260930000047_shared_history_org_delete.sql (the body that reads org_id in every case) and
--   delete the org-row history it leaves behind:
--   delete from shared.record_history where schema_name = 'shared' and table_name = 'orgs';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The writer: the org comes from the row's own id for the root table
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function shared._record_history_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_args     text[] := coalesce(tg_argv, '{}');
  v_key_cols text[] := coalesce((select array_agg(a) from unnest(v_args) a where a not like '-%' and a not like '~%'), '{id}');
  v_excluded text[] := array['id', 'org_id', 'created_at', 'updated_at']
                      || coalesce((select array_agg(substr(a, 2)) from unnest(v_args) a where a like '-%'), '{}');
  v_summary  text[] := coalesce((select array_agg(substr(a, 2)) from unnest(v_args) a where a like '~%'), '{}');
  v_row      jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org      uuid  := (v_row ->> case when tg_table_schema = 'shared' and tg_table_name = 'orgs'
                                      then 'id' else 'org_id' end)::uuid;
  v_old      jsonb;
  v_key      text;
begin
  -- An org delete cascades into its audited tables. By the time this AFTER trigger runs the org
  -- row is gone, and a history row for it would fail its org foreign key. The org's own history
  -- cascades away with it, so there is nothing to record.
  if tg_op <> 'INSERT' and not exists (select 1 from shared.orgs o where o.id = v_org) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    insert into shared.record_history
      (org_id, schema_name, table_name, record_key, actor_person_id, action, old_row_snapshot)
    values
      (v_org, tg_table_schema, tg_table_name,
       shared._record_history_key(v_row, v_key_cols),
       shared.current_person_id(), 'delete', v_row);
    return old;
  end if;

  v_key := shared._record_history_key(v_row, v_key_cols);

  if tg_op = 'INSERT' then
    insert into shared.record_history
      (org_id, schema_name, table_name, record_key, actor_person_id, action)
    values
      (v_org, tg_table_schema, tg_table_name, v_key,
       shared.current_person_id(), 'insert');
    return new;
  end if;

  -- UPDATE: one row per changed column the exclude list does not own; a write that changes
  -- nothing inserts nothing (FR-003). Document columns (~) record that they changed, never what
  -- they changed to (DA-2).
  v_old := to_jsonb(old);
  insert into shared.record_history
    (org_id, schema_name, table_name, record_key, actor_person_id, action, field_name, old_value, new_value)
  select
    v_org, tg_table_schema, tg_table_name, v_key,
    shared.current_person_id(), 'update', d.key,
    case when d.key = any (v_summary) then null else v_old ->> d.key end,
    case when d.key = any (v_summary) then null else d.value end
  from jsonb_each_text(v_row) d
  where d.key <> all (v_excluded)
    and (v_old ->> d.key) is distinct from d.value;
  return new;
end;
$$;
comment on function shared._record_history_write() is
  'The one generic history trigger (#983, ADR-0059): diff to_jsonb(NEW) against to_jsonb(OLD) '
  'per column, one insert-summary row per INSERT, one whole-row snapshot per DELETE. '
  'Registration grammar rides tg_argv: plain = key column (default id), -col = mechanical-clock '
  'exclude, ~col = document column recorded summary-only. The history row''s org is the row''s '
  'org_id, or its own id for the tenant root shared.orgs. Definer solely to write '
  'shared.record_history, which has no INSERT grant. An UPDATE or DELETE whose org no longer '
  'exists (the cascade of an org delete) writes nothing; the org''s history cascades away with it.';
revoke execute on function shared._record_history_write() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The organisation table: reader, registry row, trigger
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function shared._history_reader_shared_orgs(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (
         select 1 from shared.orgs o
         where o.id = p_record_key::uuid
           and o.id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_orgs(text, text, jsonb) is
  'History read predicate for shared.orgs (#1083): the table''s own SELECT predicate (the caller''s '
  'own org) over the live row for insert/update rows. An org delete records no history row, so '
  'any other action is false. Dispatched only through shared.record_history_readers.';
revoke execute on function shared._history_reader_shared_orgs(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_orgs(text, text, jsonb) to authenticated;

insert into shared.record_history_readers (schema_name, table_name, reader)
values ('shared', 'orgs', 'shared._history_reader_shared_orgs(text, text, jsonb)');

create trigger record_history_orgs
  after insert or update or delete on shared.orgs
  for each row execute function shared._record_history_write();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The read policy: the caller's org first, then the table's reader
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The org test is cheap and runs before the reader, so a reader is only ever evaluated for a row of
-- the caller's own org. The claim is read once per statement. The second arm is the people
-- reader's self half: while the password-rotation gate holds the org claim at NULL, a person still
-- reads the history of their own shared.people row.
drop policy record_history_select on shared.record_history;
create policy record_history_select on shared.record_history
  for select to authenticated
  using (
    (org_id = (select shared.current_org_id())
     or (schema_name = 'shared' and table_name = 'people'
         and record_key = (select shared.current_person_id())::text))
    and shared.can_read_history_record(schema_name, table_name, record_key, action, old_row_snapshot));
comment on policy record_history_select on shared.record_history is
  'The one read gate (#983 FR-007/FR-008): the caller''s own org (or their own people row), then '
  'visible only through the source table''s own read predicate, dispatched by (schema, table, '
  'action); anything unnamed reads as false.';
