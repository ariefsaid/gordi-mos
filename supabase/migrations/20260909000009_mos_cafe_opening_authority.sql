-- Apply the bounded process.start matrix to Café Opening's resolved canonical owning Team.
-- The existing spawn RPC first validates the requested branch Team, resolves the branch's canonical
-- kitchen/bar Team, and uses that Team in the unique occurrence key. The branch helper and due
-- surfaces must consume the same canonical predicate; otherwise a saved matrix grant/deny can be
-- advertised differently from the write path.

-- DOWN (manual, before production):
--   drop trigger process_runs_cafe_authority_guard on mos.process_runs;
--   drop function mos._guard_cafe_opening_process_start();
--   restore shared.cafe_opening_can_start(uuid), mos.cafe_opening_branches(), and
--   mos.due_process_runs() from 20260906000002_ops_cafe_opening_review_plan_rules.sql;
--   restore the prior Café Opening comment on mos.spawn_process_run(uuid,uuid,date).

-- The spawn RPC's early Café branch gate calls this helper before its unique INSERT. Repointing the
-- helper closes the idempotent-existing-run path as well as new inserts: a caller denied by the
-- canonical process.start matrix cannot learn or reuse an existing occurrence through spawn.
create or replace function shared.cafe_opening_can_start(p_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with canonical as (
    select shared.cafe_opening_team(p_branch_id) as team_id
  )
  select c.team_id is not null
     and shared.role_authority_allows('process.start', null, c.team_id, null)
    from canonical c
$$;
comment on function shared.cafe_opening_can_start(uuid) is
  'Café Opening start affordance: resolves the branch''s canonical live kitchen/bar Team and applies '
  'the effective process.start matrix to that actual owner. It does not infer authority from a '
  'requested sibling Team or a separate branch-membership role rule.';

create or replace function mos.cafe_opening_branches()
returns table(branch_id uuid, team_id uuid, team_name text, run_id uuid, run_status text)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, t.id, t.name, r.id, r.status
    from shared.branches b
    join shared.teams t on t.id = shared.cafe_opening_team(b.id)
    left join mos.work_lines wl
      on wl.org_id = b.org_id
     and wl.code = 'cafe_opening'
     and wl.type = 'process'
     and wl.archived_at is null
    left join mos.process_runs r
      on r.org_id = b.org_id
     and r.work_line_id = wl.id
     and r.owning_team_id = t.id
     and r.period_key = to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD')
   where b.org_id = shared.current_org_id()
     and b.archived_at is null
     and mos.can_start_process_for_team(t.id)
   order by b.name
$$;
comment on function mos.cafe_opening_branches() is
  'Branches the caller may start, using the canonical live kitchen/bar Team and the effective '
  'process.start matrix; includes today''s run when already started.';

create or replace function mos.due_process_runs()
returns table (work_line_id uuid, process_name text, owning_team_id uuid, team_name text, period_key text, scheduled_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  select wl.id, wl.name, coalesce(cafe.team_id, t.id), coalesce(cafe.team_name, t.name),
         to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD'),
         (now() at time zone 'Asia/Jakarta')::date
    from mos.work_lines wl
    join mos.process_cadences c
      on c.work_line_id = wl.id
     and c.active
     and c.cadence_kind = 'daily'
    join shared.teams t on t.org_id = wl.org_id and t.archived_at is null
    left join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    left join lateral (
      select ct.id as team_id, ct.name as team_name
        from shared.teams ct
       where ct.id = shared.cafe_opening_team(b.id)
    ) cafe on wl.code = 'cafe_opening'
   where wl.org_id = shared.current_org_id()
     and wl.type = 'process'
     and wl.archived_at is null
     and (
       wl.code <> 'cafe_opening'
       or (
         b.id is not null
         and t.id = cafe.team_id
         and mos.can_start_process_for_team(cafe.team_id)
       )
     )
     and (wl.code = 'cafe_opening' or mos.can_start_process_for_team(t.id))
     and not exists (
       select 1
         from mos.process_runs r
        where r.work_line_id = wl.id
          and r.owning_team_id = coalesce(cafe.team_id, t.id)
          and r.period_key = to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD')
     )
$$;
comment on function mos.due_process_runs() is
  'Due daily processes; Café Opening resolves its canonical Team and applies process.start to that '
  'owner, mirroring spawn_process_run and cafe_opening_branches.';

create or replace function mos._guard_cafe_opening_process_start()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_work_line_code text;
begin
  select w.code
    into v_work_line_code
    from mos.work_lines w
   where w.id = new.work_line_id
     and w.org_id = new.org_id;

  if v_work_line_code = 'cafe_opening'
     and not shared.role_authority_allows('process.start', null, new.owning_team_id, null) then
    raise exception 'not authorized to start this Café Opening'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_cafe_opening_process_start() is
  'Defense-in-depth for Café Opening spawn: after the RPC resolves the canonical branch Team, the '
  'effective process.start matrix must admit that actual owning Team. The requested sibling Team is '
  'never used for this check; ordinary Process rows are untouched. SECURITY INVOKER.';
revoke execute on function mos._guard_cafe_opening_process_start() from public, anon, authenticated;

create trigger process_runs_cafe_authority_guard
  before insert on mos.process_runs
  for each row execute function mos._guard_cafe_opening_process_start();

comment on function mos.spawn_process_run(uuid,uuid,date) is
  'Idempotent Process occurrence spawn. Ordinary Processes use the tenant-local process.start matrix '
  'and active owning-Team membership. Café Opening retains its branch gate and canonical Team, then '
  'the process.start matrix is enforced on that actual canonical owner before the unique occurrence '
  'insert. SECURITY DEFINER and RPC-only.';
