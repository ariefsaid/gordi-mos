begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_schema('shared', 'shared schema exists');
select has_schema('mos',    'mos schema exists (empty until Phase 2)');
select has_schema('ops',    'ops schema exists (empty until Phase 2)');
select has_schema('integrations', 'integrations schema exists (empty until later)');

select * from finish();
rollback;
