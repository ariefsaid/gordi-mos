-- P4 Kitchen Module — stock projection (ADR-0012, FR-060..062). Stored END-OF-DAY balance per
-- (org, date, item), recomputed by the approval RPC (FR-062). Negative balances preserved (FR-061).
-- The start-of-day cut is a read-time computation (ops.stock_available_for_date). org-readable;
-- write is RPC-only (SECURITY DEFINER) — no direct app INSERT/UPDATE grant beyond what RLS allows
-- (the RPC runs as the approver; a direct member write is denied by the absence of a write policy).
create table ops.kitchen_stock (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  log_date    date not null,
  wip_item_id uuid not null references ops.wip_items(id) on delete cascade,
  usable_qty  numeric(12,2) not null,
  notes       text,
  updated_at  timestamptz not null default now(),
  unique (org_id, log_date, wip_item_id)
);
comment on table ops.kitchen_stock is
  'Stored end-of-day stock projection (FR-060/062). Net of Approved logs. Negative preserved (FR-061). Start-of-day is a read.';

create index kitchen_stock_org_item_idx on ops.kitchen_stock (org_id, wip_item_id, log_date);

create trigger kitchen_stock_set_updated_at
  before update on ops.kitchen_stock
  for each row execute function shared.set_updated_at();

grant select on ops.kitchen_stock to authenticated;
-- NOTE: no insert/update grant to authenticated — only the SECURITY DEFINER RPC writes stock.
-- (service_role / postgres bypass RLS and are used by the RPC's internal writes.)

alter table ops.kitchen_stock enable row level security;
alter table ops.kitchen_stock force row level security;
create policy kitchen_stock_select_org on ops.kitchen_stock
  for select to authenticated using (org_id = shared.current_org_id());

-- DOWN: drop policy kitchen_stock_select_org on ops.kitchen_stock;
--       drop table ops.kitchen_stock cascade;
