-- Meetings (#1840), part 1: the tables. Access, guards, RPCs, mention notices and history follow in
-- 20261024002100 .. 20261024002900.
--
--   mos.meetings          title, optional date/time, owning Team, optional link to ONE Project/Process
--                         or Objective, Private switch, the minutes (BlockNote block array), and the
--                         series chain (previous_meeting_id; series_id and sequence_number derive).
--   mos.meeting_attendees who is in the meeting; removal is soft (removed_at), never a DELETE.
--   mos.tasks.meeting_id  "Created in meeting".
--
-- DOWN (reverse order of the whole 20261024002xxx set; this file last):
--   drop index mos.tasks_meeting_idx;
--   alter table mos.tasks drop column meeting_id;
--   drop table mos.meeting_attendees;
--   drop table mos.meetings;

create table mos.meetings (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null default shared.current_org_id() references shared.orgs(id) on delete cascade,
  title                text not null check (btrim(title) <> '' and char_length(title) <= 200),
  -- NULL = "Set date and time" (a next meeting whose date nobody has chosen yet).
  starts_at            timestamptz,
  owning_team_id       uuid not null references shared.teams(id),
  -- At most one link: a Project/Process (mos.work_lines) or an Objective.
  work_line_id         uuid references mos.work_lines(id),
  objective_id         uuid references mos.objectives(id),
  is_private           boolean not null default false,
  -- BlockNote block array; same document guards as mos.objectives.write_up.
  minutes              jsonb,
  -- Series: Previous is previous_meeting_id; Next is the meeting naming this one as its previous.
  -- series_id and sequence_number are derived by mos._guard_meetings on insert, never client-set.
  previous_meeting_id  uuid references mos.meetings(id),
  series_id            uuid not null,
  sequence_number      integer not null default 1 check (sequence_number >= 1),
  created_by           uuid not null default shared.current_person_id() references shared.people(id),
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint meetings_org_id_id_uk unique (org_id, id),
  constraint meetings_one_link check (work_line_id is null or objective_id is null),
  constraint meetings_minutes_is_array check (minutes is null or jsonb_typeof(minutes) = 'array'),
  constraint meetings_minutes_size_limit check (minutes is null or pg_column_size(minutes) <= 262144),
  constraint meetings_not_own_previous check (previous_meeting_id is distinct from id)
);
comment on table mos.meetings is
  'A Meeting and its minutes (#1840). Org-readable unless Private, in which case only attendees and admins read it. Attendees, the owning Team and admins edit. Archive is soft.';
comment on column mos.meetings.starts_at is 'NULL until a person sets it ("Set date and time"); Start next meeting leaves it NULL.';
comment on column mos.meetings.minutes is
  'The minutes: one BlockNote document, a top-level JSON array of blocks, shape and size only (256 KB). '
  'Inline nodes: mention {kind person|team, id}, recordLink {kind, id}; blocks taskRow {taskId} and tasksTable store ids only.';
comment on column mos.meetings.previous_meeting_id is 'The meeting this one was started from (Start next meeting). At most one next meeting per meeting.';
create unique index meetings_one_next_uk on mos.meetings (previous_meeting_id) where previous_meeting_id is not null;
create index meetings_org_starts_idx on mos.meetings (org_id, starts_at desc nulls first) where archived_at is null;
create index meetings_team_idx on mos.meetings (org_id, owning_team_id);
create index meetings_work_line_idx on mos.meetings (work_line_id) where work_line_id is not null;
create index meetings_objective_idx on mos.meetings (objective_id) where objective_id is not null;
create index meetings_series_idx on mos.meetings (series_id, sequence_number);
create index meetings_title_trgm_idx on mos.meetings using gin (title gin_trgm_ops);
create trigger meetings_set_updated_at
  before update on mos.meetings
  for each row execute function shared.set_updated_at();

create table mos.meeting_attendees (
  meeting_id  uuid not null,
  person_id   uuid not null,
  org_id      uuid not null default shared.current_org_id() references shared.orgs(id) on delete cascade,
  -- Soft removal: a removed attendee keeps no access; re-adding clears it.
  removed_at  timestamptz,
  added_by    uuid not null default shared.current_person_id() references shared.people(id),
  created_at  timestamptz not null default now(),
  primary key (meeting_id, person_id),
  constraint meeting_attendees_meeting_same_org_fk foreign key (org_id, meeting_id)
    references mos.meetings (org_id, id) on delete cascade,
  constraint meeting_attendees_person_same_org_fk foreign key (org_id, person_id)
    references shared.people (org_id, id) on delete restrict
);
comment on table mos.meeting_attendees is 'People in a Meeting (#1840). Live attendees have removed_at NULL. Read follows the Meeting; add/remove needs edit rights.';
create index meeting_attendees_person_idx on mos.meeting_attendees (person_id) where removed_at is null;

alter table mos.tasks add column meeting_id uuid references mos.meetings(id);
comment on column mos.tasks.meeting_id is '"Created in meeting" (#1840): set when the Task is created from a Meeting, immutable afterwards.';
create index tasks_meeting_idx on mos.tasks (meeting_id) where meeting_id is not null;
