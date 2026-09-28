-- Café stream item lists (#222): which items a (branch, activity) stream offers for new MOS
-- capture and planning, who may change a list, and that history outlives a list change.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

-- Rows a DELETE removed. RLS turns a refused delete into zero rows, not an error.
create function pg_temp.deleted(p_sql text) returns int language plpgsql as $f$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$f$;

-- Two items of this suite's own, so the fixture's offer-everything lists never answer for them.
-- c801 is offered at HQ Bar only; c802 is on no list.
insert into ops.wip_items (id, org_id, name, flag_active) values
  ('00000000-0000-0000-0000-00000000c801','00000000-0000-0000-0000-0000000000a1','Stream Item',true),
  ('00000000-0000-0000-0000-00000000c802','00000000-0000-0000-0000-0000000000a1','Unlisted Item',true);
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','bar','00000000-0000-0000-0000-00000000c801','esb');
-- The capturing member's Café affiliation: home Team HQ Bar.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4', t.id, true
from shared.teams t where t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'gordi_hq_bar';

select cmp_ok((select count(*)::int from ops.stream_items where org_id = '00000000-0000-0000-0000-0000000000b1'), '>', 0,
  'precondition: the other org has stream item rows for RLS to hide');

-- ═══ A. A member reads, captures on the listed stream only, and cannot change a list ══════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';

select is((select count(*)::int from ops.stream_items where wip_item_id = '00000000-0000-0000-0000-00000000c801'), 1,
  'RLS: a member reads their org''s stream item list');
select is((select count(*)::int from ops.stream_items where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'RLS: a member reads no other org''s stream item list');
select throws_ok($$insert into ops.stream_items (branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-00000000bf01','kitchen','00000000-0000-0000-0000-00000000c801','manual')$$,
  '42501', null, 'RLS: a member cannot add an item to a stream');
select is(pg_temp.deleted('delete from ops.stream_items where wip_item_id = ''00000000-0000-0000-0000-00000000c801'''), 0,
  'RLS: a member''s delete of a stream item removes nothing');

select lives_ok($$insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000c811','00000000-0000-0000-0000-00000000bb01','2026-09-24','00000000-0000-0000-0000-00000000bf01','bar','produce','00000000-0000-0000-0000-00000000c801',1)$$,
  'capture: an item on HQ Bar''s list can be logged at HQ Bar');
select throws_ok($$insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-24','00000000-0000-0000-0000-00000000bf01','kitchen','produce','00000000-0000-0000-0000-00000000c801',1)$$,
  'P0012', 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list',
  'capture: the same item is refused at HQ Kitchen, whose list does not offer it');
select throws_ok($$insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-24','00000000-0000-0000-0000-00000000bf01','bar','produce','00000000-0000-0000-0000-00000000c802',1)$$,
  'P0012', 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list',
  'capture: an item on no list is refused');

-- ═══ B. Supervisor and finance cannot change a list either ═════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","supervisor"]}';
select throws_ok($$insert into ops.stream_items (branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-00000000bf01','kitchen','00000000-0000-0000-0000-00000000c801','manual')$$,
  '42501', null, 'RLS: a supervisor cannot add an item to a stream');
select is(pg_temp.deleted('delete from ops.stream_items where wip_item_id = ''00000000-0000-0000-0000-00000000c801'''), 0,
  'RLS: a supervisor''s delete of a stream item removes nothing');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select throws_ok($$insert into ops.stream_items (branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-00000000bf01','kitchen','00000000-0000-0000-0000-00000000c801','manual')$$,
  '42501', null, 'RLS: finance cannot add an item to a stream');

-- ═══ C. An ops lead maps one item into a second stream: one identity, two streams ═════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$insert into ops.stream_items (branch_id, activity, wip_item_id, source, created_by) values
  ('00000000-0000-0000-0000-00000000bf01','kitchen','00000000-0000-0000-0000-00000000c801','manual','00000000-0000-0000-0000-0000000000d1')$$,
  'an ops lead adds the HQ Bar item to HQ Kitchen''s list too');
select is((select created_by from ops.stream_items where wip_item_id = '00000000-0000-0000-0000-00000000c801' and activity = 'kitchen'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'provenance: created_by is the session person, whatever the caller sent');
select throws_ok($$insert into ops.stream_items (branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-00000000bf02','kitchen','00000000-0000-0000-0000-00000000c801','esb')$$,
  '42501', null, 'provenance: a person cannot claim an ERP-sourced row');
select throws_ok($$insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bf09','kitchen','00000000-0000-0000-0000-00000000ab09','manual')$$,
  'P0010', 'CAFE_STREAM_ITEM_ORG_MISMATCH: the item belongs to another org',
  'cross-org: an ops lead cannot write another org''s stream item list');
select is(pg_temp.deleted('delete from ops.stream_items where org_id = ''00000000-0000-0000-0000-0000000000b1'''), 0,
  'cross-org: an ops lead''s delete reaches no other org''s row');

reset role;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
set local role authenticated;
select lives_ok($$insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000c812','00000000-0000-0000-0000-00000000bb01','2026-09-24','00000000-0000-0000-0000-00000000bf01','kitchen','produce','00000000-0000-0000-0000-00000000c801',2)$$,
  'shared item: now logged at HQ Kitchen as well');
select is((select count(distinct activity)::int from ops.kitchen_logs where wip_item_id = '00000000-0000-0000-0000-00000000c801'), 2,
  'shared item: rows in both streams');
select is((select count(*)::int from ops.wip_items where name = 'Stream Item'), 1,
  'shared item: both streams reference the ONE item row');

-- ═══ D. Plans follow the same list ═══════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$insert into ops.kitchen_plans (id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000c821','2026-09-24','00000000-0000-0000-0000-00000000bf01','kitchen','produce','00000000-0000-0000-0000-00000000c801',3)$$,
  'plan: a listed item can be planned');
select throws_ok($$insert into ops.kitchen_plans (log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('2026-09-24','00000000-0000-0000-0000-00000000bf01','bar','produce','00000000-0000-0000-0000-00000000c802',1)$$,
  'P0012', 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list',
  'plan: an unlisted item cannot be planned');
select throws_ok($$update ops.kitchen_plans set wip_item_id = '00000000-0000-0000-0000-00000000c802'
  where id = '00000000-0000-0000-0000-00000000c821'$$,
  'P0012', 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list',
  'plan: re-pointing a plan to an unlisted item is refused');
select throws_ok($$update ops.kitchen_plans set branch_id = '00000000-0000-0000-0000-00000000bf02'
  where id = '00000000-0000-0000-0000-00000000c821'$$,
  'P0012', 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list',
  'plan: moving a plan to a stream that does not list its item is refused');

-- ═══ E. An item leaves a list: its history stays readable, reviewable and editable ═══════════
select is(pg_temp.deleted('delete from ops.stream_items where wip_item_id = ''00000000-0000-0000-0000-00000000c801'' and activity = ''kitchen'''), 1,
  'an ops lead removes the item from HQ Kitchen''s list');
select lives_ok($$update ops.kitchen_plans set qty_porsi = 5 where id = '00000000-0000-0000-0000-00000000c821'$$,
  'history: the plan for an item no longer listed keeps an editable quantity');
select is((select qty_porsi from ops.kitchen_plans where id = '00000000-0000-0000-0000-00000000c821'), 5::numeric,
  'history: the edited quantity landed');
select lives_ok($$update ops.kitchen_logs set status = 'Rejected', review_note = 'Counted twice'
  where id = '00000000-0000-0000-0000-00000000c812'$$,
  'history: the log for an item no longer listed can still be reviewed');
select is((select status from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c812'), 'Rejected',
  'history: the review landed');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c812'), 1,
  'history: a member still reads the log');

-- ═══ F. Paths the list does not govern, and the list's own integrity ═════════════════════════
reset role;
-- Re-pointing a log is otherwise possible only on a decided row and only for a privileged writer;
-- the list still holds there.
select throws_ok($$update ops.kitchen_logs set wip_item_id = '00000000-0000-0000-0000-00000000c802'
  where id = '00000000-0000-0000-0000-00000000c812'$$,
  'P0012', 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list',
  'log: re-pointing a log to an unlisted item is refused');
select lives_ok($$insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, status, source)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-01','00000000-0000-0000-0000-00000000bf01','bar','produce','00000000-0000-0000-0000-00000000c802',1,'Approved','teable_import')$$,
  'import: an imported log is not held to the list');
select lives_ok($$insert into ops.kitchen_plans (org_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, source)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-01','00000000-0000-0000-0000-00000000bf01','bar','produce','00000000-0000-0000-0000-00000000c802',1,'teable_import')$$,
  'import: an imported plan is not held to the list');
select throws_ok($$insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','bar','00000000-0000-0000-0000-00000000ab09','esb')$$,
  'P0010', 'CAFE_STREAM_ITEM_ORG_MISMATCH: the item belongs to another org',
  'integrity: a list row cannot reference another org''s item');
select throws_ok($$insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf03','event','00000000-0000-0000-0000-00000000c801','esb')$$,
  'P0011', 'CAFE_STREAM_ITEM_NO_LIVE_STREAM: no live stream Team for this branch and activity',
  'integrity: a list row needs a live stream Team');

-- ═══ G. An admin may change a list ═══════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}';
select lives_ok($$insert into ops.stream_items (branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-00000000bf02','kitchen','00000000-0000-0000-0000-00000000c802','manual')$$,
  'an admin adds an item to a stream');
select is(pg_temp.deleted('delete from ops.stream_items where wip_item_id = ''00000000-0000-0000-0000-00000000c802'' and branch_id = ''00000000-0000-0000-0000-00000000bf02'''), 1,
  'an admin removes an item from a stream');

select * from finish();
rollback;
