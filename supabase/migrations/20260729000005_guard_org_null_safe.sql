-- Fix: the org-seam guards on shared.person_roles (ADR-0050, mig ...000002) and
-- reporting.supervisor_revenue_scope (ADR-0051, mig ...000004) raised 42501 whenever
-- shared.current_org_id() is NULL — which is the case under the service/seed connection (no JWT
-- claims). That broke `supabase db reset` (seed.sql inserts person_roles for the dev personas) and
-- any fresh deploy / manual seed. CI never caught it: `verify` doesn't seed, and the pgTAP gate
-- runs only at dev→main.
--
-- The cross-org threat these guards defend against only exists for an AUTHENTICATED admin session,
-- which always carries a non-null org claim. Under a service/seed connection there is no "your org"
-- to cross, and such connections are trusted + bypass RLS anyway (same rationale as the
-- reporting_writer no-GUC case, mig 20260712000002). So the org-membership check is now applied
-- ONLY when current_org_id() is not null. Authenticated cross-org writes stay blocked (unchanged);
-- the seed/service path is unblocked. SECURITY INVOKER, bodies otherwise identical to the originals.

create or replace function shared._guard_person_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Only enforce the org seam for a real (authenticated) session; NULL org = service/seed context.
  if tg_op = 'INSERT' and shared.current_org_id() is not null then
    if not exists (select 1 from shared.people p
                    where p.id = new.person_id and p.org_id = shared.current_org_id()) then
      raise exception 'person is not in your org' using errcode = '42501';
    end if;
    if not exists (select 1 from shared.roles r
                    where r.id = new.role_id and r.org_id = shared.current_org_id()) then
      raise exception 'position is not in your org' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function shared._guard_person_roles() is
  'Guard (ADR-0050, org-null-safe ...000005): a Jabatan assignment must reference a person AND a role in the caller''s org — enforced only when current_org_id() is not null (an authenticated session); the service/seed connection (null org) is exempt. SECURITY INVOKER.';

create or replace function reporting._guard_supervisor_revenue_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.granted_by := shared.current_person_id();
    -- Only enforce the org seam for a real (authenticated) session; NULL org = service/seed context.
    if shared.current_org_id() is not null
       and not exists (select 1 from shared.people p
                        where p.id = new.person_id and p.org_id = shared.current_org_id()) then
      raise exception 'person is not in your org' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function reporting._guard_supervisor_revenue_scope() is
  'Guard (ADR-0051, org-null-safe ...000005): a supervisor scope row must target a person in the caller''s org — enforced only when current_org_id() is not null; service/seed (null org) exempt. granted_by forced server-side. SECURITY INVOKER.';

-- DOWN:
--   create or replace both functions with their pre-...000005 bodies (unconditional org check on INSERT):
--     shared._guard_person_roles: drop the `and shared.current_org_id() is not null` from the IF.
--     reporting._guard_supervisor_revenue_scope: drop the `shared.current_org_id() is not null and` from the IF.
