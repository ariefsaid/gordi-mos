-- P1-2 — the org-seam + read-posture machinery (ADR-0001 D4/D5).

-- _claim_uuid(claim): defensive extraction of a single UUID-valued claim from request.jwt.claims.
-- A malformed claims setting (empty string, non-JSON garbage) or a non-UUID claim value must FAIL
-- CLOSED (return NULL) rather than raise: a raised error inside an RLS predicate would surface as a
-- 500 and could be probed; a clean NULL denies access (no org -> directory hidden). PLPGSQL with an
-- others-handler around the jsonb parse + uuid cast turns every parse/cast failure into NULL. The
-- empty-string/whitespace claim is short-circuited (current_setting returns '' when unset) so the
-- jsonb cast is never even attempted on the common "no claims" path.
create or replace function shared._claim_uuid(claim_key text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  raw text := current_setting('request.jwt.claims', true);
  val text;
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  val := nullif(raw::jsonb ->> claim_key, '');
  return val::uuid;
exception
  when others then
    return null;  -- malformed JSON or non-UUID claim -> fail closed (clean deny)
end;
$$;
comment on function shared._claim_uuid(text) is
  'Defensive single-UUID claim extraction: malformed JSON / non-UUID / empty -> NULL (fail closed). Backs current_org_id / current_person_id.';

-- current_org_id(): the org claim minted into the JWT by the access-token hook (OD-P1-1).
-- STABLE, SECURITY INVOKER: reads only the request claims, no elevated rights.
create or replace function shared.current_org_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select shared._claim_uuid('org_id')
$$;
comment on function shared.current_org_id() is 'Org id from the JWT custom claim (hook-injected, client-unspoofable). OD-P1-1.';

-- current_person_id(): the person claim minted into the JWT by the hook (OD-P1-2 link).
create or replace function shared.current_person_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select shared._claim_uuid('person_id')
$$;
comment on function shared.current_person_id() is 'Person id from the JWT custom claim. OD-P1-2.';

-- is_org_member(): true when the session is bound to an org (i.e., has an org claim).
create or replace function shared.is_org_member()
returns boolean
language sql
stable
set search_path = ''
as $$
  select shared.current_org_id() is not null
$$;
comment on function shared.is_org_member() is 'Session is bound to an org. Basis of org-readable RLS.';

-- is_manager_of(target): UNION over ALL roles the target holds, walking reports_to_role_id upward;
-- true iff the current person holds ANY ancestor role. Dual-hat -> reachable from all leads (OD-P1-7).
-- INVARIANT: correctness relies on the access-token hook minting org_id + person_id from the SAME
-- people row, so the viewer's person_id is always consistent with current_org_id(); RLS then scopes
-- person_roles/roles to that org and a cross-org person_id claim matches no in-org rows (fails closed).
create or replace function shared.is_manager_of(target_person_id uuid)
returns boolean
language sql
stable
set search_path = ''
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
    -- UNION (not UNION ALL): roles form a FINITE set, and a cyclic reports_to_role_id graph is
    -- insertable today (self-FK, no acyclicity constraint). UNION dedupes the working set so the
    -- recursion terminates on cycles instead of looping forever inside RLS evaluation.
    union
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
