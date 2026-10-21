-- Staff attendance stage 2: the fixed `hr` access role (ADR-0063). HR reads every Team's attendance
-- records through named capability grants; it grants no money access and no roster or approval
-- authority over a Team it does not lead.
-- DOWN: supabase/rollbacks/20261022010000_shared_hr_access_role.sql (refuses while any hr assignment exists).

alter domain shared.access_role drop constraint access_role_allowed;
alter domain shared.access_role add constraint access_role_allowed
  check (value in ('admin','ops_lead','finance','member','manager','supervisor','hr'));

-- Named grants. shared.can() only says a grant exists; every attendance action also checks org,
-- Person and Team against current data.
insert into shared.role_capabilities (role, capability, scope) values
  ('hr',    'attendance.read_all',      'org'),
  ('hr',    'attendance.correct',       'org'),
  ('hr',    'attendance.receive_unled', 'org'),
  ('admin', 'attendance.read_all',      'org')
on conflict (role, capability) do nothing;

-- hr joins the roles an admin can never give to themselves, including a re-grant of a revoked row.
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
    if new.person_id is not null
       and not exists (select 1 from shared.people p
                        where p.id = new.person_id and p.org_id = new.org_id) then
      raise exception 'person is not in your org' using errcode = '42501';
    end if;
  end if;

  if new.revoked_at is null
     and new.access_role in ('admin','finance','manager','supervisor','hr')
     and new.person_id = shared.current_person_id() then
    raise exception 'access role % is never self-assignable', new.access_role using errcode = '42501';
  end if;

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
  'Guard (ADR-0011 D5 + ADR-0016 + ADR-0050 + ADR-0051 + ADR-0063): admin/finance/manager/supervisor/hr never '
  'self-assignable on grant or re-grant (42501); org_id/person_id/access_role immutable on UPDATE (42501); '
  'the subject person must belong to the grant''s own org (42501); granted_by/revoked_by forced '
  'server-side; no-lockout on the last active admin. SECURITY INVOKER.';
