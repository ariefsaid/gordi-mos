-- api_v1 operation layer (slice a): the catalog contract. AC-002 (no definer, empty search_path,
-- no anon/public execute), AC-003 (no actor/author/creator/org/channel parameter), AC-026 (helper
-- ACL), AC-030 (v1 signature snapshot), plus a COMMENT on every function and the definer allow-list.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select ok(
  exists (select 1 from pg_namespace where nspname = 'api_v1')
  and exists (select 1 from pg_namespace where nspname = 'api_private'),
  'schemas api_v1 and api_private exist');

select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p where p.pronamespace = to_regnamespace('api_v1')),
  array['add_checklist_item','create_project_process','create_signal','create_task','edit_objective_write_up',
        'edit_project_process','edit_signal','edit_task','get_objective','get_project_process','get_record_history',
        'get_signal','get_task','link_signal_task','list_business_units','list_objectives','list_people',
        'list_projects_processes','list_signals','list_tasks','list_teams','refused_action','set_checklist_item',
        'set_key_result_current_value','whoami'],
  'api_v1 holds exactly the slice-(a), slice-(b), Objective and history operations');

-- ── AC-002 ───────────────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = to_regnamespace('api_v1') and p.prosecdef),
  0, 'AC-002: no api_v1 function is SECURITY DEFINER');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = to_regnamespace('api_v1')
      and not coalesce('search_path=""' = any(p.proconfig), false)),
  0, 'AC-002: every api_v1 function pins an empty search_path');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = to_regnamespace('api_v1')
      and (p.proacl is null
           or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
           or has_function_privilege('anon', p.oid, 'execute')
           or not has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'AC-002: api_v1 is executable by authenticated only (never anon or public)');

-- ── AC-003 ───────────────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int
     from pg_proc p, unnest(coalesce(p.proargnames, '{}')) as n(name)
    where p.pronamespace = to_regnamespace('api_v1')
      and n.name ~ '^(actor|actor_person_id|author|author_id|creator|created_by|org|org_id|channel|client_id|person_id)$'
      and not (p.proname = 'list_signals' and n.name = 'author_id')),
  0, 'AC-003: no api_v1 parameter names an actor, author, creator, org or channel (list_signals filters by author)');

-- ── COMMENT on every function ────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace in (to_regnamespace('api_v1'), to_regnamespace('api_private'))
      and coalesce(obj_description(p.oid, 'pg_proc'), '') = ''),
  0, 'every api_v1 and api_private function carries a COMMENT');

-- ── AC-026 / NFR-002: helpers ────────────────────────────────────────────────────────────────
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p where p.pronamespace = to_regnamespace('api_private') and p.prosecdef),
  array['_agent_fence','begin_write','log_write'],
  'NFR-002: only the agent-fence helper and the two write-log helpers in api_private are SECURITY DEFINER');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = to_regnamespace('api_private') and p.prosecdef
      and not coalesce('search_path=""' = any(p.proconfig), false)),
  0, 'NFR-002: each definer helper pins an empty search_path');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = to_regnamespace('api_private')
      and (p.proacl is null
           or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
           or (has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'check_request')
           or not has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'AC-026: api_private EXECUTE is held by authenticated, never public; anon holds only check_request');

select is(
  (select count(*)::int from pg_namespace n
    where n.nspname in ('api_v1','api_private')
      and ((has_schema_privilege('anon', n.oid, 'usage') and n.nspname = 'api_v1')
           or not has_schema_privilege('authenticated', n.oid, 'usage'))),
  0, 'both schemas grant USAGE to authenticated; anon has it on api_private only, for the pre-request check');

-- ── AC-030: the recorded v1 signature snapshot ───────────────────────────────────────────────
-- A recorded signature must still exist; a later defaulted parameter only extends the tail.
select is_empty($snap$
  select r.sig from unnest(array[
    'whoami()',
    'list_people(q text, team_id uuid, include_archived boolean, cursor text, "limit" integer)',
    'list_teams(q text, business_unit_id uuid, cursor text, "limit" integer)',
    'list_business_units()',
    'list_tasks(status text[], team_id uuid, business_unit_id uuid, responsible_person_id uuid, accountable_person_id uuid, objective_id uuid, work_line_id uuid, due_from date, due_to date, updated_since timestamp with time zone, q text, include_archived boolean, cursor text, "limit" integer)',
    'get_task(id uuid)',
    'create_task(title text, team_id uuid, responsible_person_id uuid, accountable_person_id uuid, description text, due_date date, status text, consulted_person_ids uuid[], informed_person_ids uuid[], objective_id uuid, work_line_id uuid, checklist text[], idempotency_key text)',
    'edit_task(id uuid, changes jsonb, expected_updated_at timestamp with time zone)',
    'add_checklist_item(task_id uuid, label text, "position" integer)',
    'set_checklist_item(item_id uuid, label text, is_done boolean)',
    'refused_action(action text, record_type text, id uuid)',
    'list_signals(attention text[], author_id uuid, occurred_from timestamp with time zone, occurred_to timestamp with time zone, linked_task_id uuid, updated_since timestamp with time zone, q text, include_retracted boolean, cursor text, "limit" integer)',
    'get_signal(id uuid)',
    'create_signal(body text, occurred_at timestamp with time zone, attention text, mentions jsonb, link_task_ids uuid[], idempotency_key text)',
    'edit_signal(id uuid, changes jsonb, expected_updated_at timestamp with time zone)',
    'link_signal_task(signal_id uuid, task_id uuid)',
    'list_projects_processes(type text, objective_id uuid, business_unit_id uuid, updated_since timestamp with time zone, q text, include_archived boolean, cursor text, "limit" integer)',
    'get_project_process(id uuid)',
    'create_project_process(name text, type text, business_unit_id uuid, objective_id uuid, accountable_person_id uuid, responsible_person_id uuid, idempotency_key text)',
    'edit_project_process(id uuid, changes jsonb, expected_updated_at timestamp with time zone)',
    'get_record_history(record_type text, id uuid, cursor text, "limit" integer)',
    'list_objectives(business_unit_id uuid, company_wide boolean, period_year integer, period_quarter integer, q text, include_archived boolean, cursor text, "limit" integer)',
    'get_objective(id uuid)',
    'edit_objective_write_up(id uuid, write_up jsonb, expected_updated_at timestamp with time zone)',
    'set_key_result_current_value(key_result_id uuid, current_value numeric, expected_updated_at timestamp with time zone)'
  ]) as r(sig)
  where not exists (
    select 1 from pg_proc p
     where p.pronamespace = to_regnamespace('api_v1')
       and (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') like
           replace(replace(regexp_replace(r.sig, '\)$', ''), '_', '\_'), '%', '\%') || '%')
$snap$, 'AC-030: every recorded v1 signature still exists');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = to_regnamespace('api_v1')
      and p.prorettype <> 'jsonb'::regtype),
  0, 'every api_v1 function returns one jsonb value');

select * from finish();
rollback;
