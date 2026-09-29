-- api_v1 operation layer (slice b): Signal and Project/Process reads and writes, the search-input cap on
-- every list, the hand-away equivalence row. AC-001 (operation x role equivalence matrix, every write
-- here), AC-008, AC-010, AC-011, AC-015, AC-018 and the AC-006 refusals for Signals and Projects/Processes.
--
-- Personas (shared._test_seed_directory + _test_seed_access_roles):
--   author d1 (Staff R; PIC of the fixture task)   lead d2 (Lead R; manages d1)   head d3 (Exec; manages
--   all; also holds the admin access role in the seed)   d4 peer (also probed with ops_lead)
--   d5 report (under d1 and d4)   d7 (probed with finance)   b4 member of another org.
begin;
create extension if not exists pgtap with schema extensions;
select plan(130);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

-- ── fixtures (as postgres) ───────────────────────────────────────────────────────────────────
insert into shared.teams (id, org_id, business_unit_id, name, code) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','Team One','t1'),
  ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3','Team Three','t3');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1', true);
insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id, created_by) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','Fixture task','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1');
-- three Tasks whose Accountable is d4 (not a manager of the person in charge d1): the hand-away fixtures
insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id, created_by)
select ('00000000-0000-0000-0000-0000000000' || n)::uuid, '00000000-0000-0000-0000-0000000000a1', 'Hand-away ' || n,
       '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1',
       '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000d1'
  from unnest(array['f3','f4','f5']) n;

insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body, attention, category) values
  ('00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','org',null, now() - interval '1 hour','Fixture signal about coffee','Needs attention','Quality'),
  ('00000000-0000-0000-0000-0000000005a4','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','org',null, now() - interval '3 hours','Older signal','FYI',null),
  ('00000000-0000-0000-0000-0000000005a3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','team','00000000-0000-0000-0000-0000000000c3', now() - interval '2 hours','Team signal','FYI',null);
insert into mos.signals (id, org_id, author_id, audience, occurred_at, body, retracted_at, retract_reason) values
  ('00000000-0000-0000-0000-0000000005a2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','org', now() - interval '2 hours','Retracted signal', now(), 'wrong');
insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_person_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000005a1','person','00000000-0000-0000-0000-0000000000d4');
insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_bu_id, revoked_at) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000005a1','bu','00000000-0000-0000-0000-0000000000a2', now());
insert into mos.signal_acknowledgements (org_id, signal_id, person_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000005a1','00000000-0000-0000-0000-0000000000d4');
insert into mos.signal_tasks (org_id, signal_id, task_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000005a4','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d2');
insert into mos.comments (org_id, author_id, entity_type, entity_id, body) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','signal','00000000-0000-0000-0000-0000000005a1','A comment');

insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id) values
  ('00000000-0000-0000-0000-0000000006a1','00000000-0000-0000-0000-0000000000a1','Alpha project','project','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000006a3','00000000-0000-0000-0000-0000000000a1','Gamma process','process','00000000-0000-0000-0000-0000000000a3',null);
insert into mos.work_lines (id, org_id, name, type, business_unit_id, archived_at) values
  ('00000000-0000-0000-0000-0000000006a2','00000000-0000-0000-0000-0000000000a1','Beta archived','project','00000000-0000-0000-0000-0000000000a2', now());

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
-- The owner default no longer grants PUBLIC execute, so the session-local helpers are granted.
grant execute on all functions in schema pg_temp to public;

set local role authenticated;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Signal reads
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select array_agg(e ->> 'body' order by ord) from jsonb_array_elements(api_v1.list_signals() -> 'items') with ordinality x(e, ord)),
  array['Fixture signal about coffee','Older signal'], 'list_signals returns the readable live Signals, newest occurred_at first');
select is(jsonb_array_length(api_v1.list_signals(include_retracted => true) -> 'items'), 3, 'list_signals include_retracted returns the retracted Signal too');
select is(jsonb_array_length(api_v1.list_signals(attention => array['Needs attention']) -> 'items'), 1, 'list_signals filters by attention');
select is((api_v1.list_signals(author_id => '00000000-0000-0000-0000-0000000000d2') -> 'items' -> 0) ->> 'body', 'Older signal', 'list_signals filters by author');
select is(jsonb_array_length(api_v1.list_signals(occurred_from => now() - interval '90 minutes', occurred_to => now()) -> 'items'), 1, 'list_signals filters by occurred_from and occurred_to');
select is((api_v1.list_signals(q => 'COFFEE') -> 'items' -> 0) ->> 'id', '00000000-0000-0000-0000-0000000005a1', 'list_signals q matches the body, case-insensitively');
select is((api_v1.list_signals(linked_task_id => '00000000-0000-0000-0000-0000000000f1') -> 'items' -> 0) ->> 'id', '00000000-0000-0000-0000-0000000005a4', 'list_signals filters by linked Task');
select is(jsonb_array_length(api_v1.list_signals(updated_since => now() + interval '1 hour') -> 'items'), 0, 'list_signals filters by updated_since');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(api_v1.list_signals() -> 'items' -> 0) k),
  array['attention','audience','author_id','body','category','created_at','edited_at','id','occurred_at','owning_team_id','retract_reason','retracted_at','source','updated_at'],
  'a Signal record carries exactly the spec fields');
select is(
  (select count(distinct e ->> 'id')::int from (
     select jsonb_array_elements(api_v1.list_signals("limit" => 1) -> 'items') as e
     union all
     select jsonb_array_elements(api_v1.list_signals("limit" => 1,
         cursor => api_v1.list_signals("limit" => 1) ->> 'next_cursor') -> 'items')) x),
  2, 'list_signals cursor continues without repeats');
select alike(pg_temp.err($q$ select api_v1.list_signals(attention => array['Nope']) $q$), 'PT400|invalid_input|attention|%', 'an unknown attention is invalid_input naming the field');
select alike(pg_temp.err($q$ select api_v1.list_signals(cursor => 'not-a-cursor') $q$), 'PT400|invalid_input|cursor|%', 'a malformed Signal cursor is invalid_input');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(jsonb_array_length(api_v1.list_signals() -> 'items'), 3, 'an author also reads their own Team-audience Signal');

-- get_signal: one shape; the same answer for a missing id and an unreadable one (AC-008)
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is(api_v1.get_signal('00000000-0000-0000-0000-0000000005a1') -> 'item' ->> 'body', 'Fixture signal about coffee', 'get_signal returns the Signal');
select is(api_v1.get_signal('00000000-0000-0000-0000-0000000005a1') -> 'item' -> 'mentions',
  '[{"kind":"person","id":"00000000-0000-0000-0000-0000000000d4"}]'::jsonb, 'get_signal lists the active mentions only');
select is(jsonb_array_length(api_v1.get_signal('00000000-0000-0000-0000-0000000005a1') -> 'item' -> 'comments'), 1, 'get_signal carries the comments');
select is(api_v1.get_signal('00000000-0000-0000-0000-0000000005a1') -> 'item' ->> 'acknowledged_by_me', 'true', 'acknowledged_by_me is true for the person who acknowledged');
select is(api_v1.get_signal('00000000-0000-0000-0000-0000000005a4') -> 'item' -> 'task_ids',
  '["00000000-0000-0000-0000-0000000000f1"]'::jsonb, 'get_signal lists the linked Task ids');
select is(api_v1.get_signal('00000000-0000-0000-0000-0000000005a4') -> 'item' ->> 'acknowledged_by_me', 'false', 'acknowledged_by_me is false for anyone else');
select is(pg_temp.err($q$ select api_v1.get_signal('00000000-0000-0000-0000-0000000005a3') $q$),
  pg_temp.err($q$ select api_v1.get_signal('00000000-0000-0000-0000-00000000dead') $q$),
  'AC-008: an unreadable Signal answers exactly like a missing one');
select is(pg_temp.err($q$ select api_v1.get_signal('00000000-0000-0000-0000-00000000dead') $q$),
  'PT404|not_found||Signal not found.', 'get_signal on a missing id is not_found');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.get_signal('00000000-0000-0000-0000-0000000005a1') $q$),
  'PT404|not_found||Signal not found.', 'NFR-003: another org''s Signal answers exactly like a missing one');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Project/Process reads
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select array_agg(e ->> 'name' order by ord) from jsonb_array_elements(api_v1.list_projects_processes() -> 'items') with ordinality x(e, ord)),
  array['Alpha project','Gamma process'], 'list_projects_processes returns the live ones by name');
select is(jsonb_array_length(api_v1.list_projects_processes(include_archived => true) -> 'items'), 3, 'include_archived returns the archived one too');
select is((api_v1.list_projects_processes(type => 'process') -> 'items' -> 0) ->> 'name', 'Gamma process', 'list_projects_processes filters by type');
select is((api_v1.list_projects_processes(business_unit_id => '00000000-0000-0000-0000-0000000000a2') -> 'items' -> 0) ->> 'name', 'Alpha project', 'list_projects_processes filters by Business Unit');
select is((api_v1.list_projects_processes(q => 'GAMMA') -> 'items' -> 0) ->> 'id', '00000000-0000-0000-0000-0000000006a3', 'list_projects_processes q matches the name, case-insensitively');
select is(jsonb_array_length(api_v1.list_projects_processes(updated_since => now() + interval '1 hour') -> 'items'), 0, 'list_projects_processes filters by updated_since');
select is(
  (select count(distinct e ->> 'id')::int from (
     select jsonb_array_elements(api_v1.list_projects_processes("limit" => 1) -> 'items') as e
     union all
     select jsonb_array_elements(api_v1.list_projects_processes("limit" => 1,
         cursor => api_v1.list_projects_processes("limit" => 1) ->> 'next_cursor') -> 'items')) x),
  2, 'list_projects_processes cursor continues without repeats');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(api_v1.get_project_process('00000000-0000-0000-0000-0000000006a1') -> 'item') k),
  array['accountable_person_id','archived_at','business_unit_id','created_at','id','name','objective_id','responsible_person_id','type','updated_at'],
  'a Project/Process record carries the spec fields and no internal code or version');
select is(pg_temp.err($q$ select api_v1.get_project_process('00000000-0000-0000-0000-00000000dead') $q$),
  'PT404|not_found||Project or Process not found.', 'get_project_process on a missing id is not_found');
select alike(pg_temp.err($q$ select api_v1.list_projects_processes(type => 'nope') $q$), 'PT400|invalid_input|type|%', 'an unknown type filter is invalid_input');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Hardening 1: every search input is capped at 200 characters, on every list
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is(
  (select string_agg(f || '=' || pg_temp.err(format($q$ select api_v1.%s(q => repeat('a', 201)) $q$, f)), ';' order by f)
     from unnest(array['list_people','list_projects_processes','list_signals','list_tasks','list_teams']) f),
  'list_people=PT400|invalid_input|q|q must be at most 200 characters.;list_projects_processes=PT400|invalid_input|q|q must be at most 200 characters.;list_signals=PT400|invalid_input|q|q must be at most 200 characters.;list_tasks=PT400|invalid_input|q|q must be at most 200 characters.;list_teams=PT400|invalid_input|q|q must be at most 200 characters.',
  'a 201-character q is invalid_input naming q on every list');
select is(
  (select string_agg(f || '=' || pg_temp.err(format($q$ select api_v1.%s(q => repeat('a', 200)) $q$, f)), ';' order by f)
     from unnest(array['list_people','list_projects_processes','list_signals','list_tasks','list_teams']) f),
  'list_people=no error;list_projects_processes=no error;list_signals=no error;list_tasks=no error;list_teams=no error',
  'a 200-character q is accepted on every list');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- AC-001 — the layer allows and refuses exactly what the direct table path does
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is(pg_temp.matrix(
  $q$ select api_v1.create_signal(body => 'm') $q$,
  $q$ select mos.create_signal_with_mentions('m', now(), '[]'::jsonb, 'FYI') $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=A/A;report=A/A;finance=A/A;admin=A/A;other_org=A/A;',
  'AC-001 create_signal: layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.create_signal(body => 'm', mentions => '[{"kind":"person","id":"00000000-0000-0000-0000-0000000000d4"}]') $q$,
  $q$ select mos.create_signal_with_mentions('m', now(), '[{"kind":"person","targetId":"00000000-0000-0000-0000-0000000000d4"}]'::jsonb, 'FYI') $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=A/A;report=A/A;finance=A/A;admin=A/A;other_org=R/R;',
  'AC-001 create_signal (person mention): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.create_signal(body => 'm', mentions => '[{"kind":"team","id":"00000000-0000-0000-0000-0000000000c3"}]') $q$,
  $q$ select mos.create_signal_with_mentions('m', now(), '[{"kind":"team","targetId":"00000000-0000-0000-0000-0000000000c3"}]'::jsonb, 'FYI') $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=A/A;report=A/A;finance=A/A;admin=A/A;other_org=R/R;',
  'AC-001 create_signal (team mention): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.create_signal(body => 'm', mentions => '[{"kind":"business_unit","id":"00000000-0000-0000-0000-0000000000a3"}]') $q$,
  $q$ select mos.create_signal_with_mentions('m', now(), '[{"kind":"bu","targetId":"00000000-0000-0000-0000-0000000000a3"}]'::jsonb, 'FYI') $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=A/A;report=A/A;finance=A/A;admin=A/A;other_org=R/R;',
  'AC-001 create_signal (business unit mention): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.create_signal(body => 'm', link_task_ids => array['00000000-0000-0000-0000-0000000000f1']::uuid[]) $q$,
  $q$ do $d$ declare v uuid; begin
        v := mos.create_signal_with_mentions('m', now(), '[]'::jsonb, 'FYI');
        insert into mos.signal_tasks (signal_id, task_id, created_by) values (v, '00000000-0000-0000-0000-0000000000f1', shared.current_person_id());
      end $d$ $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=A/A;report=A/A;finance=A/A;admin=A/A;other_org=R/R;',
  'AC-001 create_signal (linked Task): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"body":"edited"}') $q$,
  $q$ do $d$ begin
        update mos.signals set body = 'edited' where id = '00000000-0000-0000-0000-0000000005a1';
        if not found then raise exception 'no row'; end if;
      end $d$ $q$),
  'author=A/A;lead=R/R;head=R/R;ops_lead=R/R;report=R/R;finance=R/R;admin=R/R;other_org=R/R;',
  'AC-001 edit_signal (body): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"attention":"Urgent","category":"People","occurred_at":"2026-01-02T03:04:05Z"}') $q$,
  $q$ do $d$ begin
        update mos.signals set attention = 'Urgent', category = 'People', occurred_at = '2026-01-02T03:04:05Z' where id = '00000000-0000-0000-0000-0000000005a1';
        if not found then raise exception 'no row'; end if;
      end $d$ $q$),
  'author=A/A;lead=R/R;head=R/R;ops_lead=R/R;report=R/R;finance=R/R;admin=R/R;other_org=R/R;',
  'AC-001 edit_signal (attention, category, occurred_at): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.link_signal_task(signal_id => '00000000-0000-0000-0000-0000000005a1', task_id => '00000000-0000-0000-0000-0000000000f1') $q$,
  $q$ insert into mos.signal_tasks (signal_id, task_id, created_by)
      values ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000f1', shared.current_person_id()) $q$),
  'author=A/A;lead=A/A;head=A/A;ops_lead=A/A;report=A/A;finance=A/A;admin=A/A;other_org=R/R;',
  'AC-001 link_signal_task: layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.create_project_process(name => 'm', type => 'project', business_unit_id => '00000000-0000-0000-0000-0000000000a2') $q$,
  $q$ insert into mos.work_lines (name, type, business_unit_id) values ('m', 'project', '00000000-0000-0000-0000-0000000000a2') $q$),
  'author=R/R;lead=R/R;head=A/A;ops_lead=A/A;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 create_project_process: layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.create_project_process(name => 'm', type => 'process', accountable_person_id => shared.current_person_id()) $q$,
  $q$ insert into mos.work_lines (name, type, accountable_person_id) values ('m', 'process', shared.current_person_id()) $q$),
  'author=R/R;lead=R/R;head=R/R;ops_lead=A/A;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 create_project_process (no Business Unit): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => '{"name":"renamed","responsible_person_id":"00000000-0000-0000-0000-0000000000d5"}') $q$,
  $q$ do $d$ begin
        update mos.work_lines set name = 'renamed', responsible_person_id = '00000000-0000-0000-0000-0000000000d5' where id = '00000000-0000-0000-0000-0000000006a1';
        if not found then raise exception 'no row'; end if;
      end $d$ $q$),
  'author=R/R;lead=R/R;head=A/A;ops_lead=A/A;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 edit_project_process (name, responsible): layer = table for every role');

select is(pg_temp.matrix(
  $q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => '{"business_unit_id":"00000000-0000-0000-0000-0000000000a3"}') $q$,
  $q$ do $d$ begin
        update mos.work_lines set business_unit_id = '00000000-0000-0000-0000-0000000000a3' where id = '00000000-0000-0000-0000-0000000006a1';
        if not found then raise exception 'no row'; end if;
      end $d$ $q$),
  'author=R/R;lead=R/R;head=R/R;ops_lead=A/A;report=R/R;finance=R/R;admin=A/A;other_org=R/R;',
  'AC-001 edit_project_process (move to another unit): layer = table for every role');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Hand-away: an editor reassigns a Task and stops being an editor. The layer and the direct path
-- (events first) agree; a later edit is refused on both paths.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select lives_ok($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f3', changes => '{"accountable_person_id":"00000000-0000-0000-0000-0000000000d5"}') $q$,
  'hand-away: the layer lets the Accountable hand the Task to someone else');
select lives_ok($q$ do $d$ begin
    insert into mos.task_events (task_id, actor_person_id, event_type, from_value, to_value)
    values ('00000000-0000-0000-0000-0000000000f4', shared.current_person_id(), 'field_edited', 'x', 'y');
    update mos.tasks set accountable_person_id = '00000000-0000-0000-0000-0000000000d5' where id = '00000000-0000-0000-0000-0000000000f4';
    if not found then raise exception 'no row'; end if;
  end $d$ $q$, 'hand-away: the direct path (event first) lets them too');
select is(
  pg_temp.outcome($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f3', changes => '{"title":"again"}') $q$)
  || '/' ||
  pg_temp.outcome($q$ do $d$ begin
    update mos.tasks set title = 'again' where id = '00000000-0000-0000-0000-0000000000f4';
    if not found then raise exception 'no row'; end if;
  end $d$ $q$),
  'R/R', 'hand-away: afterwards the same person''s edit is refused on both paths');
select is(pg_temp.err($q$ select api_v1.edit_task(id => '00000000-0000-0000-0000-0000000000f3', changes => '{"title":"again"}') $q$),
  'PT403|forbidden||You don''t have permission to do this in MOS.', 'hand-away: the layer answers forbidden');
select is(
  pg_temp.outcome($q$ do $d$ begin
    update mos.tasks set accountable_person_id = '00000000-0000-0000-0000-0000000000d5' where id = '00000000-0000-0000-0000-0000000000f5';
    insert into mos.task_events (task_id, actor_person_id, event_type, from_value, to_value)
    values ('00000000-0000-0000-0000-0000000000f5', shared.current_person_id(), 'field_edited', 'x', 'y');
  end $d$ $q$),
  'R', 'hand-away: writing the event after the hand-over is refused, which is why the layer writes it first');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- create_signal
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
insert into ctx values ('s1', api_v1.create_signal(
  body => '  Made by the layer  ', attention => 'Urgent',
  mentions => '[{"kind":"person","id":"00000000-0000-0000-0000-0000000000d4"}]',
  link_task_ids => array['00000000-0000-0000-0000-0000000000f1']::uuid[], idempotency_key => 'sk-1')::text);
select is((select v::jsonb -> 'item' ->> 'body' from ctx where k = 's1'), 'Made by the layer', 'create_signal trims the body');
select is((select v::jsonb -> 'item' ->> 'author_id' from ctx where k = 's1'), '00000000-0000-0000-0000-0000000000d3', 'the author is the caller');
select is((select v::jsonb -> 'item' ->> 'audience' || '|' || (v::jsonb -> 'item' ->> 'attention') || '|' || (v::jsonb -> 'item' ->> 'source') from ctx where k = 's1'),
  'org|Urgent|human', 'the Signal is org-wide, human-sourced, with the given attention');
select is((select v::jsonb ->> 'replayed' from ctx where k = 's1'), 'false', 'a first create is not a replay');
select is((select v::jsonb -> 'item' -> 'mentions' from ctx where k = 's1'),
  '[{"kind":"person","id":"00000000-0000-0000-0000-0000000000d4"}]'::jsonb, 'the mention is recorded');
select is((select v::jsonb -> 'item' -> 'task_ids' from ctx where k = 's1'),
  '["00000000-0000-0000-0000-0000000000f1"]'::jsonb, 'the Task link is recorded');
select is((select count(*)::int from mos.signal_tasks where signal_id = (select (v::jsonb -> 'item' ->> 'id')::uuid from ctx where k = 's1') and created_by = '00000000-0000-0000-0000-0000000000d3'),
  1, 'the link is created by the caller');
select is((select concat_ws('|', operation, record_type, channel, idempotency_key) from shared.api_write_log
            where record_id = (select (v::jsonb -> 'item' ->> 'id')::uuid from ctx where k = 's1')),
  'create_signal|signal|api|sk-1', 'the write log names the operation, record and key');

select is(pg_temp.err($q$ select api_v1.create_signal(body => '  ') $q$), 'PT400|invalid_input|body|body must not be blank.', 'a blank body is invalid_input naming the field');
select is(pg_temp.err($q$ select api_v1.create_signal(body => repeat('x', 4001)) $q$), 'PT400|invalid_input|body|body must be at most 4000 characters.', 'an over-long body is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', attention => 'Nope') $q$), 'PT400|invalid_input|attention|%', 'an unknown attention is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', mentions => '[{"kind":"robot","id":"00000000-0000-0000-0000-0000000000d4"}]') $q$), 'PT400|invalid_input|mentions|%', 'an unknown mention kind is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', mentions => '[{"kind":"person"}]') $q$), 'PT400|invalid_input|mentions|%', 'a mention without an id is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', mentions => '{"kind":"person"}') $q$), 'PT400|invalid_input|mentions|%', 'mentions that are not a list are invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', mentions => (select jsonb_agg(jsonb_build_object('kind', 'person', 'id', gen_random_uuid())) from generate_series(1, 51))) $q$),
  'PT400|invalid_input|mentions|%', 'more than 50 mentions is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', link_task_ids => (select array_agg(gen_random_uuid()) from generate_series(1, 11))) $q$),
  'PT400|invalid_input|link_task_ids|%', 'more than 10 linked Tasks is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', link_task_ids => array['00000000-0000-0000-0000-00000000dead']::uuid[]) $q$),
  'PT404|not_found|link_task_ids|%', 'an unknown Task to link is not_found naming the field');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', mentions => '[{"kind":"person","id":"00000000-0000-0000-0000-00000000dead"}]') $q$),
  'PT403|forbidden||mention target person%', 'the posting function''s own refusal text is passed through');
select is((select count(*)::int from mos.signals where body = 'b'), 0, 'a refused create leaves no Signal behind');

-- idempotency (AC-011)
select is((api_v1.create_signal(body => 'Made by the layer', idempotency_key => 'sk-1') -> 'item' ->> 'id'),
  (select v::jsonb -> 'item' ->> 'id' from ctx where k = 's1'), 'AC-011: the same person and key return the same Signal id');
select is((api_v1.create_signal(body => 'Made by the layer', idempotency_key => 'sk-1') ->> 'replayed'), 'true', 'AC-011: the repeat is flagged replayed');
select is((select count(*)::int from mos.signals where author_id = '00000000-0000-0000-0000-0000000000d3' and body = 'Made by the layer'), 1, 'AC-011: one Signal exists');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((api_v1.create_signal(body => 'Made by the layer', idempotency_key => 'sk-1') ->> 'replayed'), 'false', 'AC-011: another person using the same key gets their own Signal');
select alike(pg_temp.err($q$ select api_v1.create_signal(body => 'b', idempotency_key => '') $q$), 'PT400|invalid_input|idempotency_key|%', 'an empty idempotency key is invalid_input');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- edit_signal — AC-003, 006, 010, 015
-- ═════════════════════════════════════════════════════════════════════════════════════════════
select is(
  (select string_agg(k || '=' || split_part(pg_temp.err(format($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => jsonb_build_object(%L, 'x')) $q$, k)), '|', 3), ';' order by k)
     from unnest(array['author_id','created_by','org_id','channel','source','foo']) k),
  'author_id=author_id;channel=channel;created_by=created_by;foo=foo;org_id=org_id;source=source',
  'AC-003: an actor, author, org, channel or unknown key in changes is invalid_input naming the key');
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{}') $q$) ~ '^PT400\|invalid_input\|changes\|', true, 'empty changes is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"body":"  "}') $q$),
  'PT400|invalid_input|body|body must not be blank.', 'a blank body is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"attention":"Nope"}') $q$) ~ '^PT400\|invalid_input\|attention\|', true, 'a bad attention is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"category":"Nope"}') $q$) ~ '^PT400\|invalid_input\|category\|', true, 'a bad category is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"occurred_at":"garbage"}') $q$) ~ '^PT400\|invalid_input\|occurred_at\|', true, 'a bad occurred_at is invalid_input');

select is(
  (select string_agg(k || '=' || split_part(pg_temp.err(format($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => jsonb_build_object(%L, 'x')) $q$, k)), '|', 2), ';' order by k)
     from unnest(array['audience','owning_team_id','mentions']) k),
  'audience=refused.permissions;mentions=refused.permissions;owning_team_id=refused.permissions',
  'AC-006: an audience, owning-team or mention change is refused.permissions');
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"audience":"team"}') $q$),
  'PT403|refused.permissions||People, roles and access can''t be changed through the API or an agent. Do this in MOS.', 'AC-006: the permissions refusal carries its exact message');
select is(
  (select string_agg(k || '=' || split_part(pg_temp.err(format($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => jsonb_build_object(%L, 'x')) $q$, k)), '|', 2), ';' order by k)
     from unnest(array['retracted','retracted_at','retract_reason','archived','archived_at']) k),
  'archived=refused.archive;archived_at=refused.archive;retract_reason=refused.archive;retracted=refused.archive;retracted_at=refused.archive',
  'AC-006: a retraction or archive key is refused.archive');
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"body":"ok","retract_reason":"x"}') $q$),
  'PT403|refused.archive||Archiving, restoring and retracting can''t be done through the API or an agent. Do this in MOS.', 'AC-006: a refusal key beside a valid one refuses the whole edit');
select is((select body || '|' || coalesce(retracted_at::text, 'live') from mos.signals where id = '00000000-0000-0000-0000-0000000005a1'), 'Fixture signal about coffee|live', 'AC-006: nothing changed');

select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"body":"y"}', expected_updated_at => '2000-01-01') $q$) ~ '^PT409\|conflict\|\|', true, 'AC-010: a stale expected_updated_at is conflict');
select is((select body from mos.signals where id = '00000000-0000-0000-0000-0000000005a1'), 'Fixture signal about coffee', 'AC-010: nothing changed');

insert into ctx values ('e1', api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1',
  changes => '{"body":"Edited body","attention":"Urgent","category":null}',
  expected_updated_at => (select updated_at from mos.signals where id = '00000000-0000-0000-0000-0000000005a1'))::text);
select is((select v::jsonb -> 'item' ->> 'body' || '|' || (v::jsonb -> 'item' ->> 'attention') || '|' || coalesce(v::jsonb -> 'item' ->> 'category', '-') from ctx where k = 'e1'),
  'Edited body|Urgent|-', 'the edit returns the Signal as get_signal reads it, category cleared by null');
select isnt((select v::jsonb -> 'item' ->> 'edited_at' from ctx where k = 'e1'), null, 'edited_at is set by the existing guard');
select is((select array_agg(field order by field) from mos.signal_revisions where signal_id = '00000000-0000-0000-0000-0000000005a1'),
  array['attention','body','category'], 'the guard writes one revision per changed field');
select is(api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"body":"Edited body"}') -> 'item' ->> 'body', 'Edited body', 'an edit that changes nothing succeeds');
select is((select count(*)::int from mos.signal_revisions where signal_id = '00000000-0000-0000-0000-0000000005a1'), 3, 'an edit that changes nothing writes no revision');

-- AC-015: a non-author is forbidden with the guard's own message and no revision is written
select is(
  (select string_agg(p || '=' || pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a1', changes => '{"body":"hijack"}') $q$), ';' order by p)
     from (select 'd2' as p, set_config('request.jwt.claims', pg_temp.claims('a1', 'd2', '"member"'), true)
           union all select 'd5', set_config('request.jwt.claims', pg_temp.claims('a1', 'd5', '"member"'), true)) x),
  'd2=PT403|forbidden||signal content is author-only; signal.retract may only retract;d5=PT403|forbidden||signal content is author-only; signal.retract may only retract',
  'AC-015: a non-author, with or without retract authority, gets the guard''s own message');
select is((select count(*)::int from mos.signal_revisions where signal_id = '00000000-0000-0000-0000-0000000005a1'), 3, 'AC-015: no revision row was written');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-0000000005a3', changes => '{"body":"x"}') $q$),
  'PT404|not_found||Signal not found.', 'an unreadable Signal is not_found on edit');
select is(pg_temp.err($q$ select api_v1.edit_signal(id => '00000000-0000-0000-0000-00000000dead', changes => '{"body":"x"}') $q$),
  'PT404|not_found||Signal not found.', 'a missing Signal is not_found on edit');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- link_signal_task
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is(api_v1.link_signal_task(signal_id => '00000000-0000-0000-0000-0000000005a1', task_id => '00000000-0000-0000-0000-0000000000f1') -> 'item' -> 'task_ids',
  '["00000000-0000-0000-0000-0000000000f1"]'::jsonb, 'link_signal_task returns the Signal with the link');
select is(api_v1.link_signal_task(signal_id => '00000000-0000-0000-0000-0000000005a1', task_id => '00000000-0000-0000-0000-0000000000f1') -> 'item' -> 'task_ids',
  '["00000000-0000-0000-0000-0000000000f1"]'::jsonb, 'an existing link is success');
select is((select count(*)::int from mos.signal_tasks where signal_id = '00000000-0000-0000-0000-0000000005a1'), 1, 'the repeat adds no second link');
select is((select created_by from mos.signal_tasks where signal_id = '00000000-0000-0000-0000-0000000005a1'), '00000000-0000-0000-0000-0000000000d4'::uuid, 'the link is created by the caller');
select is(pg_temp.err($q$ select api_v1.link_signal_task(signal_id => '00000000-0000-0000-0000-00000000dead', task_id => '00000000-0000-0000-0000-0000000000f1') $q$),
  'PT404|not_found|signal_id|Signal not found.', 'an unknown Signal is not_found naming the field');
select is(pg_temp.err($q$ select api_v1.link_signal_task(signal_id => '00000000-0000-0000-0000-0000000005a1', task_id => '00000000-0000-0000-0000-00000000dead') $q$),
  'PT404|not_found|task_id|Task not found.', 'an unknown Task is not_found naming the field');
select is(pg_temp.err($q$ select api_v1.link_signal_task(signal_id => '00000000-0000-0000-0000-0000000005a3', task_id => '00000000-0000-0000-0000-0000000000f1') $q$),
  'PT404|not_found|signal_id|Signal not found.', 'an unreadable Signal is not_found');
select is(pg_temp.err($q$ select api_v1.link_signal_task(signal_id => null, task_id => '00000000-0000-0000-0000-0000000000f1') $q$) ~ '^PT400\|invalid_input\|signal_id\|', true, 'a missing signal_id is invalid_input');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- create_project_process
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
insert into ctx values ('w1', api_v1.create_project_process(
  name => '  Layer project  ', type => 'project', business_unit_id => '00000000-0000-0000-0000-0000000000a2',
  accountable_person_id => '00000000-0000-0000-0000-0000000000d2', idempotency_key => 'wk-1')::text);
select is((select v::jsonb -> 'item' ->> 'name' || '|' || (v::jsonb -> 'item' ->> 'type') || '|' || (v::jsonb ->> 'replayed') from ctx where k = 'w1'),
  'Layer project|project|false', 'create_project_process trims the name and returns the record');
select is((select code from mos.work_lines where id = (select (v::jsonb -> 'item' ->> 'id')::uuid from ctx where k = 'w1')), 'standard', 'the internal code is the default');
select is((select concat_ws('|', operation, record_type, channel, idempotency_key) from shared.api_write_log
            where record_id = (select (v::jsonb -> 'item' ->> 'id')::uuid from ctx where k = 'w1')),
  'create_project_process|project_process|api|wk-1', 'the write log names the operation, record and key');
select is(pg_temp.err($q$ select api_v1.create_project_process(name => ' ', type => 'project') $q$), 'PT400|invalid_input|name|name must not be blank.', 'a blank name is invalid_input');
select is(pg_temp.err($q$ select api_v1.create_project_process(name => repeat('x', 201), type => 'project') $q$), 'PT400|invalid_input|name|name must be at most 200 characters.', 'an over-long name is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_project_process(name => 'n', type => 'thing') $q$), 'PT400|invalid_input|type|%', 'an unknown type is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_project_process(name => 'n', type => null) $q$), 'PT400|invalid_input|type|%', 'a missing type is invalid_input');
select alike(pg_temp.err($q$ select api_v1.create_project_process(name => 'n', type => 'project', business_unit_id => '00000000-0000-0000-0000-00000000dead') $q$),
  'PT404|not_found|business_unit_id|%', 'an unknown Business Unit is not_found naming the field');
select is((api_v1.create_project_process(name => 'Layer project', type => 'project', idempotency_key => 'wk-1') -> 'item' ->> 'id'),
  (select v::jsonb -> 'item' ->> 'id' from ctx where k = 'w1'), 'AC-011: the same person and key return the same Project/Process');
select is((select count(*)::int from mos.work_lines where name = 'Layer project'), 1, 'AC-011: one Project/Process exists');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.create_project_process(name => 'n', type => 'project', business_unit_id => '00000000-0000-0000-0000-0000000000a2') $q$),
  'PT403|forbidden||You don''t have permission to do this in MOS.', 'a person without the definition authority is forbidden');

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- edit_project_process — AC-003, 006, 010, 018
-- ═════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select is(
  (select string_agg(k || '=' || split_part(pg_temp.err(format($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => jsonb_build_object(%L, 'process')) $q$, k)), '|', 1 + 1) || '/' || split_part(pg_temp.err(format($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => jsonb_build_object(%L, 'process')) $q$, k)), '|', 3), ';' order by k)
     from unnest(array['type','code','definition_version','org_id','foo']) k),
  'code=invalid_input/code;definition_version=invalid_input/definition_version;foo=invalid_input/foo;org_id=invalid_input/org_id;type=invalid_input/type',
  'AC-018: type, the internal code, the version or any other key in changes is invalid_input naming the key');
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => '{"type":"process"}') $q$) ~ '^PT400\|invalid_input\|type\|', true, 'AC-018: refusal is 400');
select is((select type from mos.work_lines where id = '00000000-0000-0000-0000-0000000006a1'), 'project', 'AC-018: nothing changed');
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => '{}') $q$) ~ '^PT400\|invalid_input\|changes\|', true, 'empty changes is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => '{"name":" "}') $q$),
  'PT400|invalid_input|name|name must not be blank.', 'a blank name is invalid_input');
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => '{"archived_at":"2026-01-01"}') $q$),
  'PT403|refused.archive||Archiving, restoring and retracting can''t be done through the API or an agent. Do this in MOS.', 'AC-006: an archive key is refused with the exact message');
select is((select name || '|' || coalesce(archived_at::text, 'live') from mos.work_lines where id = '00000000-0000-0000-0000-0000000006a1'), 'Alpha project|live', 'AC-006: nothing changed');
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => '{"name":"y"}', expected_updated_at => '2000-01-01') $q$) ~ '^PT409\|conflict\|\|', true, 'AC-010: a stale expected_updated_at is conflict');
select is((select name from mos.work_lines where id = '00000000-0000-0000-0000-0000000006a1'), 'Alpha project', 'AC-010: nothing changed');
insert into ctx values ('p1', api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1',
  changes => '{"name":"Alpha renamed","accountable_person_id":null,"business_unit_id":"00000000-0000-0000-0000-0000000000a2"}',
  expected_updated_at => (select updated_at from mos.work_lines where id = '00000000-0000-0000-0000-0000000006a1'))::text);
select is((select v::jsonb -> 'item' ->> 'name' || '|' || (v::jsonb -> 'item' ->> 'business_unit_id') || '|' || coalesce(v::jsonb -> 'item' ->> 'accountable_person_id', '-') from ctx where k = 'p1'),
  'Alpha renamed|00000000-0000-0000-0000-0000000000a2|-', 'the edit returns the record as get_project_process reads it');
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a1', changes => '{"name":"z"}', expected_updated_at => (select updated_at from mos.work_lines where id = '00000000-0000-0000-0000-0000000006a1')) $q$),
  'no error', 'a matching expected_updated_at lets the edit through');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a3', changes => '{"name":"nope"}') $q$),
  'PT403|forbidden||You don''t have permission to do this in MOS.', 'AC-009: readable but not editable is forbidden');
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-00000000dead', changes => '{"name":"nope"}') $q$),
  'PT404|not_found||Project or Process not found.', 'a missing Project/Process is not_found on edit');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(pg_temp.err($q$ select api_v1.edit_project_process(id => '00000000-0000-0000-0000-0000000006a3', changes => '{"name":"nope"}') $q$),
  'PT404|not_found||Project or Process not found.', 'another org''s Project/Process is not_found on edit');

select * from finish();
rollback;
