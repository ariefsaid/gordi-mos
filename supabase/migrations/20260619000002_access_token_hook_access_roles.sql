-- P4 — extend the access-token hook to stamp the access_roles claim (ADR-0011 D5).
-- The read helpers (_claim_text_array / current_access_roles / has_access_role) live in the prior
-- migration (…000001) because the RLS policies there reference has_access_role and CREATE POLICY
-- resolves the function at creation time. This migration extends the single audited SECURITY DEFINER
-- injection point (the hook) and grants the auth-admin role SELECT on the new table.

-- Extend the existing custom_access_token_hook (…000005) to also stamp the access_roles claim — the
-- person's NON-REVOKED assigned access roles. CREATE OR REPLACE keeps the single audited DEFINER
-- injection point (ADR-0001 D1); the …000005 file is NOT edited. Body is the prior body + the stamp.
create or replace function shared.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims     jsonb;
  v_person   shared.people;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  select p.* into v_person
  from shared.people p
  where p.user_id = (event ->> 'user_id')::uuid
    and p.archived_at is null
  limit 1;

  if v_person.id is not null then
    claims := jsonb_set(claims, '{org_id}',    to_jsonb(v_person.org_id::text), true);
    claims := jsonb_set(claims, '{person_id}', to_jsonb(v_person.id::text),     true);
    -- access_roles: the non-revoked assigned set; coalesce to [] (fail-safe: no roles, not absent).
    -- manager is NOT stamped (derived, FR-013) — a role-chain change needs no token re-mint.
    claims := jsonb_set(claims, '{access_roles}',
      coalesce(
        (select to_jsonb(array_agg(par.access_role order by par.access_role))
           from shared.person_access_roles par
          where par.person_id = v_person.id
            and par.revoked_at is null),
        '[]'::jsonb),
      true);
  else
    -- orphan: still stamp an empty array so the claim is present and fails closed (FR-012).
    claims := jsonb_set(claims, '{access_roles}', '[]'::jsonb, true);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
comment on function shared.custom_access_token_hook(jsonb) is
  'Auth hook: stamps org_id + person_id + access_roles (non-revoked assigned set) from shared.*. OD-P1-1/2, ADR-0011 D5.';

-- The definer hook now reads person_access_roles; grant the auth-admin role SELECT (mirrors the
-- existing grant on shared.people in …000005). Execute grants on the hook are unchanged (re-verified,
-- not re-introduced — NFR-007).
grant select on shared.person_access_roles to supabase_auth_admin;

-- Re-affirm the single-injection-point privilege posture at this CREATE OR REPLACE site (NFR-007;
-- idempotent — these match …000005). The definer hook stays executable only by the auth admin.
revoke execute on function shared.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function shared.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- DOWN: CREATE OR REPLACE the hook with the …000005 body (drop the access_roles stamp);
--       revoke select on shared.person_access_roles from supabase_auth_admin.
--       (The read helpers live in …000001's DOWN.)
