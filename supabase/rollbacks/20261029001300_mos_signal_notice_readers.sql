create or replace function mos.create_notification(
  p_owner    uuid,
  p_severity text,
  p_title    text,
  p_body     text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_task text := case when p_metadata #>> '{entity,type}' = 'task' then p_metadata #>> '{entity,id}' end;
begin
  -- The org wall. A caller in org A can never deliver into org B, so a cross-org @mention is not
  -- merely unauthorised but impossible; an archived person cannot be notified either.
  if not exists (
    select 1 from shared.people
     where id = p_owner
       and org_id = shared.current_org_id()
       and archived_at is null
  ) then
    raise exception 'create_notification: target % is not a current-org active person', p_owner
      using errcode = '42501';
  end if;

  if v_task is not null
     and v_task ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and not mos.person_can_read_task(p_owner, v_task::uuid) then
    return null;
  end if;

  insert into mos.notifications (owner_id, org_id, severity, title, body, metadata)
  values (p_owner, shared.current_org_id(), coalesce(p_severity, 'info'), p_title, p_body,
          coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;
create or replace function mos.can_read_signal(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from mos.signals s
      left join shared.teams tm on tm.id = s.owning_team_id and tm.org_id = s.org_id
     where s.id = p_signal_id
       and s.org_id = shared.current_org_id()
       and (
         (s.audience = 'org' and shared._current_person_is_live())
         or (s.audience = 'team' and (
           -- An author may have posted for a Team outside their own membership or BU read path.
           s.author_id = shared.current_person_id()
           -- No active-row condition: a retraction authority must reach the row to retract it, and
           -- still inspect the tombstone afterwards, including once the owning Team is archived.
           -- tm.id keeps the left join fail-closed: an unresolved Team never reaches the grant.
           or (tm.id is not null
               and shared.role_authority_allows(
                     'signal.retract', tm.business_unit_id, s.owning_team_id, s.author_id))
           or mos._can_read_signal_rules(s.id, s.owning_team_id)
         ))
       )
  )
$$;
create or replace function shared.role_authority_allows(
  p_action text,
  p_business_unit_id uuid default null,
  p_team_id uuid default null,
  p_owner_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org         uuid := shared.current_org_id();
  v_person      uuid := shared.current_person_id();
  v_team_bu     uuid;
  v_scope       text;
  v_role        text;
  v_role_active boolean;
begin
  if v_org is null or v_person is null then
    return false;
  end if;
  if not exists (select 1 from shared._role_authority_defaults() d where d.action = p_action) then
    return false;
  end if;

  if p_business_unit_id is not null
     and not exists (
       select 1 from shared.business_units bu
        where bu.id = p_business_unit_id
          and bu.org_id = v_org
          and (bu.archived_at is null or p_action in ('signal.retract', 'process.close'))
     ) then
    return false;
  end if;

  if p_team_id is not null then
    select t.business_unit_id into v_team_bu
      from shared.teams t
     where t.id = p_team_id
       and t.org_id = v_org
       and (t.archived_at is null or p_action in ('signal.retract', 'process.close'));
    if v_team_bu is null then
      return false;
    end if;
  end if;

  if p_owner_id is not null
     and not exists (
       select 1 from shared.people p
        where p.id = p_owner_id
          and p.org_id = v_org
     ) then
    return false;
  end if;

  if not exists (
    select 1 from shared.people p
     where p.id = v_person
       and p.org_id = v_org
       and p.archived_at is null
  ) then
    return false;
  end if;

  -- `member` is a derived baseline. The other categories are either explicit access roles or the
  -- two relationship predicates above.
  for v_role in
    select r.role
      from (values
        ('member'), ('team_lead'), ('bu_head'), ('ops_lead'), ('admin'),
        ('finance'), ('manager'), ('supervisor')) as r(role)
  loop
    v_role_active := case v_role
      when 'member'    then exists (
                              select 1 from shared.people p
                               where p.id = v_person
                                 and p.org_id = v_org
                                 and p.archived_at is null)
      when 'team_lead' then exists (
                              select 1 from shared.teams t
                               where t.org_id = v_org
                                 and t.archived_at is null
                                 and shared.is_designated_team_lead(t.id, v_person))
      when 'bu_head'   then exists (
                              select 1 from shared.business_units bu
                               where bu.org_id = v_org
                                 and bu.archived_at is null
                                 and shared.is_business_unit_head(bu.id, v_person))
      else shared.has_access_role(v_role)
    end;
    if not v_role_active then
      continue;
    end if;

    v_scope := shared.role_authority_scope(p_action, v_role);
    if v_scope is null or v_scope = 'none' then
      continue;
    elsif v_scope = 'org' then
      return true;
    elsif v_scope = 'own' then
      if p_owner_id is not null and p_owner_id = v_person then
        return true;
      end if;
    elsif v_scope = 'own_team' then
      if p_team_id is null then
        continue;
      end if;
      if v_role = 'team_lead' then
        if shared.is_designated_team_lead(p_team_id, v_person) then
          return true;
        end if;
        -- A designated lead's own_team grant is for the explicitly designated Team, not every
        -- other Team where the person happens to retain ordinary membership. The member category
        -- below/alongside it supplies any separate baseline membership grant.
        continue;
      end if;
      if exists (
        select 1 from shared.team_memberships m
         where m.org_id = v_org
           and m.team_id = p_team_id
           and m.person_id = v_person
           and m.effective_from <= current_date
           and (m.effective_to is null or m.effective_to >= current_date)
      ) then
        return true;
      end if;
    elsif v_scope = 'own_bu' then
      if p_business_unit_id is null then
        continue;
      end if;
      if v_role = 'bu_head'
         and shared.is_business_unit_head(p_business_unit_id, v_person) then
        return true;
      end if;
      if v_role <> 'bu_head'
         and shared._person_has_business_unit(p_business_unit_id, v_person) then
        return true;
      end if;
    end if;
  end loop;
  return false;
end;
$$;
revoke execute on function mos.create_notification(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function mos.can_read_signal(uuid) from public, anon;
grant execute on function mos.can_read_signal(uuid) to authenticated;
revoke execute on function shared.role_authority_allows(text,uuid,uuid,uuid) from public, anon;
grant execute on function shared.role_authority_allows(text,uuid,uuid,uuid) to authenticated;
drop function mos.person_can_read_signal(uuid,uuid);
drop function mos._person_can_read_signal_rules(uuid,uuid,uuid);
drop function shared.person_role_authority_allows(uuid,text,uuid,uuid,uuid);
