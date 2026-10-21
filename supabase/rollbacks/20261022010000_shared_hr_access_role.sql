-- DOWN for 20261022010000. Refuses while any hr assignment exists (including revoked rows): export
-- the grant audit separately, then delete those rows before shrinking the vocabulary.
begin;
lock table shared.person_access_roles in access exclusive mode;
do $$
begin
  if exists (select 1 from shared.person_access_roles where access_role = 'hr') then
    raise exception 'Rollback refused: remove or migrate every hr assignment (including revoked) first';
  end if;
end $$;
delete from shared.role_capabilities where capability in ('attendance.read_all','attendance.correct','attendance.receive_unled');
alter domain shared.access_role drop constraint access_role_allowed;
alter domain shared.access_role add constraint access_role_allowed
  check (value in ('admin','ops_lead','finance','member','manager','supervisor'));
-- Restore the previous self-assignment list from 20260805000002_shared_access_control.sql.
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
       and not exists (select 1 from shared.people p where p.id = new.person_id and p.org_id = new.org_id) then
      raise exception 'person is not in your org' using errcode = '42501';
    end if;
  end if;
  if new.revoked_at is null
     and new.access_role in ('admin','finance','manager','supervisor')
     and new.person_id = shared.current_person_id() then
    raise exception 'access role % is never self-assignable', new.access_role using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.access_role = 'admin' and old.revoked_at is null and new.revoked_at is not null then
    if shared._count_active_admins() <= 1 then
      raise exception 'cannot revoke admin from the last active admin' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
commit;
