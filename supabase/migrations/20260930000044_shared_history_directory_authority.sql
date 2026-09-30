-- Change history batch 2d — Directory & authority (#989), on the registry mechanism of 20260930000040_shared_record_history_registry.sql
-- (ADR-0059, DA-3). This migration ONLY creates the batch's reader functions, registers them in
-- shared.record_history_readers and attaches the one generic trigger; it does not replace the
-- read dispatch, so batches are order-independent and none can drop another's arms.
-- The reader bodies and trigger registrations are the batch's reviewed arms, ported unchanged
-- from the batch's tip (feat/989-*).
--
-- Eight uuid-id tables — shared.business_units, shared.people, shared.person_access_roles,
-- shared.person_roles, shared.roles, shared.sites, shared.team_memberships, shared.teams — take
-- the bare registration (default id key, built-in exclude list). Their history reads through each
-- table's own SELECT policy: the plain org-membership predicate every one of them carries
-- (people_select_org and its siblings, 20260805000002), so each arm is that predicate over a live
-- lookup by record_key, with the guarded uuid cast that preserves the PK index.
--
-- TWO composite-key tables (change-history DA-1; the PK is the key, there is no uuid id):
--   shared.role_authority        (org_id, action, role) → record_key '<org-uuid>:<action>:<role>'
--   shared.team_lead_assignments (org_id, team_id)       → record_key '<org-uuid>:<team-uuid>'
-- The trigger registers the PK columns in PK order. Their dispatch arms are the one structural
-- exception to the live-lookup shape: both tables are deliberately RPC-only (20260909000006
-- revokes every table privilege from the application roles and creates no SELECT policy — the
-- admin-only SECURITY DEFINER list/save functions are the only surface), so a dispatch lookup
-- under the invoker would ERROR "permission denied" for every authenticated caller rather than
-- return false. The arms therefore restate the RPCs' read authority without touching the tables:
-- the org parsed from the record_key's first registered component (org_id is first in both PKs)
-- AND shared.has_access_role('admin'), exactly who can read these settings today. A malformed key
-- fails closed on the uuid shape test instead of erroring the policy query.
--
-- NOT wired: shared.orgs. The tenant root has no org_id column — it IS the org — and the Slice-1
-- trigger hardcodes the history row's org as (row ->> 'org_id')::uuid into record_history.org_id
-- (NOT NULL, FK to shared.orgs). Attaching the trigger would turn every org insert into a not-null
-- violation, starting with the test seed. Wiring it needs a mechanism change, and this batch does
-- not touch 20260929000010; orgs stays unnamed in the dispatch and fails closed.
--
-- The batch's one hard-DELETE with a wired arm: shared.person_roles — the schema's only
-- authenticated DELETE grant (person_roles_delete_admin, org-scoped admin; the Jabatan assignment
-- has no soft-delete column and is_manager_of reads live rows). Its delete row stays readable
-- through the SNAPSHOT arm: the org-wide person_roles_select_org predicate (no role gate)
-- evaluated over the captured columns, because the row itself is gone.
-- shared.team_lead_assignments is also hard-deletable (the settings RPC clears a designation with
-- NULL) and its delete row reads through the admin tier over the snapshot's org.
--
-- DOWN (drop the observers first, then the registry rows, then the readers they name):
--   drop trigger record_history_business_units on shared.business_units;
--   drop trigger record_history_people on shared.people;
--   drop trigger record_history_person_access_roles on shared.person_access_roles;
--   drop trigger record_history_person_roles on shared.person_roles;
--   drop trigger record_history_roles on shared.roles;
--   drop trigger record_history_sites on shared.sites;
--   drop trigger record_history_team_memberships on shared.team_memberships;
--   drop trigger record_history_teams on shared.teams;
--   drop trigger record_history_role_authority on shared.role_authority;
--   drop trigger record_history_team_lead_assignments on shared.team_lead_assignments;
--   delete from shared.record_history_readers where (schema_name, table_name) in (
--     ('shared','business_units'), ('shared','people'), ('shared','person_access_roles'), ('shared','person_roles'), ('shared','roles'), ('shared','sites'), ('shared','team_memberships'), ('shared','teams'), ('shared','role_authority'), ('shared','team_lead_assignments'));
--   drop function shared._history_reader_shared_business_units(text, text, jsonb);
--   drop function shared._history_reader_shared_people(text, text, jsonb);
--   drop function shared._history_reader_shared_person_access_roles(text, text, jsonb);
--   drop function shared._history_reader_shared_person_roles(text, text, jsonb);
--   drop function shared._history_reader_shared_roles(text, text, jsonb);
--   drop function shared._history_reader_shared_sites(text, text, jsonb);
--   drop function shared._history_reader_shared_team_memberships(text, text, jsonb);
--   drop function shared._history_reader_shared_teams(text, text, jsonb);
--   drop function shared._history_reader_shared_role_authority(text, text, jsonb);
--   drop function shared._history_reader_shared_team_lead_assignments(text, text, jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Reader functions — one per table, the table's own read predicate
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function shared._history_reader_shared_business_units(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from shared.business_units bu
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and bu.id = p_record_key::uuid
        and bu.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_business_units(text, text, jsonb) is
  'History read predicate for shared.business_units (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_people(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    -- people's own SELECT policy is org-wide OR self (the self half is what still resolves
    -- while the password-rotation gate holds current_org_id() at NULL) — the history arm
    -- reuses both halves, so a person reads their own row's history exactly when they read
    -- the row.
    return exists (
      select 1 from shared.people pe
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and pe.id = p_record_key::uuid
        and (pe.org_id = shared.current_org_id()
             or pe.id = shared.current_person_id()));
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_people(text, text, jsonb) is
  'History read predicate for shared.people (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_person_access_roles(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from shared.person_access_roles par
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and par.id = p_record_key::uuid
        and par.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_person_access_roles(text, text, jsonb) is
  'History read predicate for shared.person_access_roles (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_person_roles(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from shared.person_roles pr
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and pr.id = p_record_key::uuid
        and pr.org_id = shared.current_org_id());
  elsif p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id();
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_person_roles(text, text, jsonb) is
  'History read predicate for shared.person_roles (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows, and over the captured snapshot columns for delete rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_roles(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from shared.roles ro
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and ro.id = p_record_key::uuid
        and ro.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_roles(text, text, jsonb) is
  'History read predicate for shared.roles (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_sites(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from shared.sites si
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and si.id = p_record_key::uuid
        and si.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_sites(text, text, jsonb) is
  'History read predicate for shared.sites (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_team_memberships(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from shared.team_memberships tm
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and tm.id = p_record_key::uuid
        and tm.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_team_memberships(text, text, jsonb) is
  'History read predicate for shared.team_memberships (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_teams(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return exists (
      select 1 from shared.teams te
      where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and te.id = p_record_key::uuid
        and te.org_id = shared.current_org_id());
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_teams(text, text, jsonb) is
  'History read predicate for shared.teams (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_role_authority(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return split_part(p_record_key, ':', 1)
             ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and split_part(p_record_key, ':', 1)::uuid = shared.current_org_id()
       and shared.has_access_role('admin');
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_role_authority(text, text, jsonb) is
  'History read predicate for shared.role_authority (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

create or replace function shared._history_reader_shared_team_lead_assignments(
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    return split_part(p_record_key, ':', 1)
             ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and split_part(p_record_key, ':', 1)::uuid = shared.current_org_id()
       and shared.has_access_role('admin');
  elsif p_action = 'delete' then
    return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
       and shared.has_access_role('admin');
  end if;
  return false;
end;
$$;
comment on function shared._history_reader_shared_team_lead_assignments(text, text, jsonb) is
  'History read predicate for shared.team_lead_assignments (#989): the table''s own SELECT predicate over the live row '
  'for insert/update rows, and over the captured snapshot columns for delete rows. '
  'Dispatched only through shared.record_history_readers; false for any other action.';

revoke execute on function shared._history_reader_shared_business_units(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_business_units(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_people(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_people(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_person_access_roles(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_person_access_roles(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_person_roles(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_person_roles(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_roles(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_roles(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_sites(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_sites(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_team_memberships(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_team_memberships(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_teams(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_teams(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_role_authority(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_role_authority(text, text, jsonb) to authenticated;
revoke execute on function shared._history_reader_shared_team_lead_assignments(text, text, jsonb) from public, anon;
grant  execute on function shared._history_reader_shared_team_lead_assignments(text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Registry rows
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('shared', 'business_units', 'shared._history_reader_shared_business_units(text, text, jsonb)'),
  ('shared', 'people', 'shared._history_reader_shared_people(text, text, jsonb)'),
  ('shared', 'person_access_roles', 'shared._history_reader_shared_person_access_roles(text, text, jsonb)'),
  ('shared', 'person_roles', 'shared._history_reader_shared_person_roles(text, text, jsonb)'),
  ('shared', 'roles', 'shared._history_reader_shared_roles(text, text, jsonb)'),
  ('shared', 'sites', 'shared._history_reader_shared_sites(text, text, jsonb)'),
  ('shared', 'team_memberships', 'shared._history_reader_shared_team_memberships(text, text, jsonb)'),
  ('shared', 'teams', 'shared._history_reader_shared_teams(text, text, jsonb)'),
  ('shared', 'role_authority', 'shared._history_reader_shared_role_authority(text, text, jsonb)'),
  ('shared', 'team_lead_assignments', 'shared._history_reader_shared_team_lead_assignments(text, text, jsonb)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Wire the observer triggers
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create trigger record_history_business_units
  after insert or update or delete on shared.business_units
  for each row execute function shared._record_history_write();

create trigger record_history_people
  after insert or update or delete on shared.people
  for each row execute function shared._record_history_write();

create trigger record_history_person_access_roles
  after insert or update or delete on shared.person_access_roles
  for each row execute function shared._record_history_write();

create trigger record_history_person_roles
  after insert or update or delete on shared.person_roles
  for each row execute function shared._record_history_write();

create trigger record_history_roles
  after insert or update or delete on shared.roles
  for each row execute function shared._record_history_write();

create trigger record_history_sites
  after insert or update or delete on shared.sites
  for each row execute function shared._record_history_write();

create trigger record_history_team_memberships
  after insert or update or delete on shared.team_memberships
  for each row execute function shared._record_history_write();

create trigger record_history_teams
  after insert or update or delete on shared.teams
  for each row execute function shared._record_history_write();

create trigger record_history_role_authority
  after insert or update or delete on shared.role_authority
  for each row execute function shared._record_history_write('org_id', 'action', 'role');

create trigger record_history_team_lead_assignments
  after insert or update or delete on shared.team_lead_assignments
  for each row execute function shared._record_history_write('org_id', 'team_id');
