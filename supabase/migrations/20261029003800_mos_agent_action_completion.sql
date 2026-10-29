-- Approved assistant writes and their replay evidence commit in one caller transaction.
-- DOWN: revert the edge caller, then apply the matching supabase/rollbacks file.
begin;
create function mos.execute_agent_approved_write(
  p_run_id uuid, p_event_id uuid, p_seq integer, p_pending_id text,
  p_tool_call_id text, p_name text, p_args jsonb, p_args_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_id uuid;
  v_update_id uuid;
  v_replayed boolean;
  v_field text;
begin
  if p_name is null or p_name not in ('create_task', 'post_update')
     or jsonb_typeof(p_args) is distinct from 'object'
     or p_args_hash is null or p_args_hash = ''
     or p_pending_id is null or p_tool_call_id is null or p_seq is null then
    raise exception 'unsupported approved action' using errcode = '22023';
  end if;

  perform 1 from mos.agent_runs r
    where r.id = p_run_id and r.org_id = shared.current_org_id()
      and r.owner_id = shared.current_person_id()
    for update;
  if not found then
    raise exception 'owned run required' using errcode = '42501';
  end if;

  if p_name = 'create_task' then
    if jsonb_typeof(p_args->'title') is distinct from 'string'
       or btrim(p_args->>'title') = '' or length(p_args->>'title') > 300 then
      raise exception 'invalid task title' using errcode = '22023';
    end if;
    foreach v_field in array array['businessUnitId','responsiblePersonId','accountablePersonId'] loop
      if jsonb_typeof(p_args->v_field) is distinct from 'string' or p_args->>v_field = '' then
        raise exception 'missing task reference' using errcode = '22023';
      end if;
    end loop;
    foreach v_field in array array['dueDate','objectiveId','workLineId','description'] loop
      if p_args ? v_field and jsonb_typeof(p_args->v_field) is distinct from 'string' then
        raise exception 'invalid optional task field' using errcode = '22023';
      end if;
    end loop;
    if (p_args ? 'dueDate' and p_args->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$')
       or length(p_args->>'description') > 2000 then
      raise exception 'invalid task field' using errcode = '22023';
    end if;
  else
    if jsonb_typeof(p_args->'label') is distinct from 'string'
       or btrim(p_args->>'label') = '' or length(p_args->>'label') > 300
       or jsonb_typeof(p_args->'progress') is distinct from 'string'
       or p_args->>'progress' not in ('done','in_progress','blocked')
       or jsonb_typeof(p_args->'weekStart') is distinct from 'string'
       or p_args->>'weekStart' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'invalid update fields or stored week' using errcode = '22023';
    end if;
  end if;

  -- Match historical A1 hashes as well as stored inputs; the latter keeps direct callers
  -- from changing the hash to repeat the same action in a retained run.
  select e.payload->'result' into v_result from mos.agent_events e
    where e.run_id = p_run_id and e.type = 'tool'
      and e.tool_name = p_name and e.tool_status = 'completed'
      and (e.tool_args_hash = p_args_hash or e.payload->'input' = p_args)
    order by e.seq limit 1;
  v_replayed := found;
  if v_replayed then
    if jsonb_typeof(v_result) is distinct from 'object' or jsonb_typeof(v_result->'id') is distinct from 'string' then
      raise exception 'completed result unavailable' using errcode = '22023';
    end if;
  elsif p_name = 'create_task' then
    insert into mos.tasks(title, business_unit_id, responsible_person_id,
      accountable_person_id, created_by, due_date, objective_id, work_line_id,
      description, consulted_person_ids, informed_person_ids)
    values (p_args->>'title', (p_args->>'businessUnitId')::uuid,
      (p_args->>'responsiblePersonId')::uuid, (p_args->>'accountablePersonId')::uuid,
      shared.current_person_id(), (p_args->>'dueDate')::date,
      (p_args->>'objectiveId')::uuid, (p_args->>'workLineId')::uuid,
      p_args->>'description', '{}', '{}') returning id into v_id;
    insert into mos.task_events(task_id, actor_person_id, event_type)
      values (v_id, shared.current_person_id(), 'created');
    v_result := jsonb_build_object('id', v_id);
  else
    select id into v_update_id from mos.weekly_updates
      where org_id = shared.current_org_id() and person_id = shared.current_person_id()
        and week_start = (p_args->>'weekStart')::date;
    if not found then
      insert into mos.weekly_updates(person_id, week_start, summary, status, created_by)
        values (shared.current_person_id(), (p_args->>'weekStart')::date, '', 'draft', shared.current_person_id())
        on conflict (org_id, person_id, week_start) do nothing
        returning id into v_update_id;
      if v_update_id is null then
        select id into v_update_id from mos.weekly_updates
          where org_id = shared.current_org_id() and person_id = shared.current_person_id()
            and week_start = (p_args->>'weekStart')::date;
      end if;
    end if;
    if v_update_id is null then
      raise exception 'own update required' using errcode = '42501';
    end if;
    insert into mos.weekly_update_items(weekly_update_id, label, progress, position)
      values (v_update_id, p_args->>'label', p_args->>'progress', 0) returning id into v_id;
    v_result := jsonb_build_object('id', v_id);
  end if;

  insert into mos.agent_events(id, run_id, seq, type, payload, tool_name, tool_args_hash, tool_status)
    values (p_event_id, p_run_id, p_seq, 'tool',
      jsonb_build_object('name', p_name, 'pendingId', p_pending_id, 'input', p_args,
        'result', v_result, 'tool_call_id', p_tool_call_id), p_name, p_args_hash, 'completed');
  return jsonb_build_object('result', v_result, 'replayed', v_replayed);
end;
$$;
revoke all on function mos.execute_agent_approved_write(uuid,uuid,integer,text,text,text,jsonb,text) from public, anon, service_role;
grant execute on function mos.execute_agent_approved_write(uuid,uuid,integer,text,text,text,jsonb,text) to authenticated;
commit;
