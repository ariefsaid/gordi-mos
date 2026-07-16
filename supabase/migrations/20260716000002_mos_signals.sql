-- ADR-0050 D3: the Signal factual record + 5 child tables. No BU/Site columns (derive via owning_team_id).
-- source='human' only in v1 (columns exist, unused). No DELETE grant anywhere (soft-retract).
create table mos.signals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  author_id      uuid not null references shared.people(id) default shared.current_person_id(),
  owning_team_id uuid not null references shared.teams(id),
  occurred_at    timestamptz not null,
  body           text not null check (btrim(body) <> ''),
  attention      text not null default 'FYI' check (attention in ('FYI','Needs attention','Urgent')),
  category       text check (category is null or category in
                   ('Supply/vendor','Equipment/facility','Inventory/availability','Quality','Customer','People','Process','Other')),
  source         text not null default 'human' check (source in ('human','shared_record','rule')),
  source_ref     jsonb not null default '{}'::jsonb,
  retracted_at   timestamptz,
  retract_reason text,
  edited_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index signals_org_idx        on mos.signals (org_id);
create index signals_team_idx       on mos.signals (owning_team_id);
create index signals_occurred_idx   on mos.signals (occurred_at desc);
create index signals_attention_idx  on mos.signals (attention);
create index signals_category_idx   on mos.signals (category);
create index signals_author_idx     on mos.signals (author_id);
create index signals_active_org_idx on mos.signals (org_id) where retracted_at is null;
create trigger signals_set_updated_at before update on mos.signals
  for each row execute function shared.set_updated_at();

create table mos.signal_mentions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  signal_id        uuid not null references mos.signals(id) on delete cascade,
  mention_kind     text not null check (mention_kind in ('person','team','bu')),
  target_person_id uuid references shared.people(id),
  target_team_id   uuid references shared.teams(id),
  target_bu_id     uuid references shared.business_units(id),
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  constraint signal_mentions_one_target check (
    (mention_kind='person' and target_person_id is not null and target_team_id is null and target_bu_id is null) or
    (mention_kind='team'   and target_team_id   is not null and target_person_id is null and target_bu_id is null) or
    (mention_kind='bu'     and target_bu_id     is not null and target_person_id is null and target_team_id is null)
  )
);
create index signal_mentions_signal_idx on mos.signal_mentions (signal_id);
create index signal_mentions_person_idx on mos.signal_mentions (target_person_id);
create index signal_mentions_team_idx   on mos.signal_mentions (target_team_id);
create index signal_mentions_bu_idx     on mos.signal_mentions (target_bu_id);

create table mos.signal_acknowledgements (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  signal_id  uuid not null references mos.signals(id) on delete cascade,
  person_id  uuid not null references shared.people(id) default shared.current_person_id(),
  created_at timestamptz not null default now(),
  unique (signal_id, person_id)
);
create index signal_ack_signal_idx on mos.signal_acknowledgements (signal_id);

create table mos.signal_revisions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  signal_id  uuid not null references mos.signals(id) on delete cascade,
  actor_id   uuid not null references shared.people(id),
  field      text not null check (field in ('body','occurred_at','category','attention')),
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
create index signal_revisions_signal_idx on mos.signal_revisions (signal_id, created_at);

create table mos.signal_tasks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references shared.orgs(id) on delete cascade default shared.current_org_id(),
  signal_id  uuid not null references mos.signals(id) on delete cascade,
  task_id    uuid not null references mos.tasks(id) on delete cascade,
  created_by uuid not null references shared.people(id) default shared.current_person_id(),
  created_at timestamptz not null default now(),
  unique (signal_id, task_id)
);
create index signal_tasks_signal_idx on mos.signal_tasks (signal_id);
create index signal_tasks_task_idx   on mos.signal_tasks (task_id);

-- DOWN (manual): drop table if exists mos.signal_tasks, mos.signal_revisions,
--   mos.signal_acknowledgements, mos.signal_mentions, mos.signals cascade;
