-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 2 of 4 for `ops`: access control (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Server-stamped column defaults, every guard, every base privilege and every RLS policy on `ops` —
-- plus the enqueue refusal on the outbox landing zone authored alongside it in ...0009.
--
-- ⚠ A RE-AUTHORED RLS POLICY IS A NEW POLICY. Nothing here inherits a fail-closed proof from the
-- policy it replaces. Every policy created in this file has its own negative assertion in
-- supabase/tests/ops_03_policy_fail_closed.sql, written against THIS SQL.
--
-- Two structural rules carried from the `shared` and `mos` halves because both have cost real time:
--   1. CREATE POLICY resolves its functions at creation time, so every helper is defined above the
--      first policy that calls it.
--   2. There is exactly ONE guard function per table. Where the prior chains grew several by
--      accretion, this file folds them into one body and labels each carried invariant with the
--      migration it came from, so extending one cannot silently drop another. Where two checks could
--      both raise on the same statement the merged body preserves the original order, so the error
--      CODE a given violation produces is unchanged.
--
-- DOWN: see ...0009's DOWN (drop schema ops cascade; drop table integrations.esb_push cascade).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Server-stamped defaults
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Set here rather than inline in ...0009 for the same reason the `shared` half does it: the default
-- expressions call functions defined in the access-control layer, and a table cannot depend on a
-- function that does not exist yet. org_id is additionally pinned by every INSERT policy's WITH
-- CHECK, so the default is a convenience and the policy is the control.
alter table ops.log_entries    alter column org_id     set default shared.current_org_id();
alter table ops.log_entries    alter column created_by set default shared.current_person_id();
alter table ops.wip_items      alter column org_id     set default shared.current_org_id();
alter table ops.kitchen_plans  alter column org_id     set default shared.current_org_id();
alter table ops.kitchen_plans  alter column plan_by    set default shared.current_person_id();
alter table ops.kitchen_logs   alter column org_id     set default shared.current_org_id();
alter table ops.kitchen_logs   alter column submitted_by set default shared.current_person_id();
alter table ops.kitchen_stock  alter column org_id     set default shared.current_org_id();
alter table integrations.esb_push alter column org_id  set default shared.current_org_id();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Read/write predicates
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CARRIED from 20260612000005. Edit/archive gate for the Daily Log: the author, or a manager of the
-- author, within the org (OD-P2-19, FR-021/022). SECURITY INVOKER — nothing to revoke, so the
-- definer-revoke lint stays clean.
create or replace function ops.can_edit_log_entry(p_entry_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from ops.log_entries e
    where e.id = p_entry_id
      and e.org_id = shared.current_org_id()
      and (
        e.created_by = shared.current_person_id()
        or shared.is_manager_of(e.created_by)
      )
  )
$$;
comment on function ops.can_edit_log_entry(uuid) is
  'Daily Log edit/archive gate: the current person is the author or a manager of the author (OD-P2-19, FR-021/022). SECURITY INVOKER.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Guards
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── ops.log_entries ──────────────────────────────────────────────────────────────────────────
-- CARRIED WHOLE from 20260612000006 (the 2026-06-12 audit). Two seams RLS cannot close on its own:
--
--   HIGH — created_by / org_id mutable on UPDATE. ops.can_edit_log_entry re-reads the row BY ID, so
--     the UPDATE WITH CHECK evaluates the gate against the OLD created_by and never sees the NEW
--     value: an author passes the gate and can then re-attribute the entry to anyone, including a
--     foreign-org person. WITH CHECK cannot compare OLD to NEW, so this is a trigger, and it RAISES
--     rather than silently pinning the value.
--   MEDIUM — cross-org business_unit_id / linked_task_id (an existence oracle). FK lookups bypass
--     RLS and check existence only, so an org-A entry could reference an org-B business unit or task.
--
-- SECURITY INVOKER is sufficient and is the point: both referenced tables are org-readable, so a
-- same-org reference is visible and yields a matching org_id, while a cross-org reference is
-- invisible, the lookup returns NULL, and the IS DISTINCT FROM comparison fires the raise.
create or replace function ops._guard_log_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_task_org uuid;
begin
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable on a log entry' using errcode = '42501';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a log entry' using errcode = '42501';
    end if;
  end if;

  -- A NULL business_unit_id is left to the NOT NULL column constraint (23502) so this guard never
  -- pre-empts the more fundamental column rule and the error-code contract is unchanged.
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org
      from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id must belong to the same org as the log entry'
        using errcode = '23514';
    end if;
  end if;

  if new.linked_task_id is not null then
    select t.org_id into v_task_org from mos.tasks t where t.id = new.linked_task_id;
    if v_task_org is distinct from new.org_id then
      raise exception 'linked_task_id must belong to the same org as the log entry'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
comment on function ops._guard_log_entry() is
  'Guard (20260612000006): created_by/org_id immutable on UPDATE (42501); business_unit_id + linked_task_id must be same-org on INSERT/UPDATE (23514). SECURITY INVOKER — the references are org-readable, so a cross-org id reads as NULL and raises.';

create trigger log_entries_guard
  before insert or update on ops.log_entries
  for each row execute function ops._guard_log_entry();

-- ── ops.kitchen_logs ─────────────────────────────────────────────────────────────────────────
-- ONE guard, folding 20260620000008 (status gate + immutability + same-org FK seam) and
-- 20260620000012 (reject provenance), and extending both to the columns this baseline adds. Each
-- carried invariant is labelled with the migration it came from.
--
-- The re-target rule is where the reshape shows. On the prior chains it froze
-- action_type/wip_item_id/log_date on a Submitted row, because flipping any of them would alter the
-- day's actuals silently after the fact. The stream columns and the movement columns are exactly the
-- same class of value — flipping branch_id after submission moves a production run into another
-- branch's books, which is the COGS defect this whole effort exists to stop — so the same freeze
-- covers them. `source` is frozen on every transition, not just Submitted→Submitted: it is
-- provenance, and a row that could change its own provenance would make the AC-011 constraint and
-- the import marker meaningless.
create or replace function ops._guard_kitchen_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_wip_org  uuid;
  v_br_org   uuid;
  v_dest_org uuid;
begin
  -- 20260620000008: submitted_by is immutable post-insert — a log cannot be re-attributed.
  if tg_op = 'UPDATE' and new.submitted_by is distinct from old.submitted_by then
    raise exception 'submitted_by is immutable' using errcode = '42501';
  end if;
  -- 20260620000008: org_id is immutable post-insert (prevents cross-org re-homing on UPDATE).
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- NEW in this baseline (OD-WAY-38): `source` is provenance and never changes. Without this a
  -- member could relabel their own MOS row as imported history, or an imported row as MOS-authored.
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'source is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- 20260620000008, stated as the rule it is meant to be: EVERY status transition is a reviewer
  -- action. The gate is keyed on the ACT of changing status rather than on which status is being
  -- left, so it reads the same in both directions and does not have to be re-derived per transition.
  --
  -- Review is ONE-WAY. Approved and Rejected are terminal for the app tier, and a correction is
  -- recorded as a new log — which is how the floor already works on paper. This is the same intent
  -- the field freeze below carries: figures stop moving once they have been reviewed. An approved
  -- log has also already produced a downstream ERP document, and those identifiers are minted once
  -- per batch, so a reopen would need a compensating design for that document before it could mean
  -- anything. Whether a reviewer should be able to reopen at all is a product decision no ruling
  -- authorises; between two unruled options this is the one that cannot alter a figure somebody has
  -- already signed off. Raised for the owner rather than assumed settled.
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
      raise exception 'only ops_lead/admin may approve or reject a kitchen log' using errcode = '42501';
    end if;
    if old.status <> 'Submitted' then
      raise exception 'a reviewed kitchen log keeps its status; record a correction as a new log'
        using errcode = '42501';
    end if;
  end if;
  -- 20260620000012: Submitted→Rejected stamps reviewer provenance server-side (FR-044). Reject is a
  -- plain guarded UPDATE and the client sends only status + review_note, so reviewed_by/reviewed_at
  -- are attributed here. Approve is left to the approval function, which sets them explicitly, so
  -- this stamp deliberately does NOT fire on →Approved.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Rejected' then
    new.reviewed_by := shared.current_person_id();
    new.reviewed_at := now();
  end if;
  -- 20260620000008, extended: a Submitted→Submitted UPDATE that re-targets the row is forbidden —
  -- it would alter the day's actuals silently. The prior chains froze action_type/wip_item/log_date;
  -- the stream and movement columns that replaced action_type are frozen with them.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Submitted' then
    if new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date then
      raise exception 'the production stream, movement, wip item and date are immutable on a Submitted log'
        using errcode = '42501';
    end if;
  end if;
  -- 20260620000008: SAME-ORG FK seam. business_unit_id and wip_item_id are existence-only FKs and FK
  -- lookups bypass RLS, so a member could reference a foreign-org row. Under INVOKER RLS a same-org
  -- reference is visible and a cross-org one is not, so the lookup returns NULL and raises 23514.
  --
  -- EVERY arm below is guarded on `is not null`, and that is deliberate rather than defensive. A
  -- BEFORE ROW trigger runs before NOT NULL is checked, so an unguarded lookup on a missing value
  -- would report a same-org violation (23514) for what is actually a missing required column
  -- (23502) — the guard would pre-empt the more fundamental rule and give the wrong diagnosis.
  -- AC-007 depends on this: a log written without a stream must be refused BY the NOT NULL column,
  -- so the refusal survives any later change to this guard.
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  if new.wip_item_id is not null then
    select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
    if v_wip_org is distinct from new.org_id then
      raise exception 'wip_item_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  -- NEW in this baseline: branch_id and destination_branch_id are the same class of existence-only
  -- FK, into a catalog that is itself org-scoped. Added because the columns are new, NOT because the
  -- old seam was reopened — omitting them would have left the stream dimension as the one
  -- unvalidated cross-tenant reference on the table that feeds COGS.
  if new.branch_id is not null then
    select b.org_id into v_br_org from shared.branches b where b.id = new.branch_id;
    if v_br_org is distinct from new.org_id then
      raise exception 'branch_id must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.destination_branch_id is not null then
    select b.org_id into v_dest_org from shared.branches b where b.id = new.destination_branch_id;
    if v_dest_org is distinct from new.org_id then
      raise exception 'destination_branch_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_log() is
  'Guard (folds 20260620000008 + 20260620000012, extended for the stream columns): Submitted→Approved/Rejected is ops_lead/admin only; Submitted→Rejected stamps reviewed_by/reviewed_at; submitted_by, org_id and source are immutable, as are the stream, movement, wip item and date on a Submitted row (42501); business_unit_id, wip_item_id, branch_id and destination_branch_id must be same-org (23514). SECURITY INVOKER.';

create trigger kitchen_logs_guard
  before insert or update on ops.kitchen_logs
  for each row execute function ops._guard_kitchen_log();

-- ── ops.kitchen_plans ────────────────────────────────────────────────────────────────────────
-- NEW in this baseline, and it exists because the table gained the same class of reference the two
-- tables above already had guarded. Plans are ops_lead/admin-written, so the threat is narrower than
-- on kitchen_logs, but the cross-org FK seam does not care who writes it: an existence-only FK into
-- an org-scoped catalog is a cross-tenant reference unless something checks the org.
create or replace function ops._guard_kitchen_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_wip_org  uuid;
  v_br_org   uuid;
  v_dest_org uuid;
begin
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on a kitchen plan' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'source is immutable on a kitchen plan' using errcode = '42501';
  end if;
  -- Guarded on `is not null` for the same reason as ops._guard_kitchen_log: a BEFORE ROW trigger
  -- runs before NOT NULL is checked, so an unguarded lookup would diagnose a missing stream as a
  -- cross-org reference. AC-008 depends on the NOT NULL column being the thing that refuses.
  if new.wip_item_id is not null then
    select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
    if v_wip_org is distinct from new.org_id then
      raise exception 'wip_item_id must belong to the same org as the kitchen plan' using errcode = '23514';
    end if;
  end if;
  if new.branch_id is not null then
    select b.org_id into v_br_org from shared.branches b where b.id = new.branch_id;
    if v_br_org is distinct from new.org_id then
      raise exception 'branch_id must belong to the same org as the kitchen plan' using errcode = '23514';
    end if;
  end if;
  if new.destination_branch_id is not null then
    select b.org_id into v_dest_org from shared.branches b where b.id = new.destination_branch_id;
    if v_dest_org is distinct from new.org_id then
      raise exception 'destination_branch_id must belong to the same org as the kitchen plan'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_plan() is
  'Guard: org_id and source immutable on UPDATE (42501); wip_item_id, branch_id and destination_branch_id must be same-org (23514, same seam as ops._guard_kitchen_log). SECURITY INVOKER.';

create trigger kitchen_plans_guard
  before insert or update on ops.kitchen_plans
  for each row execute function ops._guard_kitchen_plan();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. THE ENQUEUE REFUSAL — no outbox row for a log the ERP already holds (AC-012, DD-WAY-20)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Read DD-WAY-20 before changing anything here, because the obvious mental model of this control is
-- the wrong one.
--
-- OD-K-4 makes "at most one ERP document per batch" a hard-safety guarantee, and OD-WAY-38's
-- flip-time import re-arms it: every imported log line corresponds to a document the live ERP ALREADY
-- HOLDS. The standing instruction was that the importer stamps posted_to_esb and the danger passes.
-- It does not. On both prior chains posted_to_esb was NEVER READ AS A PREDICATE — not in a policy,
-- not in a function, not in the app. It was an audit mirror of what the worker had stamped. What
-- actually prevented a re-POST was structural and indirect: no outbox row exists for a row that never
-- passed through approval, and the approval guard refuses anything not Submitted.
--
-- Those two protections hold for the paths that exist TODAY. They do not hold for the paths the flip
-- and the bar-capture work are about to add, and each of these is realistic rather than theoretical:
--   * a status-mapping slip in the loader that lands an imported row as Submitted rather than
--     Approved — the loader is written fresh at flip time, under time pressure, and this is a
--     one-character class of mistake;
--   * any direct or backfill enqueue that writes an outbox row without going through approval;
--   * any future bulk-approve path.
--
-- This trigger is what makes the flag load-bearing rather than decorative, at which point the
-- standing instruction becomes true as written. It is a schema-level refusal: it does not care which
-- code path asked, so it covers the paths that do not exist yet.
--
-- SECURITY DEFINER, and that is a deliberate choice rather than a default. Every legitimate writer of
-- this table bypasses RLS anyway (the approval function is definer; the worker holds service_role),
-- but an INVOKER guard whose lookup was filtered by RLS would find no row, read NULL, and ALLOW the
-- enqueue — a control that fails open exactly when it is being evaded. It reads one boolean and one
-- id and returns nothing else, so it is not an information channel.
--
-- Scoped to source_module = 'kitchen' because source_ref only names an ops.kitchen_logs batch for
-- that module; a roastery row's source_ref means something else and must not be silently matched
-- against a kitchen batch id.
create or replace function integrations._guard_esb_push_not_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posted boolean;
begin
  if new.source_module = 'kitchen' then
    select l.posted_to_esb into v_posted
      from ops.kitchen_logs l
     where l.org_id = new.org_id
       and l.batch_id = new.source_ref;
    if v_posted then
      raise exception
        'batch % is already posted to the ERP; refusing to enqueue an outbox row for it', new.source_ref
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
comment on function integrations._guard_esb_push_not_posted() is
  'AC-012 / DD-WAY-20: refuses an outbox row whose kitchen batch is already marked posted to the ERP (55000). This is what makes ops.kitchen_logs.posted_to_esb load-bearing — on both prior chains no predicate anywhere read it, so stamping it guaranteed nothing. SECURITY DEFINER so the lookup cannot be filtered into a NULL and fail open; it returns nothing and is not an information channel.';
-- A trigger function is not meant to be callable directly, and `integrations` is exposed through
-- PostgREST. Revoked rather than left on the default PUBLIC grant.
revoke execute on function integrations._guard_esb_push_not_posted() from public, anon, authenticated;

-- Fires on INSERT (the enqueue itself) and on an UPDATE that re-points source_ref — otherwise a row
-- could be enqueued against a pending batch and then aimed at a posted one.
create trigger esb_push_not_posted_guard
  before insert or update of source_ref on integrations.esb_push
  for each row execute function integrations._guard_esb_push_not_posted();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Base privileges
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- NO DELETE anywhere in `ops` (NFR-002/004, FR-095). Removal is an archive on the Daily Log and a
-- status transition on a kitchen log; hard delete is impossible for the app tier by privilege, which
-- fails closed with nothing to widen. service_role bypasses RLS but still needs the grants below.
grant select, insert, update on ops.log_entries   to authenticated;
grant select, insert, update on ops.wip_items     to authenticated;
grant select, insert, update on ops.kitchen_plans to authenticated;
-- ops.kitchen_logs takes a COLUMN-LIST update grant rather than a table-level one. The posting
-- columns — batch_id, posted_to_esb, esb_doc_num, posted_at — are the ERP dispatch record, and they
-- are written by exactly two parties: the approval path, which runs as the definer, and the worker,
-- which is service_role. Neither needs an app-tier grant, and the app tier has no reason to set any
-- of them. Withholding the privilege is the control: a missing column grant fails closed with
-- nothing to widen, where a trigger branch is one edit away from being relaxed. It also keeps the
-- posted marker sound as the AC-012 enqueue refusal's predicate: that refusal decides whether a
-- batch may be sent to the ERP by reading this marker, so the marker belongs to the parties that
-- own the dispatch and to no one else.
--
-- The list is EVERY OTHER COLUMN, deliberately. Withholding more would be a better-looking grant and
-- a worse change: org_id, submitted_by and source are already immutable via ops._guard_kitchen_log,
-- with the guard's own error message asserted, and moving them to a privilege refusal would silently
-- replace a proven mechanism with a different one and leave two tests passing for a new reason.
-- Exactly four columns change hands here.
grant select, insert on ops.kitchen_logs to authenticated;
grant update (id, org_id, business_unit_id, log_date, branch_id, activity, action,
              destination_branch_id, wip_item_id, qty_porsi, notes, status, source, submitted_by,
              review_note, reviewed_by, reviewed_at, created_at, updated_at)
  on ops.kitchen_logs to authenticated;
-- kitchen_stock is written only by the approval path, which runs as the definer. No write grant to
-- authenticated at all: the absence of the privilege is the control, not the absence of a policy.
grant select on ops.kitchen_stock to authenticated;
-- kitchen_batch_seq gets NOTHING. It is an approval-internal mechanism; the app tier can neither
-- read the counter nor mint from it.

-- The outbox is readable by the ops tier and written only by the approval path and the worker.
grant select on integrations.esb_push to authenticated;

-- CARRIED from 20260626000010. service_role bypasses RLS but table-level grants are still required
-- on these custom schemas, and without them the worker's calls fail with 42501. The privileges are
-- the minimum the worker uses: read pending rows and flip their status; stamp the posting mirror on
-- the log by batch_id; resolve the WIP item name for the assembly notes. NO INSERT on esb_push — the
-- approval path enqueues — and no DELETE anywhere, mirroring the app-tier posture.
grant select, update on integrations.esb_push to service_role;
grant select, update on ops.kitchen_logs      to service_role;
grant select          on ops.wip_items        to service_role;
-- The flip-time import writes history into the live tables (OD-WAY-38) as service_role.
grant insert on ops.kitchen_logs   to service_role;
grant select, insert, update on ops.kitchen_plans to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. RLS posture
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ENABLED and FORCED on every table.
--
-- ⚠ BE PRECISE ABOUT WHAT FORCE BUYS, because the obvious reading credits it with work it does not
-- do. FORCE subjects the table OWNER to its own policies. It does NOT constrain the approval path:
-- that function is SECURITY DEFINER and runs as the owning role, which holds BYPASSRLS, and
-- BYPASSRLS overrides FORCE. The approval path is meant to bypass RLS — that is why it is DEFINER,
-- and why every guard it needs is written into its body rather than left to a policy.
--
-- What actually keeps the app tier out of posting state and stock is PRIVILEGE and the absence of a
-- write policy: no INSERT/UPDATE grant on ops.kitchen_stock or integrations.esb_push, no grant at
-- all on ops.kitchen_batch_seq, and no write policy for `authenticated` on any of the three. Those
-- are the controls; ops_01_rls_posture.sql asserts them directly for that reason.
--
-- FORCE stays, and stays on everything, as defence in depth: it binds any future owner or grantee
-- that does NOT hold BYPASSRLS, and enabled-but-not-forced would be a real hole for such a role. It
-- is simply not the thing holding the line today, and a comment that says otherwise is how the next
-- reader removes the grant posture and keeps the flag.
alter table ops.log_entries       enable row level security;
alter table ops.log_entries       force  row level security;
alter table ops.wip_items         enable row level security;
alter table ops.wip_items         force  row level security;
alter table ops.kitchen_plans     enable row level security;
alter table ops.kitchen_plans     force  row level security;
alter table ops.kitchen_logs      enable row level security;
alter table ops.kitchen_logs      force  row level security;
alter table ops.kitchen_stock     enable row level security;
alter table ops.kitchen_stock     force  row level security;
alter table ops.kitchen_batch_seq enable row level security;
alter table ops.kitchen_batch_seq force  row level security;
alter table integrations.esb_push enable row level security;
alter table integrations.esb_push force  row level security;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. Policies
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── ops.log_entries ──────────────────────────────────────────────────────────────────────────
create policy log_entries_select_org on ops.log_entries
  for select to authenticated
  using (org_id = shared.current_org_id());
comment on policy log_entries_select_org on ops.log_entries is
  'Org-readable floor visibility (OD-P1-3, FR-010). Archived rows are hidden by a query predicate, not by RLS — an archived entry is still the org''s record.';

create policy log_entries_insert_member on ops.log_entries
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.is_org_member()
    and created_by = shared.current_person_id());
comment on policy log_entries_insert_member on ops.log_entries is
  'Any org member may add a floor record; org_id is unspoofable and created_by is pinned to the session person.';

create policy log_entries_update_editor on ops.log_entries
  for update to authenticated
  using (ops.can_edit_log_entry(id))
  with check (org_id = shared.current_org_id() and ops.can_edit_log_entry(id));
comment on policy log_entries_update_editor on ops.log_entries is
  'Author-or-manager gate covering edit AND archive (OD-P2-19). The gate re-reads by id, so created_by and org_id immutability is enforced by ops._guard_log_entry rather than here.';

-- ── ops.wip_items ────────────────────────────────────────────────────────────────────────────
create policy wip_items_select_org on ops.wip_items
  for select to authenticated
  using (org_id = shared.current_org_id());
comment on policy wip_items_select_org on ops.wip_items is
  'Org-readable: any member sees the item list to log against (FR-011).';

create policy wip_items_insert_ops on ops.wip_items
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));

create policy wip_items_update_ops on ops.wip_items
  for update to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')))
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
comment on policy wip_items_update_ops on ops.wip_items is
  'Master data write is ops_lead/admin only (FR-010). The item list and its ERP identity decide what every capture surface can record, so it is not member-writable.';

-- ── ops.kitchen_plans ────────────────────────────────────────────────────────────────────────
create policy kitchen_plans_select_org on ops.kitchen_plans
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy kitchen_plans_insert_ops on ops.kitchen_plans
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and source = 'mos'
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
comment on policy kitchen_plans_insert_ops on ops.kitchen_plans is
  'ops_lead/admin write the plan (FR-030). source is pinned to mos: the app tier can never author a row that claims to be imported Teable history — the flip-time import runs as service_role (OD-WAY-38).';

create policy kitchen_plans_update_ops on ops.kitchen_plans
  for update to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')))
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));

-- ── ops.kitchen_logs ─────────────────────────────────────────────────────────────────────────
create policy kitchen_logs_select_org on ops.kitchen_logs
  for select to authenticated
  using (org_id = shared.current_org_id());
comment on policy kitchen_logs_select_org on ops.kitchen_logs is
  'Org-readable: the review queue and the upcoming-orders view are deliberately org-scoped (FR-044).';

create policy kitchen_logs_insert_member on ops.kitchen_logs
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and submitted_by = shared.current_person_id()
              and source = 'mos'
              and status = 'Submitted');
comment on policy kitchen_logs_insert_member on ops.kitchen_logs is
  'Any member logs their own line, server-attributed, always Submitted. source is pinned to mos so the app tier cannot forge imported history — which is also what keeps the conditional submitted_by constraint honest: the only rows that may omit a submitter are written by service_role at the flip (OD-WAY-38).';

-- CARRIED from 20260804000001 (#177), which replaced an org-only UPDATE policy under which any
-- member could edit any other member's pending row. Production capture moves into MOS precisely so
-- the numbers become trustworthy, and "anyone may edit anyone's pending entry" is the one property
-- that argues against that.
-- The submitter's arm is scoped by BOTH terms: their own row, and only while it is still awaiting
-- review. A member's edit window is the period before review, and the status term is what expresses
-- the second half of that — "your own row" alone names a person, not a period. The reviewer arms
-- carry no status term, because reviewing is exactly what they are for.
create policy kitchen_logs_update_own_or_reviewer on ops.kitchen_logs
  for update to authenticated
  using (
    org_id = shared.current_org_id()
    and ((submitted_by = shared.current_person_id() and status = 'Submitted')
         or shared.has_access_role('ops_lead')
         or shared.has_access_role('admin')))
  with check (
    org_id = shared.current_org_id()
    and ((submitted_by = shared.current_person_id() and status = 'Submitted')
         or shared.has_access_role('ops_lead')
         or shared.has_access_role('admin')));
comment on policy kitchen_logs_update_own_or_reviewer on ops.kitchen_logs is
  'Non-privileged edits are scoped to the submitter''s own rows AND to the period before review; ops_lead/admin retain review-edit at any status. submitted_by is immutable post-insert (ops._guard_kitchen_log), so USING and WITH CHECK cannot disagree — a member can neither re-attribute a row to themselves nor away from themselves. An imported row has a NULL submitted_by and therefore matches no member, so only ops_lead/admin can touch history.';

-- ── ops.kitchen_stock ────────────────────────────────────────────────────────────────────────
create policy kitchen_stock_select_org on ops.kitchen_stock
  for select to authenticated
  using (org_id = shared.current_org_id());
comment on policy kitchen_stock_select_org on ops.kitchen_stock is
  'Read-only to the app tier. There is no write policy AND no write grant: stock is recomputed by the approval path alone, so a direct member write is refused by privilege before RLS is consulted.';

-- ── ops.kitchen_batch_seq ────────────────────────────────────────────────────────────────────
-- No policy, deliberately. RLS is enabled and FORCED with no policy and no grant, so the app tier can
-- neither read the counter nor mint from it; only the approval path, which bypasses RLS, touches it.

-- ── integrations.esb_push ────────────────────────────────────────────────────────────────────
create policy esb_push_select_ops on integrations.esb_push
  for select to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
comment on policy esb_push_select_ops on integrations.esb_push is
  'ops_lead/admin read their org''s outbox rows; nobody else. There is no INSERT or UPDATE policy for authenticated — the approval path enqueues as the definer and the worker flips status as service_role, so the app tier cannot write posting state.';
