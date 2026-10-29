-- Real transactions exercise membership changes against pending schedule actions.
-- The dedicated fabricated organizations are committed for dblink and removed at the end.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
begin;
insert into shared.orgs(id,name,slug) values
('70000000-0000-0000-0000-000000000001','Schedule race fixture','staff_schedule_race_fixture'),
('70000000-0000-0000-0000-000000000101','Foreign schedule fixture','staff_schedule_race_foreign');
insert into shared.business_units(id,org_id,name,code) values
('70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','Schedule fixture','staff_schedule_fixture'),
('70000000-0000-0000-0000-000000000102','70000000-0000-0000-0000-000000000101','Foreign fixture','staff_schedule_foreign');
insert into shared.sites(id,org_id,name,code) values('70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','Schedule fixture','staff_schedule_site');
insert into shared.people(id,org_id,full_name) values
('70000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000001','Schedule administrator'),
('70000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000001','Copied crew'),
('70000000-0000-0000-0000-000000000006','70000000-0000-0000-0000-000000000001','Joining crew'),
('70000000-0000-0000-0000-000000000007','70000000-0000-0000-0000-000000000001','Second crew'),
('70000000-0000-0000-0000-000000000104','70000000-0000-0000-0000-000000000101','Foreign crew');
insert into shared.person_access_roles(org_id,person_id,access_role) values('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004','admin');
insert into shared.teams(id,org_id,business_unit_id,site_id,name,code) values
('70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003','Copy fixture','staff_copy_fixture'),
('70000000-0000-0000-0000-000000000011','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003','Standing fixture','staff_standing_fixture'),
('70000000-0000-0000-0000-000000000012','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003','Shift fixture','staff_shift_fixture'),
('70000000-0000-0000-0000-000000000110','70000000-0000-0000-0000-000000000101','70000000-0000-0000-0000-000000000102',null,'Foreign fixture','staff_foreign_fixture');
insert into shared.team_memberships(org_id,person_id,team_id,effective_from) values
('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000010','2026-10-01'),
('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000006','70000000-0000-0000-0000-000000000012','2026-10-01'),
('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000007','70000000-0000-0000-0000-000000000012','2026-10-01');
insert into ops.staff_shift_templates(id,org_id,site_id,name,start_time,end_time,created_by)
values('70000000-0000-0000-0000-000000000020','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','Fixture morning','09:00','17:00','70000000-0000-0000-0000-000000000004');
insert into ops.staff_rosters(id,org_id,team_id,site_id,week_start,status,created_by,published_at)
values('70000000-0000-0000-0000-000000000030','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000003','2026-10-19','published','70000000-0000-0000-0000-000000000004','2026-10-18 00:00+00');
insert into ops.staff_shifts(id,org_id,roster_id,team_id,site_id,person_id,template_id,local_date,template_name,start_at,end_at,created_by)
values('70000000-0000-0000-0000-000000000031','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000030','70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000020','2026-10-19','Fixture morning','2026-10-19 02:00+00','2026-10-19 10:00+00','70000000-0000-0000-0000-000000000004');
commit;

begin;
select plan(14);
create temporary table staff_race_result(name text primary key,value jsonb);
create function pg_temp.staff_wait_for_advisory(p_connection text)
returns boolean language plpgsql as $$
declare deadline timestamptz := clock_timestamp()+interval '5 seconds';
begin
  while clock_timestamp()<deadline loop
    perform pg_stat_clear_snapshot();
    if exists(select 1 from pg_stat_activity where application_name=p_connection and wait_event='advisory') then return true; end if;
    if extensions.dblink_is_busy(p_connection)=0 then return false; end if;
    perform pg_sleep(0.01);
  end loop;
  return false;
end $$;
create function pg_temp.staff_take_integer(p_connection text)
returns integer language plpgsql as $$
declare result integer;
begin
  select n into result from extensions.dblink_get_result(p_connection,true) as result(n integer);
  perform n from extensions.dblink_get_result(p_connection,false) as drained(n integer);
  return result;
end $$;
create function pg_temp.staff_begin_admin(p_connection text)
returns void language plpgsql as $helper$
declare remote_ok boolean;
begin
  if current_database()<>'postgres' or session_user<>'supabase_admin' then raise exception 'fixture requires the disposable controlling login'; end if;
  perform extensions.dblink_connect(p_connection,'dbname=postgres user=supabase_admin');
  perform extensions.dblink_exec(p_connection,format(
    'begin; set local role authenticated; set local application_name=%L; set local statement_timeout=''20s''; set local search_path=pg_catalog,public,extensions; set local app.allow_test_seeds=''on''; set local app.attendance_now=''2026-10-22 03:00+00''; set local request.jwt.claims=%L',
    p_connection,'{"org_id":"70000000-0000-0000-0000-000000000001","person_id":"70000000-0000-0000-0000-000000000004","access_roles":["admin"]}'));
  select valid into remote_ok from extensions.dblink(p_connection,$identity$
    select current_database()='postgres' and session_user='supabase_admin' and current_user='authenticated'
      and shared.current_org_id()='70000000-0000-0000-0000-000000000001'::uuid
      and to_regprocedure('ops.copy_staff_roster(uuid,date)') is not null
  $identity$) as identity_check(valid boolean);
  if remote_ok is not true then raise exception 'fixture remote identity did not match'; end if;
end $helper$;

select current_setting('is_superuser')='on' as staff_can_race \gset
\if :staff_can_race
do $copy_race$
declare
  person_key bigint := hashtextextended('70000000-0000-0000-0000-000000000001:70000000-0000-0000-0000-000000000005',0);
  membership_waited boolean; eligible boolean; copied integer;
begin
  perform pg_temp.staff_begin_admin('staff_race_copy');
  perform pg_temp.staff_begin_admin('staff_race_end');
  perform pg_advisory_lock(person_key);
  if extensions.dblink_send_query('staff_race_copy',
    'select ops.copy_staff_roster(''70000000-0000-0000-0000-000000000010'',''2026-10-26'')')<>1 then raise exception 'fixture async query was not submitted'; end if;
  insert into staff_race_result values('copy_wait',to_jsonb(pg_temp.staff_wait_for_advisory('staff_race_copy')));
  if extensions.dblink_send_query('staff_race_end',
    'with ended as (update shared.team_memberships set effective_to=''2026-10-25'' where org_id=''70000000-0000-0000-0000-000000000001'' and team_id=''70000000-0000-0000-0000-000000000010'' and person_id=''70000000-0000-0000-0000-000000000005'' returning 1) select count(*)::integer from ended')<>1 then raise exception 'fixture async query was not submitted'; end if;
  membership_waited := pg_temp.staff_wait_for_advisory('staff_race_end');
  insert into staff_race_result values('end_wait',to_jsonb(membership_waited));
  if not membership_waited then
    perform pg_temp.staff_take_integer('staff_race_end');
    perform extensions.dblink_exec('staff_race_end','commit');
  end if;
  perform pg_advisory_unlock(person_key);
  copied := pg_temp.staff_take_integer('staff_race_copy');
  insert into staff_race_result values('copy_count',to_jsonb(copied));
  -- Query through the same transaction so the newly copied rows are visible before it commits.
  select valid into eligible from extensions.dblink('staff_race_copy',$query$
    select not exists(
      select 1 from jsonb_array_elements(ops.get_staff_roster('70000000-0000-0000-0000-000000000010','2026-10-26')->'shifts') s
      where not exists(select 1 from shared.team_memberships m
        where m.org_id='70000000-0000-0000-0000-000000000001' and m.team_id='70000000-0000-0000-0000-000000000010' and m.person_id='70000000-0000-0000-0000-000000000005'
          and m.effective_from<=date '2026-10-26' and (m.effective_to is null or m.effective_to>=date '2026-10-26')))
  $query$) as result(valid boolean);
  insert into staff_race_result values('copy_eligible',to_jsonb(eligible));
  perform extensions.dblink_exec('staff_race_copy','commit');
  if membership_waited then
    perform pg_temp.staff_take_integer('staff_race_end');
    perform extensions.dblink_exec('staff_race_end','commit');
  end if;
  perform extensions.dblink_disconnect('staff_race_copy');
  perform extensions.dblink_disconnect('staff_race_end');
end $copy_race$;

select ok((select value::boolean from staff_race_result where name='copy_wait'),'copy participates in Person schedule serialization');
select ok((select value::boolean from staff_race_result where name='end_wait'),'a membership end waits for an in-flight copy');
select is((select value::integer from staff_race_result where name='copy_count'),1,'the valid source shift is copied once');
select ok((select value::boolean from staff_race_result where name='copy_eligible'),'copied shifts are still membership-eligible before commit');

do $standing_race$
declare gate bigint := hashtextextended('70000000-0000-0000-0000-000000000001:standing_test_gate',0); membership_waited boolean; result_text text; join_error text;
begin
  perform pg_temp.staff_begin_admin('staff_race_standing');
  perform pg_temp.staff_begin_admin('staff_race_join');
  perform pg_temp.staff_begin_admin('staff_race_shift');
  perform extensions.dblink_exec('staff_race_standing',$remote$
    create temporary table staff_pause_fixture(value integer);
    create function pg_temp.staff_save_and_wait() returns date language plpgsql as $body$
    declare effective date;
    begin
      effective := ops.save_standing_hours('70000000-0000-0000-0000-000000000011',null,array[0]::smallint[],'09:00','17:00',true);
      perform pg_advisory_xact_lock(hashtextextended('70000000-0000-0000-0000-000000000001:standing_test_gate',0));
      return effective;
    end $body$
  $remote$);
  perform pg_advisory_lock(gate);
  if extensions.dblink_send_query('staff_race_standing','select pg_temp.staff_save_and_wait()::text')<>1 then raise exception 'fixture async query was not submitted'; end if;
  insert into staff_race_result values('standing_wait',to_jsonb(pg_temp.staff_wait_for_advisory('staff_race_standing')));
  if extensions.dblink_send_query('staff_race_join',
    'with joined as (insert into shared.team_memberships(org_id,team_id,person_id,effective_from) values(''70000000-0000-0000-0000-000000000001'',''70000000-0000-0000-0000-000000000011'',''70000000-0000-0000-0000-000000000006'',''2026-10-01'') returning 1) select count(*)::integer from joined')<>1 then raise exception 'fixture async query was not submitted'; end if;
  membership_waited := pg_temp.staff_wait_for_advisory('staff_race_join');
  insert into staff_race_result values('join_wait',to_jsonb(membership_waited));
  if not membership_waited then
    perform pg_temp.staff_take_integer('staff_race_join');
    perform extensions.dblink_exec('staff_race_join','commit');
  end if;
  select saved into result_text from extensions.dblink('staff_race_shift',
    'select ops.save_staff_shift(''70000000-0000-0000-0000-000000000012'',''70000000-0000-0000-0000-000000000006'',''2026-10-26'',''70000000-0000-0000-0000-000000000020'',null)::text') as saved(result_text text);
  perform extensions.dblink_exec('staff_race_shift','commit');
  perform pg_advisory_unlock(gate);
  perform saved from extensions.dblink_get_result('staff_race_standing',false) as result(saved text);
  perform saved from extensions.dblink_get_result('staff_race_standing',false) as drained(saved text);
  perform extensions.dblink_exec('staff_race_standing','commit');
  if membership_waited then
    begin
      perform n from extensions.dblink_get_result('staff_race_join',true) as result(n integer);
      join_error := 'JOIN_SUCCEEDED';
    exception when others then
      get stacked diagnostics join_error = returned_sqlstate;
      join_error := join_error || ':' || sqlerrm;
    end;
    perform n from extensions.dblink_get_result('staff_race_join',false) as drained(n integer);
    perform extensions.dblink_exec('staff_race_join','rollback');
  end if;
  insert into staff_race_result values('join_error',to_jsonb(coalesce(join_error,'')));
  perform extensions.dblink_disconnect('staff_race_standing');
  perform extensions.dblink_disconnect('staff_race_join');
  perform extensions.dblink_disconnect('staff_race_shift');
end $standing_race$;

select ok((select value::boolean from staff_race_result where name='standing_wait'),'the real standing action finishes before its transaction is released');
select ok((select value::boolean from staff_race_result where name='join_wait'),'membership insertion waits for an uncommitted Team default');
select ok(
  (select value#>>'{}' from staff_race_result where name='join_error') like '23P01:STAFF_STANDING_CONFLICT%'
  and not exists(select 1 from shared.team_memberships where org_id='70000000-0000-0000-0000-000000000001' and team_id='70000000-0000-0000-0000-000000000011' and person_id='70000000-0000-0000-0000-000000000006')
  and exists(select 1 from ops.staff_shifts where org_id='70000000-0000-0000-0000-000000000001' and team_id='70000000-0000-0000-0000-000000000012' and person_id='70000000-0000-0000-0000-000000000006' and local_date='2026-10-26')
  and exists(select 1 from ops.staff_standing_hours where org_id='70000000-0000-0000-0000-000000000001' and team_id='70000000-0000-0000-0000-000000000011' and active),
  'a concurrent join cannot activate hours overlapping a committed shift');

\else
select * from skip('Concurrent sessions are proved by the disposable superuser harness.',7);
set local role authenticated;
set local app.allow_test_seeds='on';
set local app.attendance_now='2026-10-22 03:00+00';
set local request.jwt.claims='{"org_id":"70000000-0000-0000-0000-000000000001","person_id":"70000000-0000-0000-0000-000000000004","access_roles":["admin"]}';
select ops.save_staff_shift('70000000-0000-0000-0000-000000000012','70000000-0000-0000-0000-000000000006','2026-10-26','70000000-0000-0000-0000-000000000020',null);
select ops.save_standing_hours('70000000-0000-0000-0000-000000000011',null,array[0]::smallint[],'09:00','17:00',true);
reset role;
\endif

set local role authenticated;
set local app.allow_test_seeds='on';
set local app.attendance_now='2026-10-22 03:00+00';
set local request.jwt.claims='{"org_id":"70000000-0000-0000-0000-000000000001","person_id":"70000000-0000-0000-0000-000000000004","access_roles":["admin"]}';
select ops.save_staff_shift('70000000-0000-0000-0000-000000000012','70000000-0000-0000-0000-000000000007','2026-10-26','70000000-0000-0000-0000-000000000020',null);
select throws_ok($sql$insert into shared.team_memberships(org_id,team_id,person_id,effective_from)
  values('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000011','70000000-0000-0000-0000-000000000007','2026-10-01')$sql$,'23P01',null,'joining a Team validates the standing schedule it activates');
select lives_ok($sql$update shared.team_memberships set effective_to='2026-10-25' where org_id='70000000-0000-0000-0000-000000000001' and team_id='70000000-0000-0000-0000-000000000012' and person_id='70000000-0000-0000-0000-000000000006'$sql$,'a membership range may still be reduced');
select lives_ok($sql$update shared.team_memberships set is_primary=true where org_id='70000000-0000-0000-0000-000000000001' and team_id='70000000-0000-0000-0000-000000000012' and person_id='70000000-0000-0000-0000-000000000006'$sql$,'an unrelated primary flag remains editable');
select lives_ok($sql$insert into shared.team_memberships(org_id,team_id,person_id,effective_from,effective_to)
  values('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000011','70000000-0000-0000-0000-000000000007','2026-10-27','2026-11-01')$sql$,'a bounded membership excludes a shift outside its effective dates');
select throws_ok($sql$update shared.team_memberships set effective_from='2026-10-26'
  where org_id='70000000-0000-0000-0000-000000000001' and team_id='70000000-0000-0000-0000-000000000011' and person_id='70000000-0000-0000-0000-000000000007'$sql$,
  '23P01',null,'expanding a membership checks the newly activated standing day');
set local request.jwt.claims='{"org_id":"70000000-0000-0000-0000-000000000001","person_id":"70000000-0000-0000-0000-000000000006","access_roles":[]}';
select throws_ok($sql$insert into shared.team_memberships(org_id,team_id,person_id,effective_from)
  values('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000007','2026-10-01')$sql$,'42501',null,'a member cannot use the new trigger to add Team membership');
set local request.jwt.claims='{"org_id":"70000000-0000-0000-0000-000000000001","person_id":"70000000-0000-0000-0000-000000000004","access_roles":["admin"]}';
select throws_ok($sql$insert into shared.team_memberships(org_id,team_id,person_id,effective_from)
  values('70000000-0000-0000-0000-000000000101','70000000-0000-0000-0000-000000000110','70000000-0000-0000-0000-000000000104','2026-10-01')$sql$,'42501',null,'an administrator cannot change another organization through membership validation');
reset role;
select * from finish();

-- These committed fixture rows are private to this specification.
set local request.jwt.claims='{}';
delete from ops.staff_shifts where org_id='70000000-0000-0000-0000-000000000001';
delete from ops.staff_rosters where org_id='70000000-0000-0000-0000-000000000001';
delete from ops.staff_standing_hours where org_id='70000000-0000-0000-0000-000000000001';
delete from ops.staff_shift_templates where org_id='70000000-0000-0000-0000-000000000001';
delete from shared.team_memberships where org_id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000101');
delete from shared.person_access_roles where org_id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000101');
delete from shared.teams where org_id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000101');
delete from shared.sites where org_id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000101');
delete from shared.people where org_id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000101');
delete from shared.business_units where org_id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000101');
delete from shared.orgs where id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000101');
commit;
