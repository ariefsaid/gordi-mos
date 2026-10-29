-- DOWN: run supabase/rollbacks/20261029001300_mos_signal_notice_readers.sql
-- Signal notice recipients use the same read rule as a session reader.
create or replace function shared.person_role_authority_allows(
  p_person_id uuid,
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
  v_person      uuid := p_person_id;
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
      else exists (select 1 from shared.person_access_roles par
        where par.person_id = v_person and par.org_id = v_org
          and par.access_role::text = v_role and par.revoked_at is null)
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
comment on function shared.person_role_authority_allows(uuid,text,uuid,uuid,uuid) is
  'Internal same-org authority evaluator for a specified person, using live role assignments.';
revoke execute on function shared.person_role_authority_allows(uuid,text,uuid,uuid,uuid) from public, anon, authenticated;

create or replace function shared.role_authority_allows(
  p_action text, p_business_unit_id uuid default null, p_team_id uuid default null, p_owner_id uuid default null
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select shared.person_role_authority_allows(shared.current_person_id(), p_action,
    p_business_unit_id, p_team_id, p_owner_id)
$$;
comment on function shared.role_authority_allows(text,uuid,uuid,uuid) is
  'Session wrapper for the canonical same-org role authority evaluator.';
revoke execute on function shared.role_authority_allows(text,uuid,uuid,uuid) from public, anon;
grant execute on function shared.role_authority_allows(text,uuid,uuid,uuid) to authenticated;

create or replace function mos._person_can_read_signal_rules(
  p_person_id uuid,
  p_signal_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from shared.teams tm
    where tm.id = p_team_id
      and tm.org_id = shared.current_org_id()
      and (
        exists (
          select 1 from shared.team_memberships m
          where m.team_id = p_team_id and m.person_id = p_person_id
            and m.org_id = shared.current_org_id()
            and m.effective_from <= current_date
            and (m.effective_to is null or m.effective_to >= current_date))
        or exists (
          select 1 from shared.person_roles pr
          join shared.roles r on r.id = pr.role_id
          where pr.person_id = p_person_id and pr.org_id = shared.current_org_id()
            and r.business_unit_id = tm.business_unit_id)
        or (

          coalesce((select max(coalesce(bu.signal_visibility_rank, 0))
                    from shared.person_roles pr
                    join shared.roles r on r.id = pr.role_id
                    join shared.business_units bu on bu.id = r.business_unit_id
                    where pr.person_id = p_person_id and pr.org_id = shared.current_org_id()), 0)
          > coalesce((select bu2.signal_visibility_rank
                      from shared.business_units bu2
                      where bu2.id = tm.business_unit_id), 0))
        or (
          p_signal_id is not null and exists (
            select 1 from mos.signal_mentions sm
            where sm.signal_id = p_signal_id and sm.revoked_at is null and (
              (sm.mention_kind = 'person' and sm.target_person_id = p_person_id)
              or (sm.mention_kind = 'team' and exists (
                select 1 from shared.team_memberships m2
                where m2.team_id = sm.target_team_id and m2.person_id = p_person_id
                  and m2.effective_from <= current_date
                  and (m2.effective_to is null or m2.effective_to >= current_date)))
              or (sm.mention_kind = 'bu' and exists (
                select 1 from shared.person_roles pr2
                join shared.roles r2 on r2.id = pr2.role_id
                where pr2.person_id = p_person_id and r2.business_unit_id = sm.target_bu_id))))
        )
        or exists (select 1 from shared.role_capabilities rc
          join shared.person_access_roles par on par.access_role::text = rc.role
          where rc.capability = 'signal.read_all' and par.person_id = p_person_id
            and par.org_id = shared.current_org_id() and par.revoked_at is null)
      )
  )
$$;
comment on function mos._person_can_read_signal_rules(uuid,uuid,uuid) is
  'Internal Team-rooted Signal read grants for a specified recipient: membership, BU role/rank, explicit Signal mentions and capability.';
revoke execute on function mos._person_can_read_signal_rules(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function mos.person_can_read_signal(p_person_id uuid, p_signal_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from mos.signals s
    join shared.people p on p.id = p_person_id and p.org_id = s.org_id and p.archived_at is null
    left join shared.teams tm on tm.id = s.owning_team_id and tm.org_id = s.org_id
    where s.id = p_signal_id and s.org_id = shared.current_org_id()
      and (s.audience = 'org' or (s.audience = 'team' and (
        s.author_id = p_person_id
        or (tm.id is not null and shared.person_role_authority_allows(
          p_person_id, 'signal.retract', tm.business_unit_id, s.owning_team_id, s.author_id))
        or mos._person_can_read_signal_rules(p_person_id, s.id, s.owning_team_id))))
  )
$$;
comment on function mos.person_can_read_signal(uuid,uuid) is
  'Canonical same-org active-person Signal read rule, shared by session reads and notification delivery. Internal.';
revoke execute on function mos.person_can_read_signal(uuid,uuid) from public, anon, authenticated;

create or replace function mos.can_read_signal(p_signal_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select mos.person_can_read_signal(shared.current_person_id(), p_signal_id)
$$;
comment on function mos.can_read_signal(uuid) is
  'Session wrapper for the canonical Signal read rule, including historical authors, moderators, Team grants and explicit Signal mentions.';
revoke execute on function mos.can_read_signal(uuid) from public, anon;
grant execute on function mos.can_read_signal(uuid) to authenticated;

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
  v_signal text := case when p_metadata #>> '{entity,type}' = 'signal' then p_metadata #>> '{entity,id}' end;
  v_task text := case when p_metadata #>> '{entity,type}' = 'task' then p_metadata #>> '{entity,id}' end;
begin
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

  if v_signal is not null then
    if v_signal !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not mos.person_can_read_signal(p_owner, v_signal::uuid) then
      return null;
    end if;
  end if;

  insert into mos.notifications (owner_id, org_id, severity, title, body, metadata)
  values (p_owner, shared.current_org_id(), coalesce(p_severity, 'info'), p_title, p_body,
          coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function mos.create_notification(uuid,text,text,text,jsonb) is
  'Internal cross-owner notice writer: active same-org recipients only; Task and Signal notices require recipient read access and otherwise return NULL.';
revoke execute on function mos.create_notification(uuid,text,text,text,jsonb) from public, anon, authenticated;
