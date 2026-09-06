-- Café opening/review/plan/pushes rule composition for #778.
-- DOWN is executable and restores the prior function/policy definitions below.

create or replace function shared.cafe_opening_team(p_branch_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id
  from shared.teams t
  where t.org_id = shared.current_org_id()
    and t.branch_id = p_branch_id
    and t.archived_at is null
    and t.activity in ('kitchen', 'bar')
  order by case t.activity when 'kitchen' then 0 else 1 end, t.id
  limit 1
$$;
comment on function shared.cafe_opening_team(uuid) is
  'Canonical Café Opening Team for a branch: live kitchen first, otherwise live bar (#778).';
grant execute on function shared.cafe_opening_team(uuid) to authenticated;

create or replace function shared.cafe_opening_can_start(p_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.has_access_role('admin')
    or shared.has_access_role('ops_lead')
    or exists (
      select 1
      from shared.team_memberships m
      join shared.teams t on t.id = m.team_id
      where m.org_id = shared.current_org_id()
        and m.person_id = shared.current_person_id()
        and t.org_id = m.org_id
        and t.branch_id = p_branch_id
        and t.activity is not null
        and t.archived_at is null
        and m.effective_from <= current_date
        and m.effective_to is null
        and (m.is_primary or shared.has_access_role('supervisor'))
    )
$$;
comment on function shared.cafe_opening_can_start(uuid) is
  'Café Opening start gate: admin/ops_lead or a live branch Team member, with supervisor secondary membership allowed (#778).';
grant execute on function shared.cafe_opening_can_start(uuid) to authenticated;

create or replace function mos.spawn_process_run(p_work_line_id uuid, p_owning_team_id uuid, p_target_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid := shared.current_org_id();
  v_wl      mos.work_lines;
  v_cad     mos.process_cadences;
  v_team    shared.teams;
  v_period  text; v_caption text; v_snapshot jsonb;
  v_run_id  uuid; v_created int := 0; v_requested_team uuid; v_pending int := 0;
  td        mos.process_task_defs%rowtype;
  v_holders uuid[]; v_pic uuid; v_sup uuid; v_task_id uuid; v_label text; v_pos int;
begin
  select * into v_wl from mos.work_lines where id = p_work_line_id;
  -- Nonexistent and foreign-org raise the IDENTICAL error. Distinguishing them would let a caller
  -- probe whether a work_line exists in another org by reading which message came back — an
  -- existence oracle, even though they could never start it either way. Checked together and before
  -- the type check, because a foreign row's type is none of the caller's business either.
  if v_wl.id is null or v_wl.org_id is distinct from v_org then
    raise exception 'process not found' using errcode = 'P0002';
  end if;
  if v_wl.type <> 'process' then
    raise exception 'work_line % is not a process', p_work_line_id using errcode = 'P0003';
  end if;
  v_requested_team := p_owning_team_id;
  select * into v_team from shared.teams where id = p_owning_team_id and org_id = v_org;
  if v_team.id is null then raise exception 'owning team not found in org' using errcode = 'P0002'; end if;

  -- Café Opening has one canonical owner per branch. Resolve it before the insert so idempotency,
  -- generated task ownership, and the returned run id all use the same Team.
  if v_wl.name = 'Café Opening' then
    if v_team.branch_id is null or not shared.cafe_opening_can_start(v_team.branch_id)
       or not exists (select 1 from shared.teams t where t.id = v_team.id
          and t.org_id = v_org and t.branch_id = v_team.branch_id
          and t.activity in ('kitchen', 'bar') and t.archived_at is null) then
      raise exception 'not authorized to start this Café Opening' using errcode = '42501';
    end if;
    select * into v_team from shared.teams where id = shared.cafe_opening_team(v_team.branch_id)
      and org_id = v_org;
    if v_team.id is null then
      raise exception 'not authorized to start this Café Opening' using errcode = '42501';
    end if;
    p_owning_team_id := v_team.id;
  end if;

  -- Both gates, always together: the capability says you may start processes at all, the Team check
  -- says you may start THIS one. `member` holds process.start, so the Team check is what stops a
  -- member starting an unrelated Team's process.
  if not (shared.can('process.start') and mos.can_start_process_for_team(v_requested_team)) then
    raise exception 'not authorized to start this process (needs process.start + owning-Team membership)'
      using errcode = '42501';
  end if;
  select * into v_cad from mos.process_cadences where work_line_id = p_work_line_id and org_id = v_org;
  if v_cad.id is null then raise exception 'process has no cadence configured' using errcode = 'P0003'; end if;

  -- The period key is the idempotency grain, derived deterministically from the cadence kind.
  v_period := case v_cad.cadence_kind
                when 'daily'   then to_char(p_target_date, 'YYYY-MM-DD')
                when 'weekly'  then to_char(p_target_date, 'IYYY"W"IW')
                when 'monthly' then to_char(p_target_date, 'YYYY-MM')
                else                to_char(p_target_date, 'YYYY-MM-DD') end;
  v_caption := v_wl.name || ' · ' || to_char(p_target_date, 'DD Mon YYYY');

  -- Freeze the active definitions onto the run, so editing a definition later cannot rewrite what a
  -- past occurrence asked people to do.
  select jsonb_build_object('definition_version', v_wl.definition_version, 'process_name', v_wl.name,
           'task_defs', coalesce(jsonb_agg(to_jsonb(d.*) order by d.position), '[]'::jsonb))
    into v_snapshot
    from mos.process_task_defs d
   where d.work_line_id = p_work_line_id and d.org_id = v_org and d.archived_at is null;

  -- The UNIQUE key does the idempotency; on conflict the existing run is returned and NOTHING is
  -- generated, so a double-tap cannot duplicate a day's tasks.
  insert into mos.process_runs (org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
                                definition_version, spec_snapshot, started_by)
  values (v_org, p_work_line_id, p_owning_team_id, v_period, v_caption, p_target_date,
          v_wl.definition_version, v_snapshot, shared.current_person_id())
  on conflict (org_id, work_line_id, owning_team_id, period_key) do nothing
  returning id into v_run_id;
  if v_run_id is null then
    select id into v_run_id from mos.process_runs
      where org_id = v_org and work_line_id = p_work_line_id
        and owning_team_id = p_owning_team_id and period_key = v_period;
    return jsonb_build_object('run_id', v_run_id, 'created', 0, 'pending', 0, 'idempotent', true);
  end if;

  for td in select * from mos.process_task_defs
            where work_line_id = p_work_line_id and org_id = v_org and archived_at is null order by position loop
    if td.pic_person_id is not null then
      v_pic := td.pic_person_id;
    else
      select array_agg(h) into v_holders from mos._function_holders(v_org, td.pic_role_id, td.pic_team_id) h;
      v_pic := case when v_holders is not null and array_length(v_holders,1) = 1 then v_holders[1] else null end;
    end if;

    -- Zero or several holders means a human chooses. Never guess a PIC (OD-41): a wrongly-assigned
    -- task is worse than an unassigned one, because nobody checks a task that already has a name.
    if v_pic is null then
      insert into mos.process_run_pending_tasks (org_id, process_run_id, task_def_id, candidate_person_ids, reason)
      values (v_org, v_run_id, td.id, coalesce(v_holders, '{}'),
              case when v_holders is null then 'none' else 'multiple' end);
      v_pending := v_pending + 1;
      continue;
    end if;

    -- Supervisor: explicit, then a unique role holder, then the Process's own Accountable, then the
    -- PIC themselves. The last step means a generated task always has an A, never a NULL.
    v_sup := td.supervisor_person_id;
    if v_sup is null and td.supervisor_role_id is not null then
      select array_agg(h) into v_holders from mos._function_holders(v_org, td.supervisor_role_id, td.supervisor_team_id) h;
      if v_holders is not null and array_length(v_holders,1) = 1 then v_sup := v_holders[1]; end if;
    end if;
    v_sup := coalesce(v_sup, v_wl.accountable_person_id, v_pic);

    insert into mos.tasks (org_id, title, description, business_unit_id, status,
                           responsible_person_id, accountable_person_id, due_date,
                           work_line_id, process_run_id, generated_from_task_def_id, created_by)
    values (v_org, td.title, td.description, v_team.business_unit_id, 'Open',
            v_pic, v_sup, p_target_date + td.due_offset_days,
            p_work_line_id, v_run_id, td.id, shared.current_person_id())
    returning id into v_task_id;
    v_created := v_created + 1;

    v_pos := 0;
    for v_label in select value from jsonb_array_elements_text(td.checklist_items) loop
      insert into mos.task_checklist_items (org_id, task_id, label, position) values (v_org, v_task_id, v_label, v_pos);
      v_pos := v_pos + 1;
    end loop;
  end loop;

  return jsonb_build_object('run_id', v_run_id, 'created', v_created, 'pending', v_pending, 'idempotent', false);
end;
$$;
comment on function mos.spawn_process_run(uuid,uuid,date) is
  'Idempotent occurrence spawn (ADR-0051). Nonexistent and foreign-org work lines raise the identical "process not found" so there is no existence oracle; then process.start + owning-Team membership; then a deterministic period key, an on-conflict-do-nothing run, a definition snapshot, and per def either a Task (exactly one holder) or a pending human-choice row. SECURITY DEFINER.';
revoke execute on function mos.spawn_process_run(uuid,uuid,date) from public, anon, authenticated;
grant  execute on function mos.spawn_process_run(uuid,uuid,date) to authenticated;


-- Café Opening is authorised by the branch rule, while every other process keeps the
-- original Team-membership gate unchanged.
create or replace function mos.can_start_process_for_team(p_team_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select shared.has_access_role('admin')
  or exists (select 1 from shared.team_memberships m where m.team_id = p_team_id
    and m.person_id = shared.current_person_id() and m.org_id = shared.current_org_id()
    and m.effective_from <= current_date and m.effective_to is null)
$$;
comment on function mos.can_start_process_for_team(uuid) is
  'Team-authorization gate for spawn/resolve/complete; admin or an open-ended live membership (ADR-0051 D8).';

create or replace function mos.due_process_runs()
returns table (work_line_id uuid, process_name text, owning_team_id uuid, team_name text, period_key text, scheduled_date date)
language sql stable security invoker set search_path = '' as $$
  select wl.id, wl.name, coalesce(shared.cafe_opening_team(b.id), t.id),
         coalesce((select ct.name from shared.teams ct where ct.id=shared.cafe_opening_team(b.id)), t.name),
         to_char((now() at time zone 'Asia/Jakarta')::date,'YYYY-MM-DD'),
         (now() at time zone 'Asia/Jakarta')::date
  from mos.work_lines wl join mos.process_cadences c on c.work_line_id=wl.id and c.active and c.cadence_kind='daily'
  join shared.teams t on t.org_id=wl.org_id and t.archived_at is null
  left join shared.branches b on b.id=t.branch_id and b.org_id=t.org_id
  where wl.org_id=shared.current_org_id() and wl.type='process' and wl.archived_at is null
    and (wl.name <> 'Café Opening' or (b.id is not null and shared.cafe_opening_can_start(b.id) and t.id=shared.cafe_opening_team(b.id)))
    and (wl.name = 'Café Opening' or mos.can_start_process_for_team(t.id))
    and not exists (select 1 from mos.process_runs r where r.work_line_id=wl.id
      and r.owning_team_id=coalesce(shared.cafe_opening_team(b.id),t.id)
      and r.period_key=to_char((now() at time zone 'Asia/Jakarta')::date,'YYYY-MM-DD'))
$$;

-- Reviewer authority follows any open-ended live membership, not only the primary one.
create or replace function ops.is_stream_reviewer(p_branch_id uuid, p_activity text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.has_access_role('supervisor')
    and exists (
      select 1
      from shared.team_memberships m
      join shared.teams t on t.id = m.team_id
      where m.person_id = shared.current_person_id()
        and m.org_id = shared.current_org_id()
        and t.org_id = m.org_id
        and t.archived_at is null
        and t.branch_id = p_branch_id
        and t.activity = p_activity
        and m.effective_from <= current_date
        and m.effective_to is null
    )
$$;
comment on function ops.is_stream_reviewer(uuid, text) is
  'True for a supervisor with any open-ended live membership in the requested branch stream; membership need not be primary (OD-WAY-95 (7)).';

-- Approval/rejection requirements are a second trigger so the existing review guard remains intact.
create or replace function ops._guard_kitchen_review_requirements()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare planned numeric;
begin
 if tg_op='UPDATE' and old.status='Submitted' and new.status='Rejected'
    and nullif(btrim(new.review_note),'') is null then
   raise exception 'a rejection requires a reason' using errcode='42501';
 end if;
 if tg_op='UPDATE' and old.status='Submitted' and new.status='Approved' then
   select p.qty_porsi into planned from ops.kitchen_plans p where p.org_id=old.org_id and p.log_date=old.log_date
    and p.wip_item_id=old.wip_item_id and p.branch_id=old.branch_id and p.activity=old.activity
    and p.action=old.action and p.destination_branch_id is not distinct from old.destination_branch_id limit 1;
   if planned is not null and planned <> old.qty_porsi and nullif(btrim(old.notes),'') is null
      and nullif(btrim(new.review_note),'') is null then
     raise exception 'an off-plan approval requires a reviewer note' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
comment on function ops._guard_kitchen_review_requirements() is
  'Rejects every rejection without a reason, and requires a reviewer note only for a planned quantity deviation with no submitter note (OD-WAY-95 (6)).';
create trigger kitchen_logs_review_requirements before update on ops.kitchen_logs
for each row execute function ops._guard_kitchen_review_requirements();

-- Plan writes: the row's stream reviewer, plus the existing privileged roles.
drop policy kitchen_plans_insert_ops_lead_or_admin on ops.kitchen_plans;
create policy kitchen_plans_insert_ops_lead_or_admin on ops.kitchen_plans for insert to authenticated
 with check (org_id=shared.current_org_id() and source='mos' and (shared.has_access_role('ops_lead') or shared.has_access_role('admin') or ops.is_stream_reviewer(branch_id,activity)));
drop policy kitchen_plans_update_ops_lead_or_admin on ops.kitchen_plans;
create policy kitchen_plans_update_ops_lead_or_admin on ops.kitchen_plans for update to authenticated
 using (org_id=shared.current_org_id() and (shared.has_access_role('ops_lead') or shared.has_access_role('admin') or ops.is_stream_reviewer(branch_id,activity)))
 with check (org_id=shared.current_org_id() and (shared.has_access_role('ops_lead') or shared.has_access_role('admin') or ops.is_stream_reviewer(branch_id,activity)));

-- Posture: ops_lead/admin read their org's outbox rows; Retail Ops managers now join them.
-- Nobody else has access, and authenticated has no INSERT or UPDATE policy.
drop policy esb_push_select_ops_lead_or_admin on integrations.esb_push;
create policy esb_push_select_ops_lead_admin_or_retail_ops_manager on integrations.esb_push
for select to authenticated
using (
  org_id = shared.current_org_id()
  and (
    shared.has_access_role('ops_lead')
    or shared.has_access_role('admin')
    or (
      shared.has_access_role('manager')
      and exists (
        select 1
        from shared.person_roles pr
        join shared.roles r on r.id = pr.role_id
        join shared.business_units bu on bu.id = r.business_unit_id
        where pr.person_id = shared.current_person_id()
          and pr.org_id = shared.current_org_id()
          and r.org_id = pr.org_id
          and bu.org_id = r.org_id
          and bu.code = 'retail_ops'
      )
    )
  )
);

-- DOWN (executable statements, to be applied in reverse by the migration operator):
-- drop policy if exists esb_push_select_ops_lead_admin_or_retail_ops_manager on integrations.esb_push;
-- alter policy esb_push_select_ops on integrations.esb_push rename to esb_push_select_ops_lead_or_admin;
-- create policy esb_push_select_ops_lead_or_admin on integrations.esb_push for select to authenticated
-- using (org_id = shared.current_org_id() and (shared.has_access_role('ops_lead')
--   or shared.has_access_role('admin')));
-- drop policy kitchen_plans_insert_ops_lead_or_admin on ops.kitchen_plans;
-- create policy kitchen_plans_insert_ops_lead_or_admin on ops.kitchen_plans for insert to authenticated
-- with check (org_id = shared.current_org_id() and source = 'mos'
--   and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
-- drop policy kitchen_plans_update_ops_lead_or_admin on ops.kitchen_plans;
-- create policy kitchen_plans_update_ops_lead_or_admin on ops.kitchen_plans for update to authenticated
-- using (org_id = shared.current_org_id() and (shared.has_access_role('ops_lead')
--   or shared.has_access_role('admin')))
-- with check (org_id = shared.current_org_id() and (shared.has_access_role('ops_lead')
--   or shared.has_access_role('admin')));
-- drop trigger kitchen_logs_review_requirements on ops.kitchen_logs;
-- drop function ops._guard_kitchen_review_requirements();
-- drop function ops.is_stream_reviewer(uuid, text);
-- create or replace function ops.is_stream_reviewer(uuid, text) returns boolean language sql stable security invoker set search_path = '' as $$
--   select shared.has_access_role('supervisor') and exists (select 1 from shared.team_memberships m join shared.teams t on t.id = m.team_id
--     where m.person_id = shared.current_person_id() and m.org_id = shared.current_org_id() and t.org_id = m.org_id
--       and t.archived_at is null and t.branch_id = $1 and t.activity = $2 and m.is_primary
--       and m.effective_from <= current_date and m.effective_to is null)
-- $$;
-- drop function mos.spawn_process_run(uuid, uuid, date);
-- drop function mos.due_process_runs();
-- create or replace function mos.can_start_process_for_team(uuid) returns boolean language sql stable security invoker set search_path = '' as $$
--   select shared.has_access_role('admin') or exists (select 1 from shared.team_memberships m
--     where m.team_id = $1 and m.person_id = shared.current_person_id() and m.org_id = shared.current_org_id()
--       and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date))
-- $$;
-- drop function shared.cafe_opening_can_start(uuid); drop function shared.cafe_opening_team(uuid);
