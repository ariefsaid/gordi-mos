-- Roll back caller-context initPlans and the two indexes introduced by the paired migration.

do $restore_policy_expressions$
declare
  v_policy record;
  v_helper text;
  v_escaped_helper text;
  v_wrapper_pattern text;
  v_roles text;
  v_create_policy text;
  v_qual text;
  v_with_check text;
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
           policies.permissive,
           policies.roles,
           policies.cmd,
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

    foreach v_helper in array v_helpers loop
      v_escaped_helper := replace(v_helper, '.', chr(92) || '.');
      v_wrapper_pattern := '\([[:space:]]*select[[:space:]]+('
        || v_escaped_helper || '[[:space:]]*\([[:space:]]*\))'
        || '([[:space:]]+as[[:space:]]+[[:alnum:]_]+)?[[:space:]]*\)';
      if v_qual is not null then
        v_qual := regexp_replace(v_qual, v_wrapper_pattern, '\1', 'gi');
      end if;
      if v_with_check is not null then
        v_with_check := regexp_replace(v_with_check, v_wrapper_pattern, '\1', 'gi');
      end if;
    end loop;

    foreach v_helper in array v_literal_helpers loop
      v_escaped_helper := replace(v_helper, '.', chr(92) || '.');
      v_wrapper_pattern := '\([[:space:]]*select[[:space:]]+('
        || v_escaped_helper || '[[:space:]]*\('
        || chr(39) || '[^' || chr(39) || ']*' || chr(39)
        || '([[:space:]]*::text)?[[:space:]]*\))'
        || '([[:space:]]+as[[:space:]]+[[:alnum:]_]+)?[[:space:]]*\)';
      if v_qual is not null then
        v_qual := regexp_replace(v_qual, v_wrapper_pattern, '\1', 'gi');
      end if;
      if v_with_check is not null then
        v_with_check := regexp_replace(v_with_check, v_wrapper_pattern, '\1', 'gi');
      end if;
    end loop;

    if v_qual is distinct from v_policy.qual or v_with_check is distinct from v_policy.with_check then
      select string_agg(
               case when role_name = 'public' then 'PUBLIC' else quote_ident(role_name::text) end,
               ', ' order by role_name::text
             )
        into v_roles
        from unnest(v_policy.roles) as policy_roles(role_name);

      execute format('drop policy %I on %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
      v_create_policy := format(
        'create policy %I on %I.%I as %s for %s to %s',
        v_policy.policyname,
        v_policy.schemaname,
        v_policy.tablename,
        v_policy.permissive,
        v_policy.cmd,
        v_roles
      );
      if v_qual is not null then
        v_create_policy := v_create_policy || format(' using (%s)', v_qual);
      end if;
      if v_with_check is not null then
        v_create_policy := v_create_policy || format(' with check (%s)', v_with_check);
      end if;
      execute v_create_policy;

      if v_policy.policy_comment is not null then
        execute format(
          'comment on policy %I on %I.%I is %L',
          v_policy.policyname,
          v_policy.schemaname,
          v_policy.tablename,
          v_policy.policy_comment
        );
      end if;
    end if;
  end loop;
end;
$restore_policy_expressions$;

drop index if exists mos.tasks_generated_from_task_def_idx;
drop index if exists mos.follow_ups_assigned_to_idx;
