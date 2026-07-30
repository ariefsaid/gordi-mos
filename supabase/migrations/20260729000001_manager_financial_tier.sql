-- Adds the `manager` access-role tier (ADR-0050, amends ADR-0011 D5).
-- `manager` = company-wide financial VIEW (revenue + COGS/gross-margin), org-scoped, SELECT-only.
-- NOT overheads (no overheads table). NOT a write path. Self-assign blocked (parity w/ finance).
-- Distinct from the DERIVED reporting-line "manager" (is_manager_of) — see ADR-0050 Context.

-- (1) Extend the access-role vocabulary CHECK (FR-101). ADR-0011 Reversibility: enum grows by one migration.
alter table shared.person_access_roles
  drop constraint person_access_roles_access_role_check,
  add constraint person_access_roles_access_role_check
    check (access_role in ('admin','ops_lead','finance','member','manager'));

comment on table shared.person_access_roles is
  'Access-role assignments (ADR-0011 D5 + ADR-0050). One row per (person, access_role); soft-revoke via revoked_at. `manager` = company-wide financial view (ADR-0050); the reporting-line manager (is_manager_of) stays derived, never stored.';

-- (2) Self-assign block extended to `manager` (FR-107). Full 20260626000001 guard body re-pasted
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

  -- admin/finance/manager never self-assignable, on a GRANT (a live, non-revoked target state).
  if new.revoked_at is null
     and new.access_role in ('admin','finance','manager')
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
  'Guard (ADR-0011 D5 + ADR-0016 + ADR-0050): admin/finance/manager never self-assignable on grant (42501); org_id/person_id/access_role immutable on UPDATE; granted_by/revoked_by forced server-side; no-lockout on last admin. SECURITY INVOKER.';

-- (3) Widen the reporting SELECT policies to admit `manager` (FR-103/104). ALTER POLICY replaces ONLY
--     the USING expression — policy names, finance/admin arms, and reporting_writer write policy untouched (FR-106).
alter policy sales_daily_revenue_select_finance_admin
  on reporting.sales_daily_revenue
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
      or shared.has_access_role('manager')
    )
  );
comment on policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue is
  'SELECT for finance/admin/manager (ADR-0050) in the same org. Name kept for DOWN-chain stability though it now admits manager.';

alter policy sales_margin_daily_select_finance_admin
  on reporting.sales_margin_daily
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
      or shared.has_access_role('manager')
    )
  );
comment on policy sales_margin_daily_select_finance_admin on reporting.sales_margin_daily is
  'SELECT for finance/admin/manager (ADR-0050) in the same org. Name kept for DOWN-chain stability though it now admits manager.';

-- DOWN:
--   alter policy sales_margin_daily_select_finance_admin on reporting.sales_margin_daily
--     using (org_id = shared.current_org_id() and (shared.has_access_role('finance') or shared.has_access_role('admin')));
--   alter policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue
--     using (org_id = shared.current_org_id() and (shared.has_access_role('finance') or shared.has_access_role('admin')));
--   create or replace shared._guard_person_access_roles() with the 20260626000001 body (self-assign set back to admin,finance);
--   alter table shared.person_access_roles drop constraint person_access_roles_access_role_check,
--     add constraint person_access_roles_access_role_check check (access_role in ('admin','ops_lead','finance','member'));
--     -- NOTE: this enum-shrink FAILS while any live 'manager' row exists — revoke/delete them first.
