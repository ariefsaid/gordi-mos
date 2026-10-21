begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

create temp view policy_initplan_metadata as
select policy.oid
  from pg_policy policy
  join pg_class relation on relation.oid = policy.polrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
 where namespace.nspname = any (array['shared', 'mos', 'ops', 'integrations', 'reporting'])
   and obj_description(policy.oid, 'pg_policy') like 'MOS_POLICY_INITPLAN_BACKUP_V1:%';

do $policy_snapshot_fixture$
declare
  v_target record;
  v_unbackfilled record;
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
    'comment', v_target.policy_comment,
    'created_definition_backfill', 'v1'
  );
  execute format('comment on policy orgs_select_own on shared.orgs is %L',
    'MOS_POLICY_INITPLAN_BACKUP_V1:' || encode(convert_to(v_snapshot::text, 'UTF8'), 'hex'));

  select policies.qual, policies.with_check
    into v_unbackfilled
    from pg_policies policies
   where policies.schemaname = 'shared' and policies.tablename = 'business_units'
     and policies.policyname = 'business_units_select_org';
  v_snapshot := jsonb_build_object(
    'qual', v_unbackfilled.qual,
    'with_check', v_unbackfilled.with_check,
    'comment', 'rollback fixture comment'
  );
  execute format('comment on policy business_units_select_org on shared.business_units is %L',
    'MOS_POLICY_INITPLAN_BACKUP_V1:' || encode(convert_to(v_snapshot::text, 'UTF8'), 'hex'));
end;
$policy_snapshot_fixture$;

select ok(exists (select 1 from policy_initplan_metadata),
  'policy definitions are stored before rollback');

\ir shared_policy_rollback_definitions.inc

select ok(exists (select 1 from policy_initplan_metadata),
  'the newer rollback retains metadata needed by the older rollback');

\ir shared_policy_initplan_rollback.inc

select ok(
  not exists (select 1 from policy_initplan_metadata)
  and (
    select obj_description(policy.oid, 'pg_policy')
      from pg_policy policy
      join pg_class relation on relation.oid = policy.polrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'shared'
       and relation.relname = 'business_units'
       and policy.polname = 'business_units_select_org'
  ) = 'rollback fixture comment',
  'the older rollback consumes metadata and restores the saved policy comment'
);

-- Reapply the initplan policy transformation, indexes, and snapshot shape for the rollback fixture.
create index if not exists follow_ups_assigned_to_idx on mos.follow_ups (assigned_to);
create index if not exists tasks_generated_from_task_def_idx on mos.tasks (generated_from_task_def_id);
alter policy orgs_select_own on shared.orgs using (id = (select shared.current_org_id()));

do $policy_reapply_fixture$
declare
  v_target record;
  v_snapshot jsonb;
begin
  select policies.qual, policies.with_check
    into v_target
    from pg_policies policies
   where policies.schemaname = 'shared' and policies.tablename = 'orgs'
     and policies.policyname = 'orgs_select_own';
  v_snapshot := jsonb_build_object(
    'qual', '(id = shared.current_org_id())',
    'with_check', null,
    'created_qual', v_target.qual,
    'created_with_check', v_target.with_check,
    'comment', null
  );
  execute format('comment on policy orgs_select_own on shared.orgs is %L',
    'MOS_POLICY_INITPLAN_BACKUP_V1:' || encode(convert_to(v_snapshot::text, 'UTF8'), 'hex'));
end;
$policy_reapply_fixture$;

select ok(exists (select 1 from policy_initplan_metadata),
  'the re-applied policy has rollback metadata for the next rollback');

select * from finish();
rollback;
