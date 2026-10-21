-- Restore the exact policy clauses and comments captured before wrapping helpers, then remove indexes.
begin;

do $rollback_guard$
begin
  if not exists (
    select 1
      from pg_policies policies
     where policies.schemaname = any (array['shared', 'mos', 'ops', 'integrations', 'reporting'])
       and obj_description((
         select policy.oid
           from pg_namespace namespace
           join pg_class relation on relation.relnamespace = namespace.oid and relation.relname = policies.tablename
           join pg_policy policy on policy.polrelid = relation.oid and policy.polname = policies.policyname
          where namespace.nspname = policies.schemaname
       ), 'pg_policy') like 'MOS_POLICY_INITPLAN_BACKUP_V1:%'
  )
  and to_regclass('mos.follow_ups_assigned_to_idx') is null
  and to_regclass('mos.tasks_generated_from_task_def_idx') is null then
    raise exception 'rollback refused: no policy snapshots or lookup indexes from the initplan migration exist';
  end if;
end;
$rollback_guard$;

do $restore_policy_expressions$
declare
  v_policy record;
  v_snapshot jsonb;
  v_qual text;
  v_with_check text;
  v_original_comment text;
  v_alter_policy text;
  v_prefix constant text := 'MOS_POLICY_INITPLAN_BACKUP_V1:';
begin
  for v_policy in
    select policies.schemaname,
           policies.tablename,
           policies.policyname,
           policies.permissive,
           policies.roles,
           policies.cmd,
           obj_description(policy.oid, 'pg_policy') as policy_comment
      from pg_policies policies
      join pg_namespace namespace on namespace.nspname = policies.schemaname
      join pg_class relation on relation.relnamespace = namespace.oid and relation.relname = policies.tablename
      join pg_policy policy on policy.polrelid = relation.oid and policy.polname = policies.policyname
     where policies.schemaname = any (array['shared', 'mos', 'ops', 'integrations', 'reporting'])
       and obj_description(policy.oid, 'pg_policy') like v_prefix || '%'
  loop
    v_snapshot := convert_from(decode(substr(v_policy.policy_comment, length(v_prefix) + 1), 'hex'), 'UTF8')::jsonb;
    v_qual := v_snapshot ->> 'qual';
    v_with_check := v_snapshot ->> 'with_check';
    v_original_comment := v_snapshot ->> 'comment';

    v_alter_policy := format('alter policy %I on %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename);
    if v_qual is not null then
      v_alter_policy := v_alter_policy || format(' using (%s)', v_qual);
    end if;
    if v_with_check is not null then
      v_alter_policy := v_alter_policy || format(' with check (%s)', v_with_check);
    end if;
    execute v_alter_policy;
    execute format(
      'comment on policy %I on %I.%I is %L',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename,
      v_original_comment
    );
  end loop;
end;
$restore_policy_expressions$;

drop index if exists mos.tasks_generated_from_task_def_idx;
drop index if exists mos.follow_ups_assigned_to_idx;

commit;
