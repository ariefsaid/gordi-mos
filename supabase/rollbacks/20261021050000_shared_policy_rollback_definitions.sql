-- DOWN is guarded: this provenance stays until the 20261021043000 rollback consumes it.
do $rollback$
declare
  v_prefix constant text := 'MOS_POLICY_INITPLAN_BACKUP_V1:';
begin
  if exists (
    select 1
      from pg_policies policies
      join pg_namespace namespace on namespace.nspname = policies.schemaname
      join pg_class relation on relation.relnamespace = namespace.oid and relation.relname = policies.tablename
      join pg_policy policy on policy.polrelid = relation.oid and policy.polname = policies.policyname
     where policies.schemaname = any (array['shared', 'mos', 'ops', 'integrations', 'reporting'])
       and obj_description(policy.oid, 'pg_policy') like v_prefix || '%'
       and convert_from(
         decode(substr(obj_description(policy.oid, 'pg_policy'), length(v_prefix) + 1), 'hex'),
         'UTF8'
       )::jsonb ->> 'created_definition_backfill' = 'v1'
  ) then
    raise exception 'rollback refused: preserve policy definition metadata until the 20261021043000 rollback has completed';
  end if;

  raise notice 'No backfilled policy definition metadata remains; the 20261021043000 rollback already consumed it';
end;
$rollback$;
