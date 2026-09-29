-- api_v1 operation layer (slice a): context reads, Task reads and writes, refusals, caps, idempotency,
-- write budget and the write log. AC-001 (operation x role equivalence matrix), AC-003..007, AC-009,
-- AC-010, AC-012..014, AC-019; idempotency (AC-011's rule) is proved through create_task.
--
-- Personas (shared._test_seed_directory + _test_seed_access_roles):
--   author d1 (PIC of the fixture task)   lead d2 (Accountable; manages d1)   head d3 (Exec; manages
--   all; also holds the admin access role in the seed)   d4 peer (also probed with ops_lead)
--   d5 report   d7 (probed with finance)   b4 member of another org.
begin;
create extension if not exists pgtap with schema extensions;
select plan(108);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

-- ── fixtures (as postgres) ───────────────────────────────────────────────────────────────────
insert into shared.teams (id, org_id, business_unit_id, name, code) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Team One','t1'),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Team Bulk','t2'),
  ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','Team Three','t3');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1', true);
insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id, created_by) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','Fixture task','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1');
insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id, created_by, archived_at) values
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000a1','Archived fixture','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c3',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1', now());
insert into mos.task_checklist_items (id, org_id, task_id, label, position) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f1','First',0);
insert into mos.tasks (org_id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id, created_by)
select '00000000-0000-0000-0000-0000000000a1', 'Bulk ' || g, '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2',
       '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1'
  from generate_series(1, 120) g;

-- ── helpers (session-local) ──────────────────────────────────────────────────────────────────
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- 'A' when the statement succeeds, 'R' when it raises; the work is always rolled back.
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

-- 'sqlstate|details|hint|message' of the error the statement raises ('no error' if it does not).
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
         ('finance','a1','d7','"member","finance"'), ('admin','a1','d3','"admin"'),
         ('other_org','b1','b4','"member"')
$f$;

-- layer outcome / direct-table outcome for every persona, e.g. 'author=A/A;lead=A/A;...'
create function pg_temp.matrix(p_layer text, p_direct text) returns text language plpgsql as $f$
declare r record; v text := '';
begin
  for r in select * from pg_temp.personas() loop
    perform set_config('request.jwt.claims', pg_temp.claims(r.org, r.person, r.roles), true);
    v := v || r.label || '=' || pg_temp.outcome(p_layer) || '/' || pg_temp.outcome(p_direct) || ';';
  end loop;
  return v;
end $f$;

create function pg_temp.authority_mismatches() returns text language plpgsql as $f$
declare r record; v text := '';
begin
  for r in select * from pg_temp.personas() loop
    perform set_config('request.jwt.claims', pg_temp.claims(r.org, r.person, r.roles), true);
    if api_v1.whoami() -> 'authority' is distinct from jsonb_build_object(
         'signal', (select to_jsonb(s) from mos.get_signal_post_authority() s),
         'work',   (select to_jsonb(w) from mos.get_work_write_scopes() w)) then
      v := v || r.label || ';';
    end if;
  end loop;
  return v;
end $f$;
-- The owner default no longer grants PUBLIC execute, so the session-local helpers are granted.
grant execute on all functions in schema pg_temp to public;

set local role authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Channel marker: app until an API write, agent when the claims carry a client id
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(api_private.channel(), 'app', 'channel is app before any API write');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"],"client_id":"agent-x"}';
select is(api_private.channel(), 'agent', 'channel is agent when the claims carry a client id');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Context reads
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(api_v1.whoami() -> 'person' ->> 'id', '00000000-0000-0000-0000-0000000000d1', 'whoami names the caller');
select is(api_v1.whoami() ->> 'org_id', '00000000-0000-0000-0000-0000000000a1', 'whoami names the org');
select is(api_v1.whoami() -> 'access_roles', '["member"]'::jsonb, 'whoami returns the access roles');
select is(api_v1.whoami() -> 'teams',
  '[{"team_id":"00000000-0000-0000-0000-0000000000c1","name":"Team One","business_unit_id":"00000000-0000-0000-0000-0000000000a2","is_primary":true}]'::jsonb,
  'whoami lists the caller''s live teams');
select is(pg_temp.authority_mismatches(), '', 'AC-019: whoami authority equals the Signal-post and Work write-scope RPCs under every role fixture');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(jsonb_array_length(api_v1.list_people() -> 'items'), 7, 'list_people returns the org''s people and no other org''s');
select is(jsonb_array_length(api_v1.list_people(q => 'report') -> 'items'), 1, 'list_people q matches the name, case-insensitively');
select is((api_v1.list_people(team_id => '00000000-0000-0000-0000-0000000000c1') -> 'items' -> 0) ->> 'full_name', 'Author', 'list_people filters by team');
select is(jsonb_array_length(api_v1.list_people("limit" => 3) -> 'items'), 3, 'list_people honours limit');
select is(
  (select count(distinct e ->> 'id')::int from (
     select jsonb_array_elements(api_v1.list_people("limit" => 3) -> 'items') as e
     union all
     select jsonb_array_elements(api_v1.list_people("limit" => 3,
         cursor => api_v1.list_people("limit" => 3) ->> 'next_cursor') -> 'items')) x),
  6, 'list_people cursor continues without repeats');
select alike(pg_temp.err($q$ select api_v1.list_people(cursor => 'not-a-cursor') $q$), 'PT400|invalid_input|cursor|%', 'a malformed cursor is invalid_input naming the field');
select alike(pg_temp.err($q$ select api_v1.list_people("limit" => 0) $q$), 'PT400|invalid_input|limit|%', 'limit below 1 is invalid_input');

select is(jsonb_array_length(api_v1.list_teams() -> 'items'), 3, 'list_teams returns the org''s teams');
select is((api_v1.list_teams(business_unit_id => '00000000-0000-0000-0000-0000000000a3') -> 'items' -> 0) ->> 'name', 'Team Three', 'list_teams filters by business unit');
select is((api_v1.list_teams(q => 'one') -> 'items' -> 0) ->> 'business_unit_name', 'Unit-1', 'list_teams q matches and names the business unit');
select is(api_v1.list_business_units(), jsonb_build_object('items', (
  select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code) order by b.name, b.id)
    from shared.business_units b
   where b.org_id = '00000000-0000-0000-0000-0000000000a1' and b.archived_at is null), 'next_cursor', null),
  'list_business_units returns the live units');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-013 — 120 readable Tasks paginate under the 100 cap
-- ═════════════════════════════════════════════════════════════════════════════════════════════
insert into ctx values ('p1', api_v1.list_tasks(team_id => '00000000-0000-0000-0000-0000000000c2', "limit" => 500)::text);
insert into ctx values ('p2', api_v1.list_tasks(team_id => '00000000-0000-0000-0000-0000000000c2', "limit" => 500,
  cursor => (select v::jsonb ->> 'next_cursor' from ctx where k = 'p1'))::text);
select is((select jsonb_array_length(v::jsonb -> 'items') from ctx where k = 'p1'), 100, 'AC-013: limit 500 is clamped to 100 items');
select isnt((select v::jsonb ->> 'next_cursor' from ctx where k = 'p1'), null, 'AC-013: a cursor returns with the first page');
select is((select jsonb_array_length(v::jsonb -> 'items') from ctx where k = 'p2'), 20, 'AC-013: the cursor returns the remaining 20');
select is((select v::jsonb ->> 'next_cursor' from ctx where k = 'p2'), null, 'AC-013: the last page has next_cursor null');
select is(
  (select count(distinct e ->> 'id')::int from ctx c, jsonb_array_elements(c.v::jsonb -> 'items') e where c.k in ('p1','p2')),
  120, 'AC-013: no Task repeats across the pages');

select is((api_v1.list_tasks(responsible_person_id => '00000000-0000-0000-0000-0000000000d1', team_id => '00000000-0000-0000-0000-0000000000c1') -> 'items' -> 0) ->> 'id',
  '00000000-0000-0000-0000-0000000000f1', 'list_tasks filters by person and team');
select is(jsonb_array_length(api_v1.list_tasks(q => 'fixture task', status => array['Open']) -> 'items'), 1, 'list_tasks q and status filters combine');
select is(jsonb_array_length(api_v1.list_tasks(team_id => '00000000-0000-0000-0000-0000000000c3') -> 'items'), 0, 'list_tasks hides archived Tasks by default');
select is(jsonb_array_length(api_v1.list_tasks(team_id => '00000000-0000-0000-0000-0000000000c3', include_archived => true) -> 'items'), 1, 'list_tasks include_archived returns them');

-- get_task: one shape, and the same answer for a missing id and an unreadable one
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((api_v1.get_task('00000000-0000-0000-0000-0000000000f1') -> 'item' ->> 'title'), 'Fixture task', 'get_task returns the Task');
select is(jsonb_array_length(api_v1.get_task('00000000-0000-0000-0000-0000000000f1') -> 'item' -> 'checklist'), 1, 'get_task carries the checklist');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(api_v1.get_task('00000000-0000-0000-0000-0000000000f1') -> 'item') k
    where k in ('events','comments','signal_ids','checklist')),
  array['checklist','comments','events','signal_ids'], 'get_task carries events, comments and linked Signal ids');
select is(pg_temp.err($q$ select api_v1.get_task('00000000-0000-0000-0000-00000000dead') $q$),
  'PT404|not_found||Task not found.', 'get_task on a missing id is not_found');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.get_task('00000000-0000-0000-0000-0000000000f1') $q$),
  'PT404|not_found||Task not found.', 'NFR-003: another org''s Task answers exactly like a missing one');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-001 — the layer allows and refuses exactly what the direct table path does
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is(pg_temp.matrix(
  $q$ select api_v1.create_task(title => 'm', team_id => '00000000-0000-0000-0000-0000000000c1',
        responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id()) $q$,
  $q$ do $d$ begin
        insert into mos.tasks (id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id, created_by)
        values ('00000000-0000-0000-0000-0000000000f9','m','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1',
                shared.current_person_id(), shared.current_person_id(), shared.current_person_id());
        insert into mos.task_events (task_id, actor_person_id, event_type)
        values ('00000000-0000-0000-0000-0000000000f9', shared.current_person_id(), 'created');
      end $d$ $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=A/A;report=A/A;finance=A/A;admin=A/A;other_org=R/R;',
  'AC-001 create_task (PIC = self): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.create_task(title => 'm', team_id => '00000000-0000-0000-0000-0000000000c1',
        responsible_person_id => '00000000-0000-0000-0000-0000000000d1', accountable_person_id => shared.current_person_id()) $q$,
  $q$ do $d$ begin
        insert into mos.tasks (id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id, created_by)
        values ('00000000-0000-0000-0000-0000000000f9','m','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1',
                '00000000-0000-0000-0000-0000000000d1', shared.current_person_id(), shared.current_person_id());
        insert into mos.task_events (task_id, actor_person_id, event_type)
        values ('00000000-0000-0000-0000-0000000000f9', shared.current_person_id(), 'created');
      end $d$ $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=R/R;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 create_task (PIC = another person): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"status":"In Progress"}') $q$,
  $q$ do $d$ begin
        insert into mos.task_events (task_id, actor_person_id, event_type, from_value, to_value)
        values ('00000000-0000-0000-0000-0000000000f1', shared.current_person_id(), 'status_changed', 'Open', 'In Progress');
        update mos.tasks set status = 'In Progress' where id = '00000000-0000-0000-0000-0000000000f1';
        if not found then raise exception 'no row'; end if;
      end $d$ $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=R/R;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 edit_task (status): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"responsible_person_id":"00000000-0000-0000-0000-0000000000d5"}') $q$,
  $q$ do $d$ begin
        insert into mos.task_events (task_id, actor_person_id, event_type, from_value, to_value)
        values ('00000000-0000-0000-0000-0000000000f1', shared.current_person_id(), 'field_edited', 'x', 'y');
        update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d5' where id = '00000000-0000-0000-0000-0000000000f1';
        if not found then raise exception 'no row'; end if;
      end $d$ $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=R/R;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 edit_task (person in charge): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.add_checklist_item(task_id => '00000000-0000-0000-0000-0000000000f1', label => 'x') $q$,
  $q$ do $d$ begin
        insert into mos.task_checklist_items (task_id, label, position) values ('00000000-0000-0000-0000-0000000000f1', 'x', 1);
        insert into mos.task_events (task_id, actor_person_id, event_type)
        values ('00000000-0000-0000-0000-0000000000f1', shared.current_person_id(), 'field_edited');
      end $d$ $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=R/R;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 add_checklist_item: layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.set_checklist_item(item_id => '00000000-0000-0000-0000-0000000000e1', is_done => true) $q$,
  $q$ do $d$ begin
        update mos.task_checklist_items set is_done = true where id = '00000000-0000-0000-0000-0000000000e1';
        if not found then raise exception 'no row'; end if;
        insert into mos.task_events (task_id, actor_person_id, event_type)
        values ('00000000-0000-0000-0000-0000000000f1', shared.current_person_id(), 'field_edited');
      end $d$ $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=R/R;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 set_checklist_item: layer = table for every role');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- create_task (AC-004), limits, idempotency
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into ctx values ('c1', api_v1.create_task(
  title => 'Created by the layer', team_id => '00000000-0000-0000-0000-0000000000c3',
  responsible_person_id => '00000000-0000-0000-0000-0000000000d1', accountable_person_id => '00000000-0000-0000-0000-0000000000d2',
  checklist => array['one','two'], idempotency_key => 'k-1')::text);
select is((select v::jsonb -> 'item' ->> 'business_unit_id' from ctx where k = 'c1'), '00000000-0000-0000-0000-0000000000a3',
  'AC-004: the Task is in the Team''s Business Unit');
select is((select v::jsonb ->> 'replayed' from ctx where k = 'c1'), 'false', 'a first create is not a replay');
select is((select v::jsonb -> 'item' ->> 'created_by' from ctx where k = 'c1'), '00000000-0000-0000-0000-0000000000d1', 'created_by is the caller');
select is((select count(*)::int from mos.task_events e where e.task_id = (select (v::jsonb -> 'item' ->> 'id')::uuid from ctx where k = 'c1') and e.event_type = 'created'),
  1, 'AC-004: exactly one created event');
select is((select array_agg(label order by position) from mos.task_checklist_items i where i.task_id = (select (v::jsonb -> 'item' ->> 'id')::uuid from ctx where k = 'c1')),
  array['one','two'], 'create_task writes the checklist in order');

select is(pg_temp.err($q$ select api_v1.create_task(title => '  ', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id()) $q$),
  'PT400|invalid_input|title|title must not be blank.', 'a blank title is invalid_input naming the field');
select is(pg_temp.err($q$ select api_v1.create_task(title => repeat('x', 301), team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id()) $q$),
  'PT400|invalid_input|title|title must be at most 300 characters.', 'an over-long title is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_task(title => 't', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id(), status => 'Nope') $q$),
  'PT400|invalid_input|status|%', 'an unknown status is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_task(title => 't', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id(),
  checklist => (select array_agg('l' || g) from generate_series(1, 51) g)) $q$),
  'PT400|invalid_input|checklist|%', 'more than 50 checklist labels is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_task(title => 't', team_id => '00000000-0000-0000-0000-00000000dead',
  responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id()) $q$),
  'PT404|not_found|team_id|%', 'an unknown Team is not_found naming the field');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.create_task(title => 't', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => '00000000-0000-0000-0000-0000000000d4', accountable_person_id => shared.current_person_id()) $q$) ~ '^PT403\|forbidden\|\|',
  true, 'a PIC outside the caller''s downline is forbidden');
select isnt(pg_temp.err($q$ select api_v1.create_task(title => 't', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => '00000000-0000-0000-0000-0000000000d4', accountable_person_id => shared.current_person_id()) $q$),
  'PT403|forbidden||You don''t have permission to do this in MOS.', 'the guard''s own rule text is passed through, not replaced');

-- idempotency (AC-011''s rule, through create_task)
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((api_v1.create_task(title => 'Created by the layer', team_id => '00000000-0000-0000-0000-0000000000c3',
    responsible_person_id => '00000000-0000-0000-0000-0000000000d1', accountable_person_id => '00000000-0000-0000-0000-0000000000d2',
    idempotency_key => 'k-1') -> 'item' ->> 'id'),
  (select v::jsonb -> 'item' ->> 'id' from ctx where k = 'c1'), 'the same person and key return the same Task id');
select is((select count(*)::int from mos.tasks where title = 'Created by the layer'), 1, 'a repeat with the same key creates nothing');
select is((api_v1.create_task(title => 'Created by the layer', team_id => '00000000-0000-0000-0000-0000000000c3',
    responsible_person_id => '00000000-0000-0000-0000-0000000000d1', accountable_person_id => '00000000-0000-0000-0000-0000000000d2',
    idempotency_key => 'k-1') ->> 'replayed'), 'true', 'the repeat is flagged replayed');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((api_v1.create_task(title => 'Created by the layer', team_id => '00000000-0000-0000-0000-0000000000c3',
    responsible_person_id => '00000000-0000-0000-0000-0000000000d4', accountable_person_id => '00000000-0000-0000-0000-0000000000d2',
    idempotency_key => 'k-1') ->> 'replayed'), 'false', 'another person using the same key gets their own Task');
select alike(pg_temp.err($q$ select api_v1.create_task(title => 't', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id(), idempotency_key => '') $q$),
  'PT400|invalid_input|idempotency_key|%', 'an empty idempotency key is invalid_input');
reset role;
update shared.api_write_log set created_at = created_at - interval '25 hours'
 where idempotency_key = 'k-1' and person_id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((api_v1.create_task(title => 'Created by the layer', team_id => '00000000-0000-0000-0000-0000000000c3',
    responsible_person_id => '00000000-0000-0000-0000-0000000000d1', accountable_person_id => '00000000-0000-0000-0000-0000000000d2',
    idempotency_key => 'k-1') ->> 'replayed'), 'false', 'a key older than 24 hours has expired');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-014 — the write log
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is((select concat_ws('|', operation, record_type, channel, idempotency_key, org_id::text)
             from shared.api_write_log where record_id = (select (v::jsonb -> 'item' ->> 'id')::uuid from ctx where k = 'c1')),
  'create_task|task|api|k-1|00000000-0000-0000-0000-0000000000a1',
  'AC-014: one row names the operation, record, api channel, key and org');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"],"client_id":"agent-x"}';
insert into ctx values ('agent', api_v1.create_task(title => 'By an agent', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => '00000000-0000-0000-0000-0000000000d1', accountable_person_id => '00000000-0000-0000-0000-0000000000d2')::text);
select is((select channel || '|' || client_id from shared.api_write_log where record_id = (select (v::jsonb -> 'item' ->> 'id')::uuid from ctx where k = 'agent')),
  'agent|agent-x', 'AC-014: a client id claim logs the agent channel and the client');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($q$ insert into shared.api_write_log (person_id, org_id, operation, channel) values (shared.current_person_id(), shared.current_org_id(), 'x', 'api') $q$,
  '42501', null, 'AC-014: a person cannot insert a write-log row');
select throws_ok($q$ update shared.api_write_log set operation = 'x' $q$, '42501', null, 'AC-014: a person cannot update a write-log row');
select throws_ok($q$ delete from shared.api_write_log $q$, '42501', null, 'AC-014: a person cannot delete a write-log row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.api_write_log where person_id = '00000000-0000-0000-0000-0000000000d1'), 0, 'a person reads only their own write-log rows');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select cmp_ok((select count(*)::int from shared.api_write_log where person_id = '00000000-0000-0000-0000-0000000000d1'), '>', 0, 'an admin reads the org''s write-log rows');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is((select count(*)::int from shared.api_write_log), 0, 'an admin of another org reads none of them');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- edit_task — AC-003, 005, 006, 009, 010
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(
  (select string_agg(k || '=' || split_part(pg_temp.err(format($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => jsonb_build_object(%L, 'x')) $q$, k)), '|', 3), ';' order by k)
     from unnest(array['created_by','author_id','org_id','channel','foo']) k),
  'author_id=author_id;channel=channel;created_by=created_by;foo=foo;org_id=org_id',
  'AC-003: an actor, author, org or channel key in changes is invalid_input naming the key');
select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"created_by":"00000000-0000-0000-0000-0000000000d5"}') $q$) ~ '^PT400\|invalid_input\|created_by\|', true, 'AC-003: refusal is 400');
select is((select created_by from mos.tasks where id = '00000000-0000-0000-0000-0000000000f1'), '00000000-0000-0000-0000-0000000000d1'::uuid, 'AC-003: nothing changed');
select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{}') $q$) ~ '^PT400\|invalid_input\|changes\|', true, 'empty changes is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"status":"Nope"}') $q$) ~ '^PT400\|invalid_input\|status\|', true, 'a bad status is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"due_date":"garbage"}') $q$) ~ '^PT400\|invalid_input\|due_date\|', true, 'a bad date is invalid_input');

select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"archived_at":"2026-01-01"}') $q$),
  'PT403|refused.archive||Archiving, restoring and retracting can''t be done through the API or an agent. Do this in MOS.',
  'AC-006: an archive key is refused with the exact message');
select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"title":"ok","retract_reason":"x"}') $q$),
  'PT403|refused.archive||Archiving, restoring and retracting can''t be done through the API or an agent. Do this in MOS.',
  'AC-006: a refusal key beside a valid one refuses the whole edit');
select is((select title || '|' || coalesce(archived_at::text, 'live') from mos.tasks where id = '00000000-0000-0000-0000-0000000000f1'), 'Fixture task|live', 'AC-006: nothing changed');

select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"title":"y"}', expected_updated_at => '2000-01-01') $q$) ~ '^PT409\|conflict\|\|', true, 'AC-010: a stale expected_updated_at is conflict');
select is((select title from mos.tasks where id = '00000000-0000-0000-0000-0000000000f1'), 'Fixture task', 'AC-010: nothing changed');
select lives_ok($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"description":"d"}',
  expected_updated_at => (select updated_at from mos.tasks where id = '00000000-0000-0000-0000-0000000000f1')) $q$,
  'a matching expected_updated_at lets the edit through');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"title":"nope"}') $q$),
  'PT403|forbidden||You don''t have permission to do this in MOS.', 'AC-009: readable but not editable is forbidden');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"title":"nope"}') $q$),
  'PT404|not_found||Task not found.', 'AC-009: unreadable is not_found');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into ctx values ('e1', api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"status":"Done"}')::text);
select is((select v::jsonb -> 'item' ->> 'status' from ctx where k = 'e1'), 'Done', 'AC-005: the edit returns the Task as get_task reads it');
select isnt((select v::jsonb -> 'item' ->> 'completed_at' from ctx where k = 'e1'), null, 'AC-005: completed_at is set by the existing guard');
select is((select from_value || '>' || to_value from mos.task_events where task_id = '00000000-0000-0000-0000-0000000000f1' and event_type = 'status_changed'),
  'Open>Done', 'AC-005: a status-change event records from and to');

select lives_ok($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1',
  changes => '{"title":"Renamed","due_date":"2026-12-31","consulted_person_ids":["00000000-0000-0000-0000-0000000000d4"],"team_id":"00000000-0000-0000-0000-0000000000c3"}') $q$,
  'a multi-field edit succeeds');
select is((select array_agg(coalesce(from_value, '-') || '>' || to_value order by to_value collate "C") from mos.task_events where task_id = '00000000-0000-0000-0000-0000000000f1' and event_type = 'field_edited'),
  array['00000000-0000-0000-0000-0000000000c1>00000000-0000-0000-0000-0000000000c3', '->2026-12-31', 'Fixture task>Renamed', '->d'],
  'one field-edit event per changed field records from and to');
select is((select count(*)::int from mos.task_events where task_id = '00000000-0000-0000-0000-0000000000f1' and event_type = 'raci_edited'), 1, 'a RACI change writes a raci_edited event');
select is((select business_unit_id from mos.tasks where id = '00000000-0000-0000-0000-0000000000f1'), '00000000-0000-0000-0000-0000000000a3'::uuid, 'changing the Team moves the Business Unit with it');
insert into ctx values ('ev', (select count(*)::text from mos.task_events where task_id = '00000000-0000-0000-0000-0000000000f1'));
select lives_ok($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f1', changes => '{"title":"Renamed"}') $q$, 'an edit that changes nothing succeeds');
select is((select count(*)::text from mos.task_events where task_id = '00000000-0000-0000-0000-0000000000f1'),
  (select v from ctx where k = 'ev'), 'an edit that changes nothing writes no event');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- checklist
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is(jsonb_array_length(api_v1.add_checklist_item(task_id => '00000000-0000-0000-0000-0000000000f1', label => 'Second') -> 'item' -> 'checklist'), 2, 'add_checklist_item returns the Task with the item appended');
select is((select label || '|' || position from mos.task_checklist_items where task_id = '00000000-0000-0000-0000-0000000000f1' order by position desc limit 1), 'Second|1', 'the new item takes the next position');
select is(pg_temp.err($q$ select api_v1.add_checklist_item(task_id => '00000000-0000-0000-0000-0000000000f1', label => ' ') $q$) ~ '^PT400\|invalid_input\|label\|', true, 'a blank label is invalid_input');
select is((api_v1.set_checklist_item(item_id => '00000000-0000-0000-0000-0000000000e1', is_done => true, label => 'First!') -> 'item' -> 'checklist' -> 0) ->> 'is_done', 'true', 'set_checklist_item updates the item');
select is(pg_temp.err($q$ select api_v1.set_checklist_item(item_id => '00000000-0000-0000-0000-0000000000e1') $q$) ~ '^PT400\|invalid_input\|', true, 'set_checklist_item with nothing to change is invalid_input');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.add_checklist_item(task_id => '00000000-0000-0000-0000-0000000000f1', label => 'x') $q$),
  'PT403|forbidden||You don''t have permission to do this in MOS.', 'a non-editor adding an item is forbidden');
select is(pg_temp.err($q$ select api_v1.set_checklist_item(item_id => '00000000-0000-0000-0000-00000000dead', is_done => true) $q$) ~ '^PT404\|not_found\|item_id\|', true, 'an unknown checklist item is not_found');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- refused_action — AC-006, AC-007
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is(
  (select string_agg(a || '=' || split_part(pg_temp.err(format($q$ select api_v1.refused_action(%L, 'task', gen_random_uuid()) $q$, a)), '|', 1) || split_part(pg_temp.err(format($q$ select api_v1.refused_action(%L, 'task', gen_random_uuid()) $q$, a)), '|', 2), ';' order by a)
     from unnest(array['archive','restore','retract','delete','change_objective','change_target','change_permissions','money']) a),
  'archive=PT403refused.archive;change_objective=PT403refused.targets;change_permissions=PT403refused.permissions;change_target=PT403refused.targets;delete=PT403refused.delete;money=PT403refused.money;restore=PT403refused.archive;retract=PT403refused.archive',
  'AC-006/007: each refused action answers its refusal code on a random id, never not_found');
select is(pg_temp.err($q$ select api_v1.refused_action('archive') $q$),
  'PT403|refused.archive||Archiving, restoring and retracting can''t be done through the API or an agent. Do this in MOS.', 'refused.archive message is exact');
select is(pg_temp.err($q$ select api_v1.refused_action('delete') $q$),
  'PT403|refused.delete||Deleting can''t be done through the API or an agent. Do this in MOS.', 'refused.delete message is exact');
select is(pg_temp.err($q$ select api_v1.refused_action('change_target') $q$),
  'PT403|refused.targets||Objective settings and key-result targets can''t be changed through the API or an agent. Do this in MOS.', 'refused.targets message is exact');
select is(pg_temp.err($q$ select api_v1.refused_action('change_permissions') $q$),
  'PT403|refused.permissions||People, roles and access can''t be changed through the API or an agent. Do this in MOS.', 'refused.permissions message is exact');
select is(pg_temp.err($q$ select api_v1.refused_action('money') $q$),
  'PT403|refused.money||Money can''t be read or changed through the API or an agent yet. Do this in MOS.', 'refused.money message is exact');
select is(pg_temp.err($q$ select api_v1.refused_action('frobnicate') $q$) ~ '^PT400\|invalid_input\|action\|', true, 'an unknown action is invalid_input naming the field');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-012 — the write budget
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select lives_ok($q$ do $d$ begin
  for i in 1..60 loop
    perform api_v1.create_task(title => 'budget ' || i, team_id => '00000000-0000-0000-0000-0000000000c1',
      responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id());
  end loop; end $d$ $q$, 'AC-012: 60 writes in a minute succeed');
select is(pg_temp.err($q$ select api_v1.create_task(title => 'one too many', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id()) $q$) ~ '^PT429\|rate_limited\|\|', true, 'AC-012: the 61st write is rate_limited (429)');
select is((select count(*)::int from mos.tasks where title = 'one too many'), 0, 'AC-012: the refused write changed nothing');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select lives_ok($q$ select api_v1.create_task(title => 'other person', team_id => '00000000-0000-0000-0000-0000000000c1',
  responsible_person_id => shared.current_person_id(), accountable_person_id => shared.current_person_id()) $q$,
  'AC-012: another person''s write still succeeds');

-- The 100-item cap: a Task reaches exactly 100 items, and the next one is refused.
reset role;
insert into mos.task_checklist_items (task_id, label, position)
  select '00000000-0000-0000-0000-0000000000f1', 'fill ' || n, n + 10
    from generate_series(1, 99 - (select count(*)::int from mos.task_checklist_items where task_id = '00000000-0000-0000-0000-0000000000f1')) n;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(jsonb_array_length(api_v1.add_checklist_item(task_id => '00000000-0000-0000-0000-0000000000f1', label => 'the hundredth') -> 'item' -> 'checklist'), 100, 'the 100th checklist item is accepted');
select is(pg_temp.err($q$ select api_v1.add_checklist_item(task_id => '00000000-0000-0000-0000-0000000000f1', label => 'one too many') $q$) ~ '^PT400\|invalid_input\|task_id\|', true, 'the 101st checklist item is refused');

-- get_task returns every linked Signal id, however many there are.
reset role;
insert into mos.signals (id, org_id, author_id, audience, occurred_at, body)
  select ('00000000-0000-0000-0000-00000009' || lpad(n::text, 4, '0'))::uuid, '00000000-0000-0000-0000-0000000000a1',
         '00000000-0000-0000-0000-0000000000d1', 'org', now(), 'linked ' || n
    from generate_series(1, 105) n;
insert into mos.signal_tasks (signal_id, task_id, created_by)
  select ('00000000-0000-0000-0000-00000009' || lpad(n::text, 4, '0'))::uuid, '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1'
    from generate_series(1, 105) n;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(jsonb_array_length(api_v1.get_task('00000000-0000-0000-0000-0000000000f1') -> 'item' -> 'signal_ids'), 105, 'get_task returns all linked Signal ids');

select * from finish();
rollback;
