-- Move stable shared RLS helpers into scalar subqueries so PostgreSQL can evaluate them once per
-- statement instead of once per candidate row. The helper results and policy behavior are unchanged.
--
-- DOWN (manual, reversible): rerun the same catalog loop and apply this inverse to each non-NULL
-- clause before ALTER POLICY, keeping its roles and command untouched:
--   regexp_replace(clause, $down$\([[:space:]]*select[[:space:]]+(shared\.(current_org_id|current_person_id|is_org_wide|is_org_member|is_cafe_affiliated|has_access_role|can)[[:space:]]*\([^)]*\))([[:space:]]+as[[:space:]]+[[:alnum:]_]+)?[[:space:]]*\)$down$, '\1', 'gi')
-- Format policy/table identifiers with %I; this removes the scalar wrapper and optional deparser alias.
do $migration$
declare
  v_policy record;
  v_qual text;
  v_with_check text;
  v_bare_regex constant text := $bare$shared\.(current_org_id|current_person_id|is_org_wide|is_org_member|is_cafe_affiliated)[[:space:]]*\([[:space:]]*\)|shared\.(has_access_role|can)[[:space:]]*\('[^']*(''[^']*)*'::text[[:space:]]*\)$bare$;
  v_wrapped_regex constant text := $wrapped$\([[:space:]]*select[[:space:]]+shared\.(current_org_id|current_person_id|is_org_wide|is_org_member|is_cafe_affiliated)[[:space:]]*\([[:space:]]*\)([[:space:]]+as[[:space:]]+[[:alnum:]_]+)?[[:space:]]*\)|\([[:space:]]*select[[:space:]]+shared\.(has_access_role|can)[[:space:]]*\('[^']*(''[^']*)*'::text[[:space:]]*\)([[:space:]]+as[[:space:]]+[[:alnum:]_]+)?[[:space:]]*\)$wrapped$;
  v_start integer;
  v_pos integer;
  v_after integer;
  v_call text;
  v_statement text;
begin
  for v_policy in execute format(
    'select schemaname, tablename, policyname, qual, with_check
       from pg_policies
      where schemaname = any (array[%L, %L, %L, %L, %L])',
    'shared', 'mos', 'ops', 'integrations', 'reporting'
  ) loop
    if not (
      coalesce(regexp_replace(v_policy.qual, v_wrapped_regex, '', 'gi'), '') ~* v_bare_regex
      or coalesce(regexp_replace(v_policy.with_check, v_wrapped_regex, '', 'gi'), '') ~* v_bare_regex
    ) then
      continue;
    end if;

    v_qual := v_policy.qual;
    v_with_check := v_policy.with_check;

    if v_qual is not null then
      v_start := 1;
      loop
        v_pos := regexp_instr(v_qual, v_bare_regex, v_start, 1, 0, 'i');
        exit when v_pos = 0;
        v_after := regexp_instr(v_qual, v_bare_regex, v_start, 1, 1, 'i');
        v_call := substring(v_qual from v_pos for v_after - v_pos);
        if substring(v_qual from 1 for v_pos - 1) ~* '\([[:space:]]*select[[:space:]]*$' then
          v_start := v_after;
        else
          v_qual := overlay(v_qual placing '(select ' || v_call || ')' from v_pos for v_after - v_pos);
          v_start := v_pos + length(v_call) + 9;
        end if;
      end loop;
    end if;

    if v_with_check is not null then
      v_start := 1;
      loop
        v_pos := regexp_instr(v_with_check, v_bare_regex, v_start, 1, 0, 'i');
        exit when v_pos = 0;
        v_after := regexp_instr(v_with_check, v_bare_regex, v_start, 1, 1, 'i');
        v_call := substring(v_with_check from v_pos for v_after - v_pos);
        if substring(v_with_check from 1 for v_pos - 1) ~* '\([[:space:]]*select[[:space:]]*$' then
          v_start := v_after;
        else
          v_with_check := overlay(v_with_check placing '(select ' || v_call || ')' from v_pos for v_after - v_pos);
          v_start := v_pos + length(v_call) + 9;
        end if;
      end loop;
    end if;

    v_statement := format('alter policy %I on %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename);
    if v_policy.qual is not null then
      v_statement := v_statement || format(' using (%s)', v_qual);
    end if;
    if v_policy.with_check is not null then
      v_statement := v_statement || format(' with check (%s)', v_with_check);
    end if;
    execute v_statement;
  end loop;
end;
$migration$;
