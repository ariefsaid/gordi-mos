-- Ticket #767: team-unit post scope, one lead predicate, and lead retraction delivery.
-- DOWN: drop the added triggers/functions and restore the previous Signal policies/functions.

create or replace function mos.is_team_lead(p_team_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (shared.has_access_role('ops_lead') or shared.has_access_role('supervisor') or shared.has_access_role('manager'))
    and exists (select 1 from shared.teams t where t.id=p_team_id and t.org_id=shared.current_org_id()
      and (exists (select 1 from shared.team_memberships m where m.team_id=t.id and m.person_id=shared.current_person_id()
                   and m.org_id=shared.current_org_id() and m.effective_from<=current_date
                   and (m.effective_to is null or m.effective_to>=current_date))
           or exists (select 1 from shared.team_memberships m where m.team_id=t.id and m.org_id=shared.current_org_id()
                      and m.effective_from<=current_date and (m.effective_to is null or m.effective_to>=current_date)
                      and shared.is_manager_of(m.person_id))));
$$;
comment on function mos.is_team_lead(uuid) is 'One Signal lead predicate: lead access tier and either active Team membership or above an active Team member in the reporting line.';
revoke execute on function mos.is_team_lead(uuid) from public, anon;
grant execute on function mos.is_team_lead(uuid) to authenticated;

create or replace function mos.can_post_signal_for_team(p_team_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select shared.can('signal.create_for_team')
    or exists (select 1 from shared.team_memberships m where m.team_id=p_team_id and m.person_id=shared.current_person_id()
              and m.org_id=shared.current_org_id() and m.effective_from<=current_date
              and (m.effective_to is null or m.effective_to>=current_date))
    or ((shared.has_access_role('ops_lead') or shared.has_access_role('supervisor') or shared.has_access_role('manager'))
      and exists (select 1 from shared.teams target where target.id=p_team_id and target.org_id=shared.current_org_id()
        and (exists (select 1 from shared.team_memberships m join shared.teams home on home.id=m.team_id
                     where m.person_id=shared.current_person_id() and m.org_id=shared.current_org_id()
                       and home.business_unit_id=target.business_unit_id and m.effective_from<=current_date
                       and (m.effective_to is null or m.effective_to>=current_date))
             or exists (select 1 from shared.person_roles pr join shared.roles r on r.id=pr.role_id
                        where pr.person_id=shared.current_person_id() and pr.org_id=shared.current_org_id()
                          and r.business_unit_id=target.business_unit_id))));
$$;
comment on function mos.can_post_signal_for_team(uuid) is 'Signal post gate: own Team for members; own-unit Teams for lead tiers; signal.create_for_team for cross-unit posting.';
revoke execute on function mos.can_post_signal_for_team(uuid) from public, anon;
grant execute on function mos.can_post_signal_for_team(uuid) to authenticated;

create or replace function mos._guard_signal_lead_retract() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.retracted_at is distinct from old.retracted_at and old.author_id<>shared.current_person_id()
     and not shared.can('signal.retract') and not mos.is_team_lead(old.owning_team_id) then
    raise exception 'retract requires author, Team lead, or signal.retract' using errcode='42501';
  end if;
  return new;
end; $$;
revoke execute on function mos._guard_signal_lead_retract() from public, anon, authenticated;
create trigger signals_lead_retract_guard before update on mos.signals for each row execute function mos._guard_signal_lead_retract();

create or replace function mos._deliver_signal_retracted(p_signal_id uuid,p_actor_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_signal mos.signals; v_actor_name text;
begin
  select * into v_signal from mos.signals where id=p_signal_id;
  select full_name into v_actor_name from shared.people where id=p_actor_id;
  if not exists (select 1 from mos.notifications n where n.owner_id=v_signal.author_id
                 and n.metadata->>'source'='signal_retracted' and n.metadata#>>'{entity,id}'=p_signal_id::text) then
    insert into mos.notifications (org_id, owner_id, severity, title, body, metadata)
    values (v_signal.org_id, v_signal.author_id, 'warning', coalesce(v_actor_name,'A lead')||' retracted your Signal', p_reason,
      jsonb_build_object('source','signal_retracted','actor',jsonb_build_object('id',p_actor_id,'name',coalesce(v_actor_name,'A lead')),
        'entity',jsonb_build_object('type','signal','id',p_signal_id,'route','/work/signals?record='||p_signal_id)));
  end if;
end; $$;
comment on function mos._deliver_signal_retracted(uuid,uuid,text) is 'The sole definer delivery path for the author notification emitted by a lead Signal retraction.';
revoke execute on function mos._deliver_signal_retracted(uuid,uuid,text) from public, anon, authenticated;
grant execute on function mos._deliver_signal_retracted(uuid,uuid,text) to authenticated;

create or replace function mos._notify_signal_retracted() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor_name text;
begin
  if new.retracted_at is not null and old.retracted_at is null then
    select full_name into v_actor_name from shared.people where id=shared.current_person_id();
    if not exists (select 1 from mos.notifications n where n.owner_id=new.author_id and n.metadata->>'source'='signal_retracted' and n.metadata#>>'{entity,id}'=new.id::text) then
      insert into mos.notifications (org_id,owner_id,severity,title,body,metadata)
      values (new.org_id,new.author_id,'warning',coalesce(v_actor_name,'A lead')||' retracted your Signal',new.retract_reason,
        jsonb_build_object('source','signal_retracted','actor',jsonb_build_object('id',shared.current_person_id(),'name',coalesce(v_actor_name,'A lead')),
          'entity',jsonb_build_object('type','signal','id',new.id,'route','/work/signals?record='||new.id)));
    end if;
  end if;
  return new;
end; $$;
revoke execute on function mos._notify_signal_retracted() from public, anon, authenticated;
create trigger signals_retracted_notification after update on mos.signals for each row execute function mos._notify_signal_retracted();

-- Re-declare the guard so its retract arm admits the canonical lead predicate, not only the old capability.
create or replace function mos._guard_signals() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_team_org uuid; v_author_org uuid;
begin
  if new.owning_team_id is not null then select t.org_id into v_team_org from shared.teams t where t.id=new.owning_team_id; if v_team_org is distinct from new.org_id then raise exception 'owning_team_id belongs to a different org' using errcode='42501'; end if; end if;
  if new.author_id is not null then select p.org_id into v_author_org from shared.people p where p.id=new.author_id; if v_author_org is distinct from new.org_id then raise exception 'author_id belongs to a different org' using errcode='42501'; end if; end if;
  if tg_op='INSERT' then return new; end if;
  if new.author_id is distinct from old.author_id or new.owning_team_id is distinct from old.owning_team_id or new.source is distinct from old.source or new.org_id is distinct from old.org_id or new.created_at is distinct from old.created_at then raise exception 'signal author/owning_team/source/org/created_at are immutable' using errcode='42501'; end if;
  if (new.body is distinct from old.body or new.occurred_at is distinct from old.occurred_at or new.category is distinct from old.category or new.attention is distinct from old.attention) and old.author_id is distinct from shared.current_person_id() then raise exception 'signal content is author-only; signal.retract may only retract' using errcode='42501'; end if;
  if new.retracted_at is distinct from old.retracted_at then
    if not (old.author_id=shared.current_person_id() or shared.can('signal.retract') or mos.is_team_lead(old.owning_team_id)) then raise exception 'retract requires author, Team lead, or signal.retract' using errcode='42501'; end if;
    if new.retracted_at is not null and btrim(coalesce(new.retract_reason,''))='' then raise exception 'retraction requires a reason' using errcode='23514'; end if;
    if new.retracted_at is not null and old.retracted_at is null then
      insert into mos.notifications (org_id,owner_id,severity,title,body,metadata)
      values (old.org_id,old.author_id,'warning','A lead retracted your Signal',new.retract_reason,
        jsonb_build_object('source','signal_retracted','actor',jsonb_build_object('id',shared.current_person_id()),
          'entity',jsonb_build_object('type','signal','id',old.id,'route','/work/signals?record='||old.id)))
      on conflict do nothing;
    end if;
  end if;
  if new.body is distinct from old.body then insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value) values(old.org_id,old.id,shared.current_person_id(),'body',old.body,new.body); new.edited_at:=now(); end if;
  if new.occurred_at is distinct from old.occurred_at then insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value) values(old.org_id,old.id,shared.current_person_id(),'occurred_at',old.occurred_at::text,new.occurred_at::text); new.edited_at:=now(); end if;
  if new.category is distinct from old.category then insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value) values(old.org_id,old.id,shared.current_person_id(),'category',old.category,new.category); new.edited_at:=now(); end if;
  if new.attention is distinct from old.attention then insert into mos.signal_revisions(org_id,signal_id,actor_id,field,old_value,new_value) values(old.org_id,old.id,shared.current_person_id(),'attention',old.attention::text,new.attention::text); new.edited_at:=now(); end if;
  return new;
end; $$;
revoke execute on function mos._guard_signals() from public, anon, authenticated;

drop policy if exists signals_insert on mos.signals;
create policy signals_insert on mos.signals for insert to authenticated with check (org_id=shared.current_org_id() and author_id=shared.current_person_id() and source='human'
  and (shared.can('signal.create') or shared.has_access_role('ops_lead') or shared.has_access_role('supervisor') or shared.has_access_role('manager'))
  and mos.can_post_signal_for_team(owning_team_id));
drop policy if exists signals_update_author on mos.signals;
create policy signals_update_author on mos.signals for update to authenticated
  using (org_id=shared.current_org_id() and (author_id=shared.current_person_id() or shared.can('signal.retract') or mos.is_team_lead(owning_team_id)))
  with check (org_id=shared.current_org_id());

-- DOWN: drop signals_retracted_notification, signals_lead_retract_guard, and the added functions;
-- restore the prior insert/update policies and the prior _guard_signals/can_post_signal_for_team bodies.
