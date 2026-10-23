-- Meetings (#1840), part 5: Inbox notices for @mentions in the minutes.
--
-- AFTER INSERT/UPDATE of mos.meetings.minutes, mos._fan_out_meeting_mentions() diffs the mention
-- nodes {kind person|team, id} of the new document against the old one and sends ONE Inbox notice
-- (mos.create_notification, the single cross-owner delivery seam) to each newly mentioned person
-- and to the live members of each newly mentioned Team. Never the author. Never twice for a mention
-- that was already in the document. A Private Meeting notifies only its live attendees, so a
-- mention can never leak the Meeting's existence. Capped at 50 recipients per save. Archived Teams and
-- archived people are skipped.
--
-- A Meeting turning Private removes the mention notices already delivered to people who can no longer
-- read it (not a live attendee, not an admin): their title would otherwise keep the Meeting's name.
--
-- The node may carry its fields directly ({kind, id}) or under props ({props:{kind, id}}), which is
-- how BlockNote stores custom inline content; both are read.
--
-- DOWN: supabase/rollbacks/20261024002400_mos_meetings_mention_notices.sql

create or replace function mos._meeting_mentions(p_minutes jsonb)
returns table (kind text, target_id uuid)
language sql
immutable
set search_path = ''
as $$
  select distinct m.kind,
         case when m.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then m.id::uuid end
    from (
      select coalesce(n #>> '{props,kind}', n ->> 'kind') as kind,
             coalesce(n #>> '{props,id}', n ->> 'id') as id
        from jsonb_path_query(coalesce(p_minutes, '[]'::jsonb), 'lax $.** ? (@.type == "mention")') n
    ) m
   where m.kind in ('person', 'team')
     and m.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
comment on function mos._meeting_mentions(jsonb) is
  'The distinct (kind, id) mention nodes of a minutes document; only person and team kinds with a well-formed uuid.';

create or replace function mos._fan_out_meeting_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me         uuid := shared.current_person_id();
  v_recipients uuid[];
  v_person     uuid;
  v_old        jsonb;
begin
  if new.minutes is null or shared.current_org_id() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_old := old.minutes;
    if new.minutes is not distinct from v_old then
      return new;
    end if;
  end if;

  select array_agg(distinct r.pid) into v_recipients
  from mos._meeting_mentions(new.minutes) nm
  cross join lateral (
    select nm.target_id as pid where nm.kind = 'person'
    union
    select tm.person_id from shared.team_memberships tm
      join shared.teams tt on tt.id = tm.team_id and tt.org_id = new.org_id and tt.archived_at is null
     where nm.kind = 'team' and tm.team_id = nm.target_id and tm.org_id = new.org_id
       and tm.effective_from <= current_date and (tm.effective_to is null or tm.effective_to >= current_date)
  ) r
  join shared.people pp on pp.id = r.pid and pp.org_id = new.org_id and pp.archived_at is null
  where not exists (
      select 1 from mos._meeting_mentions(v_old) om
       where om.kind = nm.kind and om.target_id = nm.target_id)
    and r.pid is distinct from v_me
    and (not new.is_private or exists (
      select 1 from mos.meeting_attendees a
       where a.meeting_id = new.id and a.person_id = r.pid and a.removed_at is null));

  foreach v_person in array coalesce(v_recipients[1:50], '{}'::uuid[]) loop
    perform mos.create_notification(v_person, 'info', 'You were mentioned in meeting minutes', left(new.title, 200),
      jsonb_build_object('source', 'meeting_mention',
        'entity', jsonb_build_object('type', 'meeting', 'id', new.id, 'route', '/work/meetings?record=' || new.id)));
  end loop;
  return new;
end;
$$;
comment on function mos._fan_out_meeting_mentions() is
  'Observer on mos.meetings.minutes: one Inbox notice per newly mentioned person or Team member, never the author, only attendees for a Private Meeting, at most 50. SECURITY DEFINER to read Team memberships and deliver through mos.create_notification.';
revoke execute on function mos._fan_out_meeting_mentions() from public, anon, authenticated;

create trigger meetings_mention_notices
  after insert or update of minutes on mos.meetings
  for each row execute function mos._fan_out_meeting_mentions();

create or replace function mos._purge_meeting_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from mos.notifications n
   where n.org_id = new.org_id
     and n.metadata ->> 'source' = 'meeting_mention'
     and n.metadata #>> '{entity,id}' = new.id::text
     and not exists (
       select 1 from mos.meeting_attendees a
        where a.meeting_id = new.id and a.person_id = n.owner_id and a.removed_at is null)
     and not exists (
       select 1 from shared.person_access_roles r
        where r.person_id = n.owner_id and r.org_id = new.org_id
          and r.access_role = 'admin' and r.revoked_at is null);
  return null;
end;
$$;
comment on function mos._purge_meeting_notices() is
  'AFTER trigger: when a Meeting turns Private, deletes its mention notices owned by people who can no longer read it.';
revoke execute on function mos._purge_meeting_notices() from public, anon, authenticated;
create trigger meetings_purge_notices
  after update of is_private on mos.meetings
  for each row when (new.is_private and not old.is_private)
  execute function mos._purge_meeting_notices();
