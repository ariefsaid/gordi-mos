-- Tenant-local Work authority, explicit Team leads, and the bounded MOS write contract.
--
-- This migration intentionally owns only the seven Work actions below. It does not redesign the
-- unrelated finance/reporting/admin capability vocabulary in shared.role_capabilities.
--
-- Actions: workline.manage, objective.manage, signal.post, signal.tag, signal.retract,
--          process.start, process.close.
-- Editable role categories: the six existing access roles plus the two derived Work categories
-- (team_lead and bu_head). `member` is also a live-org baseline and does not depend on a JWT role.
--
-- DOWN (manual, before production):
--   drop function mos.can_close_process_run_id(uuid);
--   drop function mos.can_retract_signal(uuid);
--   drop function mos.get_signal_post_authority();
--   drop function mos.get_work_write_scopes();
--   restore the pre-migration MOS predicates, policies, signal guard, and process start functions;
--   drop table shared.team_lead_assignments;
--   drop table shared.role_authority;
--   drop function shared.save_team_lead_assignment(uuid,uuid);
--   drop function shared.list_team_lead_candidates(uuid);
--   drop function shared.list_team_lead_assignments();
--   drop function shared.save_role_authority(jsonb);
--   drop function shared.list_role_authority();
--   drop function shared.role_authority_allows(text,uuid,uuid,uuid);
--   drop function shared._person_has_business_unit(uuid,uuid);
--   drop function shared.is_business_unit_head(uuid,uuid);
--   drop function shared.is_designated_team_lead(uuid,uuid);
--   drop function shared.role_authority_scope(text,text);
--   drop function shared._role_authority_defaults();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Tenant-local settings and the fixed metadata contract
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table shared.role_authority (
  org_id     uuid not null references shared.orgs(id) on delete cascade,
  action     text not null,
  role       text not null,
  scope      text not null,
  updated_by uuid references shared.people(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, action, role),
  constraint role_authority_action_ck check (action in (
    'workline.manage', 'objective.manage', 'signal.post', 'signal.tag', 'signal.retract',
    'process.start', 'process.close')),
  constraint role_authority_role_ck check (role in (
    'member', 'team_lead', 'bu_head', 'ops_lead', 'admin',
    'finance', 'manager', 'supervisor')),
  constraint role_authority_scope_ck check (scope in ('none', 'org', 'own_bu', 'own_team', 'own'))
);
comment on table shared.role_authority is
  'Tenant-local overrides for the bounded MOS Work authority matrix. The fixed action/role vocabulary '
  'is migration-owned; absent rows use the safe defaults from shared._role_authority_defaults(). '
  'This table does not alter unrelated finance, reporting, or provisioning capabilities.';
comment on column shared.role_authority.scope is
  'Additive grant scope: none, org, own_bu, own_team, or own. none contributes no grant; it is not a '
  'global deny of another live category.';
create index role_authority_org_role_idx on shared.role_authority (org_id, role);

create table shared.team_lead_assignments (
  org_id         uuid not null references shared.orgs(id) on delete cascade,
  team_id        uuid not null references shared.teams(id) on delete cascade,
  lead_person_id uuid not null references shared.people(id) on delete cascade,
  assigned_by    uuid references shared.people(id) on delete set null,
  assigned_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (org_id, team_id)
);
comment on table shared.team_lead_assignments is
  'Explicit tenant-local Team-lead designation. Writes are admin-only through the narrow settings RPC; '
  'the lead must be an active same-org member of the active Team.';
create index team_lead_assignments_lead_idx on shared.team_lead_assignments (org_id, lead_person_id);

-- Fixed metadata is deliberately a function rather than a client-maintained list. Its result is the
-- complete settings surface: seven actions x eight categories = 56 rows.
create or replace function shared._role_authority_defaults()
returns table(action text, role text, default_scope text, allowed_scopes text[])
language sql
immutable
set search_path = ''
as $$
  with actions(action, allowed_scopes) as (
    values
      ('workline.manage',  array['none','own_bu','org']::text[]),
      ('objective.manage',  array['none','own_bu','org']::text[]),
      ('signal.post',      array['none','org']::text[]),
      ('signal.tag',       array['none','org']::text[]),
      ('signal.retract',   array['none','own','own_team','own_bu','org']::text[]),
      ('process.start',    array['none','own_team','org']::text[]),
      ('process.close',    array['none','own','own_team','org']::text[])
  ),
  roles(role) as (
    values
      ('member'), ('team_lead'), ('bu_head'), ('ops_lead'), ('admin'),
      ('finance'), ('manager'), ('supervisor')
  ),
  defaults(action, role, default_scope) as (
    values
      ('workline.manage',  'member',     'none'),
      ('workline.manage',  'team_lead',  'none'),
      ('workline.manage',  'bu_head',    'own_bu'),
      ('workline.manage',  'ops_lead',   'org'),
      ('workline.manage',  'admin',      'org'),
      ('workline.manage',  'finance',    'none'),
      ('workline.manage',  'manager',    'none'),
      ('workline.manage',  'supervisor', 'none'),

      ('objective.manage',  'member',     'none'),
      ('objective.manage',  'team_lead',  'none'),
      ('objective.manage',  'bu_head',    'own_bu'),
      ('objective.manage',  'ops_lead',   'org'),
      ('objective.manage',  'admin',      'org'),
      ('objective.manage',  'finance',    'none'),
      ('objective.manage',  'manager',    'none'),
      ('objective.manage',  'supervisor', 'none'),

      ('signal.post',      'member',     'org'),
      ('signal.post',      'team_lead',  'none'),
      ('signal.post',      'bu_head',    'none'),
      ('signal.post',      'ops_lead',   'org'),
      ('signal.post',      'admin',      'org'),
      ('signal.post',      'finance',    'none'),
      ('signal.post',      'manager',    'none'),
      ('signal.post',      'supervisor', 'none'),

      ('signal.tag',       'member',     'org'),
      ('signal.tag',       'team_lead',  'none'),
      ('signal.tag',       'bu_head',    'none'),
      ('signal.tag',       'ops_lead',   'org'),
      ('signal.tag',       'admin',      'org'),
      ('signal.tag',       'finance',    'none'),
      ('signal.tag',       'manager',    'none'),
      ('signal.tag',       'supervisor', 'none'),

      ('signal.retract',   'member',     'own'),
      ('signal.retract',   'team_lead',  'own_team'),
      ('signal.retract',   'bu_head',    'own_bu'),
      ('signal.retract',   'ops_lead',   'org'),
      ('signal.retract',   'admin',      'org'),
      ('signal.retract',   'finance',    'none'),
      ('signal.retract',   'manager',    'none'),
      ('signal.retract',   'supervisor', 'none'),

      ('process.start',    'member',     'own_team'),
      ('process.start',    'team_lead',  'none'),
      ('process.start',    'bu_head',    'none'),
      ('process.start',    'ops_lead',   'org'),
      ('process.start',    'admin',      'org'),
      ('process.start',    'finance',    'none'),
      ('process.start',    'manager',    'none'),
      ('process.start',    'supervisor', 'none'),

      ('process.close',    'member',     'own'),
      ('process.close',    'team_lead',  'own_team'),
      ('process.close',    'bu_head',    'none'),
      ('process.close',    'ops_lead',   'org'),
      ('process.close',    'admin',      'org'),
      ('process.close',    'finance',    'none'),
      ('process.close',    'manager',    'none'),
      ('process.close',    'supervisor', 'none')
  )
  select a.action, r.role, d.default_scope, a.allowed_scopes
    from actions a
    cross join roles r
    join defaults d on d.action = a.action and d.role = r.role
$$;
comment on function shared._role_authority_defaults() is
  'Migration-owned metadata for the bounded MOS authority matrix: seven actions, eight role '
  'categories, per-action allowed scopes, and safe defaults. Tenant overrides are optional rows.';
revoke execute on function shared._role_authority_defaults() from public, anon, authenticated;

create or replace function shared._guard_role_authority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed text[];
begin
  if tg_op = 'UPDATE' and (
       new.org_id is distinct from old.org_id
    or new.action is distinct from old.action
    or new.role is distinct from old.role
  ) then
    raise exception 'org_id/action/role are immutable on role_authority' using errcode = '42501';
  end if;

  select d.allowed_scopes into v_allowed
    from shared._role_authority_defaults() d
   where d.action = new.action and d.role = new.role;
  if v_allowed is null then
    raise exception 'unknown role-authority action or role' using errcode = '22023';
  end if;
  if new.scope is null or not (new.scope = any(v_allowed)) then
    raise exception 'scope is not admitted for this role-authority action' using errcode = '22023';
  end if;
  -- The admin category is the settings-control backstop. An admin may edit other categories but
  -- cannot turn off the category that protects this matrix itself.
  if new.role = 'admin' and new.scope <> 'org' then
    raise exception 'the admin authority category must remain org-wide' using errcode = '42501';
  end if;

  new.updated_by := shared.current_person_id();
  new.updated_at := now();
  return new;
end;
$$;
comment on function shared._guard_role_authority() is
  'Guard for tenant-local MOS authority overrides: fixed identity, per-action scope validation, '
  'immutable admin settings control, and server-stamped editor. SECURITY INVOKER.';
revoke execute on function shared._guard_role_authority() from public, anon, authenticated;
create trigger role_authority_guard
  before insert or update on shared.role_authority
  for each row execute function shared._guard_role_authority();

create or replace function shared._guard_team_lead_assignments()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_team_org uuid;
  v_person_org uuid;
  v_assigner_org uuid;
begin
  if tg_op = 'UPDATE' and (
       new.org_id is distinct from old.org_id
    or new.team_id is distinct from old.team_id
  ) then
    raise exception 'org_id/team_id are immutable on team_lead_assignments' using errcode = '42501';
  end if;

  select t.org_id into v_team_org
    from shared.teams t
   where t.id = new.team_id;
  if v_team_org is distinct from new.org_id then
    raise exception 'Team must belong to the assignment org' using errcode = '42501';
  end if;
  select p.org_id into v_person_org
    from shared.people p
   where p.id = new.lead_person_id;
  if v_person_org is distinct from new.org_id then
    raise exception 'lead person must belong to the assignment org' using errcode = '42501';
  end if;
  if not exists (
    select 1 from shared.teams t
     where t.id = new.team_id and t.org_id = new.org_id and t.archived_at is null
  ) then
    raise exception 'Team must be active' using errcode = '42501';
  end if;
  if not exists (
    select 1 from shared.people p
     where p.id = new.lead_person_id and p.org_id = new.org_id and p.archived_at is null
  ) then
    raise exception 'lead person must be active' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from shared.team_memberships m
     where m.org_id = new.org_id
       and m.person_id = new.lead_person_id
       and m.team_id = new.team_id
       and m.effective_from <= current_date
       and (m.effective_to is null or m.effective_to >= current_date)
  ) then
    raise exception 'lead person must be an active member of the Team' using errcode = '42501';
  end if;

  if new.assigned_by is not null then
    select p.org_id into v_assigner_org
      from shared.people p
     where p.id = new.assigned_by;
    if v_assigner_org is distinct from new.org_id then
      raise exception 'assigned_by must belong to the assignment org' using errcode = '42501';
    end if;
  end if;
  new.assigned_by := shared.current_person_id();
  if tg_op = 'INSERT' or new.lead_person_id is distinct from old.lead_person_id then
    new.assigned_at := coalesce(new.assigned_at, now());
    if tg_op = 'UPDATE' then
      new.assigned_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
comment on function shared._guard_team_lead_assignments() is
  'Guard for explicit Team leads: same-org active Team/person, inclusive effective-dated membership, '
  'and server-stamped assignment provenance. SECURITY INVOKER.';
revoke execute on function shared._guard_team_lead_assignments() from public, anon, authenticated;
create trigger team_lead_assignments_guard
  before insert or update on shared.team_lead_assignments
  for each row execute function shared._guard_team_lead_assignments();

-- These settings are deliberately RPC-only. RLS is enabled and forced even though no application
-- role has a table grant or a direct policy; the SECURITY DEFINER settings functions below are the
-- only app surface.
alter table shared.role_authority enable row level security;
alter table shared.role_authority force row level security;
alter table shared.team_lead_assignments enable row level security;
alter table shared.team_lead_assignments force row level security;
revoke all on shared.role_authority, shared.team_lead_assignments from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Derived authority predicates
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function shared.role_authority_scope(p_action text, p_role text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(ra.scope, d.default_scope)
    from shared._role_authority_defaults() d
    left join shared.role_authority ra
      on ra.org_id = shared.current_org_id()
     and ra.action = d.action
     and ra.role = d.role
   where d.action = p_action
     and d.role = p_role
$$;
comment on function shared.role_authority_scope(text,text) is
  'Resolves one bounded MOS action/category grant for the caller''s current org. Missing tenant rows '
  'use migration-owned defaults; unknown action/category returns NULL.';
revoke execute on function shared.role_authority_scope(text,text) from public, anon, authenticated;
grant execute on function shared.role_authority_scope(text,text) to authenticated;

-- The explicit lead relation is intentionally independent from the reporting-line hierarchy. A
-- broad manager may hold a position above a Team member without becoming that Team's designated lead.
create or replace function shared.is_designated_team_lead(p_team_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select shared.current_org_id() is not null
     and exists (
       select 1
         from shared.team_lead_assignments a
         join shared.teams t on t.id = a.team_id
         join shared.people p on p.id = a.lead_person_id
        where a.org_id = shared.current_org_id()
          and a.team_id = p_team_id
          and a.lead_person_id = p_person_id
          and t.org_id = shared.current_org_id()
          and t.archived_at is null
          and p.org_id = shared.current_org_id()
          and p.archived_at is null
          and exists (
            select 1
              from shared.team_memberships m
             where m.org_id = shared.current_org_id()
               and m.team_id = a.team_id
               and m.person_id = a.lead_person_id
               and m.effective_from <= current_date
               and (m.effective_to is null or m.effective_to >= current_date)
          )
     )
$$;
comment on function shared.is_designated_team_lead(uuid,uuid) is
  'True only for an explicit active same-org Team-lead assignment backed by active membership. It '
  'does not infer leadership from reports_to_role_id or a broad access role.';
revoke execute on function shared.is_designated_team_lead(uuid,uuid) from public, anon, authenticated;
grant execute on function shared.is_designated_team_lead(uuid,uuid) to authenticated;

-- A person''s own BU for a tenant-customized own_bu grant comes from current directory facts: an
-- active held position or an active Team membership. The special bu_head category is checked by the
-- stricter root-in-BU predicate below, not by this affiliation helper.
create or replace function shared._person_has_business_unit(p_business_unit_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select shared.current_org_id() is not null
     and exists (
       select 1
         from shared.business_units bu
        where bu.id = p_business_unit_id
          and bu.org_id = shared.current_org_id()
          and bu.archived_at is null
          and exists (
            select 1
              from shared.people p
             where p.id = p_person_id
               and p.org_id = bu.org_id
               and p.archived_at is null
          )
          and (
            exists (
              select 1
                from shared.person_roles pr
                join shared.roles r on r.id = pr.role_id
               where pr.org_id = bu.org_id
                 and pr.person_id = p_person_id
                 and r.org_id = bu.org_id
                 and r.business_unit_id = bu.id
            )
            or exists (
              select 1
                from shared.team_memberships m
                join shared.teams t on t.id = m.team_id
               where m.org_id = bu.org_id
                 and m.person_id = p_person_id
                 and m.effective_from <= current_date
                 and (m.effective_to is null or m.effective_to >= current_date)
                 and t.org_id = bu.org_id
                 and t.business_unit_id = bu.id
                 and t.archived_at is null
            )
          )
     )
$$;
comment on function shared._person_has_business_unit(uuid,uuid) is
  'Internal same-org affiliation predicate for tenant-customized own_bu grants. Affiliation is an '
  'active position or active Team membership; it is not the broad reporting-line manager relation.';
revoke execute on function shared._person_has_business_unit(uuid,uuid) from public, anon, authenticated;

-- A BU head is precisely a holder of a role rooted in the target BU: no parent, or a parent outside
-- that BU. A person merely above someone in the same BU is not a BU head.
create or replace function shared.is_business_unit_head(p_business_unit_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select shared.current_org_id() is not null
     and exists (
       select 1
         from shared.business_units bu
         join shared.person_roles pr
           on pr.org_id = bu.org_id
          and pr.person_id = p_person_id
         join shared.roles r
           on r.id = pr.role_id
          and r.org_id = bu.org_id
          and r.business_unit_id = bu.id
         left join shared.roles parent
           on parent.id = r.reports_to_role_id
          and parent.org_id = bu.org_id
        where bu.id = p_business_unit_id
          and bu.org_id = shared.current_org_id()
          and bu.archived_at is null
          and exists (
            select 1 from shared.people p
             where p.id = p_person_id
               and p.org_id = bu.org_id
               and p.archived_at is null
          )
          and (r.reports_to_role_id is null or parent.id is null
               or parent.business_unit_id is distinct from r.business_unit_id)
     )
$$;
comment on function shared.is_business_unit_head(uuid,uuid) is
  'Precise BU-head predicate: the person holds a role rooted in the target BU (no parent or a parent '
  'outside that BU), with active same-org BU/person checks. Broad reporting-line manager status never qualifies.';
revoke execute on function shared.is_business_unit_head(uuid,uuid) from public, anon, authenticated;
grant execute on function shared.is_business_unit_head(uuid,uuid) to authenticated;

-- One additive evaluator feeds every MOS mutation seam. Resource ids are optional only for the org
-- viewer calls; post/tag/start require active same-org targets, while retract/close also accept an
-- archived target so historical Signal tombstones and already-open Process runs do not get stranded.
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
comment on function shared.role_authority_allows(text,uuid,uuid,uuid) is
  'Additive same-org evaluator for the bounded MOS authority matrix. Live org membership supplies '
  'the member baseline; team_lead is explicit, bu_head is root-in-BU precise, and own_bu overrides '
  'for other categories use active position/Team affiliation. SECURITY DEFINER.';
revoke execute on function shared.role_authority_allows(text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function shared.role_authority_allows(text,uuid,uuid,uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Admin-only settings RPCs
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function shared.list_role_authority()
returns table(action text, role text, scope text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
begin
  if v_org is null or not shared.has_access_role('admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
    select d.action,
           d.role,
           coalesce(ra.scope, d.default_scope) as scope
      from shared._role_authority_defaults() d
      left join shared.role_authority ra
        on ra.org_id = v_org
       and ra.action = d.action
       and ra.role = d.role
     order by d.action, d.role;
end;
$$;
comment on function shared.list_role_authority() is
  'Admin-only complete view of the seven-action tenant-local MOS matrix. Missing overrides are '
  'materialized from migration-owned defaults; no direct settings-table read is exposed.';
revoke execute on function shared.list_role_authority() from public, anon, authenticated;
grant execute on function shared.list_role_authority() to authenticated;

create or replace function shared.save_role_authority(p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid := shared.current_org_id();
  v_change  jsonb;
  v_action  text;
  v_role    text;
  v_scope   text;
  v_key     text;
  v_seen    text[] := '{}'::text[];
  v_default record;
begin
  if v_org is null or not shared.has_access_role('admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'role-authority changes must be a JSON array' using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(v_change) <> 'object' then
      raise exception 'each role-authority change must be an object' using errcode = '22023';
    end if;
    v_action := v_change->>'action';
    v_role   := v_change->>'role';
    v_scope  := v_change->>'scope';
    if v_action is null or v_role is null or v_scope is null then
      raise exception 'each role-authority change needs action, role, and scope' using errcode = '22023';
    end if;
    v_key := v_action || chr(31) || v_role;
    if v_key = any(v_seen) then
      raise exception 'duplicate role-authority action/role in one save' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_key);

    select d.* into v_default
      from shared._role_authority_defaults() d
     where d.action = v_action and d.role = v_role;
    if not found then
      raise exception 'unknown role-authority action or role' using errcode = '22023';
    end if;
    if not (v_scope = any(v_default.allowed_scopes)) then
      raise exception 'scope is not admitted for this role-authority action' using errcode = '22023';
    end if;
    if v_role = 'admin' and v_scope <> 'org' then
      raise exception 'the admin authority category must remain org-wide' using errcode = '42501';
    end if;

    insert into shared.role_authority (org_id, action, role, scope, updated_by)
    values (v_org, v_action, v_role, v_scope, shared.current_person_id())
    on conflict (org_id, action, role) do update
      set scope = excluded.scope,
          updated_by = excluded.updated_by,
          updated_at = now();
  end loop;
end;
$$;
comment on function shared.save_role_authority(jsonb) is
  'Admin-only partial update for tenant-local MOS authority grants. Validates the fixed action/role '
  'vocabulary and per-action scope allow-list, rejects duplicate changes, and preserves admin control.';
revoke execute on function shared.save_role_authority(jsonb) from public, anon, authenticated;
grant execute on function shared.save_role_authority(jsonb) to authenticated;

create or replace function shared.list_team_lead_assignments()
returns table(
  team_id uuid,
  team_name text,
  business_unit_id uuid,
  lead_person_id uuid,
  lead_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
begin
  if v_org is null or not shared.has_access_role('admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
    select t.id,
           t.name,
           t.business_unit_id,
           a.lead_person_id,
           p.full_name
      from shared.teams t
      left join shared.team_lead_assignments a
        on a.org_id = v_org and a.team_id = t.id
      left join shared.people p
        on p.id = a.lead_person_id
       and p.org_id = v_org
       and p.archived_at is null
     where t.org_id = v_org
       and t.archived_at is null
     order by t.name, t.id;
end;
$$;
comment on function shared.list_team_lead_assignments() is
  'Admin-only active same-org Team list with its explicit designated lead, if any.';
revoke execute on function shared.list_team_lead_assignments() from public, anon, authenticated;
grant execute on function shared.list_team_lead_assignments() to authenticated;

create or replace function shared.list_team_lead_candidates(p_team_id uuid)
returns table(person_id uuid, full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
begin
  if v_org is null or not shared.has_access_role('admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
    select distinct p.id, p.full_name
      from shared.teams t
      join shared.team_memberships m
        on m.org_id = v_org and m.team_id = t.id
      join shared.people p
        on p.id = m.person_id and p.org_id = v_org
     where t.id = p_team_id
       and t.org_id = v_org
       and t.archived_at is null
       and p.archived_at is null
       and m.effective_from <= current_date
       and (m.effective_to is null or m.effective_to >= current_date)
     order by p.full_name, p.id;
end;
$$;
comment on function shared.list_team_lead_candidates(uuid) is
  'Admin-only candidate list: active same-org people with an inclusive active membership in the '
  'requested active Team. A foreign or missing Team returns no candidates.';
revoke execute on function shared.list_team_lead_candidates(uuid) from public, anon, authenticated;
grant execute on function shared.list_team_lead_candidates(uuid) to authenticated;

create or replace function shared.save_team_lead_assignment(
  p_team_id uuid,
  p_lead_person_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
begin
  if v_org is null or not shared.has_access_role('admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from shared.teams t
     where t.id = p_team_id and t.org_id = v_org and t.archived_at is null
  ) then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  if p_lead_person_id is null then
    delete from shared.team_lead_assignments
     where org_id = v_org and team_id = p_team_id;
    return;
  end if;

  if not exists (
    select 1 from shared.people p
     where p.id = p_lead_person_id and p.org_id = v_org and p.archived_at is null
  ) then
    raise exception 'lead person not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from shared.team_memberships m
     where m.org_id = v_org
       and m.person_id = p_lead_person_id
       and m.team_id = p_team_id
       and m.effective_from <= current_date
       and (m.effective_to is null or m.effective_to >= current_date)
  ) then
    raise exception 'lead person must be an active member of the Team' using errcode = '42501';
  end if;

  insert into shared.team_lead_assignments
    (org_id, team_id, lead_person_id, assigned_by)
  values
    (v_org, p_team_id, p_lead_person_id, shared.current_person_id())
  on conflict (org_id, team_id) do update
    set lead_person_id = excluded.lead_person_id,
        assigned_by = excluded.assigned_by,
        assigned_at = now(),
        updated_at = now();
end;
$$;
comment on function shared.save_team_lead_assignment(uuid,uuid) is
  'Admin-only explicit Team-lead assignment. Non-null leads must be active same-org members of the '
  'active Team; NULL clears the designation.';
revoke execute on function shared.save_team_lead_assignment(uuid,uuid) from public, anon, authenticated;
grant execute on function shared.save_team_lead_assignment(uuid,uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. MOS predicates and narrow viewer affordances
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function mos.can_manage_definition(p_business_unit_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.role_authority_allows('workline.manage', p_business_unit_id, null, null)
$$;
comment on function mos.can_manage_definition(uuid) is
  'Bounded Project/Process/Objective definition gate: the tenant matrix grants org or own_bu. '
  'own_bu is precise for bu_head (root-in-BU) and affiliation-based for tenant-customized categories; '
  'the broad reporting-line manager relation is never an admission. SECURITY INVOKER.';
revoke execute on function mos.can_manage_definition(uuid) from public, anon;
grant execute on function mos.can_manage_definition(uuid) to authenticated;

create or replace function mos.can_manage_process_definition(p_work_line_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select shared.role_authority_allows('workline.manage', w.business_unit_id, null, null)
        from mos.work_lines w
       where w.id = p_work_line_id
         and w.org_id = shared.current_org_id()
         and w.type = 'process'
    ),
    false
  )
$$;
comment on function mos.can_manage_process_definition(uuid) is
  'Cadence and step-definition writes consume the effective workline.manage matrix for the Process '
  'unit. This keeps a precise BU head able to edit the Process it owns without restoring the broader '
  'accountable-person or reporting-line bypass. SECURITY INVOKER.';
revoke execute on function mos.can_manage_process_definition(uuid) from public, anon;
grant execute on function mos.can_manage_process_definition(uuid) to authenticated;

create or replace function mos.can_post_signal_for_team(p_team_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.role_authority_allows('signal.post', null, p_team_id, null)
$$;
comment on function mos.can_post_signal_for_team(uuid) is
  'Same-org active-Team post affordance from signal.post. The default member grant is org-wide, so '
  'an active org member may name any active same-org owning Team.';
revoke execute on function mos.can_post_signal_for_team(uuid) from public, anon;
grant execute on function mos.can_post_signal_for_team(uuid) to authenticated;

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
      join shared.teams tm on tm.id = s.owning_team_id
     where s.id = p_signal_id
       and s.org_id = shared.current_org_id()
       and tm.org_id = s.org_id
       and (
         -- Authors must be able to see a Signal they just posted for an arbitrary same-org Team,
         -- even when that Team is outside their own membership or BU read path.
         s.author_id = shared.current_person_id()
         -- Retraction authority also carries tombstone read access. This is deliberately evaluated
         -- without an active-row condition, so the actor can still inspect what they retracted.
         or shared.role_authority_allows(
              'signal.retract', tm.business_unit_id, s.owning_team_id, s.author_id)
         or mos._can_read_signal_rules(s.id, s.owning_team_id)
       )
  )
$$;
comment on function mos.can_read_signal(uuid) is
  'Default-deny Signal read gate plus author read-back for arbitrary same-org posts and active '
  'signal.retract governance read access. The governance arm intentionally remains valid for a '
  'tombstone, while the canonical R1-R5 read rules continue to preserve the original audience. '
  'SECURITY DEFINER breaks self-referential Signal RLS and returns only a boolean.';
revoke execute on function mos.can_read_signal(uuid) from public, anon, authenticated;
grant execute on function mos.can_read_signal(uuid) to authenticated;

create or replace function mos.can_start_process_for_team(p_team_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.role_authority_allows('process.start', null, p_team_id, null)
$$;
comment on function mos.can_start_process_for_team(uuid) is
  'Same-org active owning-Team start affordance from process.start. The default member grant is '
  'own_team; explicit Team-lead status is additive and never inferred from the reporting line.';
revoke execute on function mos.can_start_process_for_team(uuid) from public, anon;
grant execute on function mos.can_start_process_for_team(uuid) to authenticated;

create or replace function mos.can_close_process_run(p_run mos.process_runs)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select shared.role_authority_allows(
               'process.close', w.business_unit_id, p_run.owning_team_id, p_run.started_by)
        from mos.work_lines w
       where p_run.id is not null
         and p_run.org_id = shared.current_org_id()
         and w.id = p_run.work_line_id
         and w.org_id = p_run.org_id
         and w.type = 'process'
    ),
    false
  )
$$;
comment on function mos.can_close_process_run(mos.process_runs) is
  'Effective Process close authority: the run starter, designated owning-Team lead, owning-BU head, '
  'ops_lead, or admin only when the tenant matrix grants the corresponding additive scope. No broad '
  'reporting-line manager inference and no own_bu close default.';
revoke execute on function mos.can_close_process_run(mos.process_runs) from public, anon, authenticated;

create or replace function mos.get_work_write_scopes()
returns table(
  workline_org boolean,
  objective_org boolean,
  workline_bu_ids uuid[],
  objective_bu_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with authority as (
    select shared.role_authority_allows('workline.manage', null, null, null) as workline_org,
           shared.role_authority_allows('objective.manage', null, null, null) as objective_org
  ),
  active_bu as (
    select bu.id
      from shared.business_units bu
     where bu.org_id = shared.current_org_id()
       and bu.archived_at is null
  )
  select a.workline_org,
         a.objective_org,
         case when a.workline_org then '{}'::uuid[] else coalesce(
           (select array_agg(b.id order by b.id)
              from active_bu b
             where shared.role_authority_allows('workline.manage', b.id, null, null)),
           '{}'::uuid[])
         end,
         case when a.objective_org then '{}'::uuid[] else coalesce(
           (select array_agg(b.id order by b.id)
              from active_bu b
             where shared.role_authority_allows('objective.manage', b.id, null, null)),
           '{}'::uuid[])
         end
    from authority a
$$;
comment on function mos.get_work_write_scopes() is
  'Narrow viewer affordance for Project/Process/Objective creation: org-wide booleans plus only '
  'accessible active BU ids. It never enumerates work rows or directory data.';
revoke execute on function mos.get_work_write_scopes() from public, anon, authenticated;
grant execute on function mos.get_work_write_scopes() to authenticated;

create or replace function mos.get_signal_post_authority()
returns table(can_post boolean, can_tag boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select shared.role_authority_allows('signal.post', null, null, null),
         shared.role_authority_allows('signal.tag', null, null, null)
$$;
comment on function mos.get_signal_post_authority() is
  'Narrow Signal composer affordance: post and tag booleans only. Target selection remains separately '
  'same-org and active at the mutation seam.';
revoke execute on function mos.get_signal_post_authority() from public, anon, authenticated;
grant execute on function mos.get_signal_post_authority() to authenticated;

create or replace function mos.can_retract_signal(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select shared.role_authority_allows(
               'signal.retract', t.business_unit_id, s.owning_team_id, s.author_id)
        from mos.signals s
        join shared.teams t on t.id = s.owning_team_id
       where s.id = p_signal_id
         and s.org_id = shared.current_org_id()
         and t.org_id = s.org_id
         and s.retracted_at is null
    ),
    false
  )
$$;
comment on function mos.can_retract_signal(uuid) is
  'Same-org row affordance for an active Signal: author own, designated owning-Team lead, precise '
  'owning-BU head, ops_lead, or admin according to signal.retract. Missing/foreign/retracted ids return false.';
revoke execute on function mos.can_retract_signal(uuid) from public, anon, authenticated;
grant execute on function mos.can_retract_signal(uuid) to authenticated;

create or replace function mos.can_close_process_run_id(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select shared.role_authority_allows(
               'process.close', w.business_unit_id, r.owning_team_id, r.started_by)
        from mos.process_runs r
        join mos.work_lines w on w.id = r.work_line_id
       where r.id = p_run_id
         and r.org_id = shared.current_org_id()
         and w.org_id = r.org_id
         and w.type = 'process'
         and r.status = 'open'
    ),
    false
  )
$$;
comment on function mos.can_close_process_run_id(uuid) is
  'Narrow same-org active-run close affordance. It returns only a boolean and never exposes run or '
  'work identifiers through a lookup result.';
revoke execute on function mos.can_close_process_run_id(uuid) from public, anon, authenticated;
grant execute on function mos.can_close_process_run_id(uuid) to authenticated;

-- The old definition guards carried a global shared.can() escape hatch for the old catalog
-- capability vocabulary. Replace that escape hatch as well as the policies: otherwise a direct UPDATE
-- could move a row through the old capability even after the new matrix denied it.
create or replace function mos._guard_work_lines()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_acc_org  uuid;
  v_resp_org uuid;
begin
  if new.objective_id is not null then
    if not exists (
      select 1 from mos.objectives o
       where o.id = new.objective_id and o.org_id = new.org_id
    ) then
      raise exception 'objective_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.accountable_person_id is not null then
    select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
    if v_acc_org is distinct from new.org_id then
      raise exception 'accountable_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.responsible_person_id is not null then
    select p.org_id into v_resp_org from shared.people p where p.id = new.responsible_person_id;
    if v_resp_org is distinct from new.org_id then
      raise exception 'responsible_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.type is distinct from old.type
       and exists (select 1 from mos.process_runs r where r.work_line_id = new.id) then
      raise exception 'type is locked once an occurrence exists' using errcode = '42501';
    end if;
    if current_user = 'authenticated'
       and new.business_unit_id is distinct from old.business_unit_id
       and not mos.can_manage_definition(old.business_unit_id) then
      raise exception 'the definition''s current unit is not one you manage' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function mos._guard_work_lines() is
  'The ONE guard on mos.work_lines: references stay same-org, Process type locks after a run, and '
  'a direct unit move requires the effective matrix on the OLD unit. SECURITY INVOKER.';

create or replace function mos._guard_objectives()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org  uuid;
  v_acc_org uuid;
begin
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.accountable_person_id is not null then
    select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
    if v_acc_org is distinct from new.org_id then
      raise exception 'accountable_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE'
     and current_user = 'authenticated'
     and new.business_unit_id is distinct from old.business_unit_id
     and not mos.can_manage_definition(old.business_unit_id) then
    raise exception 'the definition''s current unit is not one you manage' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_objectives() is
  'The ONE guard on mos.objectives: references stay same-org and a direct unit move requires the '
  'effective matrix on the OLD unit. SECURITY INVOKER.';

-- Signal retraction is a tombstone transition. The original row and all mention rows remain intact;
-- only the retraction fields move, and the author is notified through the existing cross-owner path.
create or replace function mos._guard_signals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_org   uuid;
  v_author_org uuid;
  v_actor_name text;
begin
  if new.owning_team_id is not null then
    select t.org_id into v_team_org from shared.teams t where t.id = new.owning_team_id;
    if v_team_org is distinct from new.org_id then
      raise exception 'owning_team_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.author_id is not null then
    select p.org_id into v_author_org from shared.people p where p.id = new.author_id;
    if v_author_org is distinct from new.org_id then
      raise exception 'author_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.author_id is distinct from old.author_id
     or new.owning_team_id is distinct from old.owning_team_id
     or new.source is distinct from old.source
     or new.org_id is distinct from old.org_id
     or new.created_at is distinct from old.created_at then
    raise exception 'signal author/owning_team/source/org/created_at are immutable' using errcode = '42501';
  end if;

  if (new.body is distinct from old.body
      or new.occurred_at is distinct from old.occurred_at
      or new.category is distinct from old.category
      or new.attention is distinct from old.attention)
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
  end if;

  if new.retracted_at is distinct from old.retracted_at then
    if old.retracted_at is not null or new.retracted_at is null then
      raise exception 'a retracted Signal cannot be restored' using errcode = '42501';
    end if;
    if not mos.can_retract_signal(old.id) then
      raise exception 'retraction requires the effective signal.retract authority' using errcode = '42501';
    end if;
    if btrim(coalesce(new.retract_reason, '')) = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
    new.retract_reason := btrim(new.retract_reason);
    if old.author_id is distinct from shared.current_person_id()
       and exists (
      select 1 from shared.people p
       where p.id = old.author_id
         and p.org_id = old.org_id
         and p.archived_at is null
    ) then
      select p.full_name
        into v_actor_name
        from shared.people p
       where p.id = shared.current_person_id()
         and p.org_id = old.org_id
         and p.archived_at is null;
      perform mos.create_notification(
        old.author_id,
        'warning',
        'Signal retracted',
        new.retract_reason,
        jsonb_build_object(
          'source', 'signal_retraction',
          'actor', jsonb_build_object(
            'id', shared.current_person_id(),
            'name', v_actor_name),
          'reason', new.retract_reason,
          'entity', jsonb_build_object(
            'type', 'signal',
            'id', old.id,
            'route', '/work/signals?record=' || old.id))
      );
    end if;
  end if;

  if new.retract_reason is distinct from old.retract_reason
     and not (old.retracted_at is null and new.retracted_at is not null) then
    raise exception 'retraction audit fields are immutable' using errcode = '42501';
  end if;

  if new.body is distinct from old.body then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'body', old.body, new.body);
    new.edited_at := now();
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'occurred_at',
              old.occurred_at::text, new.occurred_at::text);
    new.edited_at := now();
  end if;
  if new.category is distinct from old.category then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'category', old.category, new.category);
    new.edited_at := now();
  end if;
  if new.attention is distinct from old.attention then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'attention', old.attention, new.attention);
    new.edited_at := now();
  end if;
  return new;
end;
$$;
comment on function mos._guard_signals() is
  'Signal guard: same-org references and immutable ownership; author-only content; one-way reasoned '
  'tombstone transition through mos.can_retract_signal; original audience retained; author notified. '
  'SECURITY DEFINER solely for signal revision/notification writes.';
revoke execute on function mos._guard_signals() from public, anon, authenticated;

-- A post for an arbitrary same-org owning Team may not satisfy the default Signal read gate. This
-- helper lets the mention INSERT policy verify authorship without reopening Signal enumeration.
create or replace function mos._is_signal_author(p_signal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from mos.signals s
     where s.id = p_signal_id
       and s.org_id = shared.current_org_id()
       and s.author_id = shared.current_person_id()
  )
$$;
comment on function mos._is_signal_author(uuid) is
  'Narrow same-org authorship check for Signal mutation policies. SECURITY DEFINER bypasses the '
  'Signal read gate only for this boolean; it never returns Signal data.';
revoke execute on function mos._is_signal_author(uuid) from public, anon, authenticated;
grant execute on function mos._is_signal_author(uuid) to authenticated;

create or replace function mos.teams_author_can_read_back(
  p_author_id uuid default shared.current_person_id()
)
returns table (id uuid, name text, business_unit_id uuid, site_id uuid, is_primary boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select tm.id, tm.name, tm.business_unit_id, tm.site_id,
         exists (
           select 1 from shared.team_memberships m
            where m.team_id = tm.id
              and m.person_id = shared.current_person_id()
              and m.org_id = shared.current_org_id()
              and m.is_primary
              and m.effective_from <= current_date
              and (m.effective_to is null or m.effective_to >= current_date)
         ) as is_primary
    from shared.teams tm
   where tm.org_id = shared.current_org_id()
     and tm.archived_at is null
     -- Keep the author identity guard: callers may only enumerate destinations for themselves.
     and p_author_id = shared.current_person_id()
     and mos.can_post_signal_for_team(tm.id)
   order by is_primary desc, tm.name
$$;
comment on function mos.teams_author_can_read_back(uuid) is
  'Returns every active same-org Team the current author may name under signal.post. It no longer '
  'requires the Team to be readable by the author''s old R1-R5 Signal gate; the author identity guard '
  'and same-org active-Team seam remain mandatory.';
revoke execute on function mos.teams_author_can_read_back(uuid) from public, anon, authenticated;
grant execute on function mos.teams_author_can_read_back(uuid) to authenticated;

drop policy objectives_insert_can_manage_or_unit_lead on mos.objectives;
drop policy objectives_update_can_manage_or_unit_lead on mos.objectives;
drop policy work_lines_insert_can_manage_or_unit_lead on mos.work_lines;
drop policy work_lines_update_can_manage_or_unit_lead on mos.work_lines;
drop policy process_cadences_insert_ops_lead_or_admin_or_process_a on mos.process_cadences;
drop policy process_cadences_update_ops_lead_or_admin_or_process_a on mos.process_cadences;
drop policy process_task_defs_insert_ops_lead_or_admin_or_process_a on mos.process_task_defs;
drop policy process_task_defs_update_ops_lead_or_admin_or_process_a on mos.process_task_defs;

create policy objectives_insert_can_manage_or_unit_lead on mos.objectives
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and mos.can_manage_definition(business_unit_id));
create policy objectives_update_can_manage_or_unit_lead on mos.objectives
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id()
              and mos.can_manage_definition(business_unit_id));
create policy work_lines_insert_can_manage_or_unit_lead on mos.work_lines
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and mos.can_manage_definition(business_unit_id));
create policy work_lines_update_can_manage_or_unit_lead on mos.work_lines
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id()
              and mos.can_manage_definition(business_unit_id));
comment on policy work_lines_insert_can_manage_or_unit_lead on mos.work_lines is
  'Creating or editing a Project/Process consumes the effective workline.manage matrix for its BU; '
  'org-wide rows require an org scope. Same-org references remain in mos._guard_work_lines.';

create policy process_cadences_insert_ops_lead_or_admin_or_process_a on mos.process_cadences
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and mos.can_manage_process_definition(work_line_id));
create policy process_cadences_update_ops_lead_or_admin_or_process_a on mos.process_cadences
  for update to authenticated
  using      (org_id = shared.current_org_id()
              and mos.can_manage_process_definition(work_line_id))
  with check (org_id = shared.current_org_id()
              and mos.can_manage_process_definition(work_line_id));

create policy process_task_defs_insert_ops_lead_or_admin_or_process_a on mos.process_task_defs
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and mos.can_manage_process_definition(work_line_id));
create policy process_task_defs_update_ops_lead_or_admin_or_process_a on mos.process_task_defs
  for update to authenticated
  using      (org_id = shared.current_org_id()
              and mos.can_manage_process_definition(work_line_id))
  with check (org_id = shared.current_org_id()
              and mos.can_manage_process_definition(work_line_id));
comment on policy process_cadences_insert_ops_lead_or_admin_or_process_a on mos.process_cadences is
  'Cadence definition writes consume workline.manage on the owning Process, including a precise BU-head own_bu grant.';
comment on policy process_task_defs_insert_ops_lead_or_admin_or_process_a on mos.process_task_defs is
  'Task-definition writes consume workline.manage on the owning Process, including a precise BU-head own_bu grant.';

drop policy signals_insert on mos.signals;
drop policy signals_update_author on mos.signals;
drop policy signal_mentions_insert on mos.signal_mentions;

create policy signals_insert on mos.signals
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and author_id = shared.current_person_id()
    and source = 'human'
    and mos.can_post_signal_for_team(owning_team_id)
  );

create policy signals_update_author on mos.signals
  for update to authenticated
  using (
    org_id = shared.current_org_id()
    and (author_id = shared.current_person_id() or mos.can_retract_signal(id))
  )
  with check (org_id = shared.current_org_id());
comment on policy signals_update_author on mos.signals is
  'USING admits the author for content edits or an effective retraction authority for another author; '
  'mos._guard_signals distinguishes those mutations and blocks content forgery.';

create policy signal_mentions_insert on mos.signal_mentions
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and mos._is_signal_author(signal_id)
    and case mention_kind
      when 'person' then
        shared.role_authority_allows('signal.tag', null, null, null)
        and exists (
          select 1 from shared.people p
           where p.id = target_person_id
             and p.org_id = shared.current_org_id()
             and p.archived_at is null
        )
      when 'team' then
        shared.role_authority_allows('signal.tag', null, target_team_id, null)
        and exists (
          select 1 from shared.teams t
           where t.id = target_team_id
             and t.org_id = shared.current_org_id()
             and t.archived_at is null
        )
      when 'bu' then
        shared.can('signal.mention_bu')
        and exists (
          select 1 from shared.business_units b
           where b.id = target_bu_id
             and b.org_id = shared.current_org_id()
             and b.archived_at is null
        )
      else false
    end
  );

drop policy signal_mentions_update_author on mos.signal_mentions;
create policy signal_mentions_update_author on mos.signal_mentions
  for update to authenticated
  using (mos._is_signal_author(signal_id))
  with check (org_id = shared.current_org_id());

-- Keep the latest five-argument post path (including attention capture), but make its preflight
-- agree with the direct INSERT policy: person and Team destinations must still be active when the
-- transaction starts. The policy remains authoritative for the actual writes.
create or replace function mos.create_signal_with_mentions(
  p_body text,
  p_owning_team_id uuid,
  p_occurred_at timestamptz,
  p_mentions jsonb default '[]'::jsonb,
  p_attention text default 'FYI'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     uuid;
  v_m      jsonb;
  v_kind   text;
  v_target uuid;
begin
  for v_m in select value from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) loop
    v_kind := v_m->>'kind';
    v_target := (v_m->>'targetId')::uuid;
    if v_kind = 'person' then
      if not exists (
        select 1 from shared.people p
         where p.id = v_target
           and p.org_id = shared.current_org_id()
           and p.archived_at is null
      ) then
        raise exception 'mention target person is not an active member of your org'
          using errcode = '42501';
      end if;
    elsif v_kind = 'team' then
      if not exists (
        select 1 from shared.teams t
         where t.id = v_target
           and t.org_id = shared.current_org_id()
           and t.archived_at is null
      ) then
        raise exception 'mention target Team is not active in your org' using errcode = '42501';
      end if;
    elsif v_kind = 'bu' then
      if not exists (
        select 1 from shared.business_units b
         where b.id = v_target
           and b.org_id = shared.current_org_id()
           and b.archived_at is null
      ) then
        raise exception 'mention target BU is not active in your org' using errcode = '42501';
      end if;
    else
      raise exception 'unknown mention kind' using errcode = '22023';
    end if;
  end loop;
  if p_attention not in ('FYI', 'Needs attention', 'Urgent') then
    raise exception 'invalid attention' using errcode = '22023';
  end if;

  v_id := gen_random_uuid();
  insert into mos.signals (id, body, owning_team_id, occurred_at, attention)
    values (v_id, p_body, p_owning_team_id, p_occurred_at, p_attention);
  insert into mos.signal_mentions
    (signal_id, mention_kind, target_person_id, target_team_id, target_bu_id)
  select v_id,
         m->>'kind',
         case when m->>'kind' = 'person' then (m->>'targetId')::uuid end,
         case when m->>'kind' = 'team'   then (m->>'targetId')::uuid end,
         case when m->>'kind' = 'bu'     then (m->>'targetId')::uuid end
    from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) as m;
  perform mos.fan_out_signal_mention(v_id);
  return v_id;
end;
$$;
comment on function mos.create_signal_with_mentions(text,uuid,timestamptz,jsonb,text) is
  'Transactional Signal post with attention capture. Preflights active same-org mention targets; the '
  'SECURITY INVOKER INSERTs remain the authoritative post/tag gates, and fan-out is atomic.';
revoke execute on function mos.create_signal_with_mentions(text,uuid,timestamptz,jsonb,text) from public, anon;
grant execute on function mos.create_signal_with_mentions(text,uuid,timestamptz,jsonb,text) to authenticated;

-- Preserve the latest Café Opening canonical-Team behavior while replacing the old global
-- process.start capability conjunction for ordinary processes with the effective matrix predicate.
create or replace function mos.spawn_process_run(
  p_work_line_id uuid,
  p_owning_team_id uuid,
  p_target_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid := shared.current_org_id();
  v_wl      mos.work_lines;
  v_cad     mos.process_cadences;
  v_team    shared.teams;
  v_period  text;
  v_caption text;
  v_snapshot jsonb;
  v_run_id  uuid;
  v_created int := 0;
  v_requested_team uuid;
  v_pending int := 0;
  v_is_cafe_opening boolean;
  td        mos.process_task_defs%rowtype;
  v_holders uuid[];
  v_pic     uuid;
  v_sup     uuid;
  v_task_id uuid;
  v_label   text;
  v_pos     int;
begin
  select * into v_wl from mos.work_lines where id = p_work_line_id;
  if v_wl.id is null or v_wl.org_id is distinct from v_org then
    raise exception 'process not found' using errcode = 'P0002';
  end if;
  if v_wl.type <> 'process' then
    raise exception 'work_line % is not a process', p_work_line_id using errcode = 'P0003';
  end if;

  v_is_cafe_opening := v_wl.code = 'cafe_opening';
  v_requested_team := p_owning_team_id;
  select * into v_team
    from shared.teams
   where id = p_owning_team_id and org_id = v_org;
  if v_team.id is null then
    raise exception 'owning team not found in org' using errcode = 'P0002';
  end if;

  -- Café Opening keeps its branch-specific canonical Team rule. It is a separate operational
  -- contract, so the bounded Work matrix applies to ordinary Process starts below.
  if v_is_cafe_opening then
    if v_team.branch_id is null
       or not shared.cafe_opening_can_start(v_team.branch_id)
       or not exists (
         select 1 from shared.teams t
          where t.id = v_team.id
            and t.org_id = v_org
            and t.branch_id = v_team.branch_id
            and t.activity in ('kitchen', 'bar')
            and t.archived_at is null
       ) then
      raise exception 'not authorized to start this Café Opening' using errcode = '42501';
    end if;
    select * into v_team
      from shared.teams
     where id = shared.cafe_opening_team(v_team.branch_id)
       and org_id = v_org;
    if v_team.id is null then
      raise exception 'not authorized to start this Café Opening' using errcode = '42501';
    end if;
    p_owning_team_id := v_team.id;
  end if;

  if not v_is_cafe_opening
     and not mos.can_start_process_for_team(v_requested_team) then
    raise exception 'not authorized to start this process (needs the effective process.start grant)'
      using errcode = '42501';
  end if;

  select * into v_cad
    from mos.process_cadences
   where work_line_id = p_work_line_id and org_id = v_org;
  if v_cad.id is null then
    raise exception 'process has no cadence configured' using errcode = 'P0003';
  end if;

  v_period := case v_cad.cadence_kind
                when 'daily'   then to_char(p_target_date, 'YYYY-MM-DD')
                when 'weekly'  then to_char(p_target_date, 'IYYY"W"IW')
                when 'monthly' then to_char(p_target_date, 'YYYY-MM')
                else                to_char(p_target_date, 'YYYY-MM-DD')
              end;
  v_caption := v_wl.name || ' · ' || to_char(p_target_date, 'DD Mon YYYY');

  select jsonb_build_object(
           'definition_version', v_wl.definition_version,
           'process_name', v_wl.name,
           'task_defs', coalesce(jsonb_agg(to_jsonb(d.*) order by d.position), '[]'::jsonb))
    into v_snapshot
    from mos.process_task_defs d
   where d.work_line_id = p_work_line_id
     and d.org_id = v_org
     and d.archived_at is null;

  insert into mos.process_runs
    (org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
     definition_version, spec_snapshot, started_by)
  values
    (v_org, p_work_line_id, p_owning_team_id, v_period, v_caption, p_target_date,
     v_wl.definition_version, v_snapshot, shared.current_person_id())
  on conflict (org_id, work_line_id, owning_team_id, period_key) do nothing
  returning id into v_run_id;
  if v_run_id is null then
    select id into v_run_id
      from mos.process_runs
     where org_id = v_org
       and work_line_id = p_work_line_id
       and owning_team_id = p_owning_team_id
       and period_key = v_period;
    return jsonb_build_object('run_id', v_run_id, 'created', 0, 'pending', 0, 'idempotent', true);
  end if;

  for td in
    select * from mos.process_task_defs
     where work_line_id = p_work_line_id
       and org_id = v_org
       and archived_at is null
     order by position
  loop
    if td.pic_person_id is not null then
      v_pic := td.pic_person_id;
    else
      select array_agg(h) into v_holders
        from mos._function_holders(v_org, td.pic_role_id, td.pic_team_id) h;
      v_pic := case when v_holders is not null and array_length(v_holders, 1) = 1
                    then v_holders[1] else null end;
    end if;

    if v_pic is null then
      insert into mos.process_run_pending_tasks
        (org_id, process_run_id, task_def_id, candidate_person_ids, reason)
      values
        (v_org, v_run_id, td.id, coalesce(v_holders, '{}'),
         case when v_holders is null then 'none' else 'multiple' end);
      v_pending := v_pending + 1;
      continue;
    end if;

    v_sup := td.supervisor_person_id;
    if v_sup is null and td.supervisor_role_id is not null then
      select array_agg(h) into v_holders
        from mos._function_holders(v_org, td.supervisor_role_id, td.supervisor_team_id) h;
      if v_holders is not null and array_length(v_holders, 1) = 1 then
        v_sup := v_holders[1];
      end if;
    end if;
    v_sup := coalesce(v_sup, v_wl.accountable_person_id, v_pic);

    insert into mos.tasks
      (org_id, title, description, business_unit_id, status,
       responsible_person_id, accountable_person_id, due_date,
       work_line_id, process_run_id, generated_from_task_def_id, created_by)
    values
      (v_org, td.title, td.description, v_team.business_unit_id, 'Open',
       v_pic, v_sup, p_target_date + td.due_offset_days,
       p_work_line_id, v_run_id, td.id, shared.current_person_id())
    returning id into v_task_id;
    v_created := v_created + 1;

    v_pos := 0;
    for v_label in select value from jsonb_array_elements_text(td.checklist_items) loop
      insert into mos.task_checklist_items (org_id, task_id, label, position)
      values (v_org, v_task_id, v_label, v_pos);
      v_pos := v_pos + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'run_id', v_run_id,
    'created', v_created,
    'pending', v_pending,
    'idempotent', false);
end;
$$;
comment on function mos.spawn_process_run(uuid,uuid,date) is
  'Idempotent Process occurrence spawn. Ordinary Processes use the tenant-local process.start matrix '
  'and active owning-Team membership; Café Opening retains its branch-specific canonical-Team gate. '
  'SECURITY DEFINER and RPC-only.';
revoke execute on function mos.spawn_process_run(uuid,uuid,date) from public, anon, authenticated;
grant execute on function mos.spawn_process_run(uuid,uuid,date) to authenticated;

create or replace function mos.resolve_pending_task(p_pending_id uuid, p_pic_person_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid := shared.current_org_id();
  v_pend  mos.process_run_pending_tasks;
  v_run   mos.process_runs;
  v_td    mos.process_task_defs;
  v_team  shared.teams;
  v_wl    mos.work_lines;
  v_sup   uuid;
  v_task_id uuid;
  v_holders uuid[];
  v_label text;
  v_pos int := 0;
begin
  select * into v_pend
    from mos.process_run_pending_tasks
   where id = p_pending_id
   for update;
  if v_pend.id is null then
    raise exception 'pending item not found' using errcode = 'P0002';
  end if;
  if v_pend.org_id is distinct from v_org then
    raise exception 'cannot resolve outside your org' using errcode = '42501';
  end if;
  if v_pend.resolved_at is not null then
    raise exception 'pending item already resolved' using errcode = 'P0003';
  end if;
  select * into v_run from mos.process_runs where id = v_pend.process_run_id;
  if v_run.id is null or v_run.org_id is distinct from v_org
     or not mos.can_start_process_for_team(v_run.owning_team_id) then
    raise exception 'not authorized to resolve this pending item' using errcode = '42501';
  end if;
  if not exists (
    select 1 from shared.people
     where id = p_pic_person_id and org_id = v_org and archived_at is null
  ) then
    raise exception 'chosen PIC is not a current-org active person' using errcode = '42501';
  end if;
  if v_pend.reason = 'multiple'
     and not (p_pic_person_id = any(v_pend.candidate_person_ids)) then
    raise exception 'chosen PIC is not one of the candidates' using errcode = 'P0003';
  end if;

  select * into v_td from mos.process_task_defs where id = v_pend.task_def_id;
  select * into v_wl from mos.work_lines where id = v_run.work_line_id;
  select * into v_team from shared.teams where id = v_run.owning_team_id;

  v_sup := v_td.supervisor_person_id;
  if v_sup is null and v_td.supervisor_role_id is not null then
    select array_agg(h) into v_holders
      from mos._function_holders(v_org, v_td.supervisor_role_id, v_td.supervisor_team_id) h;
    if v_holders is not null and array_length(v_holders, 1) = 1 then
      v_sup := v_holders[1];
    end if;
  end if;
  v_sup := coalesce(v_sup, v_wl.accountable_person_id, p_pic_person_id);

  insert into mos.tasks
    (org_id, title, description, business_unit_id, status,
     responsible_person_id, accountable_person_id, due_date,
     work_line_id, process_run_id, generated_from_task_def_id, created_by)
  values
    (v_org, v_td.title, v_td.description, v_team.business_unit_id, 'Open',
     p_pic_person_id, v_sup, v_run.scheduled_date + v_td.due_offset_days,
     v_run.work_line_id, v_run.id, v_td.id, shared.current_person_id())
  returning id into v_task_id;

  for v_label in select value from jsonb_array_elements_text(v_td.checklist_items) loop
    insert into mos.task_checklist_items (org_id, task_id, label, position)
    values (v_org, v_task_id, v_label, v_pos);
    v_pos := v_pos + 1;
  end loop;

  update mos.process_run_pending_tasks
     set resolved_at = now(),
         resolved_by = shared.current_person_id(),
         materialized_task_id = v_task_id
   where id = p_pending_id;
  return v_task_id;
end;
$$;
comment on function mos.resolve_pending_task(uuid,uuid) is
  'Resolves a pending Process task under the effective process.start matrix and active owning-Team '
  'membership; candidate and same-org checks remain enforced. SECURITY DEFINER and RPC-only.';
revoke execute on function mos.resolve_pending_task(uuid,uuid) from public, anon, authenticated;
grant execute on function mos.resolve_pending_task(uuid,uuid) to authenticated;
