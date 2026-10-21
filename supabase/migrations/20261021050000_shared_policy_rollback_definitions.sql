-- Record exact catalog clauses created by the initplan migration for guarded DOWN.
-- Existing snapshots are backfilled only when their current clauses match that migration's transformation.
-- DOWN: run supabase/rollbacks/20261021050000_shared_policy_rollback_definitions.sql after the 20261021043000 rollback.

do $policy_rollback_definitions$
declare
  v_policy record;
  v_snapshot jsonb;
  v_helper text;
  v_escaped_helper text;
  v_call_pattern text;
  v_clause_name text;
  v_clause text;
  v_qual text;
  v_with_check text;
  v_start integer;
  v_pos integer;
  v_after integer;
  v_call text;
  v_prefix constant text := 'MOS_POLICY_INITPLAN_BACKUP_V1:';
  v_helpers text[] := array[
    'shared.current_org_id',
    'shared.current_person_id',
    'shared.current_access_roles',
    'shared.is_org_wide',
    'shared.is_org_member',
    'shared.is_cafe_affiliated'
  ];
  v_literal_helpers text[] := array['shared.has_access_role', 'shared.can'];
begin
  for v_policy in
    select policies.schemaname,
           policies.tablename,
           policies.policyname,
           policies.qual,
           policies.with_check,
           obj_description(policy.oid, 'pg_policy') as policy_comment
      from pg_policies policies
      join pg_namespace namespace on namespace.nspname = policies.schemaname
      join pg_class relation on relation.relnamespace = namespace.oid and relation.relname = policies.tablename
      join pg_policy policy on policy.polrelid = relation.oid and policy.polname = policies.policyname
     where policies.schemaname = any (array['shared', 'mos', 'ops', 'integrations', 'reporting'])
       and obj_description(policy.oid, 'pg_policy') like v_prefix || '%'
  loop
    v_snapshot := convert_from(decode(substr(v_policy.policy_comment, length(v_prefix) + 1), 'hex'), 'UTF8')::jsonb;
    if v_snapshot ?& array['created_qual', 'created_with_check'] then
      continue;
    end if;

    v_qual := v_snapshot ->> 'qual';
    v_with_check := v_snapshot ->> 'with_check';
    foreach v_clause_name in array array['qual', 'with_check'] loop
      if v_clause_name = 'qual' then
        v_clause := v_qual;
      else
        v_clause := v_with_check;
      end if;

      if v_clause is not null then
        foreach v_helper in array v_helpers loop
          v_escaped_helper := replace(v_helper, '.', chr(92) || '.');
          v_call_pattern := v_escaped_helper || '[[:space:]]*\([[:space:]]*\)';
          v_start := 1;
          loop
            v_pos := regexp_instr(v_clause, v_call_pattern, v_start, 1, 0, 'i');
            exit when v_pos = 0;
            v_after := regexp_instr(v_clause, v_call_pattern, v_start, 1, 1, 'i');
            v_call := substring(v_clause from v_pos for v_after - v_pos);
            if substring(v_clause from 1 for v_pos - 1) ~* '\([[:space:]]*select[[:space:]]*$' then
              v_start := v_after;
            else
              v_clause := overlay(v_clause placing '(select ' || v_call || ')' from v_pos for v_after - v_pos);
              v_start := v_pos + length(v_call) + 9;
            end if;
          end loop;
        end loop;

        foreach v_helper in array v_literal_helpers loop
          v_escaped_helper := replace(v_helper, '.', chr(92) || '.');
          v_call_pattern := v_escaped_helper || '[[:space:]]*\('
            || chr(39) || '([^' || chr(39) || ']|' || chr(39) || chr(39) || ')*' || chr(39)
            || '([[:space:]]*::text)?[[:space:]]*\)';
          v_start := 1;
          loop
            v_pos := regexp_instr(v_clause, v_call_pattern, v_start, 1, 0, 'i');
            exit when v_pos = 0;
            v_after := regexp_instr(v_clause, v_call_pattern, v_start, 1, 1, 'i');
            v_call := substring(v_clause from v_pos for v_after - v_pos);
            if substring(v_clause from 1 for v_pos - 1) ~* '\([[:space:]]*select[[:space:]]*$' then
              v_start := v_after;
            else
              v_clause := overlay(v_clause placing '(select ' || v_call || ')' from v_pos for v_after - v_pos);
              v_start := v_pos + length(v_call) + 9;
            end if;
          end loop;
        end loop;
      end if;

      if v_clause_name = 'qual' then
        v_qual := v_clause;
      else
        v_with_check := v_clause;
      end if;
    end loop;

    if v_policy.qual is distinct from v_qual or v_policy.with_check is distinct from v_with_check then
      raise notice 'Skipping backfill for policy % on %.%: current definition differs from the initplan migration output',
        v_policy.policyname, v_policy.schemaname, v_policy.tablename;
      continue;
    end if;

    v_snapshot := v_snapshot || jsonb_build_object(
      'created_qual', v_policy.qual,
      'created_with_check', v_policy.with_check,
      'created_definition_backfill', 'v1'
    );
    execute format(
      'comment on policy %I on %I.%I is %L',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename,
      v_prefix || encode(convert_to(v_snapshot::text, 'UTF8'), 'hex')
    );
  end loop;
end;
$policy_rollback_definitions$;
