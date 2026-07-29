-- Admin can assign/remove a person's Jabatan (Position) = a shared.person_roles row (ADR-0050 D5).
-- Plain admin-scoped RLS (NOT a definer RPC): person_roles is a directory junction with no auth.* write
-- and no privilege escalation, so it mirrors shared.person_access_roles' admin RLS (ADR-0011 D5). org seam
-- enforced by the org_id default (20260611000006) + WITH CHECK + a guard.

grant insert, delete on shared.person_roles to authenticated;

-- Guard: person AND role must both belong to the caller's org (org seam, ADR-0001). SECURITY INVOKER.
create or replace function shared._guard_person_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
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
  'Guard (ADR-0050): a Jabatan (person_roles) assignment must reference a person AND a role in the caller''s org (42501 otherwise). org_id is server-stamped by the column default. SECURITY INVOKER.';

create trigger person_roles_guard
  before insert on shared.person_roles
  for each row execute function shared._guard_person_roles();

-- Assign (FR-201): admin-only, org-scoped. org_id defaulted to current_org_id() in 20260611000006.
create policy person_roles_insert_admin on shared.person_roles
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Remove (FR-202): admin-only, org-scoped hard delete (no soft-delete column; is_manager_of reads live rows).
create policy person_roles_delete_admin on shared.person_roles
  for delete to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- DOWN:
--   drop policy person_roles_delete_admin on shared.person_roles;
--   drop policy person_roles_insert_admin on shared.person_roles;
--   drop trigger person_roles_guard on shared.person_roles;
--   drop function shared._guard_person_roles();
--   revoke insert, delete on shared.person_roles from authenticated;
