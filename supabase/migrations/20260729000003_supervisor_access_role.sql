-- Adds the `supervisor` access-role tier (ADR-0051 D1/D5; adds a 6th value to ADR-0011 D5 / ADR-0050).
-- `supervisor` = revenue VIEW only, scoped per-person to (channel, branch) via
-- reporting.supervisor_revenue_scope (see 20260729000004). Self-assign blocked (parity w/ finance/manager).

-- (1) Extend the access-role vocabulary CHECK (FR-301). ADR-0011 Reversibility: enum grows by one migration.
alter table shared.person_access_roles
  drop constraint person_access_roles_access_role_check,
  add constraint person_access_roles_access_role_check
    check (access_role in ('admin','ops_lead','finance','member','manager','supervisor'));

comment on table shared.person_access_roles is
  'Access-role assignments (ADR-0011 D5 + ADR-0050 + ADR-0051). One row per (person, access_role); soft-revoke via revoked_at. `manager` = company-wide financial view; `supervisor` = per-branch revenue view (scope in reporting.supervisor_revenue_scope).';

-- (2) Self-assign block extended to `supervisor` (FR-308). Full 20260729000001 guard body re-pasted
--     UNCHANGED except the self-assign set — do not drop any existing invariant (no-lockout etc.).
create or replace function shared._guard_person_access_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on an access-role assignment' using errcode = '42501';
    end if;
    if new.person_id is distinct from old.person_id then
      raise exception 'person_id is immutable on an access-role assignment' using errcode = '42501';
    end if;
    if new.access_role is distinct from old.access_role then
      raise exception 'access_role is immutable on an access-role assignment' using errcode = '42501';
    end if;
    if new.revoked_at is not null and old.revoked_at is null then
      new.revoked_by := shared.current_person_id();
    elsif new.revoked_at is null and old.revoked_at is not null then
      new.revoked_by := null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.granted_by := shared.current_person_id();
  end if;

  -- admin/finance/manager/supervisor never self-assignable, on a GRANT (a live, non-revoked target state).
  if new.revoked_at is null
     and new.access_role in ('admin','finance','manager','supervisor')
     and new.person_id = shared.current_person_id() then
    raise exception 'access role % is never self-assignable', new.access_role using errcode = '42501';
  end if;

  -- No-lockout (FR-041 / ADR-0016): a revoke (live->revoked) of the LAST active admin is refused.
  if tg_op = 'UPDATE'
     and old.access_role = 'admin'
     and old.revoked_at is null and new.revoked_at is not null then
    if shared._count_active_admins() <= 1 then
      raise exception 'cannot revoke admin from the last active admin' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
comment on function shared._guard_person_access_roles() is
  'Guard (ADR-0011 D5 + ADR-0016 + ADR-0050 + ADR-0051): admin/finance/manager/supervisor never self-assignable on grant (42501); org_id/person_id/access_role immutable on UPDATE; granted_by/revoked_by forced server-side; no-lockout on last admin. SECURITY INVOKER.';

-- DOWN:
--   create or replace shared._guard_person_access_roles() with the 20260729000001 body (self-assign set back to admin,finance,manager);
--   alter table shared.person_access_roles drop constraint person_access_roles_access_role_check,
--     add constraint person_access_roles_access_role_check check (access_role in ('admin','ops_lead','finance','member','manager'));
--     -- NOTE: this enum-shrink FAILS while any live 'supervisor' row exists — revoke/delete them first.
