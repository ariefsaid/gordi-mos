-- DOWN for 20261024001400. Restores the mention-notice function of 20261024000100 and the narrower
-- purge trigger of 20261024001200.
begin;
drop trigger person_access_roles_purge_task_notices on shared.person_access_roles;
drop function mos._purge_task_notices_for_ex_admin();
drop trigger tasks_purge_notices on mos.tasks;
create trigger tasks_purge_notices
  after update of is_private on mos.tasks
  for each row when (new.is_private and not old.is_private)
  execute function mos._purge_task_notices();
comment on function mos._purge_task_notices() is
  'AFTER trigger: deletes Task notices owned by people who can no longer read the Task (it turned private, or someone left its who-can-see list).';
create or replace function mos._notify_task_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := shared.current_person_id();
  v_actor_name text;
  v_old        jsonb := case when tg_op = 'UPDATE' then old.body end;
  v_recipients uuid[];
begin
  select p.full_name into v_actor_name
    from shared.people p where p.id = v_actor and p.org_id = new.org_id;

  select coalesce(array_agg(distinct r.pid), '{}') into v_recipients
    from (
      select m.id as pid
        from mos._task_body_mentions(new.body) m
       where m.kind = 'person'
         and not exists (select 1 from mos._task_body_mentions(v_old) o where o.kind = 'person' and o.id = m.id)
      union
      select tmb.person_id
        from mos._task_body_mentions(new.body) m
        join shared.teams tm on tm.id = m.id and tm.org_id = new.org_id and tm.archived_at is null
        join shared.team_memberships tmb on tmb.team_id = tm.id
       where m.kind = 'team'
         and tmb.effective_from <= current_date and (tmb.effective_to is null or tmb.effective_to >= current_date)
         and not exists (select 1 from mos._task_body_mentions(v_old) o where o.kind = 'team' and o.id = m.id)
    ) r
    join shared.people p on p.id = r.pid and p.org_id = new.org_id and p.archived_at is null
   where r.pid is distinct from v_actor
     and not exists (
       select 1 from mos.notifications n
        where n.owner_id = r.pid
          and n.metadata ->> 'source' = 'task_mention'
          and n.metadata #>> '{entity,id}' = new.id::text);

  if cardinality(v_recipients) > 50 then
    raise exception 'mention fan-out exceeds cap of 50 recipients (%)', cardinality(v_recipients)
      using errcode = '22023';
  end if;

  insert into mos.notifications (org_id, owner_id, severity, title, body, metadata)
  select new.org_id, r, 'info', 'You were mentioned in a Task', left(new.title, 200),
         jsonb_build_object('source', 'task_mention',
           'actor', jsonb_build_object('id', v_actor, 'name', v_actor_name),
           'entity', jsonb_build_object('type', 'task', 'id', new.id,
                                        'route', '/work/tasks?record=' || new.id))
    from unnest(v_recipients) r;
  return null;
end;
$$;
comment on function mos._notify_task_mentions() is
  'Once per Task, notifies each person newly mentioned in its document (or the active members of a newly '
  'mentioned active Team), never the author, at most 50 per save. SECURITY DEFINER: the notice lands in another person''s Inbox.';
commit;
