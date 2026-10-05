-- api_v1 operation layer (slice c): Objective reads and the two content writes.
-- AC-016 (edit_objective_write_up: ops lead stores a valid array; string / non-object / oversize is
-- invalid_input), AC-017 (set_key_result_current_value: unit head inside their unit, forbidden outside;
-- a target change is refused.targets), AC-001 (layer = table for every role), AC-008, AC-010, AC-013.
--
-- Personas (shared._test_seed_directory + _test_seed_access_roles):
--   d1 member (no authority)   d2 member (manages d1)   d3 admin claim / member claim = apex head of
--   Unit-1 (a2)   d4 ops_lead   d5 member   d7 = apex head of Unit-2 (a3)   b4 another org.
begin;
create extension if not exists pgtap with schema extensions;
select plan(96);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

-- ── fixtures (as postgres) ───────────────────────────────────────────────────────────────────
insert into mos.objectives (id, org_id, name, business_unit_id, period_year, period_quarter, accountable_person_id) values
  ('00000000-0000-0000-0000-0000000008a1','00000000-0000-0000-0000-0000000000a1','Unit-1 Growth','00000000-0000-0000-0000-0000000000a2',2027,1,'00000000-0000-0000-0000-0000000000d3');
insert into mos.objectives (id, org_id, name, business_unit_id, period_year, write_up) values
  ('00000000-0000-0000-0000-0000000008a2','00000000-0000-0000-0000-0000000000a1','Unit-2 Quality','00000000-0000-0000-0000-0000000000a3',2027,'[{"type":"paragraph","text":"Original"}]');
insert into mos.objectives (id, org_id, name, is_company_wide, period_year) values
  ('00000000-0000-0000-0000-0000000008a3','00000000-0000-0000-0000-0000000000a1','Company Focus',true,2026);
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000008a4','00000000-0000-0000-0000-0000000000a1','Unhomed | pipe'),
  ('00000000-0000-0000-0000-0000000008b1','00000000-0000-0000-0000-0000000000b1','Elsewhere Objective');
insert into mos.objectives (id, org_id, name, business_unit_id, archived_at) values
  ('00000000-0000-0000-0000-0000000008a5','00000000-0000-0000-0000-0000000000a1','Archived old','00000000-0000-0000-0000-0000000000a2', now());

insert into mos.objective_key_results (id, org_id, objective_id, what, target_value, current_value, unit, due_date, owner_person_id) values
  ('00000000-0000-0000-0000-0000000008c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000008a2','Weekly orders',60,40,'orders','2027-12-31','00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000008c2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000008a2','Mystery metric',null,null,null,null,null),
  ('00000000-0000-0000-0000-0000000008c3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000008a1','Unit-1 measure',10,1,'events',null,null),
  ('00000000-0000-0000-0000-0000000008c4','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000008a3','Company measure',5,null,'branches',null,null),
  ('00000000-0000-0000-0000-0000000008c5','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000008b1','Foreign measure',null,null,null,null,null);
-- make Weekly orders sort before Mystery metric: creation order is the key-result order
update mos.objective_key_results set created_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-0000000008c1';

insert into mos.tasks (id, org_id, title, business_unit_id, status, responsible_person_id, accountable_person_id, created_by, objective_id) values
  ('00000000-0000-0000-0000-0000000008d1','00000000-0000-0000-0000-0000000000a1','Direct done','00000000-0000-0000-0000-0000000000a2','Done',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000008a1'),
  ('00000000-0000-0000-0000-0000000008d2','00000000-0000-0000-0000-0000000000a1','Direct open','00000000-0000-0000-0000-0000000000a2','Open',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000008a1');

-- ── helpers (session-local) ──────────────────────────────────────────────────────────────────
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

create function pg_temp.outcome(p_sql text) returns text language plpgsql as $f$
begin
  begin
    execute p_sql;
    raise exception 'rollback' using errcode = 'P0777';
  exception
    when sqlstate 'P0777' then return 'A';
    when others then return 'R';
  end;
end $f$;

create function pg_temp.err(p_sql text) returns text language plpgsql as $f$
declare m text; d text; h text;
begin
  begin
    execute p_sql;
    raise exception 'rollback' using errcode = 'P0777';
  exception
    when sqlstate 'P0777' then return 'no error';
    when others then
      get stacked diagnostics m = message_text, d = pg_exception_detail, h = pg_exception_hint;
      return sqlstate || '|' || coalesce(d, '') || '|' || coalesce(h, '') || '|' || m;
  end;
end $f$;

create function pg_temp.claims(p_org text, p_person text, p_roles text) returns text language sql as $f$
  select format('{"org_id":"00000000-0000-0000-0000-0000000000%s","person_id":"00000000-0000-0000-0000-0000000000%s","access_roles":[%s]}',
                p_org, p_person, p_roles)
$f$;

create function pg_temp.personas() returns table (label text, org text, person text, roles text) language sql as $f$
  values ('author','a1','d1','"member"'), ('lead','a1','d2','"member"'), ('head','a1','d3','"member"'),
         ('ops_lead','a1','d4','"member","ops_lead"'), ('report','a1','d5','"member"'),
         ('finance','a1','d1','"member","finance"'),
         ('unit2_head','a1','d7','"member"'), ('admin','a1','d3','"admin"'),
         ('other_org','b1','b4','"member"')
$f$;

create function pg_temp.matrix(p_layer text, p_direct text) returns text language plpgsql as $f$
declare r record; v text := '';
begin
  for r in select * from pg_temp.personas() loop
    perform set_config('request.jwt.claims', pg_temp.claims(r.org, r.person, r.roles), true);
    v := v || r.label || '=' || pg_temp.outcome(p_layer) || '/' || pg_temp.outcome(p_direct) || ';';
  end loop;
  return v;
end $f$;

set local role authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Reads
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select array_agg(e ->> 'name' order by ord) from jsonb_array_elements(api_v1.list_objectives() -> 'items') with ordinality x(e, ord)),
  array['Unit-2 Quality','Unit-1 Growth','Company Focus','Unhomed | pipe'],
  'list_objectives returns the live Objectives, newest period first, whole year before its quarters');
select is(jsonb_array_length(api_v1.list_objectives(include_archived => true) -> 'items'), 5, 'include_archived returns the archived Objective too');
select is((select array_agg(e ->> 'name') from jsonb_array_elements(api_v1.list_objectives(business_unit_id => '00000000-0000-0000-0000-0000000000a2') -> 'items') e),
  array['Unit-1 Growth'], 'list_objectives filters by Business Unit');
select is((select array_agg(e ->> 'name') from jsonb_array_elements(api_v1.list_objectives(company_wide => true) -> 'items') e),
  array['Company Focus'], 'list_objectives company_wide true returns only Company-wide Objectives');
select is(jsonb_array_length(api_v1.list_objectives(company_wide => false) -> 'items'), 3, 'list_objectives company_wide false excludes Company-wide Objectives');
select is(jsonb_array_length(api_v1.list_objectives(period_year => 2027) -> 'items'), 2, 'list_objectives filters by period_year');
select is((select array_agg(e ->> 'name') from jsonb_array_elements(api_v1.list_objectives(period_year => 2027, period_quarter => 1) -> 'items') e),
  array['Unit-1 Growth'], 'list_objectives filters by period_quarter');
select is((api_v1.list_objectives(q => 'QUALITY') -> 'items' -> 0) ->> 'id', '00000000-0000-0000-0000-0000000008a2', 'list_objectives q matches the name, case-insensitively');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(api_v1.list_objectives() -> 'items' -> 0) k),
  array['accountable_person_id','archived_at','business_unit_id','created_at','id','is_company_wide','key_results','name','period_quarter','period_year','progress','updated_at'],
  'a listed Objective carries the spec fields and no write_up');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(api_v1.get_objective('00000000-0000-0000-0000-0000000008a2') -> 'item') k),
  array['accountable_person_id','archived_at','business_unit_id','created_at','id','is_company_wide','key_results','name','period_quarter','period_year','progress','updated_at','write_up'],
  'get_objective adds write_up');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a2') -> 'item' -> 'write_up',
  '[{"type":"paragraph","text":"Original"}]'::jsonb, 'get_objective returns the write-up document');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a4') -> 'item' -> 'write_up', 'null'::jsonb, 'an Objective with no write-up returns null for it');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(api_v1.get_objective('00000000-0000-0000-0000-0000000008a2') -> 'item' -> 'key_results' -> 0) k),
  array['current_value','due_date','id','owner_person_id','target_value','unit','updated_at','what'],
  'a key result carries the spec fields');
select is((select array_agg(e ->> 'what' order by ord) from jsonb_array_elements(api_v1.get_objective('00000000-0000-0000-0000-0000000008a2') -> 'item' -> 'key_results') with ordinality x(e, ord)),
  array['Weekly orders','Mystery metric'], 'key results come back in creation order');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a2') -> 'item' -> 'key_results' -> 0 ->> 'target_value', '60', 'target_value is a JSON number');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a2') -> 'item' -> 'key_results' -> 0 ->> 'due_date', '2027-12-31', 'due_date is a date string');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a2') -> 'item' -> 'key_results' -> 1 -> 'current_value', 'null'::jsonb, 'an unset current value is null');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a1') -> 'item' -> 'progress', '{"done":1,"total":2}'::jsonb, 'progress is the existing Task roll-up');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a5') -> 'item' -> 'progress', 'null'::jsonb, 'an archived Objective has no progress');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a3') -> 'item' ->> 'is_company_wide', 'true', 'is_company_wide is returned');
select is(api_v1.get_objective('00000000-0000-0000-0000-0000000008a1') -> 'item' ->> 'period_quarter', '1', 'period_quarter is returned');
select is(jsonb_array_length(api_v1.list_objectives(include_archived => true, "limit" => 2) -> 'items'), 2, 'limit caps the page');
select is(
  (select count(distinct e ->> 'id')::int from (
     select jsonb_array_elements(api_v1.list_objectives("limit" => 2) -> 'items') as e
     union all
     select jsonb_array_elements(api_v1.list_objectives("limit" => 2,
         cursor => api_v1.list_objectives("limit" => 2) ->> 'next_cursor') -> 'items')) x),
  4, 'AC-013: following the cursor returns the rest with no repeats');
select is(api_v1.list_objectives("limit" => 4) -> 'next_cursor', 'null'::jsonb, 'the last page has no cursor');
select is(pg_temp.err($q$ select api_v1.list_objectives(period_quarter => 5) $q$),
  'PT400|invalid_input|period_quarter|period_quarter must be 1 to 4.', 'a quarter outside 1 to 4 is invalid_input');
select alike(pg_temp.err($q$ select api_v1.list_objectives(cursor => 'not-a-cursor') $q$), 'PT400|invalid_input|cursor|%', 'a malformed cursor is invalid_input');
select is(pg_temp.err($q$ select api_v1.list_objectives(q => repeat('a', 201)) $q$),
  'PT400|invalid_input|q|q must be at most 200 characters.', 'a 201-character q is invalid_input');
select is(pg_temp.err($q$ select api_v1.get_objective(null) $q$), 'PT400|invalid_input|id|id is required.', 'get_objective without an id is invalid_input');
select is(pg_temp.err($q$ select api_v1.get_objective('00000000-0000-0000-0000-00000000dead') $q$),
  'PT404|not_found||Objective not found.', 'get_objective on a missing id is not_found');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.get_objective('00000000-0000-0000-0000-0000000008a2') $q$),
  'PT404|not_found||Objective not found.', 'AC-008: another org''s Objective answers exactly like a missing one');
select is((select array_agg(e ->> 'name') from jsonb_array_elements(api_v1.list_objectives() -> 'items') e),
  array['Elsewhere Objective'], 'another org lists only its own Objectives');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- edit_objective_write_up
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-016: the ops lead stores a valid array
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","ops_lead"]}';
insert into ctx values ('w1', api_v1.edit_objective_write_up(
  id => '00000000-0000-0000-0000-0000000008a2',
  write_up => '[{"type":"heading","props":{"level":2}},{"type":"paragraph","text":"Updated"}]',
  expected_updated_at => (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2'))::text);
select is((select v::jsonb -> 'item' -> 'write_up' from ctx where k = 'w1'),
  '[{"type":"heading","props":{"level":2}},{"type":"paragraph","text":"Updated"}]'::jsonb,
  'AC-016: an ops lead stores a valid write-up and gets the Objective as get_objective reads it');
select is((select write_up from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2'),
  '[{"type":"heading","props":{"level":2}},{"type":"paragraph","text":"Updated"}]'::jsonb, 'AC-016: the write-up is stored');
select is((select concat_ws('|', operation, record_type, channel) from shared.api_write_log
            where record_id = '00000000-0000-0000-0000-0000000008a2'),
  'edit_objective_write_up|objective|api', 'AC-014: the write is logged');
select is((select v::jsonb -> 'item' -> 'key_results' -> 0 ->> 'what' from ctx where k = 'w1'), 'Weekly orders', 'the returned Objective carries its key results');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', '[]', (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$),
  'no error', 'an empty document is accepted');

-- AC-016: the shape check
select is(
  (select string_agg(c.label || '=' || pg_temp.err(format(
      $q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', %L::jsonb, (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$, c.doc)),
    ';' order by c.label)
     from (values ('string', '"just text"'), ('object', '{"type":"paragraph"}'), ('json_null', 'null'),
                  ('non_object', '[1]'), ('mixed', '[{"type":"paragraph"},"x"]'),
                  ('no_type', '[{"text":"x"}]'), ('type_number', '[{"type":5}]'), ('type_null', '[{"type":null}]')) as c(label, doc)),
  'json_null=PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.;'
  || 'mixed=PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.;'
  || 'no_type=PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.;'
  || 'non_object=PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.;'
  || 'object=PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.;'
  || 'string=PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.;'
  || 'type_null=PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.;'
  || 'type_number=PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.',
  'AC-016: a string, an object, a non-object element, a missing or non-string type is invalid_input naming write_up');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', null, (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$),
  'PT400|invalid_input|write_up|write_up must be a list of blocks, each an object with a text type.', 'a missing write_up is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2',
    jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', repeat('x', 262200))),
    (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$),
  'PT400|invalid_input|write_up|write_up is too large.', 'AC-016: an oversize document is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2',
    jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', repeat('x', 100000))),
    (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$),
  'no error', 'a large document under the limit is accepted');
select is((select write_up -> 1 ->> 'text' from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2'), 'Updated',
  'AC-016: a refused write-up changed nothing (the accepted probes above roll back)');

-- AC-010: expected_updated_at is required and checked
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', '[]', null) $q$),
  'PT400|invalid_input|expected_updated_at|expected_updated_at is required.', 'expected_updated_at is required');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', '[]', '2000-01-01') $q$),
  'PT409|conflict||This Objective changed since you read it. Read it again and retry.', 'AC-010: a stale expected_updated_at is conflict');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up(null, '[]', now()) $q$), 'PT400|invalid_input|id|id is required.', 'a missing id is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-00000000dead', '[]', now()) $q$),
  'PT404|not_found||Objective not found.', 'a missing Objective is not_found');

-- Scope: the unit head reaches their own unit only; nobody reaches a Company-wide or unset Objective without org-wide authority
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', '[{"type":"paragraph"}]', (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$),
  'no error', 'a unit head edits the write-up of an Objective in their unit');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a1', '[{"type":"paragraph"}]', (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a1')) $q$),
  'PT403|forbidden||the objective write_up requires objective content authority', 'a unit head cannot edit another unit''s Objective (the guard''s own message)');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a3', '[{"type":"paragraph"}]', (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a3')) $q$),
  'PT403|forbidden||the objective write_up requires objective content authority', 'a unit head cannot edit a Company-wide Objective');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a4', '[{"type":"paragraph"}]', (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a4')) $q$),
  'PT403|forbidden||the objective write_up requires objective content authority', 'a unit head cannot edit an Objective with no unit');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', '[{"type":"paragraph"}]', (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$),
  'PT403|forbidden||the objective write_up requires objective content authority', 'AC-009: a member with no content authority is forbidden');
select is(pg_temp.err($q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', (select write_up from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2'), (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$),
  'PT403|forbidden||the update changes no column the writer has authority for', 'an idle re-save is forbidden for a member too, never a silent success');
select is((select write_up -> 1 ->> 'text' from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2'), 'Updated', 'a refused edit changed nothing');

-- AC-001: the layer allows and refuses exactly what the direct table path does
select is(pg_temp.matrix(
  $q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a2', '[{"type":"paragraph"}]', (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a2')) $q$,
  $q$ do $d$ begin update mos.objectives set write_up = '[{"type":"paragraph"}]' where id = '00000000-0000-0000-0000-0000000008a2';
        if not found then raise exception 'no row'; end if; end $d$ $q$),
  'author=R/R;lead=R/R;head=R/R;ops_lead=A/A;report=R/R;finance=R/R;unit2_head=A/A;admin=A/A;other_org=R/R;',
  'AC-001 edit_objective_write_up on a Unit-2 Objective: layer = table for every role');
select is(pg_temp.matrix(
  $q$ select api_v1.edit_objective_write_up('00000000-0000-0000-0000-0000000008a1', '[{"type":"paragraph"}]', (select updated_at from mos.objectives where id = '00000000-0000-0000-0000-0000000008a1')) $q$,
  $q$ do $d$ begin update mos.objectives set write_up = '[{"type":"paragraph"}]' where id = '00000000-0000-0000-0000-0000000008a1';
        if not found then raise exception 'no row'; end if; end $d$ $q$),
  'author=R/R;lead=R/R;head=A/A;ops_lead=A/A;report=R/R;finance=R/R;unit2_head=R/R;admin=A/A;other_org=R/R;',
  'AC-001 edit_objective_write_up on a Unit-1 Objective: layer = table for every role');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- set_key_result_current_value
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-017: the unit head moves a key result inside their unit
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
insert into ctx values ('k1', api_v1.set_key_result_current_value(
  key_result_id => '00000000-0000-0000-0000-0000000008c1', current_value => 45.5)::text);
select is((select v::jsonb -> 'item' ->> 'current_value' from ctx where k = 'k1'), '45.5', 'AC-017: a unit head sets the current value of a key result in their unit');
select is((select current_value from mos.objective_key_results where id = '00000000-0000-0000-0000-0000000008c1'), 45.5, 'AC-017: the value is stored');
select is((select concat_ws('|', v::jsonb -> 'item' ->> 'id', v::jsonb -> 'item' ->> 'objective_id', v::jsonb -> 'item' ->> 'target_value') from ctx where k = 'k1'),
  '00000000-0000-0000-0000-0000000008c1|00000000-0000-0000-0000-0000000008a2|60', 'the result is the key result with its Objective id; the target is untouched');
select is((select concat_ws('|', operation, record_type, channel) from shared.api_write_log
            where record_id = '00000000-0000-0000-0000-0000000008c1'),
  'set_key_result_current_value|key_result|api', 'AC-014: the write is logged');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c3', 5) $q$),
  'PT403|forbidden||a key result current_value requires objective content authority', 'AC-017: a unit head is forbidden on another unit''s Objective (the guard''s own message)');
select is((select current_value from mos.objective_key_results where id = '00000000-0000-0000-0000-0000000008c3'), 1::numeric, 'AC-017: nothing changed');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c4', 5) $q$),
  'PT403|forbidden||a key result current_value requires objective content authority', 'a unit head is forbidden on a Company-wide Objective');

-- clearing, bounds, conflict
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","ops_lead"]}';
select is(api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', null) -> 'item' -> 'current_value', 'null'::jsonb, 'a null current value clears it');
select is((select current_value from mos.objective_key_results where id = '00000000-0000-0000-0000-0000000008c1'), null, 'the cleared value is stored');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c4', 7) $q$), 'no error', 'an ops lead sets a key result on a Company-wide Objective');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 'NaN') $q$),
  'PT400|invalid_input|current_value|current_value must be a finite number.', 'a value that is not a finite number is invalid_input');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 'Infinity') $q$),
  'PT400|invalid_input|current_value|current_value must be a finite number.', 'an infinite value is invalid_input');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 9, '2000-01-01') $q$),
  'PT409|conflict||This key result changed since you read it. Read it again and retry.', 'AC-010: a stale expected_updated_at is conflict');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 9,
    (select updated_at from mos.objective_key_results where id = '00000000-0000-0000-0000-0000000008c1')) $q$),
  'no error', 'a matching expected_updated_at lets the write through');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value(null, 1) $q$), 'PT400|invalid_input|key_result_id|key_result_id is required.', 'a missing key_result_id is invalid_input');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-00000000dead', 1) $q$),
  'PT404|not_found||Key result not found.', 'a missing key result is not_found');

-- member, other org
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 1) $q$),
  'PT403|forbidden||a key result current_value requires objective content authority', 'AC-009: a member with no content authority is forbidden');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 1) $q$),
  'PT404|not_found||Key result not found.', 'another org''s key result answers exactly like a missing one');

-- AC-001 matrix
select is(pg_temp.matrix(
  $q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 3) $q$,
  $q$ do $d$ begin update mos.objective_key_results set current_value = 3 where id = '00000000-0000-0000-0000-0000000008c1';
        if not found then raise exception 'no row'; end if; end $d$ $q$),
  'author=R/R;lead=R/R;head=R/R;ops_lead=A/A;report=R/R;finance=R/R;unit2_head=A/A;admin=A/A;other_org=R/R;',
  'AC-001 set_key_result_current_value on a Unit-2 key result: layer = table for every role');
select is(pg_temp.matrix(
  $q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c3', 3) $q$,
  $q$ do $d$ begin update mos.objective_key_results set current_value = 3 where id = '00000000-0000-0000-0000-0000000008c3';
        if not found then raise exception 'no row'; end if; end $d$ $q$),
  'author=R/R;lead=R/R;head=A/A;ops_lead=A/A;report=R/R;finance=R/R;unit2_head=R/R;admin=A/A;other_org=R/R;',
  'AC-001 set_key_result_current_value on a Unit-1 key result: layer = table for every role');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-017: every other Objective or key-result change is refused
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is(pg_temp.err($q$ select api_v1.refused_action('change_target', 'key_result', '00000000-0000-0000-0000-0000000008c1') $q$),
  'PT403|refused.targets||Objective settings and key-result targets can''t be changed through the API or an agent. Do this in MOS.',
  'AC-017: a target change is refused.targets, for an admin too');
select is(pg_temp.err($q$ select api_v1.refused_action('change_objective', 'objective', '00000000-0000-0000-0000-0000000008a1') $q$),
  'PT403|refused.targets||Objective settings and key-result targets can''t be changed through the API or an agent. Do this in MOS.',
  'AC-017: an Objective settings change is refused.targets');
select throws_ok($q$ select api_v1.set_key_result_current_value(key_result_id => '00000000-0000-0000-0000-0000000008c1', current_value => 1, target_value => 99) $q$,
  '42883', null, 'AC-017: no operation accepts a target_value (an extra argument matches no function)');
select throws_ok($q$ select api_v1.edit_objective_write_up(id => '00000000-0000-0000-0000-0000000008a1', write_up => '[]',
    expected_updated_at => now(), name => 'Renamed') $q$,
  '42883', null, 'AC-017: no operation accepts an Objective setting (an extra argument matches no function)');
select is((select count(*)::int
             from pg_proc p, unnest(coalesce(p.proargnames, '{}')) as n(name)
            where p.pronamespace = to_regnamespace('api_v1')
              and n.name in ('target_value', 'what', 'unit', 'due_date', 'owner_person_id', 'is_company_wide', 'period_year', 'period_quarter',
                             'business_unit_id', 'accountable_person_id', 'name')
              and p.proname in ('edit_objective_write_up', 'set_key_result_current_value')), 0,
  'AC-017: the two Objective writes carry no structural parameter');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p
            where p.pronamespace = to_regnamespace('api_v1') and p.proname ~ 'objective|key_result'),
  array['edit_objective_write_up','get_objective','list_objectives','set_key_result_current_value'],
  'the Objective surface is the two reads and the two content writes');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Key-result value bounds (#1063): finite, smaller than 1e15 in size, at most 6 decimal places
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","ops_lead"]}';
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 1000000000000000) $q$),
  'PT400|invalid_input|current_value|current_value must be smaller than 1000000000000000 in size and have at most 6 decimal places.',
  'a value of 1e15 in size is invalid_input');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', -1000000000000000) $q$),
  'PT400|invalid_input|current_value|current_value must be smaller than 1000000000000000 in size and have at most 6 decimal places.',
  'a negative value of 1e15 in size is invalid_input');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 0.0000001) $q$),
  'PT400|invalid_input|current_value|current_value must be smaller than 1000000000000000 in size and have at most 6 decimal places.',
  'a value with 7 decimal places is invalid_input');
select is(pg_temp.err($q$ select api_v1.set_key_result_current_value('00000000-0000-0000-0000-0000000008c1', 999999999999999.999999) $q$),
  'no error', 'the largest allowed value is accepted');
select throws_ok($q$ update mos.objective_key_results set current_value = 1000000000000000 where id = '00000000-0000-0000-0000-0000000008c1' $q$,
  '23514', null, 'the table refuses a current_value of 1e15 in size for any writer');
select throws_ok($q$ update mos.objective_key_results set current_value = 0.0000001 where id = '00000000-0000-0000-0000-0000000008c1' $q$,
  '23514', null, 'the table refuses a current_value with 7 decimal places');
select throws_ok($q$ update mos.objective_key_results set current_value = 'NaN' where id = '00000000-0000-0000-0000-0000000008c1' $q$,
  '23514', null, 'the table refuses a current_value that is not a number');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($q$ update mos.objective_key_results set target_value = 1000000000000000 where id = '00000000-0000-0000-0000-0000000008c1' $q$,
  '23514', null, 'the table refuses a target_value of 1e15 in size, for an admin too');
select throws_ok($q$ insert into mos.objective_key_results (objective_id, what, target_value)
    values ('00000000-0000-0000-0000-0000000008a1', 'Too large', 'Infinity') $q$,
  '23514', null, 'the table refuses an infinite target_value on insert');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- The write comments say how a target change is refused (#1063)
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p
            where p.pronamespace = 'api_v1'::regnamespace and p.prosrc like '%refused.targets%'),
  array['refused_action'], 'refused_action is the only operation that returns refused.targets');
select is((select count(*)::int from pg_proc p
            where p.oid in ('api_v1.edit_objective_write_up(uuid,jsonb,timestamptz)'::regprocedure,
                            'api_v1.set_key_result_current_value(uuid,numeric,timestamptz)'::regprocedure)
              and obj_description(p.oid, 'pg_proc') like '%never returns refused.targets; only refused_action answers such a request with refused.targets.'), 2,
  'both content writes say they never return refused.targets and name refused_action as the operation that does');

-- An organization owns the successful API writes above and their log rows (#1155).
reset role;
select cmp_ok((select count(*) from shared.api_write_log
               where org_id = '00000000-0000-0000-0000-0000000000a1'), '>', 0::bigint,
  'the organization has log rows from successful API writes before deletion');
select lives_ok($q$
  delete from shared.orgs where id = '00000000-0000-0000-0000-0000000000a1'
$q$, 'an organization can be deleted after successful API writes');
select is((select count(*) from shared.orgs
            where id = '00000000-0000-0000-0000-0000000000a1'), 0::bigint,
  'the organization is deleted');
select is((select count(*) from shared.api_write_log
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0::bigint,
  'the deleted organization leaves no API write log rows');
select is((select count(*) from shared.orgs
            where id = '00000000-0000-0000-0000-0000000000b1'), 1::bigint,
  'deleting one organization preserves another organization');

select * from finish();
rollback;
