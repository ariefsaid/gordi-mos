-- reporting, squashed baseline — the org seam, asserted from the far side.
--
-- Every table here carries money, so the tenancy question is asked once per table rather than once
-- per schema: a finance user in org B holds the widest access role there is and must still read
-- exactly none of org A's figures. The negative is the assertion — a same-org read proving nothing
-- about isolation on its own.
--
-- The seam itself is shared.current_org_id(), which reads an unspoofable JWT claim and returns NULL
-- when there is no session. That NULL is why a claimless request matches nothing rather than
-- everything, and it is asserted at the bottom rather than assumed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select shared._test_seed_directory();     -- org A ...0a1, org B ...0b1
select shared._test_seed_access_roles();

-- Both orgs get a branch, so the org seam on the branch link is exercised alongside the row seam.
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-00000000ba01','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
  ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000b1','b_branch','B Branch');

insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, branch_id, transactions, clean_revenue, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','RRS','Rumah Rames','00000000-0000-0000-0000-00000000ba01',10,1250000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','POS','GKI','RRS','B''s own RRS','00000000-0000-0000-0000-00000000bb01',99,9900000.00,'2026-07-01 04:00:00+07');

insert into reporting.sales_margin_daily
  (org_id, margin_date, esb_code, branch_code, branch_name, branch_id, revenue, cogs_interim_sm, margin_interim, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','RRS','Rumah Rames','00000000-0000-0000-0000-00000000ba01',1250000.00,750000.00,500000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','GKI','RRS','B''s own RRS','00000000-0000-0000-0000-00000000bb01',9900000.00,5900000.00,4000000.00,'2026-07-01 04:00:00+07');

insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1','ING-MILK','Fresh Milk',18000.0000,'L',  now()),
  ('00000000-0000-0000-0000-0000000000b1','ING-MILK','B Milk',       1.0000,'L',  now());

insert into reporting.bom_lines (org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty, qty_unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1','MENU-LATTE','ING-MILK',0.1800,'L',now()),
  ('00000000-0000-0000-0000-0000000000b1','MENU-LATTE','ING-MILK',1.0000,'L',now());

insert into reporting.esb_ar_reduction (org_id, counterparty, period, esb_reduction_amount, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','PT Big Buyer','2026-07',1000000.00,'2026-08-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000b1','PT Big Buyer','2026-07',9000000.00,'2026-08-01 04:00:00+07');

-- The guard on the scope table reads current_org_id(), so claims are set before each seed insert.
-- The session role is still the superuser here, so RLS is bypassed and only the trigger runs.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','POS','RRS');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1"}';
insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','POS','RRS');

set local role authenticated;

-- ── Org B's finance user, holding the widest role there is, reads none of org A ──────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance","admin"]}';
select is((select count(*)::int from reporting.sales_daily_revenue
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'a foreign finance+admin session reads zero of org A''s revenue rows');
select is((select count(*)::int from reporting.sales_margin_daily
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  '...zero of its margin rows');
select is((select count(*)::int from reporting.ingredient_cost_lines
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  '...zero of its ingredient cost lines');
select is((select count(*)::int from reporting.bom_lines
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  '...zero of its recipe lines');
select is((select count(*)::int from reporting.esb_ar_reduction
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  '...zero of its AR-reduction rows');
select is((select count(*)::int from reporting.supervisor_revenue_scope
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  '...and zero of its revenue-scope grants, so a foreign admin cannot even enumerate who holds visibility');

-- It reads its OWN rows, which is what makes the six zeros above mean isolation rather than an
-- empty table or a broken policy.
select is((select count(*)::int from reporting.sales_daily_revenue), 1,
  'the same session reads its own org''s revenue row — so the zeros above are isolation, not a dead policy');

-- ── A supervisor's scope does not reach across the seam either ───────────────────────────────
-- Org B's supervisor is granted POS/RRS, and org A has a POS row whose branch_code is also 'RRS'.
-- The ERP's branch codes are not org-unique, so the scope match alone would admit the foreign row;
-- the org predicate is what refuses it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'a foreign supervisor whose grant names the SAME branch_code still reads zero org-A rows — ERP codes are not org-unique, so the org predicate is what holds');
select is((select count(*)::int from reporting.sales_daily_revenue), 1,
  '...while reading the identically-coded row in their own org');

-- ── No session at all ────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0,
  'a claimless session reads zero revenue — current_org_id() is NULL and NULL matches nothing');
select is((select count(*)::int from reporting.sales_margin_daily), 0,
  '...zero margin');
select is((select count(*)::int from reporting.ingredient_cost_lines)
        + (select count(*)::int from reporting.bom_lines), 0,
  '...zero cost and recipe lines');
select is((select count(*)::int from reporting.supervisor_revenue_scope), 0,
  '...and zero scope grants, so an unauthenticated caller cannot map who is allowed to see money');

reset role;
select * from finish();
rollback;
