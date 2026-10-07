-- reporting.ingredient_usage_daily — the nightly ingredient-usage copy (#1474, filled by #1473).
--
-- OWNS: #1474's access acceptance. Readers are the branch-cost tiers (finance, manager) of the
-- row's own org; every other role reads zero; no end user writes at all; the snapshot writer
-- writes only the org its run declared. Each zero is paired with a positive read on the same rows,
-- so a zero means isolation rather than an empty table.
begin;
create extension if not exists pgtap with schema extensions;

-- Test-only grants, rolled back with this transaction (see reporting_07_writer_org_scope.sql).
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;

select plan(24);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();     -- org A ...0a1, org B ...0b1
select shared._test_seed_access_roles();

insert into reporting.ingredient_usage_daily
  (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, ingredient_name, source_unit,
   unit_basis, source_qty, qty_used, menu_units, recipe_coverage, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-08-03','GKI','RRS','4711','Milk','ML','l',3600,3.6,20,0.9,now()),
  ('00000000-0000-0000-0000-0000000000a1','2026-08-03','GKI','RRS','4712','Beans','GR','kg',540,0.54,30,0.9,now()),
  ('00000000-0000-0000-0000-0000000000b1','2026-08-03','GKI','RRS','4711','B milk','ML','l',100,0.1,1,1,now());

-- ══ The table's posture, from the catalog ═══════════════════════════════════════════════════
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
    where oid = 'reporting.ingredient_usage_daily'::regclass),
  'row-level security is enabled AND forced');
select col_is_pk('reporting','ingredient_usage_daily',
  array['org_id','usage_date','esb_code','branch_code','ingredient_detail_id','source_unit'],
  'the primary key is the snapshot grain, so the nightly upsert re-writes a day instead of adding to it');
select is(
  (select count(*)::int from unnest(array['INSERT','UPDATE','DELETE']) priv
    where has_table_privilege('authenticated','reporting.ingredient_usage_daily', priv)
       or has_table_privilege('anon','reporting.ingredient_usage_daily', priv)),
  0, 'no INSERT, UPDATE or DELETE privilege for any app session');
select ok(not has_table_privilege('anon','reporting.ingredient_usage_daily','SELECT'),
  'anon cannot even select');
select ok(not has_table_privilege('reporting_writer','reporting.ingredient_usage_daily','DELETE'),
  'the snapshot writer upserts and never deletes');

-- ══ Readers: finance and manager of the row's own org ═══════════════════════════════════════
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}');
select is((select count(*)::int from reporting.ingredient_usage_daily), 2,
  'finance reads its own org''s two usage rows — the control the zeros below are measured against');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}');
select is((select count(*)::int from reporting.ingredient_usage_daily), 2,
  'manager reads them too — the same two tiers that read branch margin');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}');
select is((select count(*)::int from reporting.ingredient_usage_daily), 0,
  'a supervisor reads zero — that tier never sees cost, and usage is the cost side');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select is((select count(*)::int from reporting.ingredient_usage_daily), 0,
  'admin reads zero — the users-and-settings role is not a money tier');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","ops_lead"]}');
select is((select count(*)::int from reporting.ingredient_usage_daily), 0,
  'member and ops_lead read zero');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":[]}');
select is((select count(*)::int from reporting.ingredient_usage_daily), 0,
  'a session with no role at all reads zero');

-- ══ The org seam ════════════════════════════════════════════════════════════════════════════
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance","manager"]}');
select is((select count(*)::int from reporting.ingredient_usage_daily), 1,
  'org B finance reads its one row');
select is((select count(*)::int from reporting.ingredient_usage_daily
            where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  '...and never a row of org A, even asking for it by id');

-- ══ No direct write by any end user ═════════════════════════════════════════════════════════
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","manager","admin"]}');
select throws_ok($$
  insert into reporting.ingredient_usage_daily
    (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit, unit_basis,
     source_qty, qty_used, menu_units, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-04','GKI','RRS','4711','ML','l',1,0.001,1,now())
$$, '42501', null, 'finance+manager+admin cannot insert a usage row');
select throws_ok($$ update reporting.ingredient_usage_daily set qty_used = 0 $$, '42501', null,
  '...cannot update one');
select throws_ok($$ delete from reporting.ingredient_usage_daily $$, '42501', null,
  '...and cannot delete one');
reset role;

-- ══ The snapshot writer: only the org its run declared ══════════════════════════════════════
set local role reporting_writer;
select throws_ok($$
  insert into reporting.ingredient_usage_daily
    (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit, unit_basis,
     source_qty, qty_used, menu_units, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-04','GKI','RRS','4711','ML','l',1,0.001,1,now())
$$, '42501', null, 'a run that has declared no org writes nothing');
reset role;

select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000b1', true);
set local role reporting_writer;
select throws_ok($$
  insert into reporting.ingredient_usage_daily
    (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit, unit_basis,
     source_qty, qty_used, menu_units, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-04','GKI','RRS','4711','ML','l',1,0.001,1,now())
$$, '42501', null, 'a run declared for org B cannot write an org A row');
reset role;

select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000a1', true);
set local role reporting_writer;
select lives_ok($$
  update reporting.ingredient_usage_daily set qty_used = 0
   where org_id = '00000000-0000-0000-0000-0000000000b1'
$$, 'an update aimed outside the declared org raises nothing — USING filters');
reset role;
select is((select qty_used from reporting.ingredient_usage_daily
            where org_id = '00000000-0000-0000-0000-0000000000b1'), 0.1::numeric,
  '...and changed nothing');

set local role reporting_writer;
select lives_ok($$
  insert into reporting.ingredient_usage_daily
    (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, ingredient_name, source_unit,
     unit_basis, source_qty, qty_used, menu_units, recipe_coverage, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-03','GKI','RRS','4711','Milk','ML','l',4000,4.0,22,0.95,now())
  on conflict (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit)
  do update set source_qty = excluded.source_qty, qty_used = excluded.qty_used,
                menu_units = excluded.menu_units, recipe_coverage = excluded.recipe_coverage
$$, 'the declared run''s nightly upsert re-writes its own day');
reset role;
select is((select count(*)::int || ':' || max(qty_used)::text from reporting.ingredient_usage_daily
            where org_id = '00000000-0000-0000-0000-0000000000a1' and ingredient_detail_id = '4711'),
  '1:4.000000', '...in place: still one row for the day, now carrying the re-run''s figure');

-- ══ Shape guards ════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  insert into reporting.ingredient_usage_daily
    (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit, unit_basis,
     source_qty, qty_used, menu_units, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-05','GKI','RRS','4711','ML','gallon',1,1,1,now())
$$, '23514', null, 'the unit basis is kg, l or each — nothing else');
select throws_ok($$
  insert into reporting.ingredient_usage_daily
    (org_id, usage_date, esb_code, branch_code, ingredient_detail_id, source_unit, unit_basis,
     source_qty, qty_used, menu_units, recipe_coverage, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-05','GKI','RRS','4711','ML','l',1,1,1,1.5,now())
$$, '23514', null, 'coverage is a share between 0 and 1');

select * from finish();
rollback;
