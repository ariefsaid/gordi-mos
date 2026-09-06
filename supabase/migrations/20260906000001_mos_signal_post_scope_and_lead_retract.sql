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
          -- An active Team membership makes a lead responsible for that Team.
          exists (
            select 1 from shared.team_memberships m
            where m.team_id = target.id
              and m.person_id = shared.current_person_id()
              and m.org_id = shared.current_org_id()
              and m.effective_from <= current_date
              and (m.effective_to is null or m.effective_to >= current_date)
          )
          -- A manager in the Team's business unit leads through the reporting line.
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
          -- The unit head leads every Team in the unit.
          or exists (
            select 1
            from shared.person_roles pr
            join shared.roles r on r.id = pr.role_id
            where pr.person_id = shared.current_person_id()
              and pr.org_id = target.org_id
              and (r.business_unit_id = target.business_unit_id or r.business_unit_id is null)
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

-- The guard owns retract authorization and inserts the author notification.
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
     or new.source_ref is distinct from old.source_ref
     or new.org_id is distinct from old.org_id
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at then
    raise exception 'signal author/owning_team/source/source_ref/org/created_at/updated_at are immutable' using errcode = '42501';
  end if;
  if new.edited_at is distinct from old.edited_at
     and new.body is not distinct from old.body
     and new.occurred_at is not distinct from old.occurred_at
     and new.category is not distinct from old.category
     and new.attention is not distinct from old.attention then
    raise exception 'signal edited_at is server-owned' using errcode = '42501';
  end if;
  if new.retract_reason is distinct from old.retract_reason
     and new.retracted_at is not distinct from old.retracted_at
     and old.author_id is distinct from shared.current_person_id() then
    raise exception 'retract_reason is author-only unless the signal is being retracted' using errcode = '42501';
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

-- The recipient-only policy leaves cross-owner delivery to the definer trigger.
drop policy if exists notifications_insert on mos.notifications;
create policy notifications_insert on mos.notifications
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and owner_id = shared.current_person_id()
  );
comment on function mos.create_notification(uuid, text, text, text, jsonb) is
  'Authenticated mention delivery RPC for cross-owner notifications; signal retraction notifications use the signal guard directly.';
comment on policy notifications_insert on mos.notifications is
  'A direct insert addressed to another owner is denied here; cross-owner delivery uses SECURITY DEFINER RPCs and trigger-owned notifications.';

-- The unique key makes the guard insert idempotent under concurrency.
create unique index if not exists notifications_signal_retracted_once
  on mos.notifications (owner_id, (metadata->>'source'), (metadata#>>'{entity,id}'))
  where metadata->>'source' = 'signal_retracted';

drop trigger if exists signals_lead_retract_guard on mos.signals;
drop trigger if exists signals_retracted_notification on mos.signals;

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
  -- Authors, owning-Team peers, and retract authorities reach the guard; it rejects unauthorized changes loudly.
  with check (org_id = shared.current_org_id());
comment on policy signals_update_author on mos.signals is
  'USING is deliberately org-wide so an unauthorized author/peer UPDATE reaches mos._guard_signals and raises 42501; the guard is the write authority. WITH CHECK preserves the same-org narrowing.';

-- DOWN (copy into a transaction to restore the released predecessor):
-- drop index if exists mos.notifications_signal_retracted_once;
-- delete from shared.role_capabilities where (role, capability) in (('supervisor', 'signal.create'), ('manager', 'signal.create'));
-- drop function mos.is_team_lead(uuid);
-- drop function mos.viewer_lead_team_ids();
-- drop policy if exists notifications_insert on mos.notifications;
-- create policy notifications_insert on mos.notifications for insert to authenticated
--   with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());
-- drop policy if exists signals_insert on mos.signals;
-- create policy signals_insert on mos.signals for insert to authenticated
--   with check (org_id = shared.current_org_id() and author_id = shared.current_person_id()
--     and source = 'human' and shared.can('signal.create') and mos.can_post_signal_for_team(owning_team_id));
-- drop policy if exists signals_update_author on mos.signals;
-- create policy signals_update_author on mos.signals for update to authenticated
--   using (org_id = shared.current_org_id() and (author_id = shared.current_person_id() or shared.can('signal.retract')))
--   with check (org_id = shared.current_org_id());
-- create or replace function mos.can_post_signal_for_team(p_team_id uuid)
-- returns boolean language sql stable security invoker set search_path = '' as $$
--   select shared.can('signal.create_for_team') or exists (
--     select 1 from shared.team_memberships m where m.team_id = p_team_id
--       and m.person_id = shared.current_person_id() and m.org_id = shared.current_org_id()
--       and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date));
-- $$;
-- create or replace function mos._guard_signals()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = ''
-- as $$
-- declare
--   v_team_org   uuid;
--   v_author_org uuid;
-- begin
--   -- SAME-ORG REFERENCES, checked on INSERT as well as UPDATE — which is why this trigger is no
--   -- longer UPDATE-only. owning_team_id and author_id are existence-only FKs into org-scoped tables.
--   -- The INSERT policy pins the row's own org_id and pins author_id to the session person, and it
--   -- calls mos.can_post_signal_for_team(owning_team_id) — but that gate answers "may you post for
--   -- this Team", and its first arm is a capability that is true regardless of which Team was named,
--   -- so it is an authorization test and not a tenancy test. The two questions are different and the
--   -- second one belongs here, with the rest of this table's invariants. It matters more on this table
--   -- than on most: mos.can_read_signal joins the owning Team to decide who may read a Signal at all.
--   --
--   -- Compared against new.org_id, the idiom the sibling guards use, so the rule states the row's own
--   -- internal consistency and holds identically on the seed and service paths.
--   -- Both arms null-guarded although both columns are NOT NULL: a BEFORE ROW trigger runs before NOT
--   -- NULL is checked, so an unguarded lookup would report a tenancy violation for a column the caller
--   -- simply left out. Same idiom as ops._guard_kitchen_log.
--   if new.owning_team_id is not null then
--     select t.org_id into v_team_org from shared.teams t where t.id = new.owning_team_id;
--     if v_team_org is distinct from new.org_id then
--       raise exception 'owning_team_id belongs to a different org' using errcode = '42501';
--     end if;
--   end if;
--   if new.author_id is not null then
--     select p.org_id into v_author_org from shared.people p where p.id = new.author_id;
--     if v_author_org is distinct from new.org_id then
--       raise exception 'author_id belongs to a different org' using errcode = '42501';
--     end if;
--   end if;
-- 
--   -- Everything below reads OLD and is therefore UPDATE-only. Guarded explicitly rather than left to
--   -- the trigger definition, so the two halves cannot drift apart if the definition is ever widened
--   -- again: on INSERT, OLD is not merely empty, it is not a row at all.
--   if tg_op = 'INSERT' then
--     return new;
--   end if;
-- 
--   if new.author_id is distinct from old.author_id
--      or new.owning_team_id is distinct from old.owning_team_id
--      or new.source is distinct from old.source
--      or new.org_id is distinct from old.org_id
--      or new.created_at is distinct from old.created_at then
--     raise exception 'signal author/owning_team/source/org/created_at are immutable' using errcode = '42501';
--   end if;
-- 
--   -- SECURITY HIGH-1: content is AUTHOR-ONLY. The UPDATE policy's USING clause admits both the author
--   -- and any signal.retract holder — it has to, so a holder can retract someone else's Signal — but
--   -- without this that same holder could rewrite the body. A non-author may move only the retraction
--   -- columns.
--   if (new.body is distinct from old.body
--       or new.occurred_at is distinct from old.occurred_at
--       or new.category is distinct from old.category
--       or new.attention is distinct from old.attention)
--      and old.author_id is distinct from shared.current_person_id() then
--     raise exception 'signal content is author-only; signal.retract may only retract' using errcode = '42501';
--   end if;
-- 
--   if new.retracted_at is distinct from old.retracted_at then
--     if not (old.author_id = shared.current_person_id() or shared.can('signal.retract')) then
--       raise exception 'retract requires author or signal.retract' using errcode = '42501';
--     end if;
--     if new.retracted_at is not null and btrim(coalesce(new.retract_reason,'')) = '' then
--       raise exception 'retraction requires a reason' using errcode = '23514';
--     end if;
--   end if;
-- 
--   -- Edit history. One branch per mutable field so the revision row names the field that moved.
--   if new.body is distinct from old.body then
--     insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
--       values (old.org_id, old.id, shared.current_person_id(), 'body', old.body, new.body);
--     new.edited_at := now();
--   end if;
--   if new.occurred_at is distinct from old.occurred_at then
--     insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
--       values (old.org_id, old.id, shared.current_person_id(), 'occurred_at', old.occurred_at::text, new.occurred_at::text);
--     new.edited_at := now();
--   end if;
--   if new.category is distinct from old.category then
--     insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
--       values (old.org_id, old.id, shared.current_person_id(), 'category', old.category, new.category);
--     new.edited_at := now();
--   end if;
--   if new.attention is distinct from old.attention then
--     insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
--       values (old.org_id, old.id, shared.current_person_id(), 'attention', old.attention, new.attention);
--     new.edited_at := now();
--   end if;
-- 
--   return new;
-- end;
-- $$;
