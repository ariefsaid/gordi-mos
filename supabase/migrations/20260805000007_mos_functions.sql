-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 3 of 4 for `mos`: reference data, RPCs and views (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Every callable surface `mos` exposes, plus the two derived views and the certified-metric seed.
--
-- The recurring shape, and the one thing to check on any change here: a SECURITY DEFINER function
-- bypasses RLS, so EVERY definer body below does its own org check FIRST, before any gate and before
-- any write. `shared.current_org_id()` is the only source of the caller's org; it is never a
-- parameter, because an org parameter on a definer function is an oracle.
--
-- EXECUTE defaults to PUBLIC in Postgres, so every function below is revoked from public/anon and
-- then granted back to `authenticated` explicitly. Both halves are needed: the revoke closes the
-- surface, the grant is what keeps the app working.
--
-- DOWN: see ...0005's DOWN (drop schema mos cascade).

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 0. Reference data — the certified-metric registry (ADR-0022 D6)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Migrations run BEFORE supabase/seed.sql on a fresh reset, so the real org may not exist yet. Seed
-- every org that exists at migration time; seed.sql repeats the same rows for the dev org after it
-- creates it. Same dual-seed pattern the branch catalog uses in the `shared` half.
insert into mos.certified_metrics (key, org_id, name, meaning, unit, grain, certified, certified_at)
select v.key, o.id, v.name, v.meaning, v.unit, v.grain, true, now()
from shared.orgs o
cross join (values
  (
    'cogs.budgeted',
    'Budgeted COGS',
    'A menu item''s BOM (recipe qty x materials) costed at the linked ingredient cost lines — the certified budgeted COGS that pricing and budgeting both consume (ADR-0022 D1).',
    'IDR', 'menu item'
  ),
  (
    'margin.gross_pct',
    'Gross margin %',
    'Projected gross margin at a candidate price against the linked certified budgeted COGS — (price - cogs) / price. Read-only pre-flight; MOS never sets a price (ADR-0022 D5).',
    'percent', 'menu item x price'
  )
) as v(key, name, meaning, unit, grain)
on conflict (org_id, key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Notifications — the one sanctioned cross-owner delivery path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER because delivering to ANOTHER person means writing a row the caller's own INSERT
-- policy forbids (that policy pins owner_id to the caller). This is the controlled seam: it asserts
-- the target is a same-org, non-archived person and then writes on their behalf. Everything else
-- about notifications stays caller-JWT and RLS; this is the single definer exception.
create or replace function mos.create_notification(
  p_owner    uuid,
  p_severity text,
  p_title    text,
  p_body     text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- The org wall. A caller in org A can never deliver into org B, so a cross-org @mention is not
  -- merely unauthorised but impossible; an archived person cannot be notified either.
  if not exists (
    select 1 from shared.people
     where id = p_owner
       and org_id = shared.current_org_id()
       and archived_at is null
  ) then
    raise exception 'create_notification: target % is not a current-org active person', p_owner
      using errcode = '42501';
  end if;

  insert into mos.notifications (owner_id, org_id, severity, title, body, metadata)
  values (p_owner, shared.current_org_id(), coalesce(p_severity, 'info'), p_title, p_body,
          coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function mos.create_notification(uuid, text, text, text, jsonb) is
  'The ONLY path that writes a notification for another owner (@mention delivery). SECURITY DEFINER, org-walled to a same-org non-archived target.';
revoke execute on function mos.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant  execute on function mos.create_notification(uuid, text, text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Signals — fan-out and the transactional post path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Synchronous fan-out. Author-only, recipients deduplicated and snapshotted at post (there is no
-- retroactive notify), capped at 50 so a mis-aimed @BU cannot broadcast the company, and idempotent:
-- a recipient who already holds a notification for THIS Signal is skipped, so a retry or a
-- double-tap cannot flood an inbox.
create or replace function mos.fan_out_signal_mention(p_signal_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sig        mos.signals;
  v_person     uuid;
  v_count      int := 0;
  v_recipients uuid[];
begin
  select * into v_sig from mos.signals where id = p_signal_id;
  if v_sig.id is null then
    raise exception 'signal not found' using errcode = 'P0002';
  end if;
  if v_sig.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot fan out a signal outside your org' using errcode = '42501';
  end if;
  if v_sig.author_id is distinct from shared.current_person_id() then
    raise exception 'only the author may fan out' using errcode = '42501';
  end if;

  -- @Person resolves to the person; @Team to its active members; @BU to active members of its child
  -- Teams PLUS holders of roles scoped to that BU. The @BU arms re-check signal.mention_bu rather
  -- than trusting that the INSERT checked it — fail-closed if a mention row ever arrives another way.
  select array_agg(distinct pid) into v_recipients from (
    select sm.target_person_id as pid from mos.signal_mentions sm
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'person'
    union
    select m.person_id from mos.signal_mentions sm
      join shared.team_memberships m on m.team_id = sm.target_team_id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'team'
        and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date)
    union
    select m2.person_id from mos.signal_mentions sm
      join shared.teams tt on tt.business_unit_id = sm.target_bu_id
      join shared.team_memberships m2 on m2.team_id = tt.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu'
        and shared.can('signal.mention_bu')
        and m2.effective_from <= current_date and (m2.effective_to is null or m2.effective_to >= current_date)
    union
    select pr.person_id from mos.signal_mentions sm
      join shared.roles r on r.business_unit_id = sm.target_bu_id
      join shared.person_roles pr on pr.role_id = r.id
      where sm.signal_id = p_signal_id and sm.revoked_at is null and sm.mention_kind = 'bu'
        and shared.can('signal.mention_bu')
  ) dedup
  where pid is not null and pid <> v_sig.author_id
    and not exists (
      select 1 from mos.notifications n
      where n.owner_id = dedup.pid
        and n.metadata ->> 'source' = 'signal_mention'
        and n.metadata #>> '{entity,id}' = p_signal_id::text);

  if v_recipients is null then return 0; end if;
  if array_length(v_recipients, 1) > 50 then
    raise exception 'fan-out exceeds cap of 50 recipients (%). Confirm before broadcasting.', array_length(v_recipients,1)
      using errcode = 'P0003';
  end if;

  foreach v_person in array v_recipients loop
    perform mos.create_notification(v_person, 'info', 'You were mentioned in a Signal',
      left(v_sig.body, 200), jsonb_build_object('source','signal_mention',
        'entity', jsonb_build_object('type','signal','id', v_sig.id, 'route', '/work/signals?record=' || v_sig.id)));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
comment on function mos.fan_out_signal_mention(uuid) is
  'Synchronous @mention fan-out (ADR-0050 D6). Author-only, org-walled, deduplicated, capped at 50, and idempotent — a recipient already notified for this Signal is skipped. SECURITY DEFINER.';
revoke execute on function mos.fan_out_signal_mention(uuid) from public, anon, authenticated;
grant  execute on function mos.fan_out_signal_mention(uuid) to authenticated;

-- The ONE transactional post path: signal + mentions + fan-out in a single statement, so a failure
-- anywhere rolls the Signal back and a retry is safe. Three separate PostgREST calls left a
-- committed Signal behind on a mid-sequence failure and the composer's retry double-posted.
--
-- SECURITY INVOKER, deliberately: both inserts already carry fail-closed RLS policies, so running as
-- the caller keeps THOSE as the authority instead of re-implementing a gate inside a definer body.
create or replace function mos.create_signal_with_mentions(
  p_body text, p_owning_team_id uuid, p_occurred_at timestamptz, p_mentions jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     uuid;
  v_m      jsonb;
  v_kind   text;
  v_target uuid;
begin
  -- Reject any out-of-org mention target before writing anything, so the caller gets one clear
  -- per-target error rather than a policy denial that names nothing.
  for v_m in select value from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) loop
    v_kind := v_m->>'kind'; v_target := (v_m->>'targetId')::uuid;
    if v_kind = 'person' then
      if not exists (select 1 from shared.people where id = v_target and org_id = shared.current_org_id()) then
        raise exception 'mention target person % is not in your org', v_target using errcode = '42501'; end if;
    elsif v_kind = 'team' then
      if not exists (select 1 from shared.teams where id = v_target and org_id = shared.current_org_id()) then
        raise exception 'mention target team % is not in your org', v_target using errcode = '42501'; end if;
    elsif v_kind = 'bu' then
      if not exists (select 1 from shared.business_units where id = v_target and org_id = shared.current_org_id()) then
        raise exception 'mention target bu % is not in your org', v_target using errcode = '42501'; end if;
    else
      raise exception 'unknown mention kind %', coalesce(v_kind, '(null)') using errcode = '22023';
    end if;
  end loop;

  -- The id is generated here rather than taken from RETURNING, and that is not a style choice:
  -- INSERT ... RETURNING re-applies the SELECT policy, whose definer read cannot see the row it just
  -- inserted within the same command, so RETURNING would spuriously trip the fail-closed read gate.
  v_id := gen_random_uuid();
  insert into mos.signals (id, body, owning_team_id, occurred_at)
  values (v_id, p_body, p_owning_team_id, p_occurred_at);

  insert into mos.signal_mentions (signal_id, mention_kind, target_person_id, target_team_id, target_bu_id)
  select v_id, m->>'kind',
    case when m->>'kind' = 'person' then (m->>'targetId')::uuid end,
    case when m->>'kind' = 'team'   then (m->>'targetId')::uuid end,
    case when m->>'kind' = 'bu'     then (m->>'targetId')::uuid end
  from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) as m;

  perform mos.fan_out_signal_mention(v_id);
  return v_id;
end;
$$;
comment on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) is
  'Transactional Signal post — signal + mentions + fan-out in one statement, so a retry cannot double-post. SECURITY INVOKER: the existing RLS INSERT policies stay the authority.';
revoke execute on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) from public, anon;
grant  execute on function mos.create_signal_with_mentions(text, uuid, timestamptz, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Processes — spawn, resolve, complete, and the scheduler-free due surface
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Idempotent occurrence spawn. Definer because it writes mos.process_runs and mos.tasks, both of
-- which are closed to a direct authenticated write on this path.
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
  v_run_id  uuid; v_created int := 0; v_pending int := 0;
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
  select * into v_team from shared.teams where id = p_owning_team_id and org_id = v_org;
  if v_team.id is null then raise exception 'owning team not found in org' using errcode = 'P0002'; end if;

  -- Both gates, always together: the capability says you may start processes at all, the Team check
  -- says you may start THIS one. `member` holds process.start, so the Team check is what stops a
  -- member starting an unrelated Team's process.
  if not (shared.can('process.start') and mos.can_start_process_for_team(p_owning_team_id)) then
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

create or replace function mos.resolve_pending_task(p_pending_id uuid, p_pic_person_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := shared.current_org_id();
  v_pend  mos.process_run_pending_tasks;
  v_run   mos.process_runs;
  v_td    mos.process_task_defs;
  v_team  shared.teams;
  v_wl    mos.work_lines;
  v_sup   uuid; v_task_id uuid; v_holders uuid[]; v_label text; v_pos int := 0;
begin
  select * into v_pend from mos.process_run_pending_tasks where id = p_pending_id for update;
  if v_pend.id is null then raise exception 'pending item not found' using errcode = 'P0002'; end if;
  if v_pend.org_id is distinct from v_org then
    raise exception 'cannot resolve outside your org' using errcode = '42501'; end if;
  -- The FOR UPDATE above plus this check are what stop two people resolving the same item into two
  -- tasks; the partial UNIQUE on unresolved rows backs it at the schema level.
  if v_pend.resolved_at is not null then
    raise exception 'pending item already resolved' using errcode = 'P0003'; end if;
  select * into v_run from mos.process_runs where id = v_pend.process_run_id;
  if not (shared.can('process.start') and mos.can_start_process_for_team(v_run.owning_team_id)) then
    raise exception 'not authorized to resolve this pending item' using errcode = '42501'; end if;
  if not exists (select 1 from shared.people where id = p_pic_person_id and org_id = v_org and archived_at is null) then
    raise exception 'chosen PIC is not a current-org active person' using errcode = '42501'; end if;
  -- When the ambiguity was "several holders", the choice must be one of THEM. A vacant step
  -- ('none') has no candidate list, so any active same-org person is a legitimate answer.
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
end;
$$;
comment on function mos.resolve_pending_task(uuid,uuid) is
  'A human resolves an ambiguous or vacant PIC by choosing a person, materialising the Task. SECURITY DEFINER; row-locked, org-checked, capability + Team gated, and candidate-checked when the ambiguity was "several holders".';
revoke execute on function mos.resolve_pending_task(uuid,uuid) from public, anon, authenticated;
grant  execute on function mos.resolve_pending_task(uuid,uuid) to authenticated;

create or replace function mos.complete_process_run(p_run_id uuid)
returns mos.process_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_run mos.process_runs;
begin
  select * into v_run from mos.process_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'run not found' using errcode = 'P0002'; end if;
  if v_run.org_id is distinct from v_org then
    raise exception 'cannot complete a run outside your org' using errcode = '42501'; end if;
  if not (shared.can('process.start') and mos.can_start_process_for_team(v_run.owning_team_id)) then
    raise exception 'not authorized to complete this run' using errcode = '42501'; end if;
  update mos.process_runs
     set status = 'completed', completed_at = now(), completed_by = shared.current_person_id(), updated_at = now()
   where id = p_run_id;
  select * into v_run from mos.process_runs where id = p_run_id;
  return v_run;
end;
$$;
comment on function mos.complete_process_run(uuid) is 'A human marks an occurrence complete. SECURITY DEFINER; org-checked, capability + Team gated.';
revoke execute on function mos.complete_process_run(uuid) from public, anon, authenticated;
grant  execute on function mos.complete_process_run(uuid) to authenticated;

-- Derived roll-up. No stored counts anywhere: a materialised progress number is a number that goes
-- stale, and this is the same count-roll-up mechanic OD-WAY-33 chose for the cascade.
create or replace view mos.process_run_rollup as
select
  r.id as process_run_id, r.org_id, r.caption, r.scheduled_date, r.status,
  count(t.id) filter (where t.archived_at is null)                              as total,
  count(t.id) filter (where t.archived_at is null and t.status = 'Open')        as open,
  count(t.id) filter (where t.archived_at is null and t.status = 'In Progress') as in_progress,
  count(t.id) filter (where t.archived_at is null and t.status = 'Blocked')     as blocked,
  count(t.id) filter (where t.archived_at is null and t.status = 'Done')        as done,
  count(t.id) filter (where t.archived_at is null and t.status <> 'Done'
                        and t.due_date < (now() at time zone 'Asia/Jakarta')::date) as overdue,
  (select count(*) from mos.process_run_pending_tasks p
    where p.process_run_id = r.id and p.resolved_at is null)                    as pending_unresolved,
  round(coalesce(count(t.id) filter (where t.archived_at is null and t.status = 'Done')::numeric
        / nullif(count(t.id) filter (where t.archived_at is null), 0), 0) * 100, 1) as completion_pct
from mos.process_runs r
left join mos.tasks t on t.process_run_id = r.id
group by r.id, r.org_id, r.caption, r.scheduled_date, r.status;
-- security_invoker so the underlying process_runs / tasks policies scope the view per caller. A view
-- defaults to running as its OWNER, which would hand every caller every org's counts.
alter view mos.process_run_rollup set (security_invoker = true);
comment on view mos.process_run_rollup is 'Derived per-occurrence roll-up — no stored counts. security_invoker, so the base-table RLS scopes it per caller.';
grant select on mos.process_run_rollup to authenticated;

-- The "due" surface without a scheduler: daily-cadence processes whose today-in-WIB occurrence has
-- not been spawned, for a Team the caller may start. Weekly and monthly are started by explicit date
-- through the RPC, so nothing here needs a cron job to be correct.
create or replace function mos.due_process_runs()
returns table (work_line_id uuid, process_name text, owning_team_id uuid, team_name text, period_key text, scheduled_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  select wl.id, wl.name, t.id, t.name,
         to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD'),
         (now() at time zone 'Asia/Jakarta')::date
  from mos.work_lines wl
  join mos.process_cadences c on c.work_line_id = wl.id and c.active and c.cadence_kind = 'daily'
  join shared.teams t on t.org_id = wl.org_id and t.archived_at is null
  where wl.org_id = shared.current_org_id() and wl.type = 'process' and wl.archived_at is null
    and mos.can_start_process_for_team(t.id)
    and not exists (
      select 1 from mos.process_runs r
      where r.work_line_id = wl.id and r.owning_team_id = t.id
        and r.period_key = to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD'));
$$;
comment on function mos.due_process_runs() is 'Scheduler-free due surface: daily processes with an unspawned today-WIB occurrence, for a Team the caller may start.';
revoke execute on function mos.due_process_runs() from public, anon;
grant  execute on function mos.due_process_runs() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Composed views — the DB-side aggregate over a compiled query
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- An in-memory aggregate over a capped fetch is a LOWER BOUND, not an aggregate. This computes the
-- real SQL aggregate over the full predicate.
--
-- SECURITY POSTURE, and all three parts matter:
--   * SECURITY INVOKER + search_path = '' — base-table RLS still fires, so the aggregate can never
--     count a row the caller could not read.
--   * TWO trust boundaries. The client's entity whitelist is the first; the hard-coded dispatch
--     below is the SECOND and the one that counts. Identifiers (schema, table, column) come ONLY
--     from these allow-sets via format('%I'), never from the payload. Filter VALUES are inlined with
--     format('%L'), which produces a properly-escaped quoted literal, so a value cannot break out.
--   * Ceilings: a 2s statement_timeout, and any entity marked as needing a time range is rejected
--     without one — an unbounded scan over a reporting table is a denial-of-service, not a query.
create or replace function mos.aggregate_compiled(p_compiled jsonb)
returns table(group_key jsonb, agg_value numeric)
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_entity         text := p_compiled->>'entity';
  v_schema         text;
  v_table          text;
  v_group_by       text := p_compiled->>'resolvedGroupBy';
  v_agg_fn         text := p_compiled->'resolvedAggregate'->>'fn';
  v_agg_col        text := p_compiled->'resolvedAggregate'->>'column';
  v_agg_alias      text := p_compiled->'resolvedAggregate'->>'alias';
  v_order_col      text := p_compiled->'resolvedOrderBy'->>'column';
  v_order_dir      text := p_compiled->'resolvedOrderBy'->>'dir';
  v_has_time_range boolean := (p_compiled ? 'resolvedTimeRange');
  v_filters        jsonb := coalesce(p_compiled->'resolvedFilters', '[]'::jsonb);
  v_requires_time  boolean := false;
  v_allowed        text[];
  v_numeric        text[];
  v_groupable      text[];
  v_sql            text;
  v_where          text := '';
  v_select         text;
  v_group_clause   text := '';
  v_order_clause   text := '';
  v_agg_expr       text;
  v_filter_count   int := jsonb_array_length(v_filters);
  v_i              int;
  v_f              jsonb;
  v_col            text;
  v_op             text;
  v_val            text;
  v_val_from       text;
  v_val_to         text;
  v_arr            text[];
  v_j              int;
begin
  -- ── The second trust boundary: dispatch plus an allow-set per whitelisted entity ────────────
  -- DRIFT PAIR: this dispatch must stay in step with the client's entity whitelist on schema,
  -- table, allowed, numeric, groupable and requiresTimeRange for every entity. A column added on
  -- one side must be added on the other. sales_margin_daily.bom_coverage_pct is intentionally NOT
  -- numeric — it is a ratio and summing it is meaningless; do not "fix" that by adding it here.
  case v_entity
    when 'sales_daily_revenue' then
      v_schema := 'reporting'; v_table := 'sales_daily_revenue'; v_requires_time := true;
      v_allowed   := array['revenue_date','channel','esb_code','branch_code','branch_name','transactions','clean_revenue','snapshot_as_of'];
      v_numeric   := array['transactions','clean_revenue'];
      v_groupable := array['channel','esb_code','branch_code'];
    when 'sales_margin_daily' then
      v_schema := 'reporting'; v_table := 'sales_margin_daily'; v_requires_time := true;
      v_allowed   := array['margin_date','esb_code','branch_code','branch_name','revenue','cogs_interim_sm','cogs_budget_bom','margin_interim','margin_interim_pct','bom_coverage_pct','snapshot_as_of'];
      v_numeric   := array['revenue','cogs_interim_sm','cogs_budget_bom','margin_interim','margin_interim_pct'];
      v_groupable := array['esb_code','branch_code'];
    when 'tasks' then
      v_schema := 'mos'; v_table := 'tasks'; v_requires_time := true;
      v_allowed   := array['id','title','business_unit_id','team_id','status','responsible_person_id','accountable_person_id','due_date','last_activity_at','archived_at','created_at','updated_at','objective_id','work_line_id'];
      v_numeric   := array[]::text[];
      v_groupable := array['status','business_unit_id','team_id','responsible_person_id','objective_id','work_line_id'];
    when 'weekly_updates' then
      v_schema := 'mos'; v_table := 'weekly_updates'; v_requires_time := true;
      v_allowed   := array['id','person_id','week_start','status','submitted_at','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array['status','person_id'];
    when 'objectives' then
      v_schema := 'mos'; v_table := 'objectives'; v_requires_time := false;
      v_allowed   := array['id','name','archived_at','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array[]::text[];
    when 'work_lines' then
      v_schema := 'mos'; v_table := 'work_lines'; v_requires_time := false;
      -- objective_id is both readable and groupable here, which is what makes the DD-WAY-15 edge
      -- usable for roll-up ("how many Projects/Processes per Objective") rather than only for a join.
      v_allowed   := array['id','name','type','objective_id','archived_at','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array['type','objective_id'];
    when 'people' then
      v_schema := 'shared'; v_table := 'people'; v_requires_time := false;
      v_allowed   := array['id','full_name','email','archived_at','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array[]::text[];
    when 'business_units' then
      v_schema := 'shared'; v_table := 'business_units'; v_requires_time := false;
      v_allowed   := array['id','name','created_at','updated_at'];
      v_numeric   := array[]::text[];
      v_groupable := array[]::text[];
    else
      raise invalid_parameter_value using
        message = 'aggregate_compiled: entity not whitelisted';
  end case;

  if v_requires_time and not v_has_time_range then
    raise invalid_parameter_value using
      message = 'aggregate_compiled: entity requires a resolvedTimeRange';
  end if;

  if v_agg_fn is null or v_agg_fn = '' then
    raise invalid_parameter_value using message = 'aggregate_compiled: resolvedAggregate.fn required';
  end if;
  if v_agg_fn not in ('count','sum','avg','min','max') then
    raise invalid_parameter_value using message = 'aggregate_compiled: unsupported aggregate fn';
  end if;
  -- count operates on rows; every other function needs a column that is actually numeric.
  if v_agg_fn <> 'count' then
    if v_agg_col is null or v_agg_col = '' then
      raise invalid_parameter_value using message = 'aggregate_compiled: resolvedAggregate.column required for non-count fn';
    end if;
    if not (v_agg_col = any(v_numeric)) then
      raise invalid_parameter_value using
        message = 'aggregate_compiled: aggregate column not in numeric allow-set';
    end if;
  end if;

  if v_group_by is not null and v_group_by <> '' then
    if not (v_group_by = any(v_groupable)) then
      raise invalid_parameter_value using
        message = 'aggregate_compiled: groupBy column not in groupable allow-set';
    end if;
  end if;

  -- Validate every filter column and operator BEFORE building any SQL, so a rejected payload never
  -- reaches string assembly at all.
  for v_i in 0..v_filter_count - 1 loop
    v_f := v_filters->v_i;
    v_col := v_f->>'column';
    v_op := lower(coalesce(v_f->>'op', ''));
    if v_col is null or not (v_col = any(v_allowed)) then
      raise invalid_parameter_value using
        message = 'aggregate_compiled: filter column not in allow-set';
    end if;
    if v_op not in ('eq','neq','in','gt','gte','lt','lte','between','date-range') then
      raise invalid_parameter_value using message = 'aggregate_compiled: unsupported filter op';
    end if;
  end loop;

  if v_agg_fn = 'count' then
    v_agg_expr := 'count(*)';
  else
    v_agg_expr := format('%s(%I)', v_agg_fn, v_agg_col);
  end if;

  if v_group_by is not null and v_group_by <> '' then
    v_select := format(
      'select to_jsonb(%I) as group_key, %s::numeric as agg_value from %I.%I',
      v_group_by, v_agg_expr, v_schema, v_table);
    v_group_clause := format(' group by %I', v_group_by);
  else
    v_select := format(
      'select null::jsonb as group_key, %s::numeric as agg_value from %I.%I',
      v_agg_expr, v_schema, v_table);
  end if;

  for v_i in 0..v_filter_count - 1 loop
    v_f := v_filters->v_i;
    v_col := v_f->>'column';
    v_op := lower(v_f->>'op');
    if v_i = 0 then v_where := v_where || ' where '; else v_where := v_where || ' and '; end if;

    case v_op
      when 'eq','neq','gt','gte','lt','lte' then
        v_val := coalesce(v_f->>'value', '');
        v_where := v_where || format('%I %s %L', v_col,
          case v_op when 'eq' then '=' when 'neq' then '<>' when 'gt' then '>'
                    when 'gte' then '>=' when 'lt' then '<' when 'lte' then '<=' end,
          v_val);
      when 'in' then
        v_arr := array[]::text[];
        for v_j in 0..jsonb_array_length(v_f->'value') - 1 loop
          v_arr := array_append(v_arr, v_f->'value'->>v_j);
        end loop;
        v_where := v_where || format('%I = any(%L::text[])', v_col, v_arr);
      when 'between','date-range' then
        v_val_from := v_f #>> '{value,0}';
        v_val_to   := v_f #>> '{value,1}';
        v_where := v_where || format('%I between %L and %L', v_col, v_val_from, v_val_to);
      else
        raise invalid_parameter_value using message = 'aggregate_compiled: unreachable filter op';
    end case;
  end loop;

  if v_has_time_range then
    v_col := p_compiled->'resolvedTimeRange'->>'column';
    if v_col is null or not (v_col = any(v_allowed)) then
      raise invalid_parameter_value using
        message = 'aggregate_compiled: timeRange column not in allow-set';
    end if;
    if v_filter_count = 0 then v_where := v_where || ' where '; else v_where := v_where || ' and '; end if;
    v_where := v_where || format('%I between %L and %L',
      v_col,
      p_compiled->'resolvedTimeRange'->>'from',
      p_compiled->'resolvedTimeRange'->>'to');
  end if;

  -- ORDER BY may only target the reduced output, never an arbitrary column: ordering by something
  -- not in the result would need it in the GROUP BY and would silently change the aggregate.
  if v_order_col is not null and v_order_col <> '' then
    if v_order_col = coalesce(v_group_by, '') then
      v_order_clause := format(' order by group_key %s', case when v_order_dir = 'asc' then 'asc' else 'desc' end);
    elsif v_order_col = coalesce(v_agg_alias, '') then
      v_order_clause := format(' order by agg_value %s', case when v_order_dir = 'asc' then 'asc' else 'desc' end);
    else
      raise invalid_parameter_value using
        message = 'aggregate_compiled: orderBy must target the groupBy or aggregate alias';
    end if;
  end if;

  v_sql := v_select || v_where || v_group_clause || v_order_clause;
  return query execute v_sql;
end;
$$;
comment on function mos.aggregate_compiled(jsonb) is
  'DB-side aggregate over a compiled query. SECURITY INVOKER so base-table RLS fires; the hard-coded entity dispatch is the second trust boundary; identifiers via format(%I) and values via format(%L); 2s timeout and a required time bound on the reporting entities.';
revoke execute on function mos.aggregate_compiled(jsonb) from public, anon;
grant  execute on function mos.aggregate_compiled(jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Money — budget capture
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create type mos.budget_line_input as (
  ingredient_esb_code text,
  recipe_qty numeric,
  qty_unit text
);
comment on type mos.budget_line_input is
  'Input for one budget line: ingredient plus quantity, and deliberately NO unit cost — link, never copy.';

-- The single write path for budgets. Two guarantees it exists to provide, both of which a direct
-- table write would skip, which is why `authenticated` holds no write grant on either table:
--   (a) the total is RECOMPUTED server-side from the linked cost lines, so a client cannot assert
--       an arbitrary COGS figure and have it stored as certified;
--   (b) owning_bu_id is checked same-org — the column is an existence-only FK and this body runs
--       with RLS bypassed, so without the check a budget could hang off another org's BU.
create or replace function mos.capture_budget(
  p_menu_item_esb_code   text,
  p_menu_item_name       text,
  p_scenario_label       text,
  p_scenario_type        text,
  p_owning_bu_id         uuid,
  p_cost_basis_as_of     timestamptz,
  p_certified_metric_key text default 'cogs.budgeted',
  p_is_complete          boolean default true,
  p_notes                text default null,
  p_lines                mos.budget_line_input[] default array[]::mos.budget_line_input[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id    uuid;
  v_person_id uuid;
  v_budget_id uuid;
  v_total     numeric(14,4);
  v_missing   text;
begin
  if not shared.can('cogs.write') then
    raise exception 'capture_budget requires can(''cogs.write'') capability (finance/admin)' using errcode = '42501';
  end if;

  v_org_id    := shared.current_org_id();
  v_person_id := shared.current_person_id();

  if not exists (
    select 1 from shared.business_units bu
    where bu.id = p_owning_bu_id and bu.org_id = v_org_id
  ) then
    raise exception 'owning_bu_id must belong to the caller''s org' using errcode = '23514';
  end if;

  if p_scenario_type not in ('baseline','promo','new_branch','menu') then
    raise exception 'invalid scenario_type: %', p_scenario_type using errcode = 'P0003';
  end if;

  insert into mos.budgets (
    org_id, menu_item_esb_code, menu_item_name, scenario_label, scenario_type, owning_bu_id,
    total_budgeted_cogs, cost_basis_as_of, certified_metric_key, is_complete, notes, created_by
  ) values (
    v_org_id, p_menu_item_esb_code, p_menu_item_name, p_scenario_label, p_scenario_type, p_owning_bu_id,
    0, -- placeholder; recomputed below once the lines exist
    p_cost_basis_as_of, p_certified_metric_key, p_is_complete, p_notes, v_person_id
  ) returning id into v_budget_id;

  if cardinality(p_lines) > 0 then
    insert into mos.budget_lines (org_id, budget_id, ingredient_esb_code, recipe_qty, qty_unit)
      select v_org_id, v_budget_id, (l.ingredient_esb_code)::text, l.recipe_qty, l.qty_unit
      from unnest(p_lines) l;
  end if;

  -- A referenced ingredient with no cost line FAILS LOUD. Treating it as zero would quietly produce
  -- a budget that looks certified and is wrong — the exact failure the certified-metric registry
  -- exists to prevent.
  v_total := 0;
  for v_missing in
    select distinct bl.ingredient_esb_code
    from mos.budget_lines bl
    left join reporting.ingredient_cost_lines cl
           on cl.org_id = bl.org_id
          and cl.ingredient_esb_code = bl.ingredient_esb_code
    where bl.budget_id = v_budget_id
      and bl.org_id = v_org_id
      and cl.ingredient_esb_code is null
  loop
    raise exception 'missing or uncertified cost line for ingredient: % (org_id: %)', v_missing, v_org_id
      using errcode = 'P0003';
  end loop;

  select coalesce(sum(bl.recipe_qty * cl.unit_cost), 0)::numeric(14,4)
    into v_total
  from mos.budget_lines bl
  join reporting.ingredient_cost_lines cl
    on cl.org_id = bl.org_id
   and cl.ingredient_esb_code = bl.ingredient_esb_code
  where bl.budget_id = v_budget_id
    and bl.org_id = v_org_id;

  update mos.budgets
     set total_budgeted_cogs = v_total
   where id = v_budget_id
     and org_id = v_org_id;

  return v_budget_id;
end;
$$;
comment on function mos.capture_budget(text, text, text, text, uuid, timestamptz, text, boolean, text, mos.budget_line_input[]) is
  'The single write path for budgets: one transaction, a server-recomputed total from the linked cost lines (no client-trusted figure), a same-org owning BU, and a loud failure on a missing cost line. Capability gate can(''cogs.write''). SECURITY DEFINER.';
-- `revoke execute` rather than `revoke all` so the CI definer-revoke lint's literal match succeeds;
-- EXECUTE is the only grantable privilege on a function, so the two are equivalent here.
revoke execute on function mos.capture_budget(text, text, text, text, uuid, timestamptz, text, boolean, text, mos.budget_line_input[]) from public, anon, authenticated;
grant  execute on function mos.capture_budget(text, text, text, text, uuid, timestamptz, text, boolean, text, mos.budget_line_input[]) to authenticated;
-- reporting.ingredient_cost_lines is authored by the `reporting` pass. A plpgsql body resolves table
-- references at run time, so this compiles now and starts resolving the moment that schema lands.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. AR — the settlement transition RPC and the reconciliation views
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠ Dark and carried as-is (DD-WAY-16). The verbs below encode chasing, which OD-WAY-34 rules is not
-- what this record is for; they survive here only because reshaping now would mean reshaping twice.
--
-- The single gated write point for every transition. Shape: lock -> cross-org guard -> authorisation
-- -> state machine + required fields -> write the audited event -> recompute the balance -> set the
-- state. The lock is first because a balance recomputed from a row someone else is also moving is a
-- lost update wearing a correct-looking number.
create or replace function mos.transition_follow_up(p_follow_up_id uuid, p_transition text, p_options jsonb)
returns mos.follow_ups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fu       mos.follow_ups;
  v_lane     text;
  v_state    text;
  v_balance  numeric(14,2);
  v_amt      numeric(14,2);
  v_cash     date;
  v_evid     text;
  v_promise  date;
  v_to_state text;
  v_note     text;
begin
  select * into v_fu from mos.follow_ups where id = p_follow_up_id for update;
  if v_fu.id is null then
    raise exception 'follow-up not found' using errcode = 'P0002';
  end if;

  if v_fu.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot transition a follow-up outside your org' using errcode = '42501';
  end if;

  v_lane    := v_fu.lane;
  v_state   := v_fu.state;
  v_balance := v_fu.running_balance;
  v_note    := nullif(p_options ->> 'note', '');

  case p_transition
    when 'chase' then
      if not mos.can_work_lane(v_lane) then
        raise exception 'not authorized to advance lane %', v_lane using errcode = '42501';
      end if;
      if v_state not in ('open','chased','promised') then
        raise exception 'cannot chase from state %', v_state using errcode = 'P0003';
      end if;
      v_to_state := 'chased';

    when 'promise' then
      if not mos.can_work_lane(v_lane) then
        raise exception 'not authorized to advance lane %', v_lane using errcode = '42501';
      end if;
      if v_state not in ('open','chased','promised') then
        raise exception 'cannot promise from state %', v_state using errcode = 'P0003';
      end if;
      begin
        v_promise := nullif(p_options ->> 'promise_date', '')::date;
      exception when others then
        raise exception 'promise_date is required (invalid)' using errcode = 'P0003';
      end;
      if v_promise is null then
        raise exception 'promise_date is required' using errcode = 'P0003';
      end if;
      v_to_state := 'promised';

    when 'partial' then
      if not mos.can_work_lane(v_lane) then
        raise exception 'not authorized to advance lane %', v_lane using errcode = '42501';
      end if;
      if v_state not in ('open','chased','promised','partial') then
        raise exception 'cannot record a partial from state %', v_state using errcode = 'P0003';
      end if;
      begin
        v_amt := nullif(p_options ->> 'amount', '')::numeric;
      exception when others then
        raise exception 'partial requires a numeric amount > 0' using errcode = 'P0003';
      end;
      begin
        v_cash := nullif(p_options ->> 'cash_in_date', '')::date;
      exception when others then
        raise exception 'partial requires a valid cash_in_date' using errcode = 'P0003';
      end;
      v_evid := nullif(p_options ->> 'evidence', '');
      if v_amt is null or v_amt <= 0 then
        raise exception 'partial requires amount > 0' using errcode = 'P0003';
      end if;
      if v_cash is null then
        raise exception 'partial requires cash_in_date' using errcode = 'P0003';
      end if;
      if v_evid is null or btrim(v_evid) = '' then
        raise exception 'partial requires evidence' using errcode = 'P0003';
      end if;
      if v_amt > v_balance then
        raise exception 'partial amount % exceeds running balance %', v_amt, v_balance using errcode = 'P0003';
      end if;
      v_balance := v_balance - v_amt;
      v_to_state := 'partial';

    when 'settle' then
      if not mos.can_work_lane(v_lane) then
        raise exception 'not authorized to advance lane %', v_lane using errcode = '42501';
      end if;
      if v_state not in ('open','chased','promised','partial') then
        raise exception 'cannot settle from state %', v_state using errcode = 'P0003';
      end if;
      if v_balance <= 0 then
        raise exception 'nothing to settle (balance already 0)' using errcode = 'P0003';
      end if;
      begin
        v_amt := nullif(p_options ->> 'amount', '')::numeric;
      exception when others then
        raise exception 'settle requires a numeric amount' using errcode = 'P0003';
      end;
      -- Defaults to the remaining balance; if supplied it must EQUAL it. A settle that leaves money
      -- outstanding is a partial, and conflating the two is how a balance drifts.
      if v_amt is null then
        v_amt := v_balance;
      elsif v_amt <> v_balance then
        raise exception 'settle amount % must equal running balance %', v_amt, v_balance using errcode = 'P0003';
      end if;
      begin
        v_cash := nullif(p_options ->> 'cash_in_date', '')::date;
      exception when others then
        raise exception 'settle requires a valid cash_in_date' using errcode = 'P0003';
      end;
      v_evid := nullif(p_options ->> 'evidence', '');
      if v_cash is null then
        raise exception 'settle requires cash_in_date' using errcode = 'P0003';
      end if;
      if v_evid is null or btrim(v_evid) = '' then
        raise exception 'settle requires evidence' using errcode = 'P0003';
      end if;
      v_balance := 0;
      v_to_state := 'settled';

    when 'confirm' then
      -- Confirmation is Finance's, not the chaser's: the person who says money arrived is not the
      -- person who chased it. Capability-gated rather than lane-gated for exactly that reason.
      if not shared.can('followup.confirm') then
        raise exception 'confirm requires the followup.confirm capability (finance/admin)' using errcode = '42501';
      end if;
      if v_state <> 'settled' then
        raise exception 'can only confirm a settled follow-up (current: %)', v_state using errcode = 'P0003';
      end if;
      v_to_state := 'confirmed';

    else
      raise exception 'unknown transition %', p_transition using errcode = 'P0003';
  end case;

  insert into mos.follow_up_events
    (org_id, follow_up_id, transition, from_state, to_state, amount, cash_in_date, evidence, promise_date, note, actor_person_id)
  values
    (v_fu.org_id, v_fu.id, p_transition, v_state, v_to_state,
     case when p_transition in ('partial','settle') then v_amt     else null end,
     case when p_transition in ('partial','settle') then v_cash    else null end,
     case when p_transition in ('partial','settle') then v_evid    else null end,
     case when p_transition = 'promise'             then v_promise else null end,
     v_note,
     shared.current_person_id());

  update mos.follow_ups
     set state           = v_to_state,
         running_balance = v_balance,
         promise_date    = case when p_transition = 'promise' then v_promise else v_fu.promise_date end,
         updated_at      = now()
   where id = v_fu.id;

  select * into v_fu from mos.follow_ups where id = p_follow_up_id;
  return v_fu;
end;
$$;
comment on function mos.transition_follow_up(uuid, text, jsonb) is
  'The single gated write point for a settlement transition: lock, cross-org guard, lane or capability gate, state machine plus required-field validation, audited event, recomputed balance, new state. SECURITY DEFINER.';
revoke execute on function mos.transition_follow_up(uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function mos.transition_follow_up(uuid, text, jsonb) to authenticated;

-- MOS-side cash-landed truth: the sum of payment events per counterparty and cash-in month. This is
-- the per-invoice grain that a hand-kept spreadsheet is doing today.
create or replace view mos.follow_up_recon_summary as
select
  fu.org_id,
  fu.counterparty,
  to_char(ev.cash_in_date, 'YYYY-MM') as period,
  sum(ev.amount)                      as mos_amount,
  count(*)                            as payment_events
from mos.follow_up_events ev
join mos.follow_ups fu on fu.id = ev.follow_up_id
where ev.transition in ('partial','settle')
group by fu.org_id, fu.counterparty, to_char(ev.cash_in_date, 'YYYY-MM');
comment on view mos.follow_up_recon_summary is
  'MOS-side settlement truth: the sum of partial and settle amounts per counterparty and cash-in month.';

-- The drift check. A FULL OUTER JOIN rather than a left join on purpose: an ERP reduction with no
-- MOS counterpart is just as much an exception as the reverse, and a left join would hide half of
-- them. With the ERP feed empty every MOS row shows as unmatched, which is honest — those
-- settlements genuinely are not reflected in the aggregate yet.
create or replace view mos.follow_up_recon_drift as
select
  coalesce(s.org_id, e.org_id)                 as org_id,
  coalesce(s.counterparty, e.counterparty)     as counterparty,
  coalesce(s.period, e.period)                 as period,
  coalesce(s.mos_amount, 0)                    as mos_amount,
  coalesce(e.esb_reduction_amount, 0)          as esb_amount,
  coalesce(s.mos_amount, 0) - coalesce(e.esb_reduction_amount, 0) as drift,
  (coalesce(s.mos_amount, 0) <> coalesce(e.esb_reduction_amount, 0)) as is_drift
from mos.follow_up_recon_summary s
full outer join reporting.esb_ar_reduction e
  on e.org_id = s.org_id and e.counterparty = s.counterparty and e.period = s.period;
comment on view mos.follow_up_recon_drift is
  'Reconciliation drift: MOS cash-landed against the ERP aggregate AR reduction, per counterparty and period. Any non-zero drift or unmatched side is a Finance exception.';

-- security_invoker on both, so the underlying RLS scopes them per caller: a chaser sees only their
-- lane, Finance sees the whole reconciliation.
alter view mos.follow_up_recon_summary set (security_invoker = true);
alter view mos.follow_up_recon_drift   set (security_invoker = true);

grant select on mos.follow_up_recon_summary, mos.follow_up_recon_drift to authenticated;
