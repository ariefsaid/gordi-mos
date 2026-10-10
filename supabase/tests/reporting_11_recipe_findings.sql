begin;
create extension if not exists pgtap with schema extensions;
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;
select no_plan();
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
insert into shared.branches(id,org_id,code,name) values
  ('00000000-0000-0000-0000-00000000ba01','00000000-0000-0000-0000-0000000000a1','test_a','Synthetic A'),
  ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000b1','test_b','Synthetic B');

create function pg_temp.add_finding(p_org uuid, p_id text) returns void
language sql security invoker as $$
  insert into reporting.recipe_deduction_findings (
    org_id, finding_id, day, esb_code, branch_code, classification, rule, confidence,
    impact_basis, needs_human, recommended_check, source_checked_at, refreshed_at,
    replica_stale, algorithm_version, snapshot_as_of, source_contract_version
  ) values (p_org,p_id,'2026-10-09','TEST','NEW','warehouse_artefact','unit_comparison_unverified',
    'candidate_current_recipe_not_historical_proof','not_quantified',true,'Check recorded units',
    '2026-10-10','2026-10-10',false,'57.1','2026-10-10','recipe_deduction_findings.v2');
$$;
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('reporting.recipe_deduction_findings'::regclass,'reporting.recipe_finding_snapshots'::regclass)),
  'findings and receipts enable and force RLS');
select col_is_pk('reporting','recipe_deduction_findings',array['org_id','esb_code','finding_id'],
  'source finding identity stays company and tenant scoped');
select ok(not has_table_privilege('anon','reporting.recipe_deduction_findings','SELECT')
  and not has_table_privilege('anon','reporting.recipe_finding_snapshots','SELECT'), 'anonymous reads denied');
select is((select count(*)::int from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p
  cross join unnest(array['reporting.recipe_deduction_findings','reporting.recipe_finding_snapshots']) t
  where has_table_privilege('authenticated',t,p) or has_table_privilege('service_role',t,p)),0,
  'app and service roles have no mutation privileges');
select ok(not has_table_privilege('reporting_writer','reporting.recipe_deduction_findings','TRUNCATE'),
  'writer cannot bypass row scope with truncate');

set local role reporting_writer;
select throws_ok($$select pg_temp.add_finding('00000000-0000-0000-0000-0000000000a1','missing')$$,
  '42501',null,'undeclared writer cannot insert');
select set_config('app.reporting_org','invalid',true);
select throws_ok($$select pg_temp.add_finding('00000000-0000-0000-0000-0000000000a1','invalid')$$,
  '42501',null,'malformed org fails closed');
select set_config('app.reporting_org','',true);
select throws_ok($$insert into reporting.recipe_finding_snapshots values
  ('00000000-0000-0000-0000-0000000000a1','TEST','2026-08-12','2026-10-10','2026-10-10','2026-10-10',true)$$,
  '42501',null,'blank writer cannot publish receipt');
select set_config('app.reporting_org','00000000-0000-0000-0000-0000000000b1',true);
select lives_ok($$select pg_temp.add_finding('00000000-0000-0000-0000-0000000000b1','other')$$,
  'writer B inserts its own finding');
select lives_ok($$insert into reporting.recipe_finding_snapshots values
  ('00000000-0000-0000-0000-0000000000b1','TEST','2026-08-12','2026-10-10','2026-10-10','2026-10-10',true)$$,
  'writer B publishes own receipt');
select set_config('app.reporting_org','00000000-0000-0000-0000-0000000000a1',true);
select is((select count(*)::int from reporting.recipe_deduction_findings),0,'writer A cannot see B findings');
select is((select count(*)::int from reporting.recipe_finding_snapshots),0,'writer A cannot see B receipt');
select throws_ok($$select pg_temp.add_finding('00000000-0000-0000-0000-0000000000b1','other')$$,
  '42501',null,'writer A cannot conflict with B finding');
with affected as (delete from reporting.recipe_deduction_findings returning *)
select is((select count(*)::int from affected),0,'writer A cannot delete B findings');
with affected as (update reporting.recipe_finding_snapshots set complete=false returning *)
select is((select count(*)::int from affected),0,'writer A cannot update B receipt');
select throws_ok($$insert into reporting.recipe_finding_snapshots values
  ('00000000-0000-0000-0000-0000000000b1','TEST','2026-08-12','2026-10-10','2026-10-10','2026-10-10',true)
  on conflict(org_id,esb_code) do update set complete=false$$,
  '42501',null,'writer A cannot upsert B receipt');
select lives_ok($$select pg_temp.add_finding('00000000-0000-0000-0000-0000000000a1','own')$$,
  'raw new branch accepted without a MOS mapping');
select lives_ok($$insert into reporting.recipe_finding_snapshots values
  ('00000000-0000-0000-0000-0000000000a1','TEST','2026-08-12','2026-10-10','2026-10-10','2026-10-10',true)$$,
  'writer A publishes own receipt');
select throws_ok($$update reporting.recipe_deduction_findings
  set branch_id='00000000-0000-0000-0000-00000000bb01' where finding_id='own'$$,
  '23503',null,'an optional branch link cannot cross orgs');
select lives_ok($$update reporting.recipe_deduction_findings
  set branch_id='00000000-0000-0000-0000-00000000ba01' where finding_id='own'$$,
  'own-org optional mapping accepted');
select throws_ok($$update reporting.recipe_deduction_findings
  set org_id='00000000-0000-0000-0000-0000000000b1' where finding_id='own'$$,
  '42501',null,'writer cannot move a finding outside declared org');
select lives_ok($$update reporting.recipe_deduction_findings set impact_idr=1200 where finding_id='own'$$,
  'writer can update own projected evidence');
select lives_ok($$update reporting.recipe_finding_snapshots set complete=false$$,
  'writer can record an incomplete capture');
reset role;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["finance"]}');
select is((select count(*)::int from reporting.recipe_deduction_findings),1,'finance reads own-org finding');
select is((select count(*)::int from reporting.recipe_finding_snapshots),1,'finance reads own-org receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["manager"]}');
select is((select count(*)::int from reporting.recipe_deduction_findings),1,'manager reads finding');
select is((select count(*)::int from reporting.recipe_finding_snapshots),1,'manager reads receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["ops_lead"]}');
select is((select count(*)::int from reporting.recipe_deduction_findings),1,'ops lead reads finding');
select is((select count(*)::int from reporting.recipe_finding_snapshots),1,'ops lead reads receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["admin"]}');
select is((select count(*)::int from reporting.recipe_deduction_findings),0,'admin alone is not an evidence reader');
select is((select count(*)::int from reporting.recipe_finding_snapshots),0,'admin alone cannot read receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["supervisor"]}');
select is((select count(*)::int from reporting.recipe_deduction_findings),0,'supervisor cannot read findings');
select is((select count(*)::int from reporting.recipe_finding_snapshots),0,'supervisor cannot read receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from reporting.recipe_deduction_findings),0,'member cannot read findings');
select is((select count(*)::int from reporting.recipe_finding_snapshots),0,'member cannot read receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}');
select is((select count(*)::int from reporting.recipe_deduction_findings where org_id='00000000-0000-0000-0000-0000000000a1'),0,
  'other-org finance cannot read A');
select is((select count(*)::int from reporting.recipe_deduction_findings),1,'other-org finance positive control');
select throws_ok($$select pg_temp.add_finding('00000000-0000-0000-0000-0000000000b1','app')$$,
  '42501',null,'readers cannot insert evidence');
select throws_ok($$update reporting.recipe_deduction_findings set needs_human=false$$,
  '42501',null,'readers cannot edit evidence');
select throws_ok($$delete from reporting.recipe_finding_snapshots$$,
  '42501',null,'readers cannot delete receipts');
select set_config('request.jwt.claims','{}',true);
select is((select count(*)::int from reporting.recipe_deduction_findings),0,'claimless reads denied');
reset role;

select set_config('app.reporting_org','00000000-0000-0000-0000-0000000000a1',true);
set local role reporting_writer;
with affected as (delete from reporting.recipe_deduction_findings returning *)
select is((select count(*)::int from affected),1,'successful empty replacement deletes only own-org findings');
reset role;
select is((select count(*)::int from reporting.recipe_deduction_findings where finding_id='other'),1,
  'other-org evidence survives replacement');
select * from finish();
rollback;
