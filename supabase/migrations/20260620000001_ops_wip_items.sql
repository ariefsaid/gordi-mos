-- P4 Kitchen Module — master data (ADR-0012, FR-010). Active-flagged kitchen products with their
-- ESB identity (the BOM/product-detail IDs the worker composes the assembly-actual body from).
-- org-readable; write restricted to ops_lead/admin (RLS). No DELETE grant (NFR-002).
create table ops.wip_items (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null references shared.orgs(id) on delete cascade
                                  default shared.current_org_id(),
  name                          text not null check (btrim(name) <> ''),
  category                      text,
  flag_active                   boolean not null default true,
  esb_bom_id                    text,
  esb_product_detail_id_porsi   text,
  esb_product_id                text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
comment on table ops.wip_items is
  'Kitchen master data (FR-010). Active-flagged products carrying the ESB identity the worker uses to compose the assembly-actual body.';

create index wip_items_org_active_idx on ops.wip_items (org_id, name) where flag_active;
create index wip_items_org_idx        on ops.wip_items (org_id);

create trigger wip_items_set_updated_at
  before update on ops.wip_items
  for each row execute function shared.set_updated_at();

-- Base privileges. SELECT to authenticated (RLS filters to own org); INSERT/UPDATE to authenticated
-- (RLS restricts write to ops_lead/admin). NO DELETE grant (NFR-002/FR-095).
grant select, insert, update on ops.wip_items to authenticated;

alter table ops.wip_items enable row level security;
alter table ops.wip_items force row level security;

-- Org-readable: any member sees active items to log against (FR-011).
create policy wip_items_select_org on ops.wip_items
  for select to authenticated
  using (org_id = shared.current_org_id());

-- Master data write is ops_lead/admin only (FR-010, AC-006).
create policy wip_items_insert_ops on ops.wip_items
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
create policy wip_items_update_ops on ops.wip_items
  for update to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')))
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));

-- DOWN: drop policy wip_items_update_ops on ops.wip_items;
--       drop policy wip_items_insert_ops on ops.wip_items;
--       drop policy wip_items_select_org on ops.wip_items;
--       drop table ops.wip_items cascade;
