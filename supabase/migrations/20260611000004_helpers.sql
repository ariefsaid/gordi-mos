-- P1-2 — the org-seam + read-posture machinery (ADR-0001 D4/D5).

-- current_org_id(): the org claim minted into the JWT by the access-token hook (OD-P1-1).
-- STABLE, SECURITY INVOKER: reads only the request claims, no elevated rights.
create or replace function shared.current_org_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'org_id',
    ''
  )::uuid
$$;
comment on function shared.current_org_id() is 'Org id from the JWT custom claim (hook-injected, client-unspoofable). OD-P1-1.';

-- current_person_id(): the person claim minted into the JWT by the hook (OD-P1-2 link).
create or replace function shared.current_person_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'person_id',
    ''
  )::uuid
$$;
comment on function shared.current_person_id() is 'Person id from the JWT custom claim. OD-P1-2.';

-- is_org_member(): true when the session is bound to an org (i.e., has an org claim).
create or replace function shared.is_org_member()
returns boolean
language sql
stable
as $$
  select shared.current_org_id() is not null
$$;
comment on function shared.is_org_member() is 'Session is bound to an org. Basis of org-readable RLS.';

-- is_manager_of(target): UNION over ALL roles the target holds, walking reports_to_role_id upward;
-- true iff the current person holds ANY ancestor role. Dual-hat -> reachable from all leads (OD-P1-7).
create or replace function shared.is_manager_of(target_person_id uuid)
returns boolean
language sql
stable
as $$
  with recursive
  -- every role the target currently holds
  target_roles as (
    select pr.role_id
    from shared.person_roles pr
    where pr.person_id = target_person_id
  ),
  -- all ancestor roles of the target's roles (the management chain, union over all held roles)
  ancestor_roles as (
    select r.id, r.reports_to_role_id
    from shared.roles r
    join target_roles tr on tr.role_id = r.id
    union all
    select parent.id, parent.reports_to_role_id
    from shared.roles parent
    join ancestor_roles a on a.reports_to_role_id = parent.id
  ),
  -- every role the current viewer holds
  viewer_roles as (
    select pr.role_id
    from shared.person_roles pr
    where pr.person_id = shared.current_person_id()
  )
  select exists (
    -- viewer holds a STRICT ancestor of a target role (exclude the target's own roles)
    select 1
    from ancestor_roles a
    join viewer_roles vr on vr.role_id = a.id
    where a.id not in (select role_id from target_roles)
  )
$$;
comment on function shared.is_manager_of(uuid) is
  'True iff current person holds a role strictly above any role the target holds (recursive union, OD-P1-7).';
