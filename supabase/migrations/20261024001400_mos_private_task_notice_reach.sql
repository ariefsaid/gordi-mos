-- DOWN: run supabase/rollbacks/20261024001400_mos_private_task_notice_reach.sql
-- Private Task (#1839): Task notices reach, and stay with, only people who can read the Task.

-- ── Mention notices: recipients are filtered by the read rule ────────────────────────────────
-- Same function as 20261024000100, with one more recipient condition. The 50-person cap counts
-- the people left after that filter. A write with no person session cannot answer the read rule
-- for a private Task, so such a write notifies nobody about it.
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
     and (not new.is_private or mos.person_can_read_task(r.pid, new.id))
     and not exists (
       select 1 from mos.notifications n
        where n.owner_id = r.pid
          and n.metadata ->> 'source' = 'task_mention'
          and n.metadata #>> '{entity,id}' = new.id::text);

  -- Same cap as Signal mention fan-out: one save may notify at most 50 people.
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
  'mentioned active Team) who can read the Task, never the author, at most 50 per save. SECURITY DEFINER: the notice lands in another person''s Inbox.';

-- ── Purge: also when the PIC or Supervisor of a private Task changes ─────────────────────────
drop trigger tasks_purge_notices on mos.tasks;
create trigger tasks_purge_notices
  after update of is_private, responsible_person_id, accountable_person_id on mos.tasks
  for each row when (new.is_private and (not old.is_private
                                         or new.responsible_person_id is distinct from old.responsible_person_id
                                         or new.accountable_person_id is distinct from old.accountable_person_id))
  execute function mos._purge_task_notices();
comment on function mos._purge_task_notices() is
  'AFTER trigger: deletes Task notices owned by people who can no longer read the Task (it turned private, its PIC or Supervisor changed, or someone left its who-can-see list).';

-- ── Purge: also when an admin loses the role ─────────────────────────────────────────────────
-- An admin reads every private Task; once the role is revoked, notices about private Tasks they
-- have no other route to are removed. Uses the row's own org, so a revoke without a person
-- session still purges.
create or replace function mos._purge_task_notices_for_ex_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from mos.notifications n
   where n.owner_id = new.person_id
     and n.org_id = new.org_id
     and n.metadata #>> '{entity,type}' = 'task'
     and exists (
       select 1 from mos.tasks t
        where t.id::text = n.metadata #>> '{entity,id}'
          and t.org_id = new.org_id
          and t.is_private
          and t.created_by <> new.person_id
          and t.responsible_person_id <> new.person_id
          and t.accountable_person_id <> new.person_id
          and not exists (select 1 from mos.task_viewers v where v.task_id = t.id and v.person_id = new.person_id));
  return null;
end;
$$;
comment on function mos._purge_task_notices_for_ex_admin() is
  'AFTER trigger on shared.person_access_roles: when admin is revoked, deletes that person''s notices about private Tasks they have no other route to read.';
revoke execute on function mos._purge_task_notices_for_ex_admin() from public, anon, authenticated;
create trigger person_access_roles_purge_task_notices
  after update of revoked_at on shared.person_access_roles
  for each row when (old.access_role = 'admin' and old.revoked_at is null and new.revoked_at is not null)
  execute function mos._purge_task_notices_for_ex_admin();
