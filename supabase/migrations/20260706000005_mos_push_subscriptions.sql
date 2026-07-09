-- mos.push_subscriptions — owner-scoped web-push subscription rows (P3a Phase G).
-- Delivery remains inert until VAPID op secrets are configured; this migration only creates the
-- durable caller-JWT/RLS substrate for a browser subscription. NFR-P3-NF-001.

create table mos.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  owner_id    uuid not null references shared.people(id) on delete cascade
                default shared.current_person_id(),
  endpoint    text not null check (btrim(endpoint) <> ''),
  keys        jsonb not null default '{}'::jsonb,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, endpoint)
);

create index mos_push_subscriptions_owner_idx
  on mos.push_subscriptions (owner_id, created_at desc);

alter table mos.push_subscriptions enable row level security;
alter table mos.push_subscriptions force  row level security;

grant select, insert, update, delete on mos.push_subscriptions to authenticated;

create policy push_subscriptions_select on mos.push_subscriptions
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create policy push_subscriptions_insert on mos.push_subscriptions
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create policy push_subscriptions_update on mos.push_subscriptions
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create policy push_subscriptions_delete on mos.push_subscriptions
  for delete to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

create trigger set_push_subscriptions_updated_at
  before update on mos.push_subscriptions
  for each row execute function shared.set_updated_at();

comment on table mos.push_subscriptions is
  'Owner-scoped browser push subscriptions. VAPID keys are op secrets, never stored here.';

-- DOWN (manual, pre-production):
-- drop trigger if exists set_push_subscriptions_updated_at on mos.push_subscriptions;
-- drop policy if exists push_subscriptions_delete on mos.push_subscriptions;
-- drop policy if exists push_subscriptions_update on mos.push_subscriptions;
-- drop policy if exists push_subscriptions_insert on mos.push_subscriptions;
-- drop policy if exists push_subscriptions_select on mos.push_subscriptions;
-- drop index if exists mos.mos_push_subscriptions_owner_idx;
-- drop table if exists mos.push_subscriptions;
