-- #1431 — procurement is a person-granted capability; issue data and actions remain org-scoped.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

select ok((select c.relrowsecurity and c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'ops' and c.relname = 'cafe_receipt_issue_access'),
  'NFR-1001 procurement grants force RLS');
select ok((select c.relrowsecurity and c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'ops' and c.relname = 'cafe_receipt_issue_events'),
  'NFR-1001 issue history forces RLS');
select ok(not has_table_privilege('authenticated', 'ops.cafe_receipt_issue_access', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_receipt_issue_access', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_receipt_issue_access', 'DELETE')
          and not has_table_privilege('authenticated', 'ops.cafe_receipt_issue_events', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_receipt_issue_events', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_receipt_issue_events', 'DELETE'),
  'NFR-1001 capability and history have no browser write grant');
select ok(has_function_privilege('authenticated', 'ops.set_cafe_receipt_issue_access(uuid,boolean)', 'EXECUTE')
          and has_function_privilege('authenticated', 'ops.link_cafe_receipt_issue(uuid,text)', 'EXECUTE')
          and has_function_privilege('authenticated', 'ops.close_cafe_receipt_issue(uuid,text)', 'EXECUTE'),
  'NFR-1001 app writes are available only through guarded RPCs');
select ok((select count(*) = 1 from pg_policies where schemaname = 'ops'
  and tablename = 'cafe_receipt_issues' and policyname = 'cafe_receipt_issues_select_receiver_reviewer_or_procurement'),
  'FR-1040 has one explicit issue-read policy');

-- An admin can grant this capability without changing the recipient's access roles.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is(ops.get_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d5') ->> 'enabled', 'false',
  'FR-1040 a person starts without the separately granted procurement capability');
select is(ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d5', true) ->> 'enabled', 'true',
  'FR-1040 an admin can grant procurement capability to a same-org person');
select ok(not ops.can_manage_cafe_receipt_issues(), 'admin review visibility is not procurement issue-action capability');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select ok(ops.can_manage_cafe_receipt_issues(), 'a member with the capability can manage Receipt issues');
select ok(not shared.has_access_role('admin') and not shared.has_access_role('ops_lead'),
  'the procurement capability does not confer admin or ops-lead roles');
select throws_ok($$select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d4', true)$$,
  '42501', null, 'FR-1040 procurement cannot grant the capability to another person');
select throws_ok($$select ops.link_cafe_receipt_issue('00000000-0000-0000-0000-0000000000ff', 'PO-1')$$,
  '22023', null, 'a procurement holder cannot link an issue outside the organisation');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
select ok(not ops.can_manage_cafe_receipt_issues(), 'a supervisor without the explicit capability cannot act on issues');
select throws_ok($$select ops.close_cafe_receipt_issue('00000000-0000-0000-0000-0000000000ff', 'handled')$$,
  '42501', null, 'a supervisor without the capability cannot close an issue');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is(ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d5', false) ->> 'enabled', 'false',
  'an admin can revoke the capability');
select ok(not exists (select 1 from ops.cafe_receipt_issue_access
  where org_id = shared.current_org_id() and person_id = '00000000-0000-0000-0000-0000000000d5' and revoked_at is null),
  'revoke deactivates the current grant without deleting its history');
reset role;
select is((select count(*)::int from ops.cafe_receipt_issue_access
  where person_id = '00000000-0000-0000-0000-0000000000d5'), 1,
  'grant and revoke provenance remain as one retained grant row');

-- Regranting appends a new grant row. These direct rows model two approved receipts and their
-- issues so the tests can isolate procurement read/link/close behavior from the posting worker.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is(ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d5', true) ->> 'enabled', 'true',
  'an admin can grant procurement access again after revocation');
reset role;
select is((select count(*)::int from ops.cafe_receipt_issue_access
  where person_id = '00000000-0000-0000-0000-0000000000d5'), 2,
  'a regrant appends a distinct access-history row');

insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-0000000000b1', 'B receiver'),
  ('00000000-0000-0000-0000-00000000c202', '00000000-0000-0000-0000-0000000000b1', 'B reviewer');
alter table ops.cafe_receipts disable trigger cafe_receipts_guard;
alter table ops.cafe_receipt_lines disable trigger cafe_receipt_lines_guard;
insert into ops.cafe_receipts (
  id, org_id, branch_id, activity, arrival_date, client_key, received_by, received_at,
  status, submitted_at, reviewed_by, reviewed_at, row_version
) values
  ('00000000-0000-0000-0000-00000000c143', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_date,
   '00000000-0000-0000-0000-00000000c143', '00000000-0000-0000-0000-0000000000d5', now(),
   'Approved', now(), '00000000-0000-0000-0000-0000000000d4', now(), 3),
  ('00000000-0000-0000-0000-00000000c147', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000bf01', 'bar', current_date,
   '00000000-0000-0000-0000-00000000c147', '00000000-0000-0000-0000-0000000000d6', now(),
   'Approved', now(), '00000000-0000-0000-0000-0000000000d4', now(), 3),
  ('00000000-0000-0000-0000-00000000c150', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-00000000bf09', 'kitchen', current_date,
   '00000000-0000-0000-0000-00000000c150', '00000000-0000-0000-0000-00000000c201', now(),
   'Approved', now(), '00000000-0000-0000-0000-00000000c202', now(), 3);
insert into ops.cafe_receipt_lines (
  id, org_id, receipt_id, wip_item_id, item_name, item_category, item_unit_id, unit_name, received_quantity
) values
  ('00000000-0000-0000-0000-00000000c144', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c143', '00000000-0000-0000-0000-00000000ab01', 'Test rice', 'Mains',
   '00000000-0000-0000-0000-00000000de01', 'porsi', 2),
  ('00000000-0000-0000-0000-00000000c148', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c147', '00000000-0000-0000-0000-00000000ab02', 'Test chicken', 'Mains',
   '00000000-0000-0000-0000-00000000de02', 'porsi', 1),
  ('00000000-0000-0000-0000-00000000c151', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-00000000c150', '00000000-0000-0000-0000-00000000ab09', 'B item', null,
   '00000000-0000-0000-0000-00000000de09', 'porsi', 1);
alter table ops.cafe_receipts enable trigger cafe_receipts_guard;
alter table ops.cafe_receipt_lines enable trigger cafe_receipt_lines_guard;
insert into ops.cafe_receipt_issues (id, org_id, receipt_id, line_id, item_unit_id, kind, quantity) values
  ('00000000-0000-0000-0000-00000000c145', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c143', '00000000-0000-0000-0000-00000000c144',
   '00000000-0000-0000-0000-00000000de01', 'over', 1),
  ('00000000-0000-0000-0000-00000000c146', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c143', '00000000-0000-0000-0000-00000000c144',
   '00000000-0000-0000-0000-00000000de01', 'no_po', 3),
  ('00000000-0000-0000-0000-00000000c149', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c147', '00000000-0000-0000-0000-00000000c148',
   '00000000-0000-0000-0000-00000000de02', 'no_po', 1),
  ('00000000-0000-0000-0000-00000000c152', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-00000000c150', '00000000-0000-0000-0000-00000000c151',
   '00000000-0000-0000-0000-00000000de09', 'no_po', 1);
insert into ops.cafe_receipt_matches (org_id, receipt_id, cache_as_of) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c143', now()),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c147', now()),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000c150', now());
insert into ops.cafe_open_po_branches (org_id, branch_id, as_of, is_stale)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), false);
insert into ops.cafe_open_pos (id, org_id, branch_id, po_number, supplier_name, po_date, esb_created_at, esb_status)
values
  ('00000000-0000-0000-0000-00000000c153', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000bf01', 'PO-CURRENT', 'Current supplier', current_date, now(), 'Authorized'),
  ('00000000-0000-0000-0000-00000000c154', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000bf01', 'PO-FUTURE', 'Future supplier', current_date + 1, now(), 'Authorized');
insert into ops.cafe_open_po_lines (org_id, po_id, item_unit_id, item_name, unit_name, outstanding_quantity)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c153',
   '00000000-0000-0000-0000-00000000de01', 'Test rice', 'porsi', 3),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c154',
   '00000000-0000-0000-0000-00000000de01', 'Test rice', 'porsi', 10);
select set_config('app.esb_push_before', (select count(*)::text from integrations.esb_push), true);
select set_config('app.esb_groups_before', (select count(*)::text from integrations.esb_push_groups), true);

-- Procurement sees same-org work across receivers/streams, but not another organisation.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select is((select count(*)::int from ops.cafe_receipt_issues), 3,
  'procurement reads same-org issues across receivers and streams');
select is((select count(*)::int from ops.cafe_receipt_issues where id = '00000000-0000-0000-0000-00000000c152'), 0,
  'procurement cannot read another organisation''s issue');
select ok((ops.cafe_receipt_issue_open_pos('00000000-0000-0000-0000-00000000c145') ->> 'is_current')::boolean
  and ops.cafe_receipt_issue_open_pos('00000000-0000-0000-0000-00000000c145') -> 'options'
    @> '[{"po_number":"PO-CURRENT","date_eligible":true}]'::jsonb
  and ops.cafe_receipt_issue_open_pos('00000000-0000-0000-0000-00000000c145') -> 'options'
    @> '[{"po_number":"PO-FUTURE","date_eligible":false}]'::jsonb,
  'FR-1036 only same-branch exact-unit POs appear and arrival-date eligibility is explicit');
select is(ops.link_cafe_receipt_issue('00000000-0000-0000-0000-00000000c145', 'PO-CURRENT') ->> 'status', 'linked',
  'FR-1036 procurement links an issue to a current eligible PO');
select ok((select status = 'linked' and linked_po_number = 'PO-CURRENT' and resolved_by = '00000000-0000-0000-0000-0000000000d5'
                  and linked_po_date = current_date and linked_po_created_at is not null and resolved_at is not null
             from ops.cafe_receipt_issues where id = '00000000-0000-0000-0000-00000000c145')
  and (select state = 'held' and hold_reason = 'issue_linked' and push_id is null and quantity = 1
         from ops.cafe_receipt_portions where receipt_id = '00000000-0000-0000-0000-00000000c143'),
  'FR-1036 linking snapshots the PO and records exactly one held matched portion');
select ok((select action = 'linked' and actor_id = '00000000-0000-0000-0000-0000000000d5'
                  and po_number = 'PO-CURRENT' and po_date = current_date and po_created_at is not null
             from ops.cafe_receipt_issue_events where issue_id = '00000000-0000-0000-0000-00000000c145'),
  'FR-1037 link history is append-only and attributes the actor and PO snapshot');
reset role;
select is((select count(*)::int from integrations.esb_push), current_setting('app.esb_push_before')::int,
  'FR-1036 procurement linking does not write an ESB outbox row');
select is((select count(*)::int from integrations.esb_push_groups), current_setting('app.esb_groups_before')::int,
  'FR-1036 procurement linking does not write an ESB push group');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select throws_ok($$select ops.link_cafe_receipt_issue('00000000-0000-0000-0000-00000000c145', 'PO-CURRENT')$$,
  '22023', null, 'a linked issue cannot be linked a second time');
select ok(exists (select 1 from ops.cafe_receipt_issues i
  join ops.cafe_receipts r on r.org_id = i.org_id and r.id = i.receipt_id
  where i.id = '00000000-0000-0000-0000-00000000c149' and r.received_by = '00000000-0000-0000-0000-0000000000d6'),
  'a procurement holder can inspect another receiver''s issue');

-- Receivers see their own issue but not another receiver's; this remains read-only.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}';
select is((select count(*)::int from ops.cafe_receipt_issues), 1,
  'a receiver retains read-only access to their own issue');
select is((select count(*)::int from ops.cafe_receipt_issues where id = '00000000-0000-0000-0000-00000000c145'), 0,
  'a receiver cannot read another receiver''s issue');

-- Cache refresh, arrival-date and outstanding checks are repeated at the guarded link boundary.
reset role;
update ops.cafe_open_po_branches set is_stale = true
 where org_id = '00000000-0000-0000-0000-0000000000a1' and branch_id = '00000000-0000-0000-0000-00000000bf01';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select throws_ok($$select ops.link_cafe_receipt_issue('00000000-0000-0000-0000-00000000c146', 'PO-CURRENT')$$,
  '22023', null, 'FR-1036 linking refuses a stale cache');
select ok(ops.request_cafe_receipt_issue_po_refresh('00000000-0000-0000-0000-00000000c146') ->> 'requested_at' is not null,
  'FR-1033 procurement can request a worker-owned cache refresh without contacting ESB');
reset role;
update ops.cafe_open_po_branches set is_stale = false, as_of = now()
 where org_id = '00000000-0000-0000-0000-0000000000a1' and branch_id = '00000000-0000-0000-0000-00000000bf01';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select throws_ok($$select ops.link_cafe_receipt_issue('00000000-0000-0000-0000-00000000c146', 'PO-FUTURE')$$,
  '22023', null, 'FR-1036 linking refuses a PO dated after arrival');
select throws_ok($$select ops.link_cafe_receipt_issue('00000000-0000-0000-0000-00000000c146', 'PO-CURRENT')$$,
  '22023', null, 'FR-1036 linking refuses a PO whose remaining outstanding is too small');
select throws_ok($$select ops.close_cafe_receipt_issue('00000000-0000-0000-0000-00000000c149', '   ')$$,
  '22023', null, 'FR-1037 closing requires a nonblank note');
select is(ops.close_cafe_receipt_issue('00000000-0000-0000-0000-00000000c149', '  resolved through supplier credit  ') ->> 'status', 'closed',
  'FR-1037 procurement closes an issue with a note');
select ok((select status = 'closed' and closed_note = 'resolved through supplier credit'
                  and resolved_by = '00000000-0000-0000-0000-0000000000d5' and resolved_at is not null
             from ops.cafe_receipt_issues where id = '00000000-0000-0000-0000-00000000c149')
  and (select action = 'closed' and note = 'resolved through supplier credit'
              and actor_id = '00000000-0000-0000-0000-0000000000d5'
         from ops.cafe_receipt_issue_events where issue_id = '00000000-0000-0000-0000-00000000c149'),
  'FR-1037 close note and actor are retained in issue and append-only history');

reset role;
select * from finish();
rollback;
