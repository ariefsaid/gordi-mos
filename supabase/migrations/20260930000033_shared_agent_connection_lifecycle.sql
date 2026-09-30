-- Agent connections end with the thing that authorised them (#1063, ADR-0060 D4).
--
-- A connection is a consent plus sessions and refresh tokens in the Auth schema. Two events end it,
-- in the same transaction as the event itself:
--   1. an agent app is switched off for an organization (trusted_agent_clients.enabled goes false,
--      or the row is deleted): every consent for that app held by that organization's people is
--      revoked and their sessions for it are deleted;
--   2. a person is archived: every agent consent the person holds is revoked and every agent session
--      is deleted. Unarchiving starts from no connection.
-- Deleting an Auth session cascades to its refresh tokens (the guarded foreign key in
-- 20260930000009), and the api_v1 fence refuses a request whose session no longer exists. App
-- sessions (no OAuth client) are untouched. Each revoked consent appends one row to
-- api_private.agent_connection_admin_events when a person is acting.
--
-- DOWN (manual):
--   drop trigger people_end_agent_connections on shared.people;
--   drop trigger trusted_agent_clients_end_connections_removed on shared.trusted_agent_clients;
--   drop trigger trusted_agent_clients_end_connections_off on shared.trusted_agent_clients;
--   drop function shared._end_agent_connections_on_person_archive();
--   drop function shared._end_agent_connections_on_client_off();
--   drop function api_private._end_agent_connections(uuid, uuid, uuid);

-- The one place consents are revoked and sessions deleted for a person, an app or both. Runs as the
-- owner, which the Auth guard in 20260930000009 checked can update consents and delete sessions.
create or replace function api_private._end_agent_connections(
  p_org uuid, p_user_id uuid default null, p_client_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := shared.current_person_id();
begin
  if p_org is null then
    return;
  end if;

  if v_actor is not null then
    insert into api_private.agent_connection_admin_events
      (org_id, actor_person_id, target_person_id, client_id)
    select p_org, v_actor, p.id, c.client_id
      from auth.oauth_consents c
      join shared.people p on p.user_id = c.user_id and p.org_id = p_org
     where c.revoked_at is null
       and (p_user_id is null or c.user_id = p_user_id)
       and (p_client_id is null or c.client_id = p_client_id);
  end if;

  update auth.oauth_consents c
     set revoked_at = now()
   where c.revoked_at is null
     and (p_user_id is null or c.user_id = p_user_id)
     and (p_client_id is null or c.client_id = p_client_id)
     and exists (select 1 from shared.people p where p.user_id = c.user_id and p.org_id = p_org);

  delete from auth.sessions s
   where s.oauth_client_id is not null
     and (p_user_id is null or s.user_id = p_user_id)
     and (p_client_id is null or s.oauth_client_id = p_client_id)
     and exists (select 1 from shared.people p where p.user_id = s.user_id and p.org_id = p_org);
end;
$$;
comment on function api_private._end_agent_connections(uuid, uuid, uuid) is
  'Ends agent connections inside one organization: revokes the matching Auth consents, deletes the matching agent sessions (refresh tokens cascade) and audits each revoked consent when a person is acting. A null user or client matches all. SECURITY DEFINER for the Auth schema; called only by the triggers below.';
revoke execute on function api_private._end_agent_connections(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function shared._end_agent_connections_on_client_off()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Auth identifies a client by uuid; an allow-list id of another shape has no Auth connection.
  if old.client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform api_private._end_agent_connections(old.org_id, null, old.client_id::uuid);
  end if;
  return null;
end;
$$;
comment on function shared._end_agent_connections_on_client_off() is
  'Trigger: when an agent app is switched off for an organization or its allow-list row is removed, ends every connection to that app held by that organization''s people. SECURITY DEFINER.';
revoke execute on function shared._end_agent_connections_on_client_off() from public, anon, authenticated, service_role;

create trigger trusted_agent_clients_end_connections_off
  after update of enabled on shared.trusted_agent_clients
  for each row when (old.enabled and not new.enabled)
  execute function shared._end_agent_connections_on_client_off();
create trigger trusted_agent_clients_end_connections_removed
  after delete on shared.trusted_agent_clients
  for each row
  execute function shared._end_agent_connections_on_client_off();

create or replace function shared._end_agent_connections_on_person_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null and new.user_id is not null then
    perform api_private._end_agent_connections(new.org_id, new.user_id, null);
  end if;
  return null;
end;
$$;
comment on function shared._end_agent_connections_on_person_archive() is
  'Trigger: archiving a person ends every agent connection they hold, so unarchiving never revives one. SECURITY DEFINER.';
revoke execute on function shared._end_agent_connections_on_person_archive() from public, anon, authenticated, service_role;

create trigger people_end_agent_connections
  after update of archived_at on shared.people
  for each row execute function shared._end_agent_connections_on_person_archive();
