-- mos — batch 2c of the change-history rollout (#988): the Money slice. The four money tables —
-- mos.budgets, mos.budget_lines, mos.certified_metrics and reporting.supervisor_revenue_scope —
-- write shared.record_history through the one generic trigger; certified_metrics is the composite
-- (org_id, key) table of the change-history spec's DA-1, so its record_key is the ':'-joined
-- 'org:key', not a bare uuid; and the money reads are ROLE-GATED, not org-membership reads — the
-- budget pair and the registry read through the finance/admin tier of their own SELECT policies
-- (spec AC-007's role-gated-arm proof), the scope table through admin-or-own-row. The batch's one
-- hard-DELETE is the scope table (admin-only revocation): its delete row stays readable through
-- the snapshot arm, by exactly those who could read the grant before it was deleted.
--
-- Fixture, on the shared directory tree (org A ...0a1, org B ...0b1): Author ...0d1 holds the
-- finance access role in their claim (the tier that reads budgets and the registry, and the only
-- write path to them — mos.capture_budget behind the cogs.write capability), Peer ...0d4 is the
-- same-org plain member the wall stops, GrandMgr ...0d3 is org A's admin, ForeignMgr ...0b4 is
-- org B's admin and the negative control.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

select shared._test_seed_directory();

select has_function('shared', 'can_read_history_record', ARRAY['text','text','text','text','jsonb'],
  'the read dispatch is exposed with the (schema, table, key, action, snapshot) shape');

-- ── Org A (...0a1) money fixture, seeded by hand as a service session (no claims): one certified
-- metric (the registry has no runtime CRUD — service writes carry no actor, FR-005), one budget
-- with one line, the cost line capture_budget's loud-fail check needs, and the org-B controls
-- (one finance-gated budget, one scope grant).
insert into mos.certified_metrics (key, org_id, name, meaning, unit, grain)
values ('cogs.test_metric', '00000000-0000-0000-0000-0000000000a1',
        'History Test Metric', 'A test-only certified definition for the history suite',
        'IDR', 'menu item');

insert into mos.budgets (id, org_id, menu_item_esb_code, menu_item_name, scenario_label,
                         owning_bu_id, total_budgeted_cogs, cost_basis_as_of, created_by)
values ('00000000-0000-0000-0000-000000009961', '00000000-0000-0000-0000-0000000000a1',
        'ESB-HIST', 'Nasi History', 'baseline', '00000000-0000-0000-0000-0000000000a2',
        150000, now(), '00000000-0000-0000-0000-0000000000d1');

insert into mos.budget_lines (id, org_id, budget_id, ingredient_esb_code, recipe_qty, qty_unit)
values ('00000000-0000-0000-0000-000000009962', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009961', 'ING-HIST', 0.5, 'kg');

insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of)
values ('00000000-0000-0000-0000-0000000000a1', 'ING-HIST', 'History Ingredient', 40000, 'kg', now());

insert into mos.budgets (id, org_id, menu_item_esb_code, menu_item_name, scenario_label,
                         owning_bu_id, total_budgeted_cogs, cost_basis_as_of, created_by)
values ('00000000-0000-0000-0000-000000009963', '00000000-0000-0000-0000-0000000000b1',
        'ESB-FOREIGN', 'Foreign Menu', 'baseline', '00000000-0000-0000-0000-0000000000b2',
        1000, now(), '00000000-0000-0000-0000-0000000000b4');

insert into reporting.supervisor_revenue_scope (id, org_id, person_id, channel, branch_code)
values ('00000000-0000-0000-0000-000000009966', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000b4', 'B2B', 'BR-HIST');

-- ── an INSERT appends exactly one summary row, on each of the four ────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'certified_metrics'
             and record_key = '00000000-0000-0000-0000-0000000000a1:cogs.test_metric'),
  1, 'an INSERT into mos.certified_metrics appends exactly one history row, keyed org:key (DA-1)');

-- The registry has no runtime CRUD and holds no UPDATE grant for any application role: a
-- revision is a service/migration write. It is audited all the same — actor NULL (FR-005).
reset role;
set local request.jwt.claims = '';
update mos.certified_metrics set meaning = 'A test-only certified definition, revised'
 where org_id = '00000000-0000-0000-0000-0000000000a1' and key = 'cogs.test_metric';
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'certified_metrics'
             and record_key = '00000000-0000-0000-0000-0000000000a1:cogs.test_metric'
             and action = 'update' and field_name = 'meaning'),
  1, 'a certified-metric update appends its meaning row under the composite key');
select is((select actor_person_id is null from shared.record_history
           where schema_name = 'mos' and table_name = 'certified_metrics'
             and record_key = '00000000-0000-0000-0000-0000000000a1:cogs.test_metric'
             and action = 'update'),
  true, 'the service-seeded registry write records no actor (FR-005)');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'budgets'
             and record_key = '00000000-0000-0000-0000-000000009961'),
  1, 'an INSERT into mos.budgets appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'budget_lines'
             and record_key = '00000000-0000-0000-0000-000000009962'),
  1, 'an INSERT into mos.budget_lines appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009961' and action = 'insert'),
  null, 'the service-seeded budget insert carries no actor claim (FR-005)');

-- ── a two-column UPDATE appends exactly two rows, with the old and new values ─────────────────
-- Service writes: `authenticated` deliberately holds no UPDATE grant on the budget pair —
-- capture_budget is the only runtime write path, and it inserts rather than edits.
reset role;
set local request.jwt.claims = '';
update mos.budgets set notes = 'Recosted after price rise', is_complete = false
 where id = '00000000-0000-0000-0000-000000009961';
update mos.budget_lines set recipe_qty = 0.75
 where id = '00000000-0000-0000-0000-000000009962';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009961'),
  3, 'a two-column UPDATE on mos.budgets appends exactly two rows (insert + 2)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009961' and field_name = 'notes'),
  null, 'the notes change records a NULL old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009961' and field_name = 'notes'),
  'Recosted after price rise', 'the notes change records the new value');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009961' and field_name = 'is_complete'),
  'true', 'the is_complete change records the old boolean honestly');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009961' and field_name = 'is_complete'),
  'false', 'the is_complete change records the new boolean');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009961' and field_name = 'updated_at'),
  0, 'the set_updated_at clock writes no history row beside the columns the human changed');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009962'),
  2, 'the recipe_qty change appends exactly one update row (insert + 1)');
select is((select old_value::numeric from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009962' and field_name = 'recipe_qty'),
  0.5::numeric, 'the recipe_qty change records the old value, numeric-cast honestly');
select is((select new_value::numeric from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009962' and field_name = 'recipe_qty'),
  0.75::numeric, 'the recipe_qty change records the new value');

-- ── a no-op write appends nothing ─────────────────────────────────────────────────────────────
reset role;
set local request.jwt.claims = '';
update mos.budgets set notes = 'Recosted after price rise'
 where id = '00000000-0000-0000-0000-000000009961';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009961'),
  3, 'an UPDATE that changes no column appends no row');

-- ── the real write path stamps the session's person claim ─────────────────────────────────────
-- The budget pair's ONLY runtime write is mos.capture_budget (capability cogs.write: finance or
-- admin). The finance persona captures a one-line budget; the RPC's server-recomputed total lands
-- as the budget's one update row, old placeholder zero to the recomputed figure, all rows stamped
-- with the caller's claim.
select mos.capture_budget('ESB-ACT', 'Active Menu Item', 'promo-hist', 'promo',
  '00000000-0000-0000-0000-0000000000a2', now(), 'cogs.budgeted', true, null,
  array[('ING-HIST', 0.5::numeric, 'kg')::mos.budget_line_input]);

select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'budgets'
             and record_key = (select id::text from mos.budgets
                                where menu_item_esb_code = 'ESB-ACT')),
  2, 'capture_budget appends the insert row and the recomputed-total update row');
select is((select actor_person_id::text from shared.record_history
           where record_key = (select id::text from mos.budgets where menu_item_esb_code = 'ESB-ACT')
             and action = 'insert'),
  '00000000-0000-0000-0000-0000000000d1',
  'the finance caller''s capture stamps their person claim as actor on the budget');
select is((select old_value::numeric from shared.record_history
           where record_key = (select id::text from mos.budgets where menu_item_esb_code = 'ESB-ACT')
             and field_name = 'total_budgeted_cogs'),
  0::numeric, 'the recomputed total records the placeholder zero as its old value');
select is((select new_value::numeric from shared.record_history
           where record_key = (select id::text from mos.budgets where menu_item_esb_code = 'ESB-ACT')
             and field_name = 'total_budgeted_cogs'),
  20000::numeric, 'and the server-recomputed total as its new value');
select is((select actor_person_id::text from shared.record_history
           where schema_name = 'mos' and table_name = 'budget_lines'
             and record_key = (select bl.id::text from mos.budget_lines bl
                               join mos.budgets b on b.id = bl.budget_id
                               where b.menu_item_esb_code = 'ESB-ACT')),
  '00000000-0000-0000-0000-0000000000d1', 'the captured line row carries the same caller claim');

-- ── AC-007: the money reads are role-gated — history is readable exactly by ───────────────────
-- those who could read the record. Peer ...0d4 is same-org but a plain member: below the
-- finance/admin tier of the budget pair's SELECT policy, no scope grant names them.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'budgets'
             and record_key = '00000000-0000-0000-0000-000000009961'),
  0, 'AC-007: a same-org plain member — below the finance tier — reads none of the budget''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'budget_lines'
             and record_key = '00000000-0000-0000-0000-000000009962'),
  0, 'AC-007: the finance wall extends to the line''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'certified_metrics'),
  0, 'AC-007: the finance wall extends to the certified-metric registry''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'reporting' and table_name = 'supervisor_revenue_scope'),
  0, 'AC-007: a non-admin no grant names reads none of the scope history');

-- GrandMgr ...0d3: the admin tier reads what finance reads.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'budgets'
             and record_key = '00000000-0000-0000-0000-000000009961'),
  3, 'AC-007: an admin reads the budget''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'certified_metrics'
             and record_key = '00000000-0000-0000-0000-0000000000a1:cogs.test_metric'),
  2, 'AC-007: an admin reads the certified metric''s insert + revision rows through the composite-key arm');

-- ── the scope grant: the admin's INSERT through the real write path stamps the claim ─────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
insert into reporting.supervisor_revenue_scope (id, org_id, person_id, channel, branch_code)
values ('00000000-0000-0000-0000-000000009965', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d4', 'POS', null);

select is((select count(*)::int from shared.record_history
           where schema_name = 'reporting' and table_name = 'supervisor_revenue_scope'
             and record_key = '00000000-0000-0000-0000-000000009965'),
  1, 'the admin''s grant INSERT appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965' and action = 'insert'),
  '00000000-0000-0000-0000-0000000000d3', 'the admin''s grant stamps their person claim as actor');

-- The grant's own person reads its history (the select policy's self-read arm); a same-org
-- finance non-admin who is not the target reads none of it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  1, 'AC-007: the grant''s own person reads its insert row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  0, 'AC-007: finance — not admin, not the target — reads none of the grant''s history');

-- ── the delete arm: the batch's one hard-DELETE, read back through the snapshot ───────────────
-- As the org-A admin, revoke the grant. Exactly one action='delete' row — NULL field/old/new,
-- whole-row snapshot — and it stays readable afterwards by exactly those who could read the grant
-- before deletion: the admin, and the grant's own person; never a same-org non-admin other person.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
delete from reporting.supervisor_revenue_scope
 where id = '00000000-0000-0000-0000-000000009965';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  1, 'after the DELETE the admin reads exactly one history row (the delete row; the gone insert row is live-looked-up away)');
select is((select action from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  'delete', 'the row is an action=''delete'' row');
select is((select field_name from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  null, 'the delete row carries no field name');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  null, 'the delete row carries no old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  null, 'the delete row carries no new value');
select is((select old_row_snapshot ->> 'person_id' from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  '00000000-0000-0000-0000-0000000000d4', 'the delete row''s snapshot carries person_id');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  1, 'the revoked grant''s own person reads its delete row through the snapshot arm');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009965'),
  0, 'a same-org finance non-admin who was not the target reads none of the deleted grant''s history');

-- The org-B control: its admin revokes its own grant and reads the delete row; org A reads
-- none of it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
delete from reporting.supervisor_revenue_scope
 where id = '00000000-0000-0000-0000-000000009966';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009966'),
  1, 'the org-B admin reads exactly their own org''s delete row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009966'),
  0, 'the org-A admin reads none of the org-B grant''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'reporting' and table_name = 'supervisor_revenue_scope'),
  1, 'the scope table''s whole visible history for the org-A admin is exactly their one delete row');

-- ── the org wall on the finance-gated pair ────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009963'),
  0, 'org A''s finance reads none of org B''s budget history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009963'),
  1, 'org B''s admin reads their own budget''s insert row');

-- ── NFR-007: a table without a registered delete arm still fails closed ───────────────────────
-- The budget pair has no DELETE grant to anyone, so it has no snapshot arm; a service delete
-- (the runner's own privilege) is the only way one could exist, and its row must be unreadable.
reset role;
set local request.jwt.claims = '';
delete from mos.budget_lines where id = '00000000-0000-0000-0000-000000009962';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009962'),
  0, 'a hard-deleted budget line''s rows — delete row included — are unreadable while no delete arm is registered (finance)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009962'),
  0, 'the same fail-closed hold for the admin tier');

select * from finish();
rollback;
