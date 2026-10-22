begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

do $policy_snapshot_fixture$
declare
  v_target record;
  v_untouched record;
  v_snapshot jsonb;
begin
  select policies.qual,
         policies.with_check,
         obj_description(policy.oid, 'pg_policy') as policy_comment
    into v_target
    from pg_policies policies
    join pg_namespace namespace on namespace.nspname = policies.schemaname
    join pg_class relation on relation.relnamespace = namespace.oid and relation.relname = policies.tablename
    join pg_policy policy on policy.polrelid = relation.oid and policy.polname = policies.policyname
   where policies.schemaname = 'shared' and policies.tablename = 'orgs'
     and policies.policyname = 'orgs_select_own';
  v_snapshot := jsonb_build_object(
    'qual', '(id = shared.current_org_id())',
    'with_check', null,
    'created_qual', v_target.qual,
    'created_with_check', v_target.with_check,
    'comment', v_target.policy_comment
  );
  execute format('comment on policy orgs_select_own on shared.orgs is %L',
    'MOS_POLICY_INITPLAN_BACKUP_V1:' || encode(convert_to(v_snapshot::text, 'UTF8'), 'hex'));
  execute 'alter policy orgs_select_own on shared.orgs using (false)';

  select policies.qual,
         policies.with_check,
         obj_description(policy.oid, 'pg_policy') as policy_comment
    into v_untouched
    from pg_policies policies
    join pg_namespace namespace on namespace.nspname = policies.schemaname
    join pg_class relation on relation.relnamespace = namespace.oid and relation.relname = policies.tablename
    join pg_policy policy on policy.polrelid = relation.oid and policy.polname = policies.policyname
   where policies.schemaname = 'shared' and policies.tablename = 'business_units'
     and policies.policyname = 'business_units_select_org';
  v_snapshot := jsonb_build_object(
    'qual', '(org_id = shared.current_org_id())',
    'with_check', null,
    'created_qual', v_untouched.qual,
    'created_with_check', v_untouched.with_check,
    'comment', v_untouched.policy_comment
  );
  execute format('comment on policy business_units_select_org on shared.business_units is %L',
    'MOS_POLICY_INITPLAN_BACKUP_V1:' || encode(convert_to(v_snapshot::text, 'UTF8'), 'hex'));
end;
$policy_snapshot_fixture$;

\ir shared_policy_initplan_rollback.inc

select is(
  (select qual from pg_policies
    where schemaname = 'shared' and tablename = 'orgs' and policyname = 'orgs_select_own'),
  'false',
  'a later policy change survives rollback'
);
select is(
  (select qual from pg_policies
    where schemaname = 'shared' and tablename = 'business_units'
      and policyname = 'business_units_select_org'),
  '(org_id = shared.current_org_id())',
  'an untouched policy is restored to its pre-migration definition'
);

select * from finish();
rollback;
