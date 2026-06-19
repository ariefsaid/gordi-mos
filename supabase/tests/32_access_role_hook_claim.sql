begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- Fixture links Author (...0d01) to auth user (...aa01); grants member + finance (live) and
-- ops_lead (revoked). The hook is SECURITY DEFINER; called here as the migration owner.
select mos._test_seed_role_tree();
select mos._test_seed_access_roles();

-- AC-010 (FR-010/FR-011): the hook stamps the non-revoked assigned set alongside org_id/person_id.
select set_eq($$
  select jsonb_array_elements_text(
    shared.custom_access_token_hook(
      jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01',
                         'claims', jsonb_build_object())
    ) -> 'claims' -> 'access_roles')
$$, array['finance','member'], 'AC-010: hook stamps {finance, member} for the linked person');

-- AC-011 (FR-010/FR-034): a revoked ops_lead is excluded from the claim.
select ok( not (
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01','claims', jsonb_build_object())
  ) -> 'claims' -> 'access_roles' ? 'ops_lead'),
  'AC-011: revoked ops_lead excluded from the claim');

-- AC-012 (FR-012/FR-013): orphan user_id (no people row) -> empty array, never absent / never manager.
select is(
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-0000000000ff','claims', jsonb_build_object())
  ) -> 'claims' -> 'access_roles',
  '[]'::jsonb, 'AC-012: orphan -> access_roles []');

-- AC-012/013: manager is never stamped into the claim (derived, FR-013).
select ok( not (
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-00000000aa01','claims', jsonb_build_object())
  ) -> 'claims' -> 'access_roles' ? 'manager'),
  'AC-012/013: manager never stamped into the claim');

select * from finish();
rollback;
