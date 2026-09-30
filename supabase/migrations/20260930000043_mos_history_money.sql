-- Change history batch 2c — Money (#988), on the registry mechanism of 20260930000040_shared_record_history_registry.sql
-- (ADR-0059, DA-3). This migration ONLY creates the batch's reader functions, registers them in
-- shared.record_history_readers and attaches the one generic trigger; it does not replace the
-- read dispatch, so batches are order-independent and none can drop another's arms.
-- The reader bodies and trigger registrations are the batch's reviewed arms, ported unchanged
-- from the batch's tip (feat/988-*).
--
-- This is the rollout's ROLE-GATED batch (spec AC-007's proof arm): money history does not ride
-- the plain org-membership predicate of the earlier slices but each table's own SELECT policy,
-- restated verbatim.
--
--   mos.budgets                 — default uuid id key. archived_at stays recorded: soft-archiving
--                                 a scenario is a human action, the events.archived_at precedent.
--                                 Reads are the finance/admin tier of budgets_select_finance_admin.
--   mos.budget_lines            — plain registration; the default uuid id key and the built-in
--                                 exclude list (id / org_id / created_at / updated_at) are the
--                                 whole registration. Same finance/admin tier.
--   mos.certified_metrics       — THE composite-key table of the change-history spec's DA-1: the
--                                 PK is (org_id, key), there is no uuid id, so the trigger
--                                 registers ('org_id','key') in that documented order and the
--                                 record_key is their ':'-joined text ('<org-uuid>:<key>'). Its
--                                 read arm is the one plain text-comparison arm of the registry.
--                                 Same finance/admin tier.
--   reporting.supervisor_revenue_scope — default uuid id key; the read is admin-or-own-row,
--                                 verbatim from supervisor_revenue_scope_select.
--
-- The batch's one hard-DELETE: reporting.supervisor_revenue_scope holds the only authenticated
-- DELETE grant in this slice (admin-only revocation via supervisor_revenue_scope_delete_admin,
-- 20260805000015 — a grant is added or revoked, never edited, so there is no UPDATE at all). Its
-- snapshot arm evaluates its own SELECT predicate against the captured SNAPSHOT columns, because
-- the row itself is gone. The budget pair (SELECT for authenticated, no DELETE grant — writes ride
-- mos.capture_budget) and the registry (migration-seeded, no runtime CRUD at all) register no
-- delete arm: a delete row for them, if one ever existed, fails closed until its arm is wired.
--
-- DOWN (drop the observers first, then the registry rows, then the readers they name):
--   drop trigger record_history_budgets on mos.budgets;
--   drop trigger record_history_budget_lines on mos.budget_lines;
--   drop trigger record_history_certified_metrics on mos.certified_metrics;
--   drop trigger record_history_supervisor_revenue_scope on reporting.supervisor_revenue_scope;
--   delete from shared.record_history_readers where (schema_name, table_name) in (
--     ('mos','budgets'), ('mos','budget_lines'), ('mos','certified_metrics'), ('reporting','supervisor_revenue_scope'));
--   drop function shared._history_reader_mos_budgets(text, text, jsonb);
--   drop function shared._history_reader_mos_budget_lines(text, text, jsonb);
--   drop function shared._history_reader_mos_certified_metrics(text, text, jsonb);
--   drop function shared._history_reader_reporting_supervisor_revenue_scope(text, text, jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Reader functions — one per table, the table's own read predicate
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function shared._history_reader_mos_budgets(
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
      select 1 from mos.budgets b
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and b.id = p_record_key::uuid
        and b.org_id = shared.current_org_id()
        and (shared.has_access_role('finance') or shared.has_access_role('admin')));
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_budgets(text, text, jsonb) is
  'History read predicate for mos.budgets (#988): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_budget_lines(
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
      select 1 from mos.budget_lines bl
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and bl.id = p_record_key::uuid
        and bl.org_id = shared.current_org_id()
        and (shared.has_access_role('finance') or shared.has_access_role('admin')));
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_budget_lines(text, text, jsonb) is
  'History read predicate for mos.budget_lines (#988): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_mos_certified_metrics(
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
      select 1 from mos.certified_metrics cm
      where (cm.org_id::text || ':' || cm.key) = p_record_key
        and cm.org_id = shared.current_org_id()
        and (shared.has_access_role('finance') or shared.has_access_role('admin')));
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_mos_certified_metrics(text, text, jsonb) is
  'History read predicate for mos.certified_metrics (#988): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_reporting_supervisor_revenue_scope(
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
      select 1 from reporting.supervisor_revenue_scope srs
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and srs.id = p_record_key::uuid
        and srs.org_id = shared.current_org_id()
        and (shared.has_access_role('admin') or srs.person_id = shared.current_person_id()));
  elsif p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
      and (shared.has_access_role('admin')
           or (p_snapshot ->> 'person_id')::uuid = shared.current_person_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_reporting_supervisor_revenue_scope(text, text, jsonb) is
  'History read predicate for reporting.supervisor_revenue_scope (#988): the table''s own SELECT predicate over the live row '
  'for insert/update rows, and over the captured snapshot columns for delete rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

revoke execute on function shared._history_reader_mos_budgets(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_budgets(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_budget_lines(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_budget_lines(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_mos_certified_metrics(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_mos_certified_metrics(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_reporting_supervisor_revenue_scope(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_reporting_supervisor_revenue_scope(text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Registry rows
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('mos', 'budgets', 'shared._history_reader_mos_budgets(text, text, jsonb)'),
  ('mos', 'budget_lines', 'shared._history_reader_mos_budget_lines(text, text, jsonb)'),
  ('mos', 'certified_metrics', 'shared._history_reader_mos_certified_metrics(text, text, jsonb)'),
  ('reporting', 'supervisor_revenue_scope', 'shared._history_reader_reporting_supervisor_revenue_scope(text, text, jsonb)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Wire the observer triggers
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create trigger record_history_budgets
  after insert or update or delete on mos.budgets
  for each row execute function shared._record_history_write();

create trigger record_history_budget_lines
  after insert or update or delete on mos.budget_lines
  for each row execute function shared._record_history_write();

create trigger record_history_certified_metrics
  after insert or update or delete on mos.certified_metrics
  for each row execute function shared._record_history_write('org_id', 'key');

create trigger record_history_supervisor_revenue_scope
  after insert or update or delete on reporting.supervisor_revenue_scope
  for each row execute function shared._record_history_write();
