-- Deleting an org removes its history (#1113).
--
-- shared._record_history_write() inserted a history row for every cascaded child of a deleted
-- org, and that insert failed shared.record_history's org foreign key because the org row was
-- already gone, so an org with history-registered children could not be deleted. The writer now
-- skips an UPDATE or DELETE whose org no longer exists; the table's existing
-- `org_id ... on delete cascade` removes the org's history in the same statement. Other orgs'
-- history is untouched, and a live-org DELETE still records its snapshot. Same signature, same
-- definer posture, same grants.
--
-- DOWN: re-run `create or replace function shared._record_history_write()` from
-- 20260929000010_shared_record_history.sql (the body without the org-exists guard).

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
  v_row      jsonb;
  v_old      jsonb;
  v_key      text;
begin
  -- An org delete cascades into its audited tables. By the time this AFTER trigger runs the org
  -- row is gone, and a history row for it would fail its org foreign key. The org's own history
  -- cascades away with it, so there is nothing to record.
  if tg_op <> 'INSERT'
     and not exists (select 1 from shared.orgs o
                     where o.id = ((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'org_id')::uuid) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    insert into shared.record_history
      (org_id, schema_name, table_name, record_key, actor_person_id, action, old_row_snapshot)
    values
      ((v_row ->> 'org_id')::uuid, tg_table_schema, tg_table_name,
       shared._record_history_key(v_row, v_key_cols),
       shared.current_person_id(), 'delete', v_row);
    return old;
  end if;

  v_row := to_jsonb(new);
  v_key := shared._record_history_key(v_row, v_key_cols);

  if tg_op = 'INSERT' then
    insert into shared.record_history
      (org_id, schema_name, table_name, record_key, actor_person_id, action)
    values
      ((v_row ->> 'org_id')::uuid, tg_table_schema, tg_table_name, v_key,
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
    (v_row ->> 'org_id')::uuid, tg_table_schema, tg_table_name, v_key,
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
  'per column, one insert-summary row per INSERT, one whole-row snapshot per DELETE. Registration '
  'grammar rides tg_argv: plain = key column (default id), -col = mechanical-clock exclude, '
  '~col = document column recorded summary-only. Definer solely to write shared.record_history, '
  'which has no INSERT grant. An UPDATE or DELETE whose org no longer exists (the cascade of an org '
  'delete) writes nothing; the org''s history cascades away with it.';
revoke execute on function shared._record_history_write() from public, anon, authenticated;
