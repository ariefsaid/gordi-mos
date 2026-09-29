-- Change history batch 2c — Money (#988, Slice 5 of the change-history rollout on the ADR-0059
-- mechanism from 20260929000001). Attaches the one generic trigger to the four money tables and
-- registers their read arms in shared.can_read_history_record. No shape changes: the mechanism,
-- its grants and its policy are Slice 1's and are not restated here.
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
-- DOWN (restore the pre-batch shape; the mechanism itself stays):
--   drop trigger record_history_budgets on mos.budgets;
--   drop trigger record_history_budget_lines on mos.budget_lines;
--   drop trigger record_history_certified_metrics on mos.certified_metrics;
--   drop trigger record_history_supervisor_revenue_scope on reporting.supervisor_revenue_scope;
--   -- then create or replace function shared.can_read_history_record(text, text, text, text, jsonb)
--   -- back to its pre-batch body (Slice 1's arms only, as of 808aa13b):
--   --   create or replace function shared.can_read_history_record(
--   --     p_schema     text,
--   --     p_table      text,
--   --     p_record_key text,
--   --     p_action     text,
--   --     p_snapshot   jsonb
--   --   )
--   --   returns boolean
--   --   language plpgsql
--   --   stable
--   --   security invoker
--   --   set search_path = ''
--   --   as $$
--   --   begin
--   --     if p_action in ('insert', 'update') then
--   --       case
--   --         -- The registered key of every arm below is a bare uuid (DA-1's id::text shape), so the
--   --         -- stored key is cast BACK to uuid against the PK — index-preserving, per the review of
--   --         -- this migration. The shape test keeps a malformed stored key fail-closed (no row) instead
--   --         -- of erroring the whole policy query. A future composite-key table (DA-1) whose key is not
--   --         -- one uuid registers a plain text-comparison arm instead.
--   --         when p_schema = 'mos' and p_table = 'objectives' then
--   --           return exists (
--   --             select 1 from mos.objectives o
--   --             where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   --               and o.id = p_record_key::uuid
--   --               and o.org_id = shared.current_org_id());
--   --         when p_schema = 'mos' and p_table = 'work_lines' then
--   --           return exists (
--   --             select 1 from mos.work_lines w
--   --             where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--   --               and w.id = p_record_key::uuid
--   --               and w.org_id = shared.current_org_id());
--   --         else
--   --           return false;
--   --       end case;
--   --     end if;
--   --     -- p_action = 'delete' (or anything unrecognized): the snapshot arm registers hard-deletable
--   --     -- tables as their batches wire them. No audited table hard-deletes yet, so nothing is named
--   --     -- here and every delete row fails closed (FR-013, NFR-007).
--   --     return false;
--   --   end;
--   --   $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Wire the four money tables (batch 2c)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Observer triggers alongside each table's existing BEFORE guard, exactly as the earlier slices
-- wired theirs. Three tables take the bare default; certified_metrics registers its composite key
-- (DA-1) — org_id first, then key, so the record_key reads '<org-uuid>:<key>'. org_id is on the
-- mechanism's built-in exclude list, so it still never appears as a field diff.
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The read dispatch — the four new arms join the registry; everything else still fails closed
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The whole body is restated (create or replace has no per-arm edit). Each live arm is the table's
-- own read predicate verbatim — for the money tables the finance/admin tier (budgets_select_
-- finance_admin and its siblings), for the scope table admin-or-own-row
-- (supervisor_revenue_scope_select) — over a live lookup by record_key. The uuid-keyed arms keep
-- the guarded uuid cast that preserves the PK index; certified_metrics' composite key (DA-1) is
-- the registry's one plain text-comparison arm. The lookups run under the caller and each table's
-- own RLS. The delete branch registers this batch's one hard-deletable table against its SNAPSHOT
-- columns, because the row itself is gone.
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
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and o.id = p_record_key::uuid
            and o.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'work_lines' then
        return exists (
          select 1 from mos.work_lines w
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and w.id = p_record_key::uuid
            and w.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'budgets' then
        return exists (
          select 1 from mos.budgets b
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and b.id = p_record_key::uuid
            and b.org_id = shared.current_org_id()
            and (shared.has_access_role('finance') or shared.has_access_role('admin')));
      when p_schema = 'mos' and p_table = 'budget_lines' then
        return exists (
          select 1 from mos.budget_lines bl
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and bl.id = p_record_key::uuid
            and bl.org_id = shared.current_org_id()
            and (shared.has_access_role('finance') or shared.has_access_role('admin')));
      when p_schema = 'mos' and p_table = 'certified_metrics' then
        return exists (
          select 1 from mos.certified_metrics cm
          where (cm.org_id::text || ':' || cm.key) = p_record_key
            and cm.org_id = shared.current_org_id()
            and (shared.has_access_role('finance') or shared.has_access_role('admin')));
      when p_schema = 'reporting' and p_table = 'supervisor_revenue_scope' then
        return exists (
          select 1 from reporting.supervisor_revenue_scope srs
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and srs.id = p_record_key::uuid
            and srs.org_id = shared.current_org_id()
            and (shared.has_access_role('admin') or srs.person_id = shared.current_person_id()));
      else
        return false;
    end case;
  end if;
  -- p_action = 'delete' (or anything unrecognized): the row is gone, so the table's read predicate
  -- is evaluated against the captured snapshot columns. reporting.supervisor_revenue_scope is this
  -- batch's one hard-deletable table (admin-only revocation via
  -- supervisor_revenue_scope_delete_admin): its arm restates its own SELECT predicate
  -- (supervisor_revenue_scope_select: same-org, admin or the grant's own person) over the
  -- snapshot. A table without a registered delete arm — including every other table in this
  -- batch — stays fail closed (FR-013, NFR-007).
  if p_action = 'delete' then
    case
      when p_schema = 'reporting' and p_table = 'supervisor_revenue_scope' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
          and (shared.has_access_role('admin')
               or (p_snapshot ->> 'person_id')::uuid = shared.current_person_id());
      else
        return false;
    end case;
  end if;
  return false;
end;
$$;
