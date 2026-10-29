begin;
create extension if not exists pgtap with schema extensions;
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;
select plan(34);
select set_config('app.allow_test_seeds','on',true);
select shared._test_seed_directory();
-- Test-only assignments for this connection; rolled back with the fixture.
insert into reporting_private.writer_orgs (login_oid, login_name, org_id)
select oid, rolname, org_id from pg_catalog.pg_roles
cross join (values ('00000000-0000-0000-0000-0000000000a1'::uuid),
                   ('00000000-0000-0000-0000-0000000000b1'::uuid)) orgs(org_id)
where rolname = session_user;

select shared._test_seed_access_roles();

select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('reporting.cancel_void_register'::regclass,'mos.cancel_void_reviews'::regclass)),
  'source and reviews force RLS');
select col_is_pk('reporting','cancel_void_register',array['org_id','esb_code','row_id'], 'stable source identity');
select ok(not has_table_privilege('anon','reporting.cancel_void_register','SELECT')
  and not has_table_privilege('anon','mos.cancel_void_reviews','SELECT'), 'no anonymous reads');
select ok(not has_table_privilege('reporting_writer','mos.cancel_void_reviews','INSERT'), 'nightly writer cannot change reviews');
select ok(not has_table_privilege('reporting_writer','reporting.cancel_void_register','DELETE'), 'copy cannot delete source identity');

set local role reporting_writer;
select throws_ok($$insert into reporting.cancel_void_register(org_id,esb_code,row_id,case_id,is_case,branch_code,sales_date,sales_num,action_kind,node_kind,reason_scope,review_value_basis,snapshot_as_of,source_contract_version)
  values ('00000000-0000-0000-0000-0000000000a1','TEST','case','case',true,'NEW','2026-10-19','SYNTHETIC','sale_void','sale','sale_reason_not_exposed','sale_grand_total',now(),'cancel_void_register.v1')$$,
  '42501',null,'undeclared writer fails closed');
select set_config('app.reporting_org','00000000-0000-0000-0000-0000000000a1',true);
insert into reporting.cancel_void_register(org_id,esb_code,row_id,case_id,is_case,branch_code,sales_date,sales_num,action_kind,node_kind,reason_scope,review_value_basis,snapshot_as_of,source_contract_version,source_evidence_hash)
  values ('00000000-0000-0000-0000-0000000000a1','TEST','case','case',true,'NEW','2026-10-19','SYNTHETIC','sale_void','sale','sale_reason_not_exposed','sale_grand_total',now(),'cancel_void_register.v1','observed-one'),
         ('00000000-0000-0000-0000-0000000000a1','TEST','line','case',false,'NEW','2026-10-19','SYNTHETIC','sale_void','menu','source_line_reason','detail_only',now(),'cancel_void_register.v1','observed-one');
select throws_ok($$update reporting.cancel_void_register set org_id='00000000-0000-0000-0000-0000000000b1'$$,
  '42501',null,'writer cannot cross orgs');
select set_config('app.reporting_org','00000000-0000-0000-0000-0000000000b1',true);
select is((select count(*)::int from reporting.cancel_void_register),0,'writer cannot read another org');
insert into reporting.cancel_void_register(org_id,esb_code,row_id,case_id,is_case,branch_code,sales_date,sales_num,action_kind,node_kind,reason_scope,review_value_basis,snapshot_as_of,source_contract_version)
  values ('00000000-0000-0000-0000-0000000000b1','TEST','case','case',true,'NEW','2026-10-19','SYNTHETIC','sale_void','sale','sale_reason_not_exposed','sale_grand_total',now(),'cancel_void_register.v1');
reset role;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["finance"]}');
select is((select count(*)::int from reporting.cancel_void_register),2,'finance reads source');
select lives_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','case','00000000-0000-0000-0000-0000000000d1','order_error','Synthetic review')$$,'finance reviews');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["manager"]}');
select is((select count(*)::int from reporting.cancel_void_register),2,'manager reads source');
select lives_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','case','00000000-0000-0000-0000-0000000000d1','order_error','Synthetic review')$$,'manager reviews');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["ops_lead"]}');
select is((select count(*)::int from reporting.cancel_void_register),2,'ops lead reads source');
select lives_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','case','00000000-0000-0000-0000-0000000000d1','order_error','Synthetic review')$$,'ops lead reviews');
select is((select count(*)::int from mos.cancel_void_reviews),3,'all prior reviews retained');
select is((select count(*)::int from mos.cancel_void_reviews where reviewed_by='00000000-0000-0000-0000-0000000000d4' and source_evidence_hash='observed-one'),3,'reviewer and evidence stamped by server');
select throws_ok($$update mos.cancel_void_reviews set note='replace history'$$,'42501',null,'reviews cannot be overwritten');
select throws_ok($$delete from mos.cancel_void_reviews$$,'42501',null,'reviews cannot be deleted');
select throws_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','case','00000000-0000-0000-0000-0000000000b4','other','Synthetic')$$,'23503',null,'person must belong to same org');
select throws_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','line','00000000-0000-0000-0000-0000000000d1','other','Synthetic')$$,'23514',null,'details cannot become duplicate review cases');
select throws_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','case','00000000-0000-0000-0000-0000000000d1','invented','Synthetic')$$,'23514',null,'reason list enforced');
select throws_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note,reviewed_by) values ('TEST','case','00000000-0000-0000-0000-0000000000d1','other','Synthetic','00000000-0000-0000-0000-0000000000d1')$$,'42501',null,'cannot spoof reviewer');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from reporting.cancel_void_register),0,'member cannot read source');
select is((select count(*)::int from mos.cancel_void_reviews),0,'member cannot read reviews');
select throws_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','case','00000000-0000-0000-0000-0000000000d1','other','Synthetic')$$,'42501',null,'member cannot review');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["supervisor"]}');
select is((select count(*)::int from reporting.cancel_void_register),0,'supervisor cannot read source');
select is((select count(*)::int from mos.cancel_void_reviews),0,'supervisor cannot read reviews');
select throws_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','case','00000000-0000-0000-0000-0000000000d1','other','Synthetic')$$,'42501',null,'supervisor cannot review');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["admin"]}');
select is((select count(*)::int from reporting.cancel_void_register),0,'admin cannot read source');
select is((select count(*)::int from mos.cancel_void_reviews),0,'admin cannot read reviews');
select throws_ok($$insert into mos.cancel_void_reviews(esb_code,case_id,person_id,reason,note) values ('TEST','case','00000000-0000-0000-0000-0000000000d1','other','Synthetic')$$,'42501',null,'admin cannot review');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}');
select is((select count(*)::int from reporting.cancel_void_register),1,'foreign finance positive control');
select is((select count(*)::int from mos.cancel_void_reviews),0,'foreign finance cannot read reviews');
reset role;
select set_config('app.reporting_org','00000000-0000-0000-0000-0000000000a1',true);
set local role reporting_writer;
update reporting.cancel_void_register set source_evidence_hash='observed-two' where row_id='case';
reset role;
select is((select count(*)::int from mos.cancel_void_reviews where source_evidence_hash='observed-one'),3,'nightly refresh preserves reviews and their observed evidence');
select * from finish();
rollback;
