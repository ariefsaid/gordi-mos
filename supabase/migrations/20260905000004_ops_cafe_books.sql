-- Café books: producer facts and one destination derivation (#777, AC-001..AC-006).
-- DOWN: drop the destination function and producer-default trigger/function; restore the prior
-- seed function and the review-scoped kitchen guards from their immediately previous migrations;
-- then drop teams_produces_pair_check and teams.produces. No business rows are deleted.

alter table shared.teams add column produces boolean;
update shared.teams set produces = (activity = 'bar' or exists (
  select 1 from shared.branches b where b.id = shared.teams.branch_id
    and b.code in ('gordi_hq', 'rumah_rames')))
 where branch_id is not null and activity is not null;
alter table shared.teams add constraint teams_produces_pair_check
  check ((branch_id is null and activity is null and produces is null)
      or (branch_id is not null and activity is not null and produces is not null));
create or replace function shared._set_team_produces_default()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.branch_id is not null and new.activity is not null and new.produces is null then new.produces := true; end if;
  return new;
end;
$$;
create trigger teams_produces_default before insert or update on shared.teams
for each row execute function shared._set_team_produces_default();
comment on column shared.teams.produces is
  'Whether this production-stream Team may write production lines. Non-stream Teams carry NULL; receive-only kitchens carry FALSE.';

create or replace function shared.seed_stream_teams()
returns void
language plpgsql
set search_path = ''
as $$
declare
  o         record;
  v_missing text;
begin
  for o in select id as org_id from shared.orgs loop
    insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity, produces)
    select o.org_id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code, b.id, a.code, (a.code = 'bar' or b.code in ('gordi_hq', 'rumah_rames'))
    from shared.branches b
    cross join shared.activities a
    join shared.business_units bu
      on bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null
    where b.org_id = o.org_id
      and b.archived_at is null
      and (    b.code in ('gordi_hq', 'rumah_rames', 'radiant')      -- every catalog activity
            or (b.code = 'cikal' and a.code = 'bar') )               -- bar only (owner, 2026-08-27)
    on conflict (org_id, code) do nothing;

    -- Pair-existence, not row-count: what must hold is that each expected (branch, activity) has a
    -- live stream team, whatever its code.
    select string_agg(e.branch_code || '/' || e.activity, ', '
                      order by e.branch_code, e.activity)
      into v_missing
    from (
      select b.code as branch_code, a.code as activity, b.id as branch_id
      from shared.branches b
      cross join shared.activities a
      where b.org_id = o.org_id
        and b.archived_at is null
        and (    b.code in ('gordi_hq', 'rumah_rames', 'radiant')
              or (b.code = 'cikal' and a.code = 'bar') )
        and exists (select 1 from shared.business_units bu
                     where bu.org_id = o.org_id and bu.code = 'retail_ops'
                       and bu.archived_at is null)
    ) e
    where not exists (
      select 1 from shared.teams t
       where t.org_id = o.org_id
         and t.branch_id = e.branch_id
         and t.activity = e.activity
         and t.archived_at is null);

    if v_missing is not null then
      raise exception 'stream-team seed shortfall for org %: missing % — a reserved team code is '
        'already held by a non-stream team; rename it or archive it, the stream catalog must be '
        'complete (FR-005/AC-012a as amended for Cikal, OD-WAY-42)', o.org_id, v_missing;
    end if;
  end loop;
end;
$$;

-- Three published descriptions understate the catalog. The database serves all three to any reader
-- of \d+, and ops_04 asserts one — so the stale number was test-enforced green. A count in a
-- comment is a fact you own on every ruling; `shared_11` now guards the class.
comment on column ops.kitchen_logs.activity is
  'Activity half of the production stream; resolves against shared.activities. Crossed with the '
  'three FULL production branches that catalog yields six streams, plus Cikal which takes bar only '
  '= SEVEN distinct streams today (OD-WAY-42, OD-WAY-79). Adding a catalog row multiplies across '
  'the three full branches and leaves Cikal alone. Adding a BRANCH changes nothing on its own: the '
  'branch half is a literal code list inside shared.seed_stream_teams(), so a new branch gets a '
  'stream only when that function is edited to name it.';

comment on function shared.seed_stream_teams() is
  'Seeds the live stream Teams: the three FULL production branches crossed with every '
  'shared.activities row, PLUS Cikal with bar only (OD-WAY-79). A union of two rules, never a wider '
  'cross product — a new activity reaches the three and not Cikal. Roastery is a branch with no '
  'stream at all (OD-WAY-42). VALIDATES: raises if any expected pair has no live team. Idempotent '
  '(on conflict do nothing); called by this migration and again by seed.sql, which re-seeds the '
  'catalog for the Gordi org created after migrations run. Not an app RPC: no EXECUTE for anon or '
  'authenticated.';

-- From 20260806000001:59-61. Re-issued here, not edited there: a deployed database never re-runs
-- an applied migration.
comment on index shared.teams_stream_unique is
  'At most one LIVE stream team per (org, branch, activity). This is what makes the stream '
  'catalog ENUMERABLE — a capture surface can list the streams rather than guess them — which is '
  'the property FR-005/AC-012a asserts, not any particular count (OD-WAY-42, OD-WAY-79). Partial '
  'index: archiving a stream team and later seeding its successor stays possible, and ordinary '
  'teams (branch_id NULL) never pay.';

create or replace function ops.allowed_kitchen_destinations(p_org_id uuid, p_origin_branch_id uuid, p_origin_activity text)
returns table(destination_branch_id uuid) language sql stable security invoker set search_path = '' as $$
  with origin as (select t.branch_id,t.activity,t.produces from shared.teams t where t.org_id=p_org_id and t.branch_id=p_origin_branch_id and t.activity=p_origin_activity and t.archived_at is null),
  branches_with_streams as (select distinct t.branch_id from shared.teams t join shared.branches b on b.id=t.branch_id and b.org_id=t.org_id where t.org_id=p_org_id and t.branch_id is not null and t.archived_at is null and b.archived_at is null),
  bar_branches as (select distinct t.branch_id from shared.teams t join shared.branches b on b.id=t.branch_id and b.org_id=t.org_id where t.org_id=p_org_id and t.activity='bar' and t.archived_at is null and b.archived_at is null),
  kitchen_branches as (select distinct t.branch_id from shared.teams t join shared.branches b on b.id=t.branch_id and b.org_id=t.org_id where t.org_id=p_org_id and t.activity='kitchen' and t.archived_at is null and b.archived_at is null)
  select b.id from shared.branches b cross join origin o where b.org_id=p_org_id and b.archived_at is null and o.produces
    and ((o.activity='kitchen' and b.id in (select branch_id from branches_with_streams) and b.id<>o.branch_id)
      or (o.activity='bar' and ((b.id=o.branch_id and b.id in (select branch_id from kitchen_branches)) or (b.id<>o.branch_id and b.id in (select branch_id from bar_branches))))) order by b.code;
$$;
comment on function ops.allowed_kitchen_destinations(uuid,uuid,text) is 'One Café derivation: producing kitchens send to other stream branches; producing bars send to their own kitchen-backed branch and other bar branches. Non-producing streams and Roastery send nowhere.';
grant execute on function ops.allowed_kitchen_destinations(uuid,uuid,text) to authenticated;

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
  v_sub_org  uuid;
  v_rev_org  uuid;
  v_produces boolean;
begin
  -- 20260620000008: submitted_by is immutable post-insert — a log cannot be re-attributed.
  if tg_op = 'UPDATE' and new.submitted_by is distinct from old.submitted_by then
    raise exception 'submitted_by is immutable' using errcode = '42501';
  end if;
  -- 20260620000008: org_id is immutable post-insert (prevents cross-org re-homing on UPDATE).
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- OD-WAY-38: `source` is provenance and never changes. Without this a member could relabel
  -- their own MOS row as imported history, or an imported row as MOS-authored.
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'source is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- 20260620000008, re-gated for #236: EVERY status transition is a reviewer action, and the
  -- reviewer for a row is now decided BY THE ROW'S STREAM (FR-040): its stream reviewer —
  -- supervisor whose live primary Team is this stream's Team — or ops_lead/admin as the
  -- cross-stream fallback (FR-041). Keyed on OLD's stream: the stream columns are frozen through
  -- review by the re-target rule below, so OLD and NEW cannot disagree here.
  --
  -- Review stays ONE-WAY: Approved and Rejected are terminal for the app tier, and a correction
  -- is recorded as a new log (unchanged from ...0010 — see that header for the reasoning).
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not ops.can_review_stream(old.branch_id, old.activity) then
      raise exception 'only the stream''s supervisor or ops_lead/admin may approve or reject a kitchen log'
        using errcode = '42501';
    end if;
    if old.status <> 'Submitted' then
      raise exception 'a reviewed kitchen log keeps its status; record a correction as a new log'
        using errcode = '42501';
    end if;
    -- #236 review finding: THE DECIDE FREEZE. A status transition may change the status and the
    -- review fields — nothing else. Without this, the freeze below (Submitted→Submitted only)
    -- left a decide free to re-home the row's facts in the same statement: the transition was
    -- authorised against the OLD stream while WITH CHECK validated the NEW one, so a reject could
    -- carry branch_id/qty/date changes nobody authorised. Approve's legitimate stamps
    -- (reviewed_by/reviewed_at/review_note/batch_id) are set by the RPC — which by construction
    -- carries NO caller fields (it takes a log id and a note) — and reject's are stamped below;
    -- neither touches the columns listed here, so this arm fires on both paths purely as the
    -- refusal it is. qty and the submitter's note are included deliberately: a reviewer
    -- "correcting" a figure while deciding it is the same silent-rewrite class — a correction is
    -- a new log (or a pre-decision edit the submitter can see), never a side effect of a decision.
    if new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date
       or new.qty_porsi is distinct from old.qty_porsi
       or new.notes is distinct from old.notes then
      raise exception 'a decision changes only the status and the review fields; the log''s facts are frozen'
        using errcode = '42501';
    end if;
  end if;
  -- NEW (#236, FR-043/AC-010): the per-stream ordering gate. The incumbent's rule — transfers
  -- wait for the day's production count to be reviewed, because an approved transfer of WIP whose
  -- production is later rejected has moved stock that was never confirmed to exist — kept, but
  -- keyed on the ROW'S OWN stream and day. Only Submitted production locks; a decided row
  -- (Approved OR Rejected) has been looked at, which is all the ordering ever asked for.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Approved'
     and new.action = 'transfer' then
    if exists (
      select 1 from ops.kitchen_logs l
       where l.org_id    = new.org_id
         and l.branch_id = new.branch_id
         and l.activity  = new.activity
         and l.log_date  = new.log_date
         and l.action    = 'produce'
         and l.status    = 'Submitted'
    ) then
      raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
        using errcode = 'P0004';
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
  -- branch_id and destination_branch_id are the same class of existence-only FK, into a catalog
  -- that is itself org-scoped.
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
  -- The two PEOPLE references, held to the same rule as the four above (see ...0010 for why both
  -- arms are null-guarded).
  if new.submitted_by is not null then
    select p.org_id into v_sub_org from shared.people p where p.id = new.submitted_by;
    if v_sub_org is distinct from new.org_id then
      raise exception 'submitted_by must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.reviewed_by is not null then
    select p.org_id into v_rev_org from shared.people p where p.id = new.reviewed_by;
    if v_rev_org is distinct from new.org_id then
      raise exception 'reviewed_by must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if current_setting('app.allow_test_seeds', true) = 'on' then return new; end if;
  select t.produces into v_produces from shared.teams t
   where t.org_id = new.org_id and t.branch_id = new.branch_id
     and t.activity = new.activity and t.archived_at is null;
  if v_produces is distinct from true then
    raise exception 'the production stream does not produce' using errcode = '42501';
  end if;
  if new.action = 'transfer' and not exists (
    select 1 from ops.allowed_kitchen_destinations(new.org_id, new.branch_id, new.activity) d
     where d.destination_branch_id = new.destination_branch_id
  ) then
    raise exception 'the destination is outside the production stream''s allowed books'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
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
  v_plan_org uuid;
  v_produces boolean;
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
  -- The planner. Unlike the kitchen log's submitter, no policy pins this column to the session
  -- person — the write gate is the ops_lead/admin role, which says who may write the row and nothing
  -- about whose name goes on it.
  if new.plan_by is not null then
    select p.org_id into v_plan_org from shared.people p where p.id = new.plan_by;
    if v_plan_org is distinct from new.org_id then
      raise exception 'plan_by must belong to the same org as the kitchen plan' using errcode = '23514';
    end if;
  end if;
  if current_setting('app.allow_test_seeds', true) = 'on' then return new; end if;
  select t.produces into v_produces from shared.teams t
   where t.org_id = new.org_id and t.branch_id = new.branch_id
     and t.activity = new.activity and t.archived_at is null;
  if v_produces is distinct from true then
    raise exception 'the production stream does not produce' using errcode = '42501';
  end if;
  if new.action = 'transfer' and not exists (
    select 1 from ops.allowed_kitchen_destinations(new.org_id, new.branch_id, new.activity) d
     where d.destination_branch_id = new.destination_branch_id
  ) then
    raise exception 'the destination is outside the production stream''s allowed books'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_plan() is
  'Guard: org_id and source immutable on UPDATE (42501); wip_item_id, branch_id, destination_branch_id and plan_by must be same-org (23514, same seam as ops._guard_kitchen_log). SECURITY INVOKER.';

