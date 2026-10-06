-- supabase/seed.dev-money.sql
-- Captured budget scenarios so /mos/plan/pricing has something to price against.
-- The Money revenue and margin rows come from seed.sample-org-money.sql, which every reset applies.
--
-- LOAD (local ephemeral stack ONLY):
--   docker exec -i supabase_db_gordi-mos psql -U postgres < supabase/seed.dev-money.sql
--
-- Not wired into `supabase db reset` (hand-loaded, like seed.dev-kitchen.sql): the
-- AC-PB-012 budget/pricing e2e journey assumes no captured budgets, and the base
-- seed.sql already provides the small ingredient-cost/BOM set those surfaces are tested
-- against. DEV/LOCAL ONLY. Idempotent (clears this org's Dev scenarios first).

begin;

-- ── LOCAL-DEV GUARD (fail-closed) ────────────────────────────────────────────────
-- This file clears the org's Dev budget scenarios, so
-- it must be able to run ONLY on the local dev stack. The structural marker:
-- seed.dev-auth.sql — applied exclusively by local `supabase db reset` — creates
-- the *.dev@example.test auth accounts, and no other environment can ever hold
-- one. No marker → refuse, inside the transaction, before any delete.
do $$
begin
  if not exists (select 1 from auth.users where email like '%.dev@example.test') then
    raise exception 'seed.dev-money: REFUSING to run — no *.dev@example.test auth account found, '
      'so this is not the local dev stack (marker seeded by seed.dev-auth.sql on `supabase db reset`). '
      'Nothing was deleted.';
  end if;
end $$;

delete from mos.budget_lines where org_id = '10000000-0000-0000-0000-000000000001' and budget_id in (select id from mos.budgets where org_id='10000000-0000-0000-0000-000000000001' and scenario_label like 'Dev %');
delete from mos.budgets where org_id = '10000000-0000-0000-0000-000000000001' and scenario_label like 'Dev %';

insert into mos.budgets
  (id, org_id, menu_item_esb_code, menu_item_name, scenario_label, scenario_type, owning_bu_id, total_budgeted_cogs, cost_basis_as_of, certified_metric_key, is_complete, created_by, created_at, updated_at)
values
  ('b0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','MENU-CAPPUC','Cappuccino','Dev Baseline','baseline','20000000-0000-0000-0000-000000000014',9000.00,'2026-07-23 06:00:00+00','cogs.budgeted',true,'40000000-0000-0000-0000-000000000000',now(),now()),
  ('b0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','MENU-CROISS','Croissant','Dev Baseline','baseline','20000000-0000-0000-0000-000000000014',4800.00,'2026-07-23 06:00:00+00','cogs.budgeted',true,'40000000-0000-0000-0000-000000000000',now(),now()),
  ('b0000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','MENU-CAPPUC','Cappuccino','Dev Promo (bean +10%)','promo','20000000-0000-0000-0000-000000000014',9576.00,'2026-07-23 06:00:00+00','cogs.budgeted',true,'40000000-0000-0000-0000-000000000000',now(),now());

insert into mos.budget_lines (id, org_id, budget_id, ingredient_esb_code, recipe_qty, qty_unit, created_at)
values
  ('b1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','ING-MILK-FRESH',0.1800,'L',now()),
  ('b1000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','ING-ESPRESSO-BEAN',0.0180,'kg',now()),
  ('b1000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','ING-BUTTER-GK',0.0400,'kg',now()),
  ('b1000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','ING-FLOUR-AP',0.0600,'kg',now()),
  ('b1000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','ING-SUGAR-WHITE',0.0100,'kg',now()),
  ('b1000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','ING-MILK-FRESH',0.1800,'L',now()),
  ('b1000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','ING-ESPRESSO-BEAN',0.0180,'kg',now());

commit;
