-- P4 Kitchen Module — daily plan (ADR-0012, FR-030..032). Per (org, date, item, action_type)
-- planned qty_porsi; replace/upsert semantics enforced by the unique key. Plan rows are the
-- variance baseline; they never post to ESB. ops_lead/admin write; org-readable.
create table ops.kitchen_plans (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references shared.orgs(id) on delete cascade
                  default shared.current_org_id(),
  log_date      date not null,
  wip_item_id   uuid not null references ops.wip_items(id) on delete cascade,
  action_type   text not null check (action_type in ('Production','Transfer to Bungur','Transfer to Radiant')),
  qty_porsi     numeric(12,2) not null check (qty_porsi >= 0),
  notes         text,
  plan_by       uuid references shared.people(id) on delete set null
                  default shared.current_person_id(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, log_date, wip_item_id, action_type)
);
comment on table ops.kitchen_plans is
  'Daily plan (FR-030). Unique on (org, date, item, action_type) → re-save upserts (FR-031). The variance baseline (FR-032).';

create index kitchen_plans_org_date_idx on ops.kitchen_plans (org_id, log_date);
create index kitchen_plans_org_item_idx  on ops.kitchen_plans (org_id, wip_item_id);

create trigger kitchen_plans_set_updated_at
  before update on ops.kitchen_plans
  for each row execute function shared.set_updated_at();

grant select, insert, update on ops.kitchen_plans to authenticated;

alter table ops.kitchen_plans enable row level security;
alter table ops.kitchen_plans force row level security;
create policy kitchen_plans_select_org on ops.kitchen_plans
  for select to authenticated using (org_id = shared.current_org_id());
create policy kitchen_plans_upsert_ops on ops.kitchen_plans
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
create policy kitchen_plans_update_ops on ops.kitchen_plans
  for update to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')))
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));

-- DOWN: drop policy kitchen_plans_update_ops on ops.kitchen_plans;
--       drop policy kitchen_plans_upsert_ops on ops.kitchen_plans;
--       drop policy kitchen_plans_select_org on ops.kitchen_plans;
--       drop table ops.kitchen_plans cascade;
