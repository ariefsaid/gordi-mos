-- DOWN:
--   create or replace function reporting.current_writer_org() returns uuid
--   language plpgsql stable security invoker set search_path = '' as $down$
--   declare raw text := current_setting('app.reporting_org', true);
--   begin
--     if raw is null or btrim(raw) = '' then return null; end if;
--     return btrim(raw)::uuid;
--   exception when others then return null;
--   end; $down$;
--   grant execute on function reporting.current_writer_org() to public;
--   drop table reporting_private.writer_orgs;
--   drop schema reporting_private;
-- A database administrator provisions mappings before the snapshot job resumes.
-- No application role can manage or read the mapping.
create schema reporting_private;
revoke all on schema reporting_private from public, anon, authenticated, service_role, reporting_writer;

create table reporting_private.writer_orgs (
  login_oid oid not null,
  login_name name not null,
  org_id uuid not null references shared.orgs(id) on delete cascade,
  primary key (login_oid, login_name, org_id)
);
alter table reporting_private.writer_orgs enable row level security;
alter table reporting_private.writer_orgs force row level security;
revoke all on reporting_private.writer_orgs from public, anon, authenticated, service_role, reporting_writer;

create or replace function reporting.current_writer_org()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  raw text := current_setting('app.reporting_org', true);
  declared_org uuid;
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  begin
    declared_org := btrim(raw)::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if exists (
    select 1 from reporting_private.writer_orgs mapping
    join pg_catalog.pg_roles login_role on login_role.oid = mapping.login_oid
      and login_role.rolname = mapping.login_name
    where login_role.rolname = session_user and login_role.rolcanlogin
      and mapping.org_id = declared_org
  ) then
    return declared_org;
  end if;
  return null;
end;
$$;
revoke execute on function reporting.current_writer_org() from public, anon, authenticated, service_role;
grant execute on function reporting.current_writer_org() to reporting_writer;
comment on function reporting.current_writer_org() is
  'Returns the transaction-declared org only when it is assigned to the database login.';
