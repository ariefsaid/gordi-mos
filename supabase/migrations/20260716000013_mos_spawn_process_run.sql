-- Step 6 (ADR-0051 D6/D7): the single gated write points for runs/tasks. SECURITY DEFINER; each RPC
-- cross-org-guards + capability/Team-gates before any write. revoke PUBLIC execute (CI lint).

create or replace function mos.spawn_process_run(p_work_line_id uuid, p_owning_team_id uuid, p_target_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid := shared.current_org_id();
  v_wl      mos.work_lines;
  v_cad     mos.process_cadences;
  v_team    shared.teams;
  v_period  text; v_caption text; v_snapshot jsonb;
  v_run_id  uuid; v_created int := 0; v_pending int := 0;
  td        mos.process_task_defs%rowtype;
  v_holders uuid[]; v_pic uuid; v_sup uuid; v_task_id uuid; v_label text; v_pos int;
begin
  select * into v_wl from mos.work_lines where id = p_work_line_id;
  if v_wl.id is null then raise exception 'process not found' using errcode = 'P0002'; end if;
  if v_wl.type <> 'process' then raise exception 'work_line % is not a process', p_work_line_id using errcode = 'P0003'; end if;
  -- cross-org guard FIRST (DEFINER bypasses RLS).
  if v_wl.org_id is distinct from v_org then raise exception 'cannot start a process outside your org' using errcode = '42501'; end if;
  select * into v_team from shared.teams where id = p_owning_team_id and org_id = v_org;
  if v_team.id is null then raise exception 'owning team not found in org' using errcode = 'P0002'; end if;
  -- capability + Team-authorization gate.
  if not (shared.can('process.start') and mos.can_start_process_for_team(p_owning_team_id)) then
    raise exception 'not authorized to start this process (needs process.start + owning-Team membership)' using errcode = '42501';
  end if;
  select * into v_cad from mos.process_cadences where work_line_id = p_work_line_id and org_id = v_org;
  if v_cad.id is null then raise exception 'process has no cadence configured' using errcode = 'P0003'; end if;

  -- deterministic WIB period key (idempotency grain).
  v_period := case v_cad.cadence_kind
                when 'daily'   then to_char(p_target_date, 'YYYY-MM-DD')
                when 'weekly'  then to_char(p_target_date, 'IYYY"W"IW')
                when 'monthly' then to_char(p_target_date, 'YYYY-MM')
                else                to_char(p_target_date, 'YYYY-MM-DD') end;
  v_caption := v_wl.name || ' · ' || to_char(p_target_date, 'DD Mon YYYY');

  -- version snapshot (immutable copy of the active defs).
  select jsonb_build_object('definition_version', v_wl.definition_version, 'process_name', v_wl.name,
           'task_defs', coalesce(jsonb_agg(to_jsonb(d.*) order by d.position), '[]'::jsonb))
    into v_snapshot
    from mos.process_task_defs d where d.work_line_id = p_work_line_id and d.org_id = v_org and d.archived_at is null;

  -- idempotent insert: on conflict, return the existing run and generate NOTHING.
  insert into mos.process_runs (org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
                                definition_version, spec_snapshot, started_by)
  values (v_org, p_work_line_id, p_owning_team_id, v_period, v_caption, p_target_date,
          v_wl.definition_version, v_snapshot, shared.current_person_id())
  on conflict (org_id, work_line_id, owning_team_id, period_key) do nothing
  returning id into v_run_id;
  if v_run_id is null then
    select id into v_run_id from mos.process_runs
      where org_id = v_org and work_line_id = p_work_line_id and owning_team_id = p_owning_team_id and period_key = v_period;
    return jsonb_build_object('run_id', v_run_id, 'created', 0, 'pending', 0, 'idempotent', true);
  end if;

  -- generate a Task (single holder) or a pending human-choice row (0/many holders) per active def.
  for td in select * from mos.process_task_defs
            where work_line_id = p_work_line_id and org_id = v_org and archived_at is null order by position loop
    if td.pic_person_id is not null then
      v_pic := td.pic_person_id;
    else
      select array_agg(h) into v_holders from mos._function_holders(v_org, td.pic_role_id, td.pic_team_id) h;
      v_pic := case when v_holders is not null and array_length(v_holders,1) = 1 then v_holders[1] else null end;
    end if;

    if v_pic is null then
      insert into mos.process_run_pending_tasks (org_id, process_run_id, task_def_id, candidate_person_ids, reason)
      values (v_org, v_run_id, td.id, coalesce(v_holders, '{}'),
              case when v_holders is null then 'none' else 'multiple' end);
      v_pending := v_pending + 1;
      continue;  -- OD-41: never guess a PIC.
    end if;

    -- Supervisor: explicit → role holder (if unique) → process A → PIC self.
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
end $$;
comment on function mos.spawn_process_run(uuid,uuid,date) is
  'Idempotent occurrence spawn (FR-602..608): cross-org guard → process.start + Team gate → period key → on-conflict-do-nothing run → snapshot → per def resolve PIC (1 holder ⇒ Task; 0/many ⇒ pending, never guessed). SECURITY DEFINER.';
revoke execute on function mos.spawn_process_run(uuid,uuid,date) from public, anon, authenticated;
grant  execute on function mos.spawn_process_run(uuid,uuid,date) to authenticated;

create or replace function mos.resolve_pending_task(p_pending_id uuid, p_pic_person_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := shared.current_org_id();
  v_pend mos.process_run_pending_tasks; v_run mos.process_runs; v_td mos.process_task_defs;
  v_team shared.teams; v_wl mos.work_lines; v_sup uuid; v_task_id uuid; v_holders uuid[]; v_label text; v_pos int := 0;
begin
  select * into v_pend from mos.process_run_pending_tasks where id = p_pending_id for update;
  if v_pend.id is null then raise exception 'pending item not found' using errcode = 'P0002'; end if;
  if v_pend.org_id is distinct from v_org then raise exception 'cannot resolve outside your org' using errcode = '42501'; end if;
  if v_pend.resolved_at is not null then raise exception 'pending item already resolved' using errcode = 'P0003'; end if;
  select * into v_run from mos.process_runs where id = v_pend.process_run_id;
  if not (shared.can('process.start') and mos.can_start_process_for_team(v_run.owning_team_id)) then
    raise exception 'not authorized to resolve this pending item' using errcode = '42501'; end if;
  if not exists (select 1 from shared.people where id = p_pic_person_id and org_id = v_org and archived_at is null) then
    raise exception 'chosen PIC is not a current-org active person' using errcode = '42501'; end if;
  if v_pend.reason = 'multiple' and not (p_pic_person_id = any (v_pend.candidate_person_ids)) then
    raise exception 'chosen PIC is not one of the candidates' using errcode = 'P0003'; end if;

  select * into v_td   from mos.process_task_defs where id = v_pend.task_def_id;
  select * into v_wl   from mos.work_lines        where id = v_run.work_line_id;
  select * into v_team from shared.teams          where id = v_run.owning_team_id;

  v_sup := v_td.supervisor_person_id;
  if v_sup is null and v_td.supervisor_role_id is not null then
    select array_agg(h) into v_holders from mos._function_holders(v_org, v_td.supervisor_role_id, v_td.supervisor_team_id) h;
    if v_holders is not null and array_length(v_holders,1) = 1 then v_sup := v_holders[1]; end if;
  end if;
  v_sup := coalesce(v_sup, v_wl.accountable_person_id, p_pic_person_id);

  insert into mos.tasks (org_id, title, description, business_unit_id, status,
                         responsible_person_id, accountable_person_id, due_date,
                         work_line_id, process_run_id, generated_from_task_def_id, created_by)
  values (v_org, v_td.title, v_td.description, v_team.business_unit_id, 'Open',
          p_pic_person_id, v_sup, v_run.scheduled_date + v_td.due_offset_days,
          v_run.work_line_id, v_run.id, v_td.id, shared.current_person_id())
  returning id into v_task_id;
  for v_label in select value from jsonb_array_elements_text(v_td.checklist_items) loop
    insert into mos.task_checklist_items (org_id, task_id, label, position) values (v_org, v_task_id, v_label, v_pos);
    v_pos := v_pos + 1;
  end loop;
  update mos.process_run_pending_tasks
     set resolved_at = now(), resolved_by = shared.current_person_id(), materialized_task_id = v_task_id
   where id = p_pending_id;
  return v_task_id;
end $$;
comment on function mos.resolve_pending_task(uuid,uuid) is
  'Human resolves an ambiguous/vacant PIC by choosing a person → materializes the Task (FR-606). SECURITY DEFINER; cross-org + capability + Team-gated; candidate-checked.';
revoke execute on function mos.resolve_pending_task(uuid,uuid) from public, anon, authenticated;
grant  execute on function mos.resolve_pending_task(uuid,uuid) to authenticated;

create or replace function mos.complete_process_run(p_run_id uuid)
returns mos.process_runs language plpgsql security definer set search_path = '' as $$
declare v_org uuid := shared.current_org_id(); v_run mos.process_runs;
begin
  select * into v_run from mos.process_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'run not found' using errcode = 'P0002'; end if;
  if v_run.org_id is distinct from v_org then raise exception 'cannot complete a run outside your org' using errcode = '42501'; end if;
  if not (shared.can('process.start') and mos.can_start_process_for_team(v_run.owning_team_id)) then
    raise exception 'not authorized to complete this run' using errcode = '42501'; end if;
  update mos.process_runs set status = 'completed', completed_at = now(), completed_by = shared.current_person_id(), updated_at = now()
   where id = p_run_id;
  select * into v_run from mos.process_runs where id = p_run_id;
  return v_run;
end $$;
comment on function mos.complete_process_run(uuid) is 'Human marks a run complete (FR-610). SECURITY DEFINER; cross-org + capability + Team-gated.';
revoke execute on function mos.complete_process_run(uuid) from public, anon, authenticated;
grant  execute on function mos.complete_process_run(uuid) to authenticated;

-- DOWN: drop function if exists mos.complete_process_run(uuid), mos.resolve_pending_task(uuid,uuid), mos.spawn_process_run(uuid,uuid,date);
