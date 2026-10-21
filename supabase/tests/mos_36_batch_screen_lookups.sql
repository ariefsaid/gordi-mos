begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
reset role;
insert into mos.process_runs
  (id, org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
   definition_version, spec_snapshot, started_by)
values
  ('00000000-0000-0000-0000-00000000a900',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c001',
   '00000000-0000-0000-0000-000000005b01',
   '2026-03-19', 'Batch authority parity', date '2026-03-19', 1, '{}'::jsonb,
   '00000000-0000-0000-0000-00000000f001');

select ok((
  select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname, p.proname) in (
     ('mos', 'process_occurrence_authority'), ('shared', 'cafe_opening_teams')
   )
), 'both batch RPCs are SECURITY DEFINER with a pinned empty search_path');
select ok(
  has_function_privilege('authenticated', 'mos.process_occurrence_authority(uuid[],uuid[])', 'EXECUTE')
  and not has_function_privilege('public', 'mos.process_occurrence_authority(uuid[],uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'mos.process_occurrence_authority(uuid[],uuid[])', 'EXECUTE')
  and not has_function_privilege('service_role', 'mos.process_occurrence_authority(uuid[],uuid[])', 'EXECUTE'),
  'only authenticated sessions can invoke batched Process authority');
select ok(
  has_function_privilege('authenticated', 'shared.cafe_opening_teams(uuid[],uuid[])', 'EXECUTE')
  and not has_function_privilege('public', 'shared.cafe_opening_teams(uuid[],uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'shared.cafe_opening_teams(uuid[],uuid[])', 'EXECUTE')
  and not has_function_privilege('service_role', 'shared.cafe_opening_teams(uuid[],uuid[])', 'EXECUTE'),
  'only authenticated sessions can invoke batched Café Opening resolution');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}');
with targets as (
  select array[
    '00000000-0000-0000-0000-000000005b01'::uuid,
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
  ] as team_ids,
  array[
    '00000000-0000-0000-0000-00000000a900'::uuid,
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
  ] as run_ids
), actual as (
  select jsonb_agg(jsonb_build_object(
    'kind', authority_kind, 'id', target_id, 'allowed', allowed
  ) order by authority_kind, target_id) as answers
    from targets, lateral mos.process_occurrence_authority(team_ids, run_ids)
), expected as (
  select jsonb_agg(jsonb_build_object(
    'kind', authority_kind, 'id', target_id, 'allowed', allowed
  ) order by authority_kind, target_id) as answers
    from (
      select 'start'::text as authority_kind, team_id as target_id,
             mos.can_start_process_for_team(team_id) as allowed
        from unnest((select team_ids from targets)) as ids(team_id)
      union all
      select 'close'::text, run_id, mos.can_close_process_run_id(run_id)
        from unnest((select run_ids from targets)) as ids(run_id)
    ) scalar_checks
)
select is((select answers from actual), (select answers from expected),
  'member batch results exactly match the original per-Team and per-run authority predicates');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f002","access_roles":["ops_lead"]}');
with targets as (
  select array['00000000-0000-0000-0000-000000005b01'::uuid] as team_ids,
         array['00000000-0000-0000-0000-00000000a900'::uuid] as run_ids
), actual as (
  select jsonb_agg(jsonb_build_object(
    'kind', authority_kind, 'id', target_id, 'allowed', allowed
  ) order by authority_kind, target_id) as answers
    from targets, lateral mos.process_occurrence_authority(team_ids, run_ids)
), expected as (
  select jsonb_agg(jsonb_build_object(
    'kind', authority_kind, 'id', target_id, 'allowed', allowed
  ) order by authority_kind, target_id) as answers
    from (
      select 'start'::text as authority_kind, team_id as target_id,
             mos.can_start_process_for_team(team_id) as allowed
        from unnest((select team_ids from targets)) as ids(team_id)
      union all
      select 'close'::text, run_id, mos.can_close_process_run_id(run_id)
        from unnest((select run_ids from targets)) as ids(run_id)
    ) scalar_checks
)
select is((select answers from actual), (select answers from expected),
  'ops_lead batch results exactly match the existing scalar authority predicates');

with inputs as (
  select coalesce(array_agg(t.id order by t.id), array[]::uuid[]) as team_ids,
         coalesce(array_agg(distinct t.branch_id), array[]::uuid[]) as branch_ids
    from shared.teams t
   where t.org_id = '00000000-0000-0000-0000-0000000000a1'
     and t.branch_id is not null
     and t.activity in ('kitchen', 'bar')
), actual as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_team_id', source_team_id, 'branch_id', branch_id,
    'opening_team_id', opening_team_id, 'opening_team_name', opening_team_name
  ) order by source_team_id nulls first, branch_id), '[]'::jsonb) as rows
    from inputs, lateral shared.cafe_opening_teams(team_ids, branch_ids)
), expected_rows as (
  select t.id as source_team_id, t.branch_id,
         canonical.id as opening_team_id, canonical.name as opening_team_name
    from inputs
    join shared.teams t on t.id = any(inputs.team_ids)
    join lateral (
      select candidate.id, candidate.name
        from shared.teams candidate
       where candidate.org_id = shared.current_org_id()
         and candidate.branch_id = t.branch_id
         and candidate.archived_at is null
         and candidate.activity in ('kitchen', 'bar')
       order by case candidate.activity when 'kitchen' then 0 else 1 end, candidate.id
       limit 1
    ) canonical on true
  union all
  select null::uuid, requested.branch_id, canonical.id, canonical.name
    from inputs
    cross join unnest(inputs.branch_ids) as requested(branch_id)
    join lateral (
      select candidate.id, candidate.name
        from shared.teams candidate
       where candidate.org_id = shared.current_org_id()
         and candidate.branch_id = requested.branch_id
         and candidate.archived_at is null
         and candidate.activity in ('kitchen', 'bar')
       order by case candidate.activity when 'kitchen' then 0 else 1 end, candidate.id
       limit 1
    ) canonical on true
), expected as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_team_id', source_team_id, 'branch_id', branch_id,
    'opening_team_id', opening_team_id, 'opening_team_name', opening_team_name
  ) order by source_team_id nulls first, branch_id), '[]'::jsonb) as rows
    from expected_rows
)
select ok((select rows <> '[]'::jsonb from actual)
  and (select rows from actual) = (select rows from expected),
  'batched Café Opening resolution exactly matches canonical per-source and per-branch results');

select * from finish();
rollback;
