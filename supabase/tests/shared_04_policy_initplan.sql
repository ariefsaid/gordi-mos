begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

with policy_clauses as (
  select qual as expression
    from pg_policies
   where schemaname = any (array['shared', 'mos', 'ops', 'integrations', 'reporting'])
  union all
  select with_check as expression
    from pg_policies
   where schemaname = any (array['shared', 'mos', 'ops', 'integrations', 'reporting'])
), unwrapped as (
  select *, regexp_replace(
    expression,
    $wrapped$\([[:space:]]*select[[:space:]]+shared\.(current_org_id|current_person_id|is_org_wide|is_org_member|is_cafe_affiliated)[[:space:]]*\([[:space:]]*\)([[:space:]]+as[[:space:]]+[[:alnum:]_]+)?[[:space:]]*\)|\([[:space:]]*select[[:space:]]+shared\.(has_access_role|can)[[:space:]]*\('[^']*(''[^']*)*'::text[[:space:]]*\)([[:space:]]+as[[:space:]]+[[:alnum:]_]+)?[[:space:]]*\)$wrapped$,
    '', 'gi'
  ) as bare_expression
    from policy_clauses
   where expression is not null
)
select is(
  (select count(*)::int
     from unwrapped
    where bare_expression ~* $bare$shared\.(current_org_id|current_person_id|is_org_wide|is_org_member|is_cafe_affiliated)[[:space:]]*\([[:space:]]*\)|shared\.(has_access_role|can)[[:space:]]*\('[^']*(''[^']*)*'::text[[:space:]]*\)$bare$),
  0,
  'every RLS helper in policy clauses is evaluated once per statement'
);

select * from finish();
rollback;
