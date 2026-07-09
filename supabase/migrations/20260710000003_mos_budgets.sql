-- Budget capture (ADR-0022 D1/D3/D6) — MOS's core CREATE-verb in Plan. A Budget = a menu item's BOM
-- costed at the LINKED ingredient cost lines -> the certified budgeted COGS, captured as a SCENARIO
-- (baseline / promo / new-branch / menu). One owning BU. Consumers LINK the same Budget row; the
-- per-ingredient unit cost is NEVER copied — it is resolved by joining the linked
-- reporting.ingredient_cost_lines row (anchor A5). The Budget stores its captured total + cost-basis
-- as-of (snapshot-at-capture, reproducible; ADR-0022 OQ-2 resolved at spec) but no per-line unit cost.
--
-- Read-and-budget MVP (D3): MOS reads the ESB BOM + last_hpp and captures on top; it does NOT edit
-- recipes and does NOT write BOMs/prices to ESB.
--
-- Write gate = can('cogs.write') (ADR-0020) — the FIRST non-cascade consumer of a capability beyond
-- objective.manage/workline.manage. Seeded here to finance + admin (Finance owns/captures; admin is
-- the superset). READ = finance/admin (org-scoped) for this slice; consumer broadening (cogs.read for
-- Home/deputy/Marketing) is a future slice.

-- ── cogs.write capability seed (ADR-0020 D4) ──────────────────────────────────
-- Finance (owns the numbers) + admin (superset) may capture/edit budgets. Procurement co-owns
-- ingredient costs (ADR-0022 D6) but has no dedicated access role (ADR-0011 four-role set); it is
-- folded under finance for v1 (the future own_bu scope + a procurement role would refine this).
insert into shared.role_capabilities (role, capability, scope) values
  ('finance', 'cogs.write', 'org'),
  ('admin',   'cogs.write', 'org')
on conflict (role, capability) do nothing;

-- ── mos.budgets ────────────────────────────────────────────────────────────────
create table mos.budgets (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references shared.orgs(id) on delete cascade
                         default shared.current_org_id(),
  menu_item_esb_code   text not null check (btrim(menu_item_esb_code) <> ''),
  menu_item_name       text not null check (btrim(menu_item_name) <> ''),
  scenario_label       text not null check (btrim(scenario_label) <> ''),
  scenario_type        text not null default 'baseline'
                         check (scenario_type in ('baseline','promo','new_branch','menu')),
  owning_bu_id         uuid not null references shared.business_units(id),
  total_budgeted_cogs  numeric(14,4) not null check (total_budgeted_cogs >= 0),
  cost_basis_as_of     timestamptz not null,
  certified_metric_key text not null default 'cogs.budgeted' check (btrim(certified_metric_key) <> ''),
  is_complete          boolean not null default true,
  notes                text,
  archived_at          timestamptz,
  created_by           uuid not null references shared.people(id)
                         default shared.current_person_id(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table mos.budgets is
  'A captured budgeted-COGS scenario over a menu item BOM (ADR-0022 D1). One owning BU. The certified number '
  'pricing/budgeting LINK (never copy). cost_basis_as_of = when the linked cost lines were snapshotted; '
  'total_budgeted_cogs = the captured derived figure (reproducible scenario). is_complete=false when a BOM '
  'ingredient had no linked cost line (never a silent zero). Soft-archive (no hard delete).';
comment on column mos.budgets.certified_metric_key is
  'The blessed metric definition this budget COGS is (default cogs.budgeted). The pricing pre-flight checks '
  'mos.certified_metrics[key].certified -> fail-loud badge if uncertified (anchor A7).';
comment on column mos.budgets.total_budgeted_cogs is
  'The captured derived total (BOM x linked cost lines at capture). Reproducible scenario snapshot (OQ-2). '
  'NOT a copied ingredient unit cost — the per-line cost is always resolved by joining the linked cost line.';
comment on column mos.budgets.is_complete is
  'False when any BOM ingredient lacked a linked cost line at capture -> the total is partial; renders incomplete.';

create index budgets_org_idx              on mos.budgets (org_id);
create index budgets_org_menu_idx         on mos.budgets (org_id, menu_item_esb_code);
create index budgets_owning_bu_idx        on mos.budgets (owning_bu_id);
create index budgets_active_org_idx       on mos.budgets (org_id) where archived_at is null;

create trigger budgets_set_updated_at
  before update on mos.budgets
  for each row execute function shared.set_updated_at();

-- ── mos.budget_lines ───────────────────────────────────────────────────────────
-- The per-ingredient breakdown of a budget. Links the ingredient cost line by ingredient_esb_code
-- (stable natural key; the reporting snapshot table is composite-PK upserted, so no uuid FK). Stores
-- recipe_qty only — NO unit_cost column (anchor A5: link, never copy). The unit cost shown anywhere is
-- resolved by joining reporting.ingredient_cost_lines on ingredient_esb_code.
create table mos.budget_lines (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references shared.orgs(id) on delete cascade
                         default shared.current_org_id(),
  budget_id            uuid not null references mos.budgets(id) on delete cascade,
  ingredient_esb_code  text not null check (btrim(ingredient_esb_code) <> ''),
  recipe_qty           numeric(14,4) not null check (recipe_qty > 0),
  qty_unit             text not null check (btrim(qty_unit) <> ''),
  created_at           timestamptz not null default now()
);

comment on table mos.budget_lines is
  'Per-ingredient breakdown of a budget. Links the ingredient cost line by ingredient_esb_code (NO unit_cost '
  'column — anchor A5 link-never-copy; the cost is resolved by joining reporting.ingredient_cost_lines).';
comment on column mos.budget_lines.ingredient_esb_code is
  'Stable natural key into reporting.ingredient_cost_lines (the linked certified record). Drills to the LIVE '
  'cost line value + as_of, never a copied number.';

create index budget_lines_budget_idx      on mos.budget_lines (budget_id);
create index budget_lines_org_idx         on mos.budget_lines (org_id);
create index budget_lines_ingredient_idx  on mos.budget_lines (org_id, ingredient_esb_code);

-- ── Grants + RLS ───────────────────────────────────────────────────────────────
grant select, insert, update on mos.budgets to authenticated;       -- no delete (soft-archive)
grant select, insert on mos.budget_lines to authenticated;          -- cascade with budget; no update/delete path

alter table mos.budgets enable row level security;
alter table mos.budgets force  row level security;
alter table mos.budget_lines enable row level security;
alter table mos.budget_lines force  row level security;

-- SELECT: finance/admin (org-scoped) — the Plan surfaces are finance/admin-gated this slice.
create policy budgets_select_finance_admin on mos.budgets
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );

create policy budget_lines_select_finance_admin on mos.budget_lines
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );

-- INSERT/UPDATE: can('cogs.write') + org seam. org_id pinned by default; created_by must be the caller.
create policy budgets_insert_cogs_write on mos.budgets
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.can('cogs.write')
    and created_by = shared.current_person_id()
  );

create policy budgets_update_cogs_write on mos.budgets
  for update to authenticated
  using (org_id = shared.current_org_id() and shared.can('cogs.write'))
  with check (org_id = shared.current_org_id() and shared.can('cogs.write'));

create policy budget_lines_insert_cogs_write on mos.budget_lines
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.can('cogs.write')
  );

-- No delete policy on either (soft-archive budgets via archived_at; budget_lines cascade on budget delete,
-- which itself is un-granted — no authenticated delete path).

-- DOWN:
-- drop policy if exists budget_lines_insert_cogs_write on mos.budget_lines;
-- drop policy if exists budgets_update_cogs_write on mos.budgets;
-- drop policy if exists budgets_insert_cogs_write on mos.budgets;
-- drop policy if exists budget_lines_select_finance_admin on mos.budget_lines;
-- drop policy if exists budgets_select_finance_admin on mos.budgets;
-- alter table mos.budget_lines no force row level security;
-- alter table mos.budget_lines disable row level security;
-- alter table mos.budgets no force row level security;
-- alter table mos.budgets disable row level security;
-- revoke select, insert on mos.budget_lines from authenticated;
-- revoke select, insert, update on mos.budgets from authenticated;
-- drop index if exists mos.budget_lines_ingredient_idx;
-- drop index if exists mos.budget_lines_org_idx;
-- drop index if exists mos.budget_lines_budget_idx;
-- drop trigger if exists budgets_set_updated_at on mos.budgets;
-- drop index if exists budgets_active_org_idx;
-- drop index if exists budgets_owning_bu_idx;
-- drop index if exists budgets_org_menu_idx;
-- drop index if exists budgets_org_idx;
-- drop table mos.budget_lines cascade;
-- drop table mos.budgets cascade;
-- delete from shared.role_capabilities where capability = 'cogs.write';
