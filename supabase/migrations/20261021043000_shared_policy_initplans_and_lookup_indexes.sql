-- Evaluate caller-context RLS helpers once per statement and index their lookup paths.
-- The policy catalog reflects all earlier migrations, so only existing helper calls are wrapped.
-- Reversible snapshots in changed policy comments preserve exact clauses and prior comments for DOWN.
-- DOWN: run supabase/rollbacks/20261021043000_shared_policy_initplans_and_lookup_indexes.sql

do $policy_initplans$
declare
  v_policy record;
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
  v_alter_policy text;
  v_snapshot text;
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
  loop
    v_qual := v_policy.qual;
    v_with_check := v_policy.with_check;

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

    if v_qual is distinct from v_policy.qual or v_with_check is distinct from v_policy.with_check then
      v_snapshot := encode(convert_to(jsonb_build_object(
        'qual', v_policy.qual,
        'with_check', v_policy.with_check,
        'comment', v_policy.policy_comment
      )::text, 'UTF8'), 'hex');
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
        'MOS_POLICY_INITPLAN_BACKUP_V1:' || v_snapshot
      );
    end if;
  end loop;
end;
$policy_initplans$;

create index if not exists follow_ups_assigned_to_idx
  on mos.follow_ups (assigned_to);
create index if not exists tasks_generated_from_task_def_idx
  on mos.tasks (generated_from_task_def_id);
