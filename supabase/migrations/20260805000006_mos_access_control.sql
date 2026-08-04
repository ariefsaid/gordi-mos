-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 2 of 4 for `mos`: access control (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Server-stamped columns, the capability registrations `mos` owns, every read/write predicate,
-- every guard, every base privilege, and every RLS policy on `mos`.
--
-- ⚠ A RE-AUTHORED RLS POLICY IS A NEW POLICY. Nothing here inherits a fail-closed proof from the
-- policy it replaces. Every policy created in this file has its own negative assertion in
-- supabase/tests/mos_03_policy_fail_closed.sql, written against THIS SQL.
--
-- Two structural rules, both inherited from the `shared` half because both have cost real time:
--   1. CREATE POLICY resolves its functions at creation time, so every helper is defined above the
--      first policy that calls it.
--   2. There is exactly ONE guard function per table. Where the prior chains grew several by
--      accretion — mos.tasks had four — this file folds them into one body and labels each carried
--      invariant with the migration it came from, so extending one cannot silently drop another.
--      Trigger firing order was alphabetical by trigger name, and where two guards could both raise
--      on the same statement the merged body preserves that order exactly, so the error CODE a
--      given violation produces is unchanged.
--
-- DOWN: see ...0005's DOWN (drop schema mos cascade; drop table reporting.esb_ar_reduction cascade).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Capability registrations owned by `mos` (ADR-0020 D4)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- shared.role_capabilities is global vocabulary with no org seam (DD-WAY-24 — the tenant-varying
-- fact is who holds which role where, and shared.person_access_roles already carries it). The
-- `shared` baseline seeds the two cascade capabilities it defines; every other schema registers its
-- own here rather than reaching back into that file.
--
-- ⚠ ops_lead -> objective.manage IS A CONTRACT CHANGE, not a copy (OD-V4-1, owner 2026-07-27):
-- "Objectives are visible to everyone and writeable at lead level, not admin-only." It supersedes
-- OD-C-2's admin-only catalog. The policies below did not change to accommodate it and could not
-- have — they consult shared.can('objective.manage'), so extending the write is one grant row. That
-- is the whole point of the capability indirection, and mos_04_cascade.sql asserts it directly.
-- This single row is what turned five pgTAP assertions red on the v4 line (DD-WAY-23); their
-- rewrites land with this baseline.
insert into shared.role_capabilities (role, capability, scope) values
  -- Cascade catalog (OD-V4-1). admin already holds objective.manage + workline.manage, and ops_lead
  -- already holds workline.manage, from the `shared` baseline.
  ('ops_lead', 'objective.manage',       'org'),
  -- Signals (ADR-0050 D7). Default-deny: signal.read_all is deliberately NOT registered, which
  -- leaves read rule R5 inert until someone decides it should exist.
  ('member',   'signal.create',          'org'),
  ('ops_lead', 'signal.create',          'org'),
  ('finance',  'signal.create',          'org'),
  ('admin',    'signal.create',          'org'),
  ('ops_lead', 'signal.create_for_team', 'org'),
  ('admin',    'signal.create_for_team', 'org'),
  ('ops_lead', 'signal.mention_bu',      'org'),
  ('finance',  'signal.mention_bu',      'org'),
  ('admin',    'signal.mention_bu',      'org'),
  ('ops_lead', 'signal.retract',         'org'),
  ('finance',  'signal.retract',         'org'),
  ('admin',    'signal.retract',         'org'),
  -- Processes (ADR-0051 D8). `member` holds process.start per OD-REDESIGN-71(iii) — the person who
  -- runs the floor starts the day. It is safe because mos.spawn_process_run ALSO requires
  -- membership of the owning Team, so a member can only start a process for a Team they belong to.
  ('ops_lead', 'process.start',          'org'),
  ('admin',    'process.start',          'org'),
  ('member',   'process.start',          'org'),
  ('admin',    'process.adopt',          'org'),
  -- Money (ADR-0022 D4 / ADR-0019 D5). Procurement co-owns ingredient cost but has no access role
  -- of its own, so it folds under finance for v1.
  ('finance',  'cogs.write',             'org'),
  ('admin',    'cogs.write',             'org'),
  ('finance',  'followup.confirm',       'org'),
  ('admin',    'followup.confirm',       'org')
on conflict (role, capability) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Server-stamped columns — the org seam is a DEFAULT plus a WITH CHECK, never client input
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The default stamps it; the policy's WITH CHECK makes it unspoofable even when a client sends one
-- explicitly. An explicit NULL is rejected too, because NULL <> current_org_id().
alter table mos.objectives                alter column org_id set default shared.current_org_id();
alter table mos.work_lines                alter column org_id set default shared.current_org_id();
alter table mos.process_cadences          alter column org_id set default shared.current_org_id();
alter table mos.process_task_defs         alter column org_id set default shared.current_org_id();
alter table mos.process_runs              alter column org_id set default shared.current_org_id();
alter table mos.process_run_pending_tasks alter column org_id set default shared.current_org_id();
alter table mos.tasks                     alter column org_id set default shared.current_org_id();
alter table mos.task_checklist_items      alter column org_id set default shared.current_org_id();
alter table mos.task_events               alter column org_id set default shared.current_org_id();
alter table mos.signals                   alter column org_id set default shared.current_org_id();
alter table mos.signal_mentions           alter column org_id set default shared.current_org_id();
alter table mos.signal_acknowledgements   alter column org_id set default shared.current_org_id();
alter table mos.signal_revisions          alter column org_id set default shared.current_org_id();
alter table mos.signal_tasks              alter column org_id set default shared.current_org_id();
alter table mos.weekly_updates            alter column org_id set default shared.current_org_id();
alter table mos.weekly_update_items       alter column org_id set default shared.current_org_id();
alter table mos.comments                  alter column org_id set default shared.current_org_id();
alter table mos.notifications             alter column org_id set default shared.current_org_id();
alter table mos.push_subscriptions        alter column org_id set default shared.current_org_id();
alter table mos.user_views                alter column org_id set default shared.current_org_id();
alter table mos.agent_threads             alter column org_id set default shared.current_org_id();
alter table mos.agent_runs                alter column org_id set default shared.current_org_id();
alter table mos.agent_events              alter column org_id set default shared.current_org_id();
alter table mos.certified_metrics         alter column org_id set default shared.current_org_id();
alter table mos.budgets                   alter column org_id set default shared.current_org_id();
alter table mos.budget_lines              alter column org_id set default shared.current_org_id();

-- Actor columns. Same pattern, same reason: the client never chooses who it is acting as.
-- mos.follow_ups is deliberately absent — it has no authenticated write path at all.
alter table mos.signals                 alter column author_id  set default shared.current_person_id();
alter table mos.signal_acknowledgements alter column person_id  set default shared.current_person_id();
alter table mos.signal_tasks            alter column created_by set default shared.current_person_id();
alter table mos.process_runs            alter column started_by set default shared.current_person_id();
alter table mos.comments                alter column author_id  set default shared.current_person_id();
alter table mos.notifications           alter column owner_id   set default shared.current_person_id();
alter table mos.push_subscriptions      alter column owner_id   set default shared.current_person_id();
alter table mos.user_views              alter column owner_id   set default shared.current_person_id();
alter table mos.agent_threads           alter column owner_id   set default shared.current_person_id();
alter table mos.agent_runs              alter column owner_id   set default shared.current_person_id();
alter table mos.agent_events            alter column owner_id   set default shared.current_person_id();
alter table mos.budgets                 alter column created_by set default shared.current_person_id();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Read/write predicates — the functions the policies below call
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── Tasks: the edit gate (OD-P2-3, FR-050) ───────────────────────────────────────────────────
-- R, or A, or a manager of either. Reused by the tasks UPDATE policy AND by both child tables, so
-- who may edit a checklist item is by construction the same question as who may edit its task.
create or replace function mos.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from mos.tasks t
    where t.id = p_task_id
      and t.org_id = shared.current_org_id()
      and (
        t.responsible_person_id = shared.current_person_id()
        or t.accountable_person_id = shared.current_person_id()
        or shared.is_manager_of(t.responsible_person_id)
        or shared.is_manager_of(t.accountable_person_id)
      )
  )
$$;
comment on function mos.can_edit_task(uuid) is 'Edit gate: the caller is R, A, or a manager of either, for a task in their org (OD-P2-3, FR-050).';

-- ── Weekly updates: upward-only read, author-only write ──────────────────────────────────────
create or replace function mos.can_read_weekly_update(p_person_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.current_org_id() is not null
    and (
      p_person_id = shared.current_person_id()
      or shared.is_manager_of(p_person_id)
    )
$$;
comment on function mos.can_read_weekly_update(uuid) is 'Read gate: the caller is the author or an up-chain manager of the author (OD-P1-3/P1-7). Peers and reports see nothing.';

-- Line-write gate. Fails closed on a submitted parent, which IS the line submit-lock: once
-- submitted, the caller has zero writable line rows without any error path being needed.
create or replace function mos.can_write_own_update(p_weekly_update_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from mos.weekly_updates w
    where w.id = p_weekly_update_id
      and w.org_id = shared.current_org_id()
      and w.person_id = shared.current_person_id()
      and w.status = 'draft'
  )
$$;
comment on function mos.can_write_own_update(uuid) is 'Line-write gate: the parent update is the caller''s own AND still draft (FR-011/015). A submitted parent yields zero writable lines.';

-- ── Signals: the default-deny read gate, rules R1..R5 (ADR-0050 D4) ──────────────────────────
-- SECURITY DEFINER is load-bearing rather than habit. The SELECT policy on mos.signals AND every
-- child table's SELECT policy call this function, and the function itself reads mos.signals and
-- mos.signal_mentions — both gated by this very predicate. Under INVOKER those internal reads
-- re-apply the calling policy and recurse to a stack overflow. DEFINER makes them bypass RLS; the
-- function returns only a boolean, computed strictly for the JWT caller from current_org_id() /
-- current_person_id(), both unspoofable, so no row data escapes. This is the canonical
-- self-referential-RLS shape.
create or replace function mos.can_read_signal(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from mos.signals s
    join shared.teams tm on tm.id = s.owning_team_id
    where s.id = p_signal_id
      and s.org_id = shared.current_org_id()
      and (
        exists ( -- R1 active member of the owning Team
          select 1 from shared.team_memberships m
          where m.team_id = s.owning_team_id and m.person_id = shared.current_person_id()
            and m.org_id = shared.current_org_id()
            and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date))
        or exists ( -- R2 holds a role scoped to the owning Team's parent BU
          select 1 from shared.person_roles pr join shared.roles r on r.id = pr.role_id
          where pr.person_id = shared.current_person_id() and pr.org_id = shared.current_org_id()
            and r.business_unit_id = tm.business_unit_id)
        or ( -- R3 strictly higher BU visibility rank. Every rank defaults to 0, so this is INERT
             -- until an admin configures ranks — fail-closed by construction.
          coalesce((select max(coalesce(bu.signal_visibility_rank,0))
                    from shared.person_roles pr join shared.roles r on r.id = pr.role_id
                    join shared.business_units bu on bu.id = r.business_unit_id
                    where pr.person_id = shared.current_person_id() and pr.org_id = shared.current_org_id()), 0)
          > coalesce((select bu2.signal_visibility_rank from shared.business_units bu2 where bu2.id = tm.business_unit_id), 0))
        or exists ( -- R4 an explicit, unrevoked mention reaching the caller
          select 1 from mos.signal_mentions sm
          where sm.signal_id = s.id and sm.revoked_at is null and (
            (sm.mention_kind='person' and sm.target_person_id = shared.current_person_id())
            or (sm.mention_kind='team' and exists (
                select 1 from shared.team_memberships m2 where m2.team_id = sm.target_team_id
                  and m2.person_id = shared.current_person_id()
                  and m2.effective_from <= current_date and (m2.effective_to is null or m2.effective_to >= current_date)))
            or (sm.mention_kind='bu' and exists (
                select 1 from shared.person_roles pr2 join shared.roles r2 on r2.id = pr2.role_id
                where pr2.person_id = shared.current_person_id() and r2.business_unit_id = sm.target_bu_id))))
        or shared.can('signal.read_all') -- R5 override; the capability is unregistered, so inert
      ));
$$;
comment on function mos.can_read_signal(uuid) is
  'Default-deny Signal read gate, rules R1..R5 (ADR-0050 D4). SECURITY DEFINER to break self-referential RLS recursion; org-gated first; returns only a boolean computed for the JWT caller.';
-- Revoke from PUBLIC, then grant BACK to authenticated: policy evaluation runs as the calling role,
-- so without the grant every signal read fails "permission denied for function" instead of denying.
revoke execute on function mos.can_read_signal(uuid) from public, anon, authenticated;
grant  execute on function mos.can_read_signal(uuid) to authenticated;

-- Who may post a Signal FOR a given Team: a capability holder, or an active member of that Team.
create or replace function mos.can_post_signal_for_team(p_team_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.can('signal.create_for_team')
     or exists (
       select 1 from shared.team_memberships m
       where m.team_id = p_team_id and m.person_id = shared.current_person_id()
         and m.org_id = shared.current_org_id()
         and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date));
$$;
comment on function mos.can_post_signal_for_team(uuid) is 'Post gate: a signal.create_for_team holder, or an active member of the owning Team (ADR-0050 D7).';
revoke execute on function mos.can_post_signal_for_team(uuid) from public, anon;
grant  execute on function mos.can_post_signal_for_team(uuid) to authenticated;

-- ── Processes: job-function resolution and the Team gate (ADR-0051 D7/D8) ────────────────────
-- Current holders of a job function: holds the Role in p_org and, when a Team scope is set, is an
-- active member of that Team. Pinned to an EXPLICIT p_org rather than current_org_id(), because its
-- callers are DEFINER RPCs that have already resolved the org — a cross-org Role or Team therefore
-- resolves no holder at all rather than leaking one.
create or replace function mos._function_holders(p_org uuid, p_role_id uuid, p_team_id uuid)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct pr.person_id
  from shared.person_roles pr
  join shared.roles  r on r.id = pr.role_id
  join shared.people p on p.id = pr.person_id
  where p_role_id is not null
    and pr.org_id = p_org and r.org_id = p_org and p.org_id = p_org
    and p.archived_at is null
    and pr.role_id = p_role_id
    and (
      p_team_id is null
      or exists (
        select 1 from shared.team_memberships m
        where m.person_id = pr.person_id and m.team_id = p_team_id and m.org_id = p_org
          and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date)
      )
    )
$$;
comment on function mos._function_holders(uuid,uuid,uuid) is
  'Current holders of a job function (Role + optional active-Team scope), pinned to p_org (ADR-0051 D7).';
revoke execute on function mos._function_holders(uuid,uuid,uuid) from public, anon;
grant  execute on function mos._function_holders(uuid,uuid,uuid) to authenticated;

create or replace function mos.can_start_process_for_team(p_team_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.has_access_role('admin')
     or exists (
       select 1 from shared.team_memberships m
       where m.team_id = p_team_id and m.person_id = shared.current_person_id()
         and m.org_id = shared.current_org_id()
         and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date));
$$;
comment on function mos.can_start_process_for_team(uuid) is 'Team-authorization gate for spawn/resolve/complete (ADR-0051 D8). Paired with can(''process.start''), never used alone.';
revoke execute on function mos.can_start_process_for_team(uuid) from public, anon;
grant  execute on function mos.can_start_process_for_team(uuid) to authenticated;

-- ── AR: the chase-lane gate (ADR-0020 own-BU mechanism, specialised) ─────────────────────────
-- ⚠ Part of the dark AR bridge; carried unchanged (DD-WAY-16). `finance` is deliberately NOT a
-- chase lane — Finance confirms a settlement, it does not chase one.
create or replace function mos.can_work_lane(p_lane text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.has_access_role('admin')
     or (
       p_lane in ('b2b_sales','retail_ops')
       and exists (
         select 1
         from shared.person_roles pr
         join shared.roles r           on r.id = pr.role_id
         join shared.business_units bu on bu.id = r.business_unit_id
         where pr.person_id = shared.current_person_id()
           and pr.org_id    = shared.current_org_id()
           and r.org_id     = shared.current_org_id()
           and bu.org_id    = shared.current_org_id()
           and bu.code      = p_lane
       )
     )
$$;
comment on function mos.can_work_lane(text) is
  'True iff the session may advance a follow-up in p_lane — admin, or a held role in the BU whose code is the lane. Never a grant for the finance lane.';
revoke execute on function mos.can_work_lane(text) from public, anon;
grant  execute on function mos.can_work_lane(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Guards — invariants an RLS WITH CHECK cannot express
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The recurring reason all of these exist: WITH CHECK sees only the post-image, so it cannot compare
-- OLD to NEW, and a foreign-key check verifies existence only — FK lookups bypass RLS, so an FK
-- alone will happily let a row in org A point at a row in org B.

-- ── mos.work_lines ───────────────────────────────────────────────────────────────────────────
-- NEW guard for the NEW edge (DD-WAY-15). work_lines.objective_id is an existence-only FK, so
-- without this a Project/Process in org A could hang off org B's Objective and the cascade would
-- silently cross tenants. SECURITY INVOKER is sufficient and is the stronger choice: mos.objectives
-- is org-readable, so a cross-org id is invisible to the caller, the lookup returns no row, and the
-- guard raises. 42501 matches the sibling cascade check on mos.tasks — same class of violation,
-- same code, so a client need not learn two.
create or replace function mos._guard_work_lines()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.objective_id is not null then
    if not exists (
      select 1 from mos.objectives o
      where o.id = new.objective_id and o.org_id = new.org_id
    ) then
      raise exception 'objective_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function mos._guard_work_lines() is
  'Guard (DD-WAY-15): a Project/Process may only reference an Objective in its OWN org (42501). The FK checks existence only and FK lookups bypass RLS, so the tenancy half has to live here. SECURITY INVOKER.';

create trigger work_lines_guard
  before insert or update on mos.work_lines
  for each row execute function mos._guard_work_lines();

-- ── mos.tasks — ONE guard, four carried invariant sets ───────────────────────────────────────
-- Merged from four separate trigger functions on the prior chains. The order of the sections below
-- reproduces the alphabetical trigger firing order those four had, so the error CODE any given
-- violation produces is unchanged:
--   (A) tasks_guard_archive        — 20260611000009_mos_rls.sql            (ADR-0004 D2)
--   (B) tasks_guard_cascade_refs   — 20260624000001_mos_cascade_lookups.sql (NFR-201)
--                                    + 20260716000011_mos_process_runs.sql (process_run_id arm)
--   (C) tasks_guard_provenance     — v4 20260717000004                     (SECURITY LOW-1)
--   (D) tasks_guard_refs           — 20260711000001_mos_tasks_tenancy_guard (round-2 audit A1)
--                                    + v4 20260721000003                    (team_id arm)
-- Note the deliberate error-code split, which is NOT an inconsistency to tidy: the cascade/process
-- references raise 42501 (you are reaching outside your tenant) while the directory references raise
-- 23514 (the row you wrote is not internally consistent). Both are asserted at those codes.
create or replace function mos._guard_tasks()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org      uuid;
  v_resp_org    uuid;
  v_acc_org     uuid;
  v_creator_org uuid;
  v_team_org    uuid;
  v_team_bu     uuid;
begin
  -- (A) ARCHIVE GATE (ADR-0004 D2). Narrower than the general edit gate: a Responsible who is not
  -- Accountable may edit a task but may not archive it. Covers archive and unarchive symmetrically,
  -- and reads OLD so a caller cannot re-point R/A in the same statement to grant themselves the
  -- right they lack.
  if tg_op = 'UPDATE' and new.archived_at is distinct from old.archived_at then
    if not (
      old.accountable_person_id = shared.current_person_id()
      or shared.is_manager_of(old.responsible_person_id)
      or shared.is_manager_of(old.accountable_person_id)
    ) then
      raise exception 'archive requires Accountable or a manager' using errcode = '42501';
    end if;
  end if;

  -- (B) CASCADE + OCCURRENCE REFERENCES ARE SAME-ORG (NFR-201). Existence-only FKs.
  if new.objective_id is not null and not exists (
    select 1 from mos.objectives where id = new.objective_id and org_id = new.org_id) then
    raise exception 'objective_id belongs to a different org' using errcode = '42501';
  end if;
  if new.work_line_id is not null and not exists (
    select 1 from mos.work_lines where id = new.work_line_id and org_id = new.org_id) then
    raise exception 'work_line_id belongs to a different org' using errcode = '42501';
  end if;
  if new.process_run_id is not null and not exists (
    select 1 from mos.process_runs where id = new.process_run_id and org_id = new.org_id) then
    raise exception 'process_run_id belongs to a different org' using errcode = '42501';
  end if;

  -- (C) OCCURRENCE PROVENANCE IS RPC-ONLY (SECURITY LOW-1). Scoped to current_user='authenticated',
  -- which IS the RPC-only seam: a direct app write runs as `authenticated`, while the spawn/resolve
  -- SECURITY DEFINER RPCs run as the function owner, so the block is a no-op inside them. Without
  -- it any member could stamp a real same-org run id and forge "this came from a process
  -- occurrence" — the same idiom as shared._guard_people's user_id block.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.process_run_id is not null or new.generated_from_task_def_id is not null then
        raise exception 'process_run_id / generated_from_task_def_id are set only by the process spawn/resolve RPCs, not a direct write'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.process_run_id is distinct from old.process_run_id
         or new.generated_from_task_def_id is distinct from old.generated_from_task_def_id then
        raise exception 'process_run_id / generated_from_task_def_id are immutable on a direct write'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- (D) IMMUTABILITY (round-2 audit A1). The tasks UPDATE policy's WITH CHECK evaluates
  -- can_edit_task(id), which re-reads the row BY ID and therefore sees the OLD created_by, never the
  -- new one — so an editor who passes the gate could otherwise re-attribute authorship, including
  -- to a foreign-org person.
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable on a task' using errcode = '42501';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a task' using errcode = '42501';
    end if;
  end if;

  -- (D) DIRECTORY REFERENCES ARE SAME-ORG (round-2 audit A1). A NULL in any NOT NULL column is left
  -- to the column constraint (23502) rather than pre-empted here, so the column rule keeps its own
  -- error contract.
  select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
  if v_bu_org is distinct from new.org_id then
    raise exception 'business_unit_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_resp_org from shared.people p where p.id = new.responsible_person_id;
  if v_resp_org is distinct from new.org_id then
    raise exception 'responsible_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
  if v_acc_org is distinct from new.org_id then
    raise exception 'accountable_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  select p.org_id into v_creator_org from shared.people p where p.id = new.created_by;
  if v_creator_org is distinct from new.org_id then
    raise exception 'created_by must belong to the same org as the task' using errcode = '23514';
  end if;

  -- The RACI arrays are FK-free uuid[] columns, so they have no existence check at all without this.
  -- An empty array produces no rows from unnest, so the outer EXISTS is false and it passes.
  if exists (
    select 1 from unnest(new.consulted_person_ids) pid
    where not exists (select 1 from shared.people p where p.id = pid and p.org_id = new.org_id)
  ) then
    raise exception 'every consulted_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(new.informed_person_ids) pid
    where not exists (select 1 from shared.people p where p.id = pid and p.org_id = new.org_id)
  ) then
    raise exception 'every informed_person_id must belong to the same org as the task' using errcode = '23514';
  end if;

  -- (D) A supplied Team must be same-org AND its BU must equal the task's. NULL skips both, which is
  -- what keeps team_id genuinely optional (see the .HOLD disposition in ...0005).
  if new.team_id is not null then
    select tm.org_id, tm.business_unit_id into v_team_org, v_team_bu
      from shared.teams tm where tm.id = new.team_id;
    if v_team_org is distinct from new.org_id then
      raise exception 'team_id must belong to the same org as the task' using errcode = '23514';
    end if;
    if v_team_bu is distinct from new.business_unit_id then
      raise exception 'business_unit_id must equal the team''s business_unit_id' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
comment on function mos._guard_tasks() is
  'The ONE guard on mos.tasks, merged from four (archive gate, cascade/occurrence same-org, RPC-only '
  'provenance, directory tenancy + immutability). Archive requires A or a manager (42501); '
  'objective/work_line/process_run must be same-org (42501); process_run_id and '
  'generated_from_task_def_id are RPC-only (42501); created_by/org_id immutable on UPDATE (42501); '
  'BU, R, A, created_by, the consulted/informed arrays and a supplied team_id must be same-org, and '
  'team BU must equal task BU (23514). SECURITY INVOKER — every reference it checks is org-readable, '
  'so a cross-org id is invisible and the lookup fails closed.';

create trigger tasks_guard
  before insert or update on mos.tasks
  for each row execute function mos._guard_tasks();

-- ── mos.task_events -> tasks.last_activity_at ────────────────────────────────────────────────
-- One canonical clock: every event bumps the parent task to the event's own timestamp, so activity
-- ordering never depends on which of two writers committed first.
create or replace function mos._touch_task_last_activity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update mos.tasks set last_activity_at = new.created_at where id = new.task_id;
  return new;
end;
$$;
comment on function mos._touch_task_last_activity() is 'AFTER INSERT on task_events: bumps the parent task''s last_activity_at to the event time (one canonical clock).';

create trigger task_events_touch_activity
  after insert on mos.task_events
  for each row execute function mos._touch_task_last_activity();

-- ── mos.weekly_updates ───────────────────────────────────────────────────────────────────────
-- Merged from mos._stamp_submitted_at and mos._guard_weekly_update_lock. The lock is evaluated
-- BEFORE the stamp, preserving the alphabetical trigger order the two had; they are independent
-- (the lock reads status/summary, the stamp writes submitted_at) so the merge changes no outcome.
create or replace function mos._guard_weekly_updates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Submit-lock: the summary freezes while submitted. Reopen (submitted -> draft) is explicitly let
  -- through, so the lock is a workflow step and not a trap.
  if tg_op = 'UPDATE'
     and old.status = 'submitted'
     and new.status <> 'draft'
     and new.summary is distinct from old.summary then
    raise exception 'weekly update is submitted; reopen before editing the summary'
      using errcode = '42501';
  end if;

  -- The trigger owns submitted_at so the app sets status only. Into 'submitted' stamps now() when
  -- absent; anything else forces NULL. weekly_updates_status_submitted_ck therefore always holds
  -- rather than being a race the client has to avoid.
  if new.status = 'submitted' then
    if new.submitted_at is null then new.submitted_at := now(); end if;
  else
    new.submitted_at := null;
  end if;

  return new;
end;
$$;
comment on function mos._guard_weekly_updates() is
  'The ONE guard on mos.weekly_updates, merged from the submitted_at stamp and the summary submit-lock. Editing a submitted summary raises 42501; reopening to draft is allowed. submitted_at is owned server-side so the status CHECK always holds.';

create trigger weekly_updates_guard
  before insert or update on mos.weekly_updates
  for each row execute function mos._guard_weekly_updates();

-- ── mos.signals ──────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER for ONE reason and it is not the checks: the guard appends to
-- mos.signal_revisions, which has no INSERT grant to any application role precisely so that the
-- edit history cannot be forged. Everything it reads it already has in OLD/NEW.
create or replace function mos._guard_signals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_id is distinct from old.author_id
     or new.owning_team_id is distinct from old.owning_team_id
     or new.source is distinct from old.source
     or new.org_id is distinct from old.org_id
     or new.created_at is distinct from old.created_at then
    raise exception 'signal author/owning_team/source/org/created_at are immutable' using errcode = '42501';
  end if;

  -- SECURITY HIGH-1: content is AUTHOR-ONLY. The UPDATE policy's USING clause admits both the author
  -- and any signal.retract holder — it has to, so a holder can retract someone else's Signal — but
  -- without this that same holder could rewrite the body. A non-author may move only the retraction
  -- columns.
  if (new.body is distinct from old.body
      or new.occurred_at is distinct from old.occurred_at
      or new.category is distinct from old.category
      or new.attention is distinct from old.attention)
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;

  if new.retracted_at is distinct from old.retracted_at then
    if not (old.author_id = shared.current_person_id() or shared.can('signal.retract')) then
      raise exception 'retract requires author or signal.retract' using errcode = '42501';
    end if;
    if new.retracted_at is not null and btrim(coalesce(new.retract_reason,'')) = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
  end if;

  -- Edit history. One branch per mutable field so the revision row names the field that moved.
  if new.body is distinct from old.body then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'body', old.body, new.body);
    new.edited_at := now();
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'occurred_at', old.occurred_at::text, new.occurred_at::text);
    new.edited_at := now();
  end if;
  if new.category is distinct from old.category then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'category', old.category, new.category);
    new.edited_at := now();
  end if;
  if new.attention is distinct from old.attention then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'attention', old.attention, new.attention);
    new.edited_at := now();
  end if;

  return new;
end;
$$;
comment on function mos._guard_signals() is
  'Guard (ADR-0050 D5 + SECURITY HIGH-1): author/team/source/org/created_at immutable; content is author-only so a signal.retract holder may only retract; a retraction requires a reason; every content change appends a signal_revisions row. SECURITY DEFINER solely to write that revision table, which has no INSERT grant.';
-- A trigger function cannot usefully be invoked directly — Postgres refuses with "trigger functions
-- can only be called as triggers" — but the house rule is belt-and-braces on every definer function
-- with no per-case exemption to reason about. Triggers execute regardless of EXECUTE grants.
revoke execute on function mos._guard_signals() from public, anon, authenticated;

create trigger signals_guard
  before update on mos.signals
  for each row execute function mos._guard_signals();

-- ── mos.signal_mentions ──────────────────────────────────────────────────────────────────────
-- Revoking a mention is a real author-owned action, so the UPDATE grant cannot simply be withdrawn.
-- But a row policy cannot constrain WHICH columns an UPDATE moves, so without this a mention could
-- be re-pointed after insert — which would bypass the capability check applied at INSERT (a @BU
-- mention needs signal.mention_bu, and read rule R4 then grants every role-holder in that BU a
-- read) and the org check on the target. Re-targeting means revoking and inserting, which re-runs
-- both. SECURITY INVOKER: it reads OLD/NEW and writes nothing, so it needs no elevation.
create or replace function mos._guard_signal_mentions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id               is distinct from old.id
     or new.org_id           is distinct from old.org_id
     or new.signal_id        is distinct from old.signal_id
     or new.mention_kind     is distinct from old.mention_kind
     or new.target_person_id is distinct from old.target_person_id
     or new.target_team_id   is distinct from old.target_team_id
     or new.target_bu_id     is distinct from old.target_bu_id
     or new.created_at       is distinct from old.created_at then
    raise exception 'signal_mentions: only revoked_at may be updated'
      using errcode = '42501',
            detail  = 'id/org/signal/mention_kind/target_* /created_at are immutable; re-target by revoking and inserting a new mention (a @BU mention still requires signal.mention_bu).';
  end if;
  return new;
end;
$$;
comment on function mos._guard_signal_mentions() is
  'Guard: a mention row is immutable except revoked_at (42501), so the author-scoped UPDATE grant cannot change a mention''s kind or target and thereby bypass the capability and org checks applied at INSERT (see can_read_signal rule R4).';

create trigger signal_mentions_guard
  before update on mos.signal_mentions
  for each row execute function mos._guard_signal_mentions();

-- ── mos.comments ─────────────────────────────────────────────────────────────────────────────
-- entity_id is a bare uuid with no FK, because a polymorphic reference cannot point at five tables.
-- The write policy pins org and author but admits ANY entity_id, so without this a comment could
-- point at a row that does not exist or — worse — at a row in another org. SECURITY INVOKER is
-- sufficient AND is the mechanism: all five targets are org-scoped in their SELECT policy, so under
-- the caller's own RLS a same-org reference resolves and a cross-org or missing one returns NULL,
-- which then fails the comparison.
--   On mos.signals specifically this is strictly stronger than tenancy: the signal SELECT policy is
--   the default-deny read gate, so a same-org caller who cannot READ a Signal also cannot comment on
--   it. That is more than the finding required, and it is the right answer — only a reader can
--   usefully comment. Do NOT quietly switch this to DEFINER; the invoker predicate IS the control.
create or replace function mos._guard_comments()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
begin
  case new.entity_type
    when 'task'          then select t.org_id into v_org from mos.tasks t          where t.id = new.entity_id;
    when 'weekly_update' then select w.org_id into v_org from mos.weekly_updates w where w.id = new.entity_id;
    when 'daily_log'     then select l.org_id into v_org from ops.log_entries l    where l.id = new.entity_id;
    when 'follow_up'     then select f.org_id into v_org from mos.follow_ups f     where f.id = new.entity_id;
    when 'signal'        then select s.org_id into v_org from mos.signals s        where s.id = new.entity_id;
    else
      -- Unreachable while the entity_type CHECK holds. Kept so that adding a value to the CHECK
      -- without adding a branch here fails loudly instead of silently accepting an unchecked target.
      raise exception 'comments.entity_type % is not mapped by the entity guard', new.entity_type
        using errcode = '23514';
  end case;

  if v_org is distinct from new.org_id then
    raise exception
      'comments.entity_id must resolve to a same-org row of entity_type % (cross-org or missing)',
      new.entity_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;
comment on function mos._guard_comments() is
  'Guard: entity_id must resolve, under the caller''s own RLS, to a same-org row of the named entity_type, else 23514. SECURITY INVOKER is the mechanism, not an oversight — a cross-org or unreadable target is invisible, so the lookup returns NULL and the guard raises.';
-- ops.log_entries is referenced above and is authored by the `ops` pass. A plpgsql body resolves its
-- table references at RUN time, not at CREATE time, so this compiles before that schema exists and
-- the 'daily_log' branch starts working the moment it does.

create trigger comments_guard
  before insert or update on mos.comments
  for each row execute function mos._guard_comments();

-- ── mos.notifications ────────────────────────────────────────────────────────────────────────
-- A delivered notification's CONTENT is immutable; read_at and handled_at are the only columns an
-- UPDATE may move. Expressed as a deny-list of everything else rather than an allow-list of the two,
-- so a column added later is immutable by default rather than mutable by omission.
create or replace function mos._guard_notifications()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id          is distinct from old.id
     or new.org_id      is distinct from old.org_id
     or new.owner_id    is distinct from old.owner_id
     or new.severity    is distinct from old.severity
     or new.title       is distinct from old.title
     or new.body        is distinct from old.body
     or new.metadata    is distinct from old.metadata
     or new.created_at  is distinct from old.created_at
  then
    raise exception 'notifications is read-state-only on UPDATE: only read_at and handled_at may change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_notifications() is
  'BEFORE UPDATE column-pin: a delivered notification is immutable content; only read_at and handled_at may change (42501).';

create trigger notifications_guard
  before update on mos.notifications
  for each row execute function mos._guard_notifications();

-- ── mos.user_views ───────────────────────────────────────────────────────────────────────────
-- kind and context classify the row and are read by the partial indexes and the metadata CHECK.
-- Pinning them stops a persisted collection view being mutated into a composition row, which would
-- leave the spec and the classifier disagreeing. Never fires for a row that left them NULL, and
-- never for a rename, an apply, a lifecycle change or a soft-archive.
create or replace function mos._guard_user_views()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'user_views.kind is immutable once set' using errcode = '42501';
  end if;
  if new.context is distinct from old.context then
    raise exception 'user_views.context is immutable once set' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_user_views() is
  'BEFORE UPDATE column-pin: kind/context are immutable once set, so a persisted collection view cannot be mutated into a composition row or back (42501).';

create trigger user_views_guard
  before update on mos.user_views
  for each row execute function mos._guard_user_views();

-- ── mos.agent_events ─────────────────────────────────────────────────────────────────────────
-- The transcript is append-only with exactly one exception: the owner rating their own assistant
-- turn. Every other column drift is refused, and even the two feedback columns may only move on a
-- type='assistant' row — a tool, status, system, user or artifact row is fully immutable.
create or replace function mos._guard_agent_events()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.run_id            is distinct from old.run_id
     or new.org_id         is distinct from old.org_id
     or new.owner_id       is distinct from old.owner_id
     or new.seq            is distinct from old.seq
     or new.type           is distinct from old.type
     or new.text           is distinct from old.text
     or new.payload        is distinct from old.payload
     or new.tool_name      is distinct from old.tool_name
     or new.tool_args_hash is distinct from old.tool_args_hash
     or new.tool_status    is distinct from old.tool_status
     or new.created_at     is distinct from old.created_at
  then
    raise exception 'agent_events is append-only: only rating/downvote_reason may be updated'
      using errcode = '42501';
  end if;

  if (new.rating is distinct from old.rating or new.downvote_reason is distinct from old.downvote_reason)
     and old.type is distinct from 'assistant'
  then
    raise exception 'feedback (rating/downvote_reason) may only be recorded on an assistant event'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
comment on function mos._guard_agent_events() is
  'Guard: agent_events is append-only except rating/downvote_reason on the owner''s own type=assistant row; every other column drift raises 42501.';

create trigger agent_events_guard
  before update on mos.agent_events
  for each row execute function mos._guard_agent_events();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Base privileges
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- RLS is a FILTER, not a GRANT: Postgres checks the base privilege first and only then applies
-- policies, so a missing grant denies before any policy is consulted — and a grant with no matching
-- policy is closed, not open. Both halves are load-bearing and both are asserted.
--
-- NO DELETE is granted anywhere in `mos` except weekly_update_items (a draft line the author is
-- still composing) and push_subscriptions (a browser unsubscribing). Everything else is archived or
-- revoked. That is NFR-002/FR-053 made structural rather than remembered.

grant select, insert, update on mos.objectives             to authenticated;
grant select, insert, update on mos.work_lines             to authenticated;
grant select, insert, update on mos.process_cadences       to authenticated;
grant select, insert, update on mos.process_task_defs      to authenticated;
grant select, insert, update on mos.tasks                  to authenticated;
grant select, insert, update on mos.task_checklist_items   to authenticated;
grant select, insert         on mos.task_events            to authenticated; -- append-only audit
grant select, insert, update on mos.signals                to authenticated;
grant select, insert, update on mos.signal_mentions        to authenticated; -- update = revoked_at only (guard)
grant select, insert         on mos.signal_acknowledgements to authenticated;
grant select                 on mos.signal_revisions       to authenticated; -- trigger-written only
grant select, insert         on mos.signal_tasks           to authenticated;
grant select, insert, update on mos.weekly_updates         to authenticated;
grant select, insert, update, delete on mos.weekly_update_items to authenticated;
grant select, insert         on mos.comments               to authenticated; -- append-only
grant select, insert, update on mos.notifications          to authenticated;
grant select, insert, update, delete on mos.push_subscriptions to authenticated;
grant select, insert, update on mos.user_views             to authenticated;
grant select, insert, update on mos.agent_threads          to authenticated;
grant select, insert, update on mos.agent_runs             to authenticated;
grant select, insert, update on mos.agent_events           to authenticated;
grant select                 on mos.certified_metrics      to authenticated; -- migration-seeded

-- Runs and the pending queue are READ-ONLY to the app: every write flows through the spawn / resolve
-- / complete RPCs, which is where the capability and Team gates live.
grant select on mos.process_runs, mos.process_run_pending_tasks to authenticated;
grant select, insert, update on mos.process_runs, mos.process_run_pending_tasks to service_role;

-- Budgets: SELECT only. The INSERT/UPDATE policies below exist as defence in depth behind
-- mos.capture_budget, but `authenticated` deliberately holds NO write privilege on either table, so
-- the RPC is the only reachable write path. That closes two holes a direct PostgREST write would
-- otherwise open: an arbitrary client-supplied total (the RPC recomputes it server-side from the
-- linked cost lines) and a budget hung off another org's business unit via the existence-only FK.
-- A missing GRANT fails closed with nothing to widen; a policy can be widened by a later ALTER.
grant select on mos.budgets, mos.budget_lines to authenticated;

-- AR: read-only for the app; every transition goes through mos.transition_follow_up.
grant select on mos.follow_ups, mos.follow_up_events to authenticated;
grant select, insert, update, delete on mos.follow_ups, mos.follow_up_events to service_role;
grant select on reporting.esb_ar_reduction to authenticated;
grant select, insert, update, delete on reporting.esb_ar_reduction to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. RLS — enabled AND forced on every table
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- FORCE matters: without it the table owner is exempt from its own policies, and the definer
-- functions above run as the owner. Enabled-but-not-forced is a silent hole, so mos_01_rls_posture
-- asserts both flags over pg_class rather than checking a hardcoded list — a table added later
-- without RLS fails the suite instead of sitting outside it.
alter table mos.objectives                enable row level security;
alter table mos.objectives                force  row level security;
alter table mos.work_lines                enable row level security;
alter table mos.work_lines                force  row level security;
alter table mos.process_cadences          enable row level security;
alter table mos.process_cadences          force  row level security;
alter table mos.process_task_defs         enable row level security;
alter table mos.process_task_defs         force  row level security;
alter table mos.process_runs              enable row level security;
alter table mos.process_runs              force  row level security;
alter table mos.process_run_pending_tasks enable row level security;
alter table mos.process_run_pending_tasks force  row level security;
alter table mos.tasks                     enable row level security;
alter table mos.tasks                     force  row level security;
alter table mos.task_checklist_items      enable row level security;
alter table mos.task_checklist_items      force  row level security;
alter table mos.task_events               enable row level security;
alter table mos.task_events               force  row level security;
alter table mos.signals                   enable row level security;
alter table mos.signals                   force  row level security;
alter table mos.signal_mentions           enable row level security;
alter table mos.signal_mentions           force  row level security;
alter table mos.signal_acknowledgements   enable row level security;
alter table mos.signal_acknowledgements   force  row level security;
alter table mos.signal_revisions          enable row level security;
alter table mos.signal_revisions          force  row level security;
alter table mos.signal_tasks              enable row level security;
alter table mos.signal_tasks              force  row level security;
alter table mos.weekly_updates            enable row level security;
alter table mos.weekly_updates            force  row level security;
alter table mos.weekly_update_items       enable row level security;
alter table mos.weekly_update_items       force  row level security;
alter table mos.comments                  enable row level security;
alter table mos.comments                  force  row level security;
alter table mos.notifications             enable row level security;
alter table mos.notifications             force  row level security;
alter table mos.push_subscriptions        enable row level security;
alter table mos.push_subscriptions        force  row level security;
alter table mos.user_views                enable row level security;
alter table mos.user_views                force  row level security;
alter table mos.agent_threads             enable row level security;
alter table mos.agent_threads             force  row level security;
alter table mos.agent_runs                enable row level security;
alter table mos.agent_runs                force  row level security;
alter table mos.agent_events              enable row level security;
alter table mos.agent_events              force  row level security;
alter table mos.certified_metrics         enable row level security;
alter table mos.certified_metrics         force  row level security;
alter table mos.budgets                   enable row level security;
alter table mos.budgets                   force  row level security;
alter table mos.budget_lines              enable row level security;
alter table mos.budget_lines              force  row level security;
alter table mos.follow_ups                enable row level security;
alter table mos.follow_ups                force  row level security;
alter table mos.follow_up_events          enable row level security;
alter table mos.follow_up_events          force  row level security;
alter table reporting.esb_ar_reduction    enable row level security;
alter table reporting.esb_ar_reduction    force  row level security;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. Policies
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── The cascade catalog ──────────────────────────────────────────────────────────────────────
-- READ is org-wide on both catalogs and always has been — every member needs the pickers, and
-- OD-V4-1 confirms Objectives are visible to everyone. Archived rows stay readable because the
-- management surface lists them.
-- WRITE resolves through shared.can(), NOT a role name. That indirection is the reason OD-V4-1 cost
-- one seed row instead of an ALTER POLICY, and mos_04_cascade asserts the property directly by
-- granting a capability to a role that holds neither and watching the write open.
create policy objectives_select_org on mos.objectives
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy objectives_insert_can_manage on mos.objectives
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('objective.manage'));

create policy objectives_update_can_manage on mos.objectives
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id() and shared.can('objective.manage'));

create policy work_lines_select_org on mos.work_lines
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy work_lines_insert_can_manage on mos.work_lines
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('workline.manage'));

create policy work_lines_update_can_manage on mos.work_lines
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id() and shared.can('workline.manage'));

comment on policy work_lines_insert_can_manage on mos.work_lines is
  'Creating a Project/Process — including with an Objective reference (DD-WAY-15) — needs workline.manage. The Objective''s tenancy is enforced by mos._guard_work_lines, not here: a WITH CHECK cannot join to another table''s org without re-opening the read.';

-- ── Process definitions: org-readable, admin/ops_lead authoring (mirrors the catalogs) ───────
create policy process_cadences_select_org on mos.process_cadences
  for select to authenticated using (org_id = shared.current_org_id());
create policy process_cadences_insert_ops on mos.process_cadences
  for insert to authenticated
  with check (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
create policy process_cadences_update_ops on mos.process_cadences
  for update to authenticated
  using      (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')))
  with check (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));

create policy process_task_defs_select_org on mos.process_task_defs
  for select to authenticated using (org_id = shared.current_org_id());
create policy process_task_defs_insert_ops on mos.process_task_defs
  for insert to authenticated
  with check (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));
create policy process_task_defs_update_ops on mos.process_task_defs
  for update to authenticated
  using      (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')))
  with check (org_id = shared.current_org_id() and (shared.has_access_role('admin') or shared.has_access_role('ops_lead')));

-- ── Occurrences: read-only to the app; no write policy at all ────────────────────────────────
create policy process_runs_select_org on mos.process_runs
  for select to authenticated using (org_id = shared.current_org_id());
comment on policy process_runs_select_org on mos.process_runs is
  'Occurrences are org-readable and RPC-write-only: there is deliberately no INSERT/UPDATE/DELETE policy or grant for authenticated, so idempotency and the Team gate cannot be sidestepped by a direct write.';

create policy process_run_pending_select_org on mos.process_run_pending_tasks
  for select to authenticated using (org_id = shared.current_org_id());

-- ── Tasks: org-readable, member-creatable, R/A/manager-editable ──────────────────────────────
-- Cross-unit visibility is the product (OD-P1-3), so SELECT is org-wide by intent, not by omission.
create policy tasks_select_org on mos.tasks
  for select to authenticated
  using (org_id = shared.current_org_id());

create policy tasks_insert_member on mos.tasks
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.is_org_member());

-- USING gates which rows are visible for update; WITH CHECK keeps the post-image in-org and still
-- editable. archived_at and the provenance columns are further gated by mos._guard_tasks.
create policy tasks_update_editor on mos.tasks
  for update to authenticated
  using (mos.can_edit_task(id))
  with check (org_id = shared.current_org_id() and mos.can_edit_task(id));

create policy task_checklist_select_org on mos.task_checklist_items
  for select to authenticated using (org_id = shared.current_org_id());
create policy task_checklist_insert_editor on mos.task_checklist_items
  for insert to authenticated
  with check (org_id = shared.current_org_id() and mos.can_edit_task(task_id));
create policy task_checklist_update_editor on mos.task_checklist_items
  for update to authenticated
  using (mos.can_edit_task(task_id))
  with check (org_id = shared.current_org_id() and mos.can_edit_task(task_id));

-- Events are append-only and self-attributed: actor_person_id must be the caller, so the audit
-- trail cannot be written in someone else's name.
create policy task_events_select_org on mos.task_events
  for select to authenticated using (org_id = shared.current_org_id());
create policy task_events_insert_editor on mos.task_events
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and actor_person_id = shared.current_person_id()
    and mos.can_edit_task(task_id)
  );

-- ── Signals: default-deny read; author-pinned write ──────────────────────────────────────────
-- Note the shape: the SELECT policy does NOT test org_id here, because can_read_signal tests it
-- first and every one of its five arms sits inside that test. Repeating it would be redundant, not
-- safer.
create policy signals_select on mos.signals
  for select to authenticated using (mos.can_read_signal(id));

create policy signals_insert on mos.signals
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and author_id = shared.current_person_id()
              and source = 'human'
              and shared.can('signal.create')
              and mos.can_post_signal_for_team(owning_team_id));

create policy signals_update_author on mos.signals
  for update to authenticated
  using (org_id = shared.current_org_id()
         and (author_id = shared.current_person_id() or shared.can('signal.retract')))
  with check (org_id = shared.current_org_id());
comment on policy signals_update_author on mos.signals is
  'USING admits the author OR a signal.retract holder — a holder must be able to retract another author''s Signal. Narrowing that to retraction-only is mos._guard_signals'' job, because a policy cannot compare OLD to NEW.';

create policy signal_mentions_select on mos.signal_mentions
  for select to authenticated using (mos.can_read_signal(signal_id));

-- The target must be a current-org row. Enforced here rather than only in the RPC, so a direct
-- PostgREST insert is gated identically.
create policy signal_mentions_insert on mos.signal_mentions
  for insert to authenticated
  with check (org_id = shared.current_org_id()
    and exists (select 1 from mos.signals s where s.id = signal_id and s.author_id = shared.current_person_id())
    and (mention_kind <> 'bu' or shared.can('signal.mention_bu'))
    and case mention_kind
      when 'person' then exists (select 1 from shared.people p         where p.id = target_person_id and p.org_id = shared.current_org_id())
      when 'team'   then exists (select 1 from shared.teams t          where t.id = target_team_id   and t.org_id = shared.current_org_id())
      when 'bu'     then exists (select 1 from shared.business_units b where b.id = target_bu_id     and b.org_id = shared.current_org_id())
      else false end);

create policy signal_mentions_update_author on mos.signal_mentions
  for update to authenticated
  using (exists (select 1 from mos.signals s where s.id = signal_id and s.author_id = shared.current_person_id()))
  with check (org_id = shared.current_org_id());

create policy signal_ack_select on mos.signal_acknowledgements
  for select to authenticated using (mos.can_read_signal(signal_id));
create policy signal_ack_insert on mos.signal_acknowledgements
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and person_id = shared.current_person_id()
              and mos.can_read_signal(signal_id));

create policy signal_revisions_select on mos.signal_revisions
  for select to authenticated using (mos.can_read_signal(signal_id));
comment on policy signal_revisions_select on mos.signal_revisions is
  'Read-only to everyone who can read the parent Signal. There is no INSERT policy and no INSERT grant: the edit history is written solely by the definer guard trigger, so it cannot be forged or back-dated.';

create policy signal_tasks_select on mos.signal_tasks
  for select to authenticated using (mos.can_read_signal(signal_id));
create policy signal_tasks_insert on mos.signal_tasks
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and created_by = shared.current_person_id()
              and mos.can_read_signal(signal_id));

-- ── Weekly updates: the one non-org-readable mos entity ──────────────────────────────────────
-- Upward-only: the author and their manager chain, nobody else. A peer or a report reads zero rows.
create policy weekly_updates_select_upward on mos.weekly_updates
  for select to authenticated
  using (org_id = shared.current_org_id() and mos.can_read_weekly_update(person_id));

create policy weekly_updates_insert_author on mos.weekly_updates
  for insert to authenticated
  with check (org_id = shared.current_org_id() and person_id = shared.current_person_id());

-- Author-only. A manager may READ an update and can never write one — that asymmetry is the point.
create policy weekly_updates_update_author on mos.weekly_updates
  for update to authenticated
  using (org_id = shared.current_org_id() and person_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and person_id = shared.current_person_id());

create policy weekly_update_items_select_upward on mos.weekly_update_items
  for select to authenticated
  using (org_id = shared.current_org_id() and exists (
    select 1 from mos.weekly_updates w
    where w.id = weekly_update_id and mos.can_read_weekly_update(w.person_id)
  ));
create policy weekly_update_items_insert_own on mos.weekly_update_items
  for insert to authenticated
  with check (org_id = shared.current_org_id() and mos.can_write_own_update(weekly_update_id));
create policy weekly_update_items_update_own on mos.weekly_update_items
  for update to authenticated
  using (mos.can_write_own_update(weekly_update_id))
  with check (org_id = shared.current_org_id() and mos.can_write_own_update(weekly_update_id));
create policy weekly_update_items_delete_own on mos.weekly_update_items
  for delete to authenticated
  using (mos.can_write_own_update(weekly_update_id));

-- ── Comments ─────────────────────────────────────────────────────────────────────────────────
-- Same-org read for the four record types that are themselves same-org readable; Signal comments
-- additionally inherit the Signal read gate, or a same-org non-reader could read the discussion of
-- a Signal they cannot see.
create policy comments_select on mos.comments
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (entity_type <> 'signal' or mos.can_read_signal(entity_id))
  );

create policy comments_insert on mos.comments
  for insert to authenticated
  with check (org_id = shared.current_org_id() and author_id = shared.current_person_id());

-- ── Notifications: strictly the recipient's ──────────────────────────────────────────────────
-- No manager share and no admin cross-owner read: an inbox belongs to one person.
create policy notifications_select on mos.notifications
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- A direct insert addressed to someone else is denied here. Cross-owner delivery — an @mention
-- notifying another person — goes through mos.create_notification, which is org-walled.
create policy notifications_insert on mos.notifications
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create policy notifications_update on mos.notifications
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- ── Push subscriptions: owner-scoped, and the one place a real DELETE is right ───────────────
create policy push_subscriptions_select on mos.push_subscriptions
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy push_subscriptions_insert on mos.push_subscriptions
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy push_subscriptions_update on mos.push_subscriptions
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy push_subscriptions_delete on mos.push_subscriptions
  for delete to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- ── User views: org gate on EVERY branch ─────────────────────────────────────────────────────
-- The org test comes FIRST and both visibility arms sit inside it. A private row owned by someone
-- else is invisible even to a same-org admin; a cross-org row of any scope is invisible full stop.
-- shared_team runs DOWN the reporting line — the owner is a manager sharing to their reports — which
-- is why it asks is_managed_by(owner) rather than is_manager_of.
create policy user_views_select on mos.user_views
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      owner_id = shared.current_person_id()
      or (scope = 'shared_team' and shared.is_managed_by(owner_id))
    )
  );

create policy user_views_insert on mos.user_views
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- Owner re-pinned on the post-image, so ownership cannot be reassigned by an UPDATE.
create policy user_views_update on mos.user_views
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- ── The deputy transcript: owner-only, no exceptions ─────────────────────────────────────────
create policy agent_threads_select on mos.agent_threads
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy agent_threads_insert on mos.agent_threads
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy agent_threads_update on mos.agent_threads
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create policy agent_runs_select on mos.agent_runs
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy agent_runs_insert on mos.agent_runs
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy agent_runs_update on mos.agent_runs
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create policy agent_events_select on mos.agent_events
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy agent_events_insert on mos.agent_events
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
create policy agent_events_update on mos.agent_events
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
comment on policy agent_events_update on mos.agent_events is
  'Owner-scoped; mos._guard_agent_events narrows it further to a rating/downvote_reason flip on an assistant row. There is deliberately NO admin cross-owner read policy anywhere on the transcript.';

-- ── Money ────────────────────────────────────────────────────────────────────────────────────
create policy certified_metrics_select_finance_admin on mos.certified_metrics
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );
comment on policy certified_metrics_select_finance_admin on mos.certified_metrics is
  'Read-only reference data. No write policy and no write grant: the registry is migration-owned, the same discipline as shared.role_capabilities.';

create policy budgets_select_finance_admin on mos.budgets
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );

create policy budget_lines_select_finance_admin on mos.budget_lines
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );

-- Defence in depth only — `authenticated` holds no INSERT/UPDATE privilege on either table, so these
-- are never the first line. Kept so that if a grant is ever restored the capability gate is already
-- there rather than being remembered at the time.
create policy budgets_insert_cogs_write on mos.budgets
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.can('cogs.write')
    and created_by = shared.current_person_id()
  );

create policy budgets_update_cogs_write on mos.budgets
  for update to authenticated
  using (org_id = shared.current_org_id() and shared.can('cogs.write'))
  with check (org_id = shared.current_org_id() and shared.can('cogs.write'));

create policy budget_lines_insert_cogs_write on mos.budget_lines
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('cogs.write'));

-- ── AR: read-only, lane-gated ────────────────────────────────────────────────────────────────
create policy follow_ups_select on mos.follow_ups
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('admin')
      or shared.has_access_role('finance')
      or mos.can_work_lane(lane)
    )
  );
comment on policy follow_ups_select on mos.follow_ups is
  'Org-scoped AND lane-scoped: a chaser sees their own lane, Finance and admin see all. No write policy and no write grant for authenticated — every transition goes through mos.transition_follow_up.';

create policy follow_up_events_select on mos.follow_up_events
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and exists (select 1 from mos.follow_ups fu where fu.id = mos.follow_up_events.follow_up_id)
  );
comment on policy follow_up_events_select on mos.follow_up_events is
  'The EXISTS re-enters mos.follow_ups under the caller''s own RLS, so the ledger inherits the parent''s lane gate rather than restating it — a chaser who cannot see the follow-up cannot see its payments either.';

create policy esb_ar_reduction_select_finance_admin on reporting.esb_ar_reduction
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );
