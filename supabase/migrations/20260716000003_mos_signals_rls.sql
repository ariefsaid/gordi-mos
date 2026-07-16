-- ADR-0050 D4: can_read_signal (default-deny + R1..R5). D7: can_post_signal_for_team. D5: guard trigger.
grant select, insert, update on mos.signals                 to authenticated;
grant select, insert, update on mos.signal_mentions         to authenticated; -- update = set revoked_at only (guard)
grant select, insert         on mos.signal_acknowledgements to authenticated; -- append-only
grant select                 on mos.signal_revisions        to authenticated; -- trigger-written; NO insert grant
grant select, insert         on mos.signal_tasks            to authenticated;

-- SECURITY DEFINER (not INVOKER): the SELECT policy on mos.signals AND every child-table SELECT policy
-- call this function, and the function itself reads mos.signals + mos.signal_mentions (both of which are
-- gated by this very predicate). Under INVOKER those internal reads re-apply the calling policy and
-- recurse to a stack-overflow. DEFINER makes the internal reads bypass RLS; the function returns only a
-- boolean, computed strictly for the JWT caller (current_org_id/current_person_id, both unspoofable), so
-- no row data escapes — the canonical self-referential-RLS pattern. EXECUTE is revoked from PUBLIC and
-- re-granted only to authenticated (definer-revoke lint clean; policy evaluation needs authenticated EXECUTE).
create or replace function mos.can_read_signal(p_signal_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from mos.signals s
    join shared.teams tm on tm.id = s.owning_team_id
    where s.id = p_signal_id
      and s.org_id = shared.current_org_id()
      and (
        exists ( -- R1 owning-Team member (active)
          select 1 from shared.team_memberships m
          where m.team_id = s.owning_team_id and m.person_id = shared.current_person_id()
            and m.org_id = shared.current_org_id()
            and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date))
        or exists ( -- R2 BU-scoped role over parent BU (RATIFY-3: matches on BU)
          select 1 from shared.person_roles pr join shared.roles r on r.id = pr.role_id
          where pr.person_id = shared.current_person_id() and pr.org_id = shared.current_org_id()
            and r.business_unit_id = tm.business_unit_id)
        or ( -- R3 strictly-higher BU visibility rank (default 0 ⇒ inert)
          coalesce((select max(coalesce(bu.signal_visibility_rank,0))
                    from shared.person_roles pr join shared.roles r on r.id = pr.role_id
                    join shared.business_units bu on bu.id = r.business_unit_id
                    where pr.person_id = shared.current_person_id() and pr.org_id = shared.current_org_id()), 0)
          > coalesce((select bu2.signal_visibility_rank from shared.business_units bu2 where bu2.id = tm.business_unit_id), 0))
        or exists ( -- R4 explicit unrevoked mention
          select 1 from mos.signal_mentions sm
          where sm.signal_id = s.id and sm.revoked_at is null and (
            (sm.mention_kind='person' and sm.target_person_id = shared.current_person_id())
            or (sm.mention_kind='team' and exists (
                select 1 from shared.team_memberships m2 where m2.team_id = sm.target_team_id
                  and m2.person_id = shared.current_person_id()
                  and m2.effective_from <= current_date and (m2.effective_to is null or m2.effective_to >= current_date)))
            or (sm.mention_kind='bu' and exists (
                select 1 from shared.person_roles pr2 join shared.roles r2 on r2.id = pr2.role_id
                where pr2.person_id = shared.current_person_id() and r2.business_unit_id = sm.target_bu_id))))
        or shared.can('signal.read_all') -- R5 override (unregistered v1 ⇒ inert)
      ));
$$;
comment on function mos.can_read_signal(uuid) is 'ADR-0050 D4 default-deny read gate (R1..R5). SECURITY DEFINER to avoid self-referential-RLS recursion; org-gated first; returns only a boolean for the JWT caller.';
revoke execute on function mos.can_read_signal(uuid) from public, anon, authenticated;
grant  execute on function mos.can_read_signal(uuid) to authenticated;

create or replace function mos.can_post_signal_for_team(p_team_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select shared.can('signal.create_for_team')
     or exists (
       select 1 from shared.team_memberships m
       where m.team_id = p_team_id and m.person_id = shared.current_person_id()
         and m.org_id = shared.current_org_id()
         and m.effective_from <= current_date and (m.effective_to is null or m.effective_to >= current_date));
$$;

alter table mos.signals enable row level security; alter table mos.signals force row level security;
create policy signals_select on mos.signals for select to authenticated using (mos.can_read_signal(id));
create policy signals_insert on mos.signals for insert to authenticated
  with check (org_id = shared.current_org_id() and author_id = shared.current_person_id()
              and source = 'human' and shared.can('signal.create')
              and mos.can_post_signal_for_team(owning_team_id));
create policy signals_update_author on mos.signals for update to authenticated
  using (org_id = shared.current_org_id() and (author_id = shared.current_person_id() or shared.can('signal.retract')))
  with check (org_id = shared.current_org_id());
-- no delete policy.

-- Guard trigger (ADR-0050 D5). DEFINER solely to append signal_revisions (no INSERT grant to authenticated).
create or replace function mos._signal_guard_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id is distinct from old.author_id or new.owning_team_id is distinct from old.owning_team_id
     or new.source is distinct from old.source or new.org_id is distinct from old.org_id
     or new.created_at is distinct from old.created_at then
    raise exception 'signal author/owning_team/source/org/created_at are immutable' using errcode = '42501';
  end if;
  if new.retracted_at is distinct from old.retracted_at then
    if not (old.author_id = shared.current_person_id() or shared.can('signal.retract')) then
      raise exception 'retract requires author or signal.retract' using errcode = '42501';
    end if;
    if new.retracted_at is not null and btrim(coalesce(new.retract_reason,'')) = '' then
      raise exception 'retraction requires a reason' using errcode = '23514';
    end if;
  end if;
  if new.body is distinct from old.body then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'body', old.body, new.body);
    new.edited_at := now();
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'occurred_at', old.occurred_at::text, new.occurred_at::text);
    new.edited_at := now();
  end if;
  if new.category is distinct from old.category then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'category', old.category, new.category);
    new.edited_at := now();
  end if;
  if new.attention is distinct from old.attention then
    insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value)
      values (old.org_id, old.id, shared.current_person_id(), 'attention', old.attention, new.attention);
    new.edited_at := now();
  end if;
  return new;
end $$;
revoke execute on function mos._signal_guard_update() from public, anon, authenticated;
create trigger signals_guard_update before update on mos.signals
  for each row execute function mos._signal_guard_update();

-- Child-table policies (all read-gated to can_read_signal of the parent).
alter table mos.signal_mentions enable row level security; alter table mos.signal_mentions force row level security;
create policy signal_mentions_select on mos.signal_mentions for select to authenticated using (mos.can_read_signal(signal_id));
create policy signal_mentions_insert on mos.signal_mentions for insert to authenticated
  with check (org_id = shared.current_org_id()
              and exists (select 1 from mos.signals s where s.id = signal_id and s.author_id = shared.current_person_id())
              and (mention_kind <> 'bu' or shared.can('signal.mention_bu')));
create policy signal_mentions_update_author on mos.signal_mentions for update to authenticated
  using (exists (select 1 from mos.signals s where s.id = signal_id and s.author_id = shared.current_person_id()))
  with check (org_id = shared.current_org_id());

alter table mos.signal_acknowledgements enable row level security; alter table mos.signal_acknowledgements force row level security;
create policy signal_ack_select on mos.signal_acknowledgements for select to authenticated using (mos.can_read_signal(signal_id));
create policy signal_ack_insert on mos.signal_acknowledgements for insert to authenticated
  with check (org_id = shared.current_org_id() and person_id = shared.current_person_id() and mos.can_read_signal(signal_id));

alter table mos.signal_revisions enable row level security; alter table mos.signal_revisions force row level security;
create policy signal_revisions_select on mos.signal_revisions for select to authenticated using (mos.can_read_signal(signal_id));
-- no insert policy → only the DEFINER guard trigger writes.

alter table mos.signal_tasks enable row level security; alter table mos.signal_tasks force row level security;
create policy signal_tasks_select on mos.signal_tasks for select to authenticated using (mos.can_read_signal(signal_id));
create policy signal_tasks_insert on mos.signal_tasks for insert to authenticated
  with check (org_id = shared.current_org_id() and created_by = shared.current_person_id() and mos.can_read_signal(signal_id));

-- DOWN (manual): drop policies + triggers + functions can_read_signal/can_post_signal_for_team/_signal_guard_update.
