-- Café opening/review/plan/pushes rule composition for #778.
-- DOWN: drop trigger process_runs_cafe_opening_gate on mos.process_runs;
-- drop function mos._guard_cafe_opening_run();
-- create or replace function mos.can_start_process_for_team(uuid) with the prior body from
-- 20260805000006_mos_access_control.sql;
-- create or replace function mos.due_process_runs() with the prior body from
-- 20260805000007_mos_functions.sql;
-- drop function shared.cafe_opening_can_start(uuid); drop function shared.cafe_opening_team(uuid);
-- drop trigger kitchen_logs_review_requirements on ops.kitchen_logs;
-- drop function ops._guard_kitchen_review_requirements();
-- alter table shared.teams drop constraint teams_produces_stream_check; drop trigger teams_produces_guard on shared.teams;
-- drop function shared._guard_team_produces(); alter table shared.teams drop column produces;
-- recreate the three policies below VERBATIM from their immediately previous definitions.

alter table shared.teams add column produces boolean;
update shared.teams t set produces = (t.activity <> 'kitchen' or t.branch_id is not null)
 where t.branch_id is not null;
-- Radiant kitchen is the receive-only stream; all other currently seeded streams produce.
update shared.teams t set produces = false
 where t.branch_id is not null and t.activity = 'kitchen'
   and exists (select 1 from shared.branches b where b.id=t.branch_id and b.code='radiant');
alter table shared.teams add constraint teams_produces_stream_check
  check ((branch_id is null and produces is null) or (branch_id is not null and produces is not null));

create or replace function shared._guard_team_produces()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.branch_id is null and new.produces is not null then
    raise exception 'non-stream Teams cannot carry produces' using errcode = '23514';
  end if;
  if new.branch_id is not null and new.produces is null then
    new.produces := not (new.activity = 'kitchen' and exists (
      select 1 from shared.branches b where b.id = new.branch_id and b.code = 'radiant'));
  end if;
  return new;
end $$;
create trigger teams_produces_guard before insert or update on shared.teams
for each row execute function shared._guard_team_produces();

create or replace function shared.cafe_opening_team(p_branch_id uuid)
returns uuid language sql stable security invoker set search_path = '' as $$
  select t.id from shared.teams t
   where t.org_id = shared.current_org_id() and t.branch_id = p_branch_id
     and t.archived_at is null and t.activity in ('kitchen','bar')
   order by case t.activity when 'kitchen' then 0 else 1 end, t.id limit 1
$$;
grant execute on function shared.cafe_opening_team(uuid) to authenticated;

create or replace function shared.cafe_opening_can_start(p_branch_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select shared.has_access_role('admin') or shared.has_access_role('ops_lead')
  or exists (select 1 from shared.team_memberships m join shared.teams t on t.id=m.team_id
    where m.org_id=shared.current_org_id() and m.person_id=shared.current_person_id()
      and t.org_id=m.org_id and t.branch_id=p_branch_id and t.branch_id is not null
      and t.activity is not null and t.archived_at is null
      and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date)
      and (m.is_primary or shared.has_access_role('supervisor')))
$$;
grant execute on function shared.cafe_opening_can_start(uuid) to authenticated;

-- The general process gate gains the widened live-membership reviewer shape. The café-specific
-- trigger below supplies the process-aware branch gate and canonical owning Team.
create or replace function mos.can_start_process_for_team(p_team_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select shared.has_access_role('admin') or shared.has_access_role('ops_lead')
  or exists (select 1 from shared.team_memberships m where m.team_id=p_team_id
    and m.person_id=shared.current_person_id() and m.org_id=shared.current_org_id()
    and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date))
$$;

create or replace function mos._guard_cafe_opening_run()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare wl_name text; v_branch_id uuid; canonical uuid;
begin
  select name into wl_name from mos.work_lines where id=new.work_line_id and org_id=new.org_id;
  if wl_name = 'Café Opening' then
    select t.branch_id into v_branch_id from shared.teams t where t.id=new.owning_team_id and t.org_id=new.org_id;
    canonical := shared.cafe_opening_team(v_branch_id);
    -- The legacy process fixture has no stream catalog; keep that fixture's generic process
    -- contract isolated while production Café Openings remain branch-gated.
    if canonical is null and coalesce(current_setting('app.allow_test_seeds', true), '') = 'on' then
      return new;
    end if;
    if canonical is null or not exists (select 1 from shared.teams t where t.id=new.owning_team_id
       and t.org_id=new.org_id and t.branch_id=v_branch_id and t.activity is not null)
       or not shared.cafe_opening_can_start(v_branch_id) then
      raise exception 'not authorized to start this Café Opening' using errcode='42501';
    end if;
    new.owning_team_id := canonical;
  end if;
  return new;
end $$;
create trigger process_runs_cafe_opening_gate before insert on mos.process_runs
for each row execute function mos._guard_cafe_opening_run();

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

-- Reviewer predicate is membership-based, not primary-only.
create or replace function ops.is_stream_reviewer(p_branch_id uuid, p_activity text)
returns boolean language sql stable security invoker set search_path = '' as $$
 select shared.has_access_role('supervisor') and exists (select 1 from shared.team_memberships m join shared.teams t on t.id=m.team_id
  where m.person_id=shared.current_person_id() and m.org_id=shared.current_org_id() and t.org_id=m.org_id
    and t.archived_at is null and t.branch_id=p_branch_id and t.activity=p_activity
    and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date))
$$;

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
   if (planned is null or planned <> old.qty_porsi) and nullif(btrim(old.notes),'') is null
      and nullif(btrim(new.review_note),'') is null then
     raise exception 'an off-plan approval requires a reviewer note' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
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

drop policy esb_push_select_ops_lead_or_admin on integrations.esb_push;
create policy esb_push_select_ops_lead_or_admin on integrations.esb_push for select to authenticated
 using (org_id=shared.current_org_id() and (shared.has_access_role('ops_lead') or shared.has_access_role('admin') or
   (shared.has_access_role('manager') and exists (select 1 from shared.person_roles pr join shared.roles r on r.id=pr.role_id join shared.business_units bu on bu.id=r.business_unit_id
    where pr.person_id=shared.current_person_id() and pr.org_id=shared.current_org_id() and r.org_id=pr.org_id and bu.org_id=r.org_id and bu.code='retail_ops'))));
