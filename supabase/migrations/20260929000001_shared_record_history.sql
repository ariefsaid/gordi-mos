-- Change history for every audited business record (#983, ADR-0059; owner shape + OD-OBJ-1).
-- One append-only table written by ONE generic trigger; read visibility reuses each source
-- table's own read predicate, dispatched by table name, failing closed for any table the
-- dispatch function does not name.
--
--   shared.record_history          — who/when/field/old/new per change; one whole-row JSONB
--                                    snapshot per hard DELETE. No INSERT/UPDATE/DELETE grant to
--                                    any application role: the definer trigger below is the only
--                                    writer, so history cannot be forged, edited or removed —
--                                    admin included.
--   shared._record_history_write() — the generic AFTER INSERT OR UPDATE OR DELETE trigger. It is
--                                    an observer alongside each table's own BEFORE guard, not a
--                                    second guard.
--   shared.can_read_history_record(...) — the read dispatch. insert/update rows resolve against
--                                    the live source row through that table's own predicate;
--                                    delete rows resolve against the captured snapshot's columns.
--                                    Any (table, action) not named here reads as false.
--
-- Trigger registration grammar (the per-table wiring rides tg_argv on CREATE TRIGGER):
--   <col>   — a record-key column, in the order record_key joins them with ':' (DA-1). No args
--             means the table's single uuid `id`.
--   -<col>  — an excluded column: a table-specific mechanical clock no human edited
--             (e.g. mos.tasks.last_activity_at, wired by its own batch).
--   ~<col>  — a document column: update rows record the field name with NULL old/new values —
--             "the write-up changed", never a content copy (change-history spec DA-2). Its insert
--             row is the ordinary one-row summary; its delete snapshot captures every column.
-- A new ordinary column on an audited table needs no trigger change (FR-010): the JSONB diff sees
-- it automatically.
--
-- DOWN:
--   drop trigger record_history_work_lines on mos.work_lines;
--   drop trigger record_history_objectives on mos.objectives;
--   drop function shared.can_read_history_record(text, text, text, text, jsonb);
--   drop function shared._record_history_write();
--   drop function shared._record_history_key(jsonb, text[]);
--   drop policy record_history_select on shared.record_history;
--   revoke select on shared.record_history from authenticated;
--   drop table shared.record_history;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The table — append-only by grant shape, not by convention
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table shared.record_history (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid        not null references shared.orgs(id) on delete cascade,
  schema_name      text        not null,
  table_name       text        not null,
  -- DA-1: id::text where the source table has a uuid id; otherwise its registered primary-key
  -- columns joined with ':' in the trigger registration's documented order.
  record_key       text        not null,
  -- The write's own session claim, captured by the trigger — never a client-supplied value.
  -- NULL for a service/seed write, which carries no person claim (FR-005).
  actor_person_id  uuid        references shared.people(id) on delete set null,
  action           text        not null check (action in ('insert', 'update', 'delete')),
  -- insert/delete rows carry no field; update rows carry exactly one.
  field_name       text,
  old_value        text,
  new_value        text,
  -- Whole-row pre-DELETE capture; the read dispatch reconstructs the source predicate from it
  -- because the row itself is gone. NULL on insert/update rows.
  old_row_snapshot jsonb,
  occurred_at      timestamptz not null default now(),
  check ((action in ('insert', 'delete')) = (field_name is null)),
  check (action <> 'delete' or (old_value is null and new_value is null and old_row_snapshot is not null)),
  check (action = 'delete' or old_row_snapshot is null)
);
comment on table shared.record_history is
  'Append-only change history for every audited business record (#983, ADR-0059). Written ONLY by '
  'shared._record_history_write(); there is no INSERT, UPDATE or DELETE grant to any application '
  'role, so no one — admin included — can forge, edit or remove an entry. Read visibility reuses '
  'each source table''s own read predicate through shared.can_read_history_record; a table or '
  'action the dispatch does not name is unreadable (fail closed). '
  '[applied-path-content: history-dependent]';
comment on column shared.record_history.record_key is
  'The source row''s key as text: id::text, or the registered composite key joined with '':'' '
  '(change-history DA-1).';
comment on column shared.record_history.actor_person_id is
  'Server-captured from the session''s person_id claim at write time (FR-004); NULL for a '
  'service/seed write. Unspoofable by construction: no code path sets it from row data.';
comment on column shared.record_history.old_row_snapshot is
  'Whole-row JSONB of a hard-DELETEd source row, captured before removal. The read dispatch '
  'evaluates the table''s read predicate against these captured columns because the row is gone.';

create index record_history_record_idx
  on shared.record_history (org_id, schema_name, table_name, record_key, occurred_at desc);

revoke all on shared.record_history from public, anon, authenticated, service_role;
grant select on shared.record_history to authenticated;
-- No INSERT/UPDATE/DELETE grant to anyone: the definer trigger below is the only writer. The
-- revoke is load-bearing, not tidiness — fresh tables in this schema carry the stack's default
-- write grants to the application roles until they are taken back (shared.activities precedent).

alter table shared.record_history enable row level security;
alter table shared.record_history force  row level security;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The generic write trigger — one body for every audited table, full three-branch shape now
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Key-column resolution shared by every branch: the registered key columns' values joined with
-- ':' in registration order (DA-1). A registered column absent from the row yields no row here,
-- which the NOT NULL on record_history turns into a write-time wiring error.
create or replace function shared._record_history_key(p_row jsonb, p_key_cols text[])
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(coalesce(p_row ->> c.col, '<null>'), ':' order by c.ord)
  from unnest(p_key_cols) with ordinality as c(col, ord)
  where p_row ? c.col
  having count(*) = array_length(p_key_cols, 1)
$$;
comment on function shared._record_history_key(jsonb, text[]) is
  'record_key for a history row (DA-1): the registered key columns joined with '':'' in '
  'registration order; NULL when a registered column is missing from the row, so a miswired '
  'trigger fails the write instead of recording an unusable key.';

-- Definer because shared.record_history has no INSERT grant for any application role — the same
-- posture mos._guard_signals uses for mos.signal_revisions. An observer, never a guard: it
-- rejects nothing, so it does not collide with the one-guard-per-table house rule.
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
  'which has no INSERT grant.';
revoke execute on function shared._record_history_write() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The read dispatch — every audited table named explicitly, everything else fails closed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Invoker: the source-table lookups below run under the caller and that table's own RLS, so the
-- answer to "can you read this history row" is exactly the answer to "can you read the row it
-- describes". Delete rows answer from the snapshot because the row is gone; until a table with a
-- DELETE grant is wired, that arm is deliberately empty and every delete row is unreadable.
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
begin
  if p_action in ('insert', 'update') then
    case
      when p_schema = 'mos' and p_table = 'objectives' then
        return exists (
          select 1 from mos.objectives o
          where o.id::text = p_record_key
            and o.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'work_lines' then
        return exists (
          select 1 from mos.work_lines w
          where w.id::text = p_record_key
            and w.org_id = shared.current_org_id());
      else
        return false;
    end case;
  end if;
  -- p_action = 'delete' (or anything unrecognized): the snapshot arm registers hard-deletable
  -- tables as their batches wire them. No audited table hard-deletes yet, so nothing is named
  -- here and every delete row fails closed (FR-013, NFR-007).
  return false;
end;
$$;
comment on function shared.can_read_history_record(text, text, text, text, jsonb) is
  'Read dispatch for shared.record_history (#983 FR-007/008/013, NFR-007): each audited table is '
  'named explicitly and read through its own predicate — live row for insert/update, captured '
  'snapshot columns for delete. Anything unnamed returns false, so a trigger wired without a '
  'matching arm exposes nothing.';
revoke execute on function shared.can_read_history_record(text, text, text, text, jsonb) from public, anon;
grant  execute on function shared.can_read_history_record(text, text, text, text, jsonb) to authenticated;

create policy record_history_select on shared.record_history
  for select to authenticated
  using (shared.can_read_history_record(schema_name, table_name, record_key, action, old_row_snapshot));
comment on policy record_history_select on shared.record_history is
  'The one read gate (#983 FR-007/FR-008): visible only through the source table''s own read '
  'predicate, dispatched by (schema, table, action); anything unnamed reads as false.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Wire the first two audited tables (Slice 1: Objectives + Projects & Processes)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Observer triggers alongside each table's existing BEFORE guard. Neither table hard-deletes, so
-- the DELETE branch is present but inert here; later batches attach the same function to the
-- remaining audited tables and register their arms in the dispatch above.
create trigger record_history_objectives
  after insert or update or delete on mos.objectives
  for each row execute function shared._record_history_write();

create trigger record_history_work_lines
  after insert or update or delete on mos.work_lines
  for each row execute function shared._record_history_write();
