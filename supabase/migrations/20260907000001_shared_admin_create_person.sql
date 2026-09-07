-- Provisioning rule (#798, OD-WAY-98): a person is created WITH a primary Team, in one call.
--
-- shared.admin_create_person writes the person row, one live primary Team membership, the Position
-- holdings and the access role as a single transaction. A call without a Team is refused before any
-- insert, so no person can exist without a home team — the team is what resolves the capture
-- stream (shared.default_stream) and the Signal read/post gates, and a person outside every team is
-- the state the roster seed had to be fixed for.
--
-- Same posture as the login RPCs beside it (…0805000003): SECURITY DEFINER, EXECUTE revoked from
-- public/anon, the in-body admin predicate is the real gate. No GUC, no test bypass.
--
-- DOWN: drop function shared.admin_create_person(text, text, uuid, uuid[], text);

create or replace function shared.admin_create_person(
  p_full_name    text,
  p_email        text,
  p_team_id      uuid,
  p_position_ids uuid[] default '{}',
  p_access_role  text   default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid := shared.current_org_id();
  v_person uuid;
  v_role   text := coalesce(nullif(btrim(p_access_role), ''), 'member');
  v_pos    uuid;
begin
  if not shared.has_access_role('admin') then
    raise exception 'admin access role required' using errcode = '42501';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'full name is required' using errcode = '22023';
  end if;
  if p_team_id is null then
    raise exception 'a primary team is required' using errcode = '22023';
  end if;
  if not exists (select 1 from shared.teams t
                  where t.id = p_team_id and t.org_id = v_org and t.archived_at is null) then
    raise exception 'team not found in your org' using errcode = '42501';
  end if;
  if v_role not in ('admin','ops_lead','finance','member','manager','supervisor') then
    raise exception 'unknown access role' using errcode = '22023';
  end if;

  insert into shared.people (org_id, full_name, email)
  values (v_org, btrim(p_full_name), nullif(btrim(p_email), ''))
  returning id into v_person;

  insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
  values (v_org, v_person, p_team_id, true);

  -- The Jabatan guard re-checks each position against the caller's org and stamps granted_by.
  foreach v_pos in array coalesce(p_position_ids, '{}') loop
    insert into shared.person_roles (org_id, person_id, role_id)
    values (v_org, v_person, v_pos);
  end loop;

  insert into shared.person_access_roles (org_id, person_id, access_role)
  values (v_org, v_person, v_role);

  return v_person;
end;
$$;
comment on function shared.admin_create_person(text, text, uuid, uuid[], text) is
  'Provisioning (#798): create a person WITH their live primary Team, Positions and access role '
  '(default member) in one transaction; admin + org gated; refused before any insert when no team '
  'is given. Creates no login — that stays admin_create_login. SECURITY DEFINER.';
revoke execute on function shared.admin_create_person(text, text, uuid, uuid[], text) from public, anon;
grant  execute on function shared.admin_create_person(text, text, uuid, uuid[], text) to authenticated;
