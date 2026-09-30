-- Change history read registry (#983, ADR-0059, change-history spec DA-3): the read dispatch
-- stops being a function body every batch must restate and becomes DATA. One owner migration
-- (this one) converts shared.can_read_history_record from CASE arms to a lookup in
-- shared.record_history_readers; every later batch creates its own reader function, inserts its
-- registry row and attaches its trigger, and never touches the dispatch again.
--
--   shared.record_history_readers — (schema_name, table_name) -> reader regprocedure. RLS on,
--                          readable by authenticated, no write grant to anon/authenticated: rows
--                          arrive only through migrations, so no session can register a reader.
--   reader                 — SECURITY INVOKER, stable, search_path pinned, signature
--                          (record_key text, action text, old_row_snapshot jsonb) returns boolean:
--                          the table's own read predicate (live row for insert/update, captured
--                          snapshot for delete). Invoker on purpose: the answer to "can you read
--                          this history row" is the answer to "can you read the row it describes",
--                          under the caller's own RLS.
--   dispatch               — no registry row: false (fail closed, spec NFR-007). Reader returns
--                          NULL: false. Otherwise the reader's answer. Execution is dynamic
--                          (format + EXECUTE on the regprocedure's own quoted name); the reader
--                          oid never comes from caller input, only from the migration-seeded
--                          registry.
--
-- The three arms on dev (mos.objectives, mos.work_lines, and #992's mos.objective_key_results with its
-- delete snapshot arm) become readers and rows here,
-- behaviour-identical to the CASE arms they replace. shared._record_history_write() and the
-- record_history table, policy and triggers are untouched: the trigger side never consulted the
-- dispatch, so the conversion does not need it.
--
-- DOWN (restore the CASE dispatch first — the policy calls it — then drop the registry;
-- body below is 20260930000006_mos_objective_targets.sql's, i.e. dev before this migration):
--   create or replace function shared.can_read_history_record(
--     p_schema     text,
--     p_table      text,
--     p_record_key text,
--     p_action     text,
--     p_snapshot   jsonb
--   )
--   returns boolean
--   language plpgsql
--   stable
--   security invoker
--   set search_path = ''
--   as $$
--   begin
--     if p_action in ('insert', 'update') then
--       case
--         -- The registered key of every arm below is a bare uuid (DA-1's id::text shape), so the
--         -- stored key is cast BACK to uuid against the PK — index-preserving, per the review of
--         -- this migration. The shape test keeps a malformed stored key fail-closed (no row) instead
--         -- of erroring the whole policy query. A future composite-key table (DA-1) whose key is not
--         -- one uuid registers a plain text-comparison arm instead.
--         when p_schema = 'mos' and p_table = 'objectives' then
--           return exists (
--             select 1 from mos.objectives o
--             where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--               and o.id = p_record_key::uuid
--               and o.org_id = shared.current_org_id());
--         when p_schema = 'mos' and p_table = 'objective_key_results' then
--           return exists (
--             select 1 from mos.objective_key_results k
--             where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--               and k.id = p_record_key::uuid
--               and k.org_id = shared.current_org_id());
--         when p_schema = 'mos' and p_table = 'work_lines' then
--           return exists (
--             select 1 from mos.work_lines w
--             where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--               and w.id = p_record_key::uuid
--               and w.org_id = shared.current_org_id());
--         else
--           return false;
--       end case;
--     end if;
--     -- p_action = 'delete': objective_key_results is the one hard-deleting audited table, read
--     -- through the table's own org-wide predicate over the captured snapshot because the row is
--     -- gone (FR-011/FR-013). Anything else, or an unrecognized action, fails closed.
--     if p_action = 'delete' then
--       case
--         when p_schema = 'mos' and p_table = 'objective_key_results' then
--           return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id();
--         else
--           return false;
--       end case;
--     end if;
--     return false;
--   end;
--   $$;
--   comment on function shared.can_read_history_record(text, text, text, text, jsonb) is
--     'Read dispatch for shared.record_history (#983 FR-007/008/013, NFR-007; +mos_26): each audited '
--     'table is named explicitly and read through its own predicate — live row for insert/update, '
--     'captured snapshot columns for delete. Anything unnamed returns false, so a trigger wired '
--     'without a matching arm exposes nothing.';
--   delete from shared.record_history_readers;
--   drop function shared._history_reader_mos_objectives(text, text, jsonb);
--   drop function shared._history_reader_mos_work_lines(text, text, jsonb);
--   drop function shared._history_reader_mos_objective_key_results(text, text, jsonb);
--   drop table shared.record_history_readers;
-- (a later batch's DOWN must run first; it removes its own rows and readers.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The registry
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table shared.record_history_readers (
  schema_name text not null,
  table_name  text not null,
  reader      regprocedure not null,
  primary key (schema_name, table_name)
);
comment on table shared.record_history_readers is
  'Read registry for shared.record_history (#983, DA-3): which function answers "may this caller '
  'read a history row of this table". Seeded by migrations only; no INSERT/UPDATE/DELETE grant to '
  'any application role. A table with no row here has unreadable history (fail closed). '
  '[applied-path-content: history-dependent]';

revoke all on shared.record_history_readers from public, anon, authenticated, service_role;
grant select on shared.record_history_readers to authenticated;
-- The revoke is load-bearing: fresh tables in this schema carry the stack's default write grants
-- to the application roles until they are taken back (record_history precedent).

alter table shared.record_history_readers enable row level security;
alter table shared.record_history_readers force  row level security;
create policy record_history_readers_select on shared.record_history_readers
  for select to authenticated using (true);
comment on policy record_history_readers_select on shared.record_history_readers is
  'The registry is metadata, not tenant data: any signed-in caller may read which reader guards a table.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The readers on dev today, ported from the CASE arms
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function shared._history_reader_mos_objectives(
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
    return exists (
      select 1 from mos.objectives o
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and o.id = p_record_key::uuid
        and o.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_objectives(text, text, jsonb) is
  'History read predicate for mos.objectives (Slice 1, #983): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_work_lines(
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
    return exists (
      select 1 from mos.work_lines w
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and w.id = p_record_key::uuid
        and w.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_work_lines(text, text, jsonb) is
  'History read predicate for mos.work_lines (Slice 1, #983): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_objective_key_results(
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
    return exists (
      select 1 from mos.objective_key_results k
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and k.id = p_record_key::uuid
        and k.org_id = shared.current_org_id());
  end if;
  -- delete: the one hard-deleting audited table of Slice 1, read through the table's own org-wide
  -- predicate over the captured snapshot because the row is gone (FR-011/FR-013).
  if p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id();
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_objective_key_results(text, text, jsonb) is
  'History read predicate for mos.objective_key_results (#992, #983): same-org live row for insert/update, '
  'the captured snapshot''s org for delete. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

revoke execute on function shared._history_reader_mos_objectives(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_objectives(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_work_lines(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_work_lines(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_objective_key_results(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_objective_key_results(text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The dispatch — registry lookup, fail closed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Same signature as before, so the record_history_select policy keeps pointing at it untouched.
create or replace function shared.can_read_history_record(
  p_schema     text,
  p_table      text,
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
declare
  v_reader regprocedure;
  v_ok     boolean;
begin
  select r.reader into v_reader
  from shared.record_history_readers r
  where r.schema_name = p_schema and r.table_name = p_table;
  if v_reader is null then
    return false;
  end if;
  -- %s of a regproc is the schema-qualified, correctly quoted name; nothing caller-supplied is
  -- interpolated (the record key, action and snapshot travel as bind parameters).
  execute format('select %s($1, $2, $3)', v_reader::regproc)
    into v_ok using p_record_key, p_action, p_snapshot;
  return coalesce(v_ok, false);
end;
$$;
comment on function shared.can_read_history_record(text, text, text, text, jsonb) is
  'Read dispatch for shared.record_history (#983 FR-007/008/013, NFR-007, DA-3): looks the table up '
  'in shared.record_history_readers and runs its reader. No row, or a NULL answer, is false.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Registry rows for the tables on dev today
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('mos', 'objectives', 'shared._history_reader_mos_objectives(text, text, jsonb)'::regprocedure),
  ('mos', 'work_lines', 'shared._history_reader_mos_work_lines(text, text, jsonb)'::regprocedure),
  ('mos', 'objective_key_results', 'shared._history_reader_mos_objective_key_results(text, text, jsonb)'::regprocedure);
