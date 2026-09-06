-- Signal posting/retraction scope: one database rule, one notification path.
insert into shared.role_capabilities (role, capability, scope) values
  ('supervisor', 'signal.create', 'org'),
  ('manager', 'signal.create', 'org')
on conflict (role, capability) do nothing;

create or replace function mos.is_team_lead(p_team_id uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select (shared.has_access_role('ops_lead')
       or shared.has_access_role('supervisor')
       or shared.has_access_role('manager'))
    and exists (
      select 1
      from shared.teams target
      where target.id = p_team_id
        and target.org_id = shared.current_org_id()
        and (
          -- Changed arm: a lead's own active Team is still a direct lead fact.
          exists (
            select 1 from shared.team_memberships m
            where m.team_id = target.id
              and m.person_id = shared.current_person_id()
              and m.org_id = shared.current_org_id()
              and m.effective_from <= current_date
              and (m.effective_to is null or m.effective_to >= current_date)
          )
          -- Changed arm: the reporting line is scoped to this Team's business unit.
          or exists (
            select 1
            from shared.team_memberships m
            join shared.people member on member.id = m.person_id
            where m.team_id = target.id
              and m.org_id = shared.current_org_id()
              and member.org_id = target.org_id
              and m.effective_from <= current_date
              and (m.effective_to is null or m.effective_to >= current_date)
              and exists (
                select 1
                from shared.person_roles caller_pr
                join shared.roles caller_role on caller_role.id = caller_pr.role_id
                where caller_pr.person_id = shared.current_person_id()
                  and caller_pr.org_id = target.org_id
                  and caller_role.business_unit_id = target.business_unit_id
                  and shared.is_manager_of(member.id)
              )
          )
          -- Changed arm: the unit head is the root of this unit's reporting line.
          or exists (
            select 1
            from shared.person_roles pr
            join shared.roles r on r.id = pr.role_id
            where pr.person_id = shared.current_person_id()
              and pr.org_id = target.org_id
              and r.business_unit_id = target.business_unit_id
              and r.reports_to_role_id is null
          )
        )
    );
$$;
comment on function mos.is_team_lead(uuid) is
  'Lead fact for a Team: active member, above a member in that Team''s business unit, or unit head in that unit.';
revoke execute on function mos.is_team_lead(uuid) from public, anon;
grant execute on function mos.is_team_lead(uuid) to authenticated;

create or replace function mos.viewer_lead_team_ids()
returns setof uuid
language sql stable security invoker set search_path = '' as $$
  select t.id from shared.teams t
  where t.org_id = shared.current_org_id() and mos.is_team_lead(t.id);
$$;
revoke execute on function mos.viewer_lead_team_ids() from public, anon;
grant execute on function mos.viewer_lead_team_ids() to authenticated;

create or replace function mos.can_post_signal_for_team(p_team_id uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select shared.can('signal.create_for_team')
    or exists (
      select 1 from shared.team_memberships m
      where m.team_id = p_team_id
        and m.person_id = shared.current_person_id()
        and m.org_id = shared.current_org_id()
        and m.effective_from <= current_date
        and (m.effective_to is null or m.effective_to >= current_date)
    )
    or ((shared.has_access_role('ops_lead')
      or shared.has_access_role('supervisor')
      or shared.has_access_role('manager'))
      and exists (
        select 1 from shared.teams target
        where target.id = p_team_id and target.org_id = shared.current_org_id()
          and (
            exists (
              select 1 from shared.team_memberships m
              join shared.teams home on home.id = m.team_id
              where m.person_id = shared.current_person_id()
                and m.org_id = shared.current_org_id()
                and home.business_unit_id = target.business_unit_id
                and m.effective_from <= current_date
                and (m.effective_to is null or m.effective_to >= current_date)
            )
            or exists (
              select 1 from shared.person_roles pr
              join shared.roles r on r.id = pr.role_id
              where pr.person_id = shared.current_person_id()
                and pr.org_id = shared.current_org_id()
                and r.business_unit_id = target.business_unit_id
            )
          )
      ));
$$;
comment on function mos.can_post_signal_for_team(uuid) is
  'Signal post gate: signal.create_for_team, own Team membership, or a lead-tier caller in the target business unit.';
revoke execute on function mos.can_post_signal_for_team(uuid) from public, anon;
grant execute on function mos.can_post_signal_for_team(uuid) to authenticated;

-- Changed arm: the guard is the sole retract authorization and notification insertion point.
create or replace function mos._guard_signals()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_team_org uuid;
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
  if tg_op = 'INSERT' then return new; end if;
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
    if not (old.author_id = shared.current_person_id()
            or shared.can('signal.retract')
            or mos.is_team_lead(old.owning_team_id)) then
      raise exception 'retract requires author, Team lead, or signal.retract' using errcode = '42501';
    end if;
    if new.retracted_at is not null and btrim(coalesce(new.retract_reason, '')) = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
    if new.retracted_at is not null and old.retracted_at is null then
      select full_name into v_actor_name
      from shared.people where id = shared.current_person_id();
      insert into mos.notifications (org_id, owner_id, severity, title, body, metadata)
      values (
        old.org_id, old.author_id, 'warning',
        coalesce(v_actor_name, 'A lead') || ' retracted your Signal',
        new.retract_reason,
        jsonb_build_object(
          'source', 'signal_retracted',
          'actor', jsonb_build_object('id', shared.current_person_id(), 'name', coalesce(v_actor_name, 'A lead')),
          'entity', jsonb_build_object('type', 'signal', 'id', old.id, 'route', '/work/signals?record=' || old.id)
        )
      ) on conflict (owner_id, (metadata->>'source'), (metadata#>>'{entity,id}'))
        where metadata->>'source' = 'signal_retracted' do nothing;
    end if;
  end if;
  if new.body is distinct from old.body then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'body', old.body, new.body);
    new.edited_at := now();
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'occurred_at', old.occurred_at::text, new.occurred_at::text);
    new.edited_at := now();
  end if;
  if new.category is distinct from old.category then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'category', old.category, new.category);
    new.edited_at := now();
  end if;
  if new.attention is distinct from old.attention then
    insert into mos.signal_revisions(org_id, signal_id, actor_id, field, old_value, new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'attention', old.attention::text, new.attention::text);
    new.edited_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function mos._guard_signals() from public, anon, authenticated;

-- Changed arm: the guard's definer identity is the only non-recipient notification writer.
drop policy if exists notifications_insert on mos.notifications;
create policy notifications_insert on mos.notifications
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and (owner_id = shared.current_person_id() or current_user <> 'authenticated')
  );

-- Changed arm: one unique key makes the single guard insert idempotent under concurrency.
create unique index if not exists notifications_signal_retracted_once
  on mos.notifications (owner_id, (metadata->>'source'), (metadata#>>'{entity,id}'))
  where metadata->>'source' = 'signal_retracted';

drop trigger if exists signals_lead_retract_guard on mos.signals;
drop trigger if exists signals_retracted_notification on mos.signals;
drop function if exists mos._guard_signal_lead_retract();
drop function if exists mos._notify_signal_retracted();
drop function if exists mos._deliver_signal_retracted(uuid, uuid, text);

drop policy if exists signals_insert on mos.signals;
create policy signals_insert on mos.signals
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and author_id = shared.current_person_id()
    and source = 'human'
    and shared.can('signal.create')
    and mos.can_post_signal_for_team(owning_team_id)
  );

drop policy if exists signals_update_author on mos.signals;
create policy signals_update_author on mos.signals
  for update to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      author_id = shared.current_person_id()
      or exists (
        select 1 from shared.team_memberships m
        where m.team_id = mos.signals.owning_team_id
          and m.person_id = shared.current_person_id()
          and m.org_id = shared.current_org_id()
          and m.effective_from <= current_date
          and (m.effective_to is null or m.effective_to >= current_date)
      )
      or shared.can('signal.retract')
      or mos.is_team_lead(owning_team_id)
    )
  )
  -- Changed arm: authors and owning-Team peers reach the guard; it refuses unauthorized writes loudly.
  with check (org_id = shared.current_org_id());
comment on policy signals_update_author on mos.signals is
  'USING is deliberately org-wide so an unauthorized author/peer UPDATE reaches mos._guard_signals and raises 42501; the guard is the write authority. WITH CHECK preserves the same-org narrowing.';

-- DOWN (run as one transaction to restore 20260805000006/20260904000002 verbatim):
-- drop index if exists mos.notifications_signal_retracted_once;
-- create or replace function mos.can_post_signal_for_team(p_team_id uuid) returns boolean language sql stable security invoker set search_path = '' as $$ select shared.can('signal.create_for_team') or exists (select 1 from shared.team_memberships m where m.team_id=p_team_id and m.person_id=shared.current_person_id() and m.org_id=shared.current_org_id() and m.effective_from<=current_date and (m.effective_to is null or m.effective_to>=current_date)); $$;
-- create or replace function mos._guard_signals() ... -- restore the complete 20260805000006 body, without the retract notification arm;
-- drop policy if exists signals_insert on mos.signals;
-- create policy signals_insert on mos.signals for insert to authenticated with check (org_id=shared.current_org_id() and author_id=shared.current_person_id() and source='human' and shared.can('signal.create') and mos.can_post_signal_for_team(owning_team_id));
-- drop policy if exists signals_update_author on mos.signals;
-- create policy signals_update_author on mos.signals for update to authenticated using (org_id=shared.current_org_id() and (author_id=shared.current_person_id() or shared.can('signal.retract'))) with check (org_id=shared.current_org_id());
-- drop function if exists mos.viewer_lead_team_ids();
-- create or replace function mos.is_team_lead(p_team_id uuid) ... -- restore the prior 20260906000001 body;
