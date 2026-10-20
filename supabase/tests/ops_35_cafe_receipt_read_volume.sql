-- Receipt reads preserve receiver, reviewer, procurement and tenant visibility at volume.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
set local statement_timeout = 0;
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

-- Non-primary live membership also confers review authority.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4', id, false, current_date - 1
from shared.teams where code = 'gordi_hq_kitchen' and org_id = '00000000-0000-0000-0000-0000000000a1';
insert into ops.cafe_receipt_issue_access (org_id, person_id, granted_by)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d3');

-- Historical snapshots isolate read policies from capture and posting workflows.
alter table ops.cafe_receipts disable trigger user;
alter table ops.cafe_receipt_lines disable trigger user;
alter table ops.cafe_receipt_issues disable trigger user;
alter table ops.cafe_receipt_portions disable trigger user;
insert into ops.cafe_receipts (org_id, branch_id, activity, arrival_date, client_key, status, received_by, submitted_at, reviewed_by, reviewed_at)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_date, gen_random_uuid(), 'Approved',
 '00000000-0000-0000-0000-0000000000d5', now(), '00000000-0000-0000-0000-0000000000d4', now()
from generate_series(1, 1200);
insert into ops.cafe_receipts (org_id, branch_id, activity, arrival_date, client_key, status, received_by, submitted_at, reviewed_by, reviewed_at)
values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf02','kitchen',current_date,gen_random_uuid(),'Approved','00000000-0000-0000-0000-0000000000d7',now(),'00000000-0000-0000-0000-0000000000d2',now()),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','kitchen',current_date,gen_random_uuid(),'Submitted','00000000-0000-0000-0000-0000000000d5',now(),null,null),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','kitchen',current_date,gen_random_uuid(),'Counted','00000000-0000-0000-0000-0000000000d5',null,null,null),
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bf09','kitchen',current_date,gen_random_uuid(),'Approved','00000000-0000-0000-0000-0000000000b4',now(),'00000000-0000-0000-0000-0000000000d2',now());
insert into ops.cafe_receipt_lines (org_id, receipt_id, wip_item_id, item_unit_id, item_name, unit_name, received_quantity)
select r.org_id, r.id, u.wip_item_id, u.id, 'Synthetic ingredient', 'kg', 1
from ops.cafe_receipts r cross join lateral (select id, wip_item_id from ops.item_units limit 1) u;
insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity)
select l.org_id,l.receipt_id,l.id,l.item_unit_id,'no_po',1 from ops.cafe_receipt_lines l join ops.cafe_receipts r on r.id=l.receipt_id where r.status='Approved';
insert into ops.cafe_receipt_portions (org_id, receipt_id, line_id, item_unit_id, quantity, state, hold_reason)
select l.org_id,l.receipt_id,l.id,l.item_unit_id,1,'held','posting_off' from ops.cafe_receipt_lines l join ops.cafe_receipts r on r.id=l.receipt_id where r.status='Approved';
alter table ops.cafe_receipts enable trigger user;
alter table ops.cafe_receipt_lines enable trigger user;
alter table ops.cafe_receipt_issues enable trigger user;
alter table ops.cafe_receipt_portions enable trigger user;
analyze ops.cafe_receipts;
analyze ops.cafe_receipt_issues;

-- These fixed expectations are the pre-change access matrix, not results derived from the new helper.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select count(*)::int from ops.cafe_receipts),1202,'reviewer reads only their stream receipts');
select is((select count(*)::int from ops.cafe_receipt_lines),1202,'reviewer reads only their stream lines');
select is((select count(*)::int from ops.cafe_receipt_issues),1200,'reviewer reads only their stream issues');
select is((select count(*)::int from ops.cafe_receipt_portions),1200,'reviewer reads only their stream portions');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipts),1202,'receiver reads own receipts only');
select is((select count(*)::int from ops.cafe_receipt_lines),1202,'receiver reads own lines only');
select is((select count(*)::int from ops.cafe_receipt_issues),1200,'receiver reads own issues only');
select is((select count(*)::int from ops.cafe_receipt_portions),0,'receiver cannot read matched portions');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipts),1201,'procurement reads Approved receipts only');
select is((select count(*)::int from ops.cafe_receipt_lines),1201,'procurement reads Approved lines only');
select is((select count(*)::int from ops.cafe_receipt_issues),1201,'procurement reads org issues');
select is((select count(*)::int from ops.cafe_receipt_portions),1201,'procurement reads org portions');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_receipts),1,'other org admin reads only their org receipt');
select is((select count(*)::int from ops.cafe_receipt_lines),1,'other org admin reads only their org line');
select is((select count(*)::int from ops.cafe_receipt_issues),1,'other org admin reads only their org issue');
select is((select count(*)::int from ops.cafe_receipt_portions),1,'other org admin reads only their org portion');
-- Both user reads must finish well below the former per-row cost at 1,200 Approved receipts.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
set local statement_timeout = '500ms';
select lives_ok('select count(*) from ops.cafe_receipt_issues where status = ''open''','supervisor issue count finishes under 500ms');
select lives_ok('select id from ops.cafe_receipts where status = ''Approved'' order by received_at desc','supervisor receipt list finishes under 500ms');
set local statement_timeout = 0;
select * from finish();
rollback;
