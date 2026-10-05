begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

-- A normal insert and review share the app-facing write path used by the kitchen screens.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}';
select lives_ok($$
  insert into ops.kitchen_logs
    (id,org_id,business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi,submitted_by,
     batch_id,posted_to_esb,esb_doc_num,posted_at,push_group_id,review_note,reviewed_by,reviewed_at)
  values
    ('00000000-0000-0000-0000-00000000ac40','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-10-05',
     '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
     '00000000-0000-0000-0000-00000000ab01',3,'00000000-0000-0000-0000-0000000000d3',
     'caller-batch',true,'caller-document',now(),'00000000-0000-0000-0000-000000000001',
     'caller review','00000000-0000-0000-0000-0000000000d2',now())
  $$, 'an authorized kitchen-log insert keeps the table-wide write path and stores the submitted facts');
reset role;
select is((select coalesce(batch_id,'∅') || '|' || posted_to_esb::text || '|' ||
                  coalesce(esb_doc_num,'∅') || '|' || coalesce(posted_at::text,'∅') || '|' ||
                  coalesce(push_group_id::text,'∅') || '|' || coalesce(review_note,'∅') || '|' ||
                  coalesce(reviewed_by::text,'∅') || '|' || coalesce(reviewed_at::text,'∅')
             from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac40'),
  '∅|false|∅|∅|∅|∅|∅|∅',
  'inserted review and posting fields retain their database defaults');

-- A direct decision is not the review operation. The RPC binds to the exact row version shown.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select throws_ok($$
  update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ac40'
  $$, '42501', 'approval goes through the review step',
  'a direct status update cannot approve a kitchen log');
select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac40','reviewed',
    (select updated_at - interval '1 second' from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac40'))
  $$, 'P0003', 'review row changed; refresh before approval',
  'approval refuses a row version different from the one the reviewer saw');
select lives_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac40','reviewed',
    (select updated_at from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac40'))
  $$, 'the current row version can be approved through the review RPC');
reset role;
select is((select status || '|' || coalesce(batch_id,'∅') || '|' ||
                  (reviewed_by = '00000000-0000-0000-0000-0000000000d2')::text
             from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac40'),
  'Approved|PR-20261005-001|true', 'the approved row carries its server-minted batch and reviewer');

-- Prepare a reviewer who can approve this stream and a row they submitted themselves.
insert into shared.person_access_roles (org_id,person_id,access_role) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','supervisor')
on conflict do nothing;
insert into shared.team_memberships (org_id,person_id,team_id,is_primary,effective_from)
select '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4',t.id,true,current_date - 1
from shared.teams t where t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'rumah_rames_kitchen'
on conflict do nothing;
insert into ops.kitchen_logs
  (id,business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi,submitted_by)
values
  ('00000000-0000-0000-0000-00000000ac41','00000000-0000-0000-0000-00000000bb01','2026-10-05',
   '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
   '00000000-0000-0000-0000-00000000ab01',2,'00000000-0000-0000-0000-0000000000d4'),
  ('00000000-0000-0000-0000-00000000ac42','00000000-0000-0000-0000-00000000bb01','2026-10-05',
   '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
   '00000000-0000-0000-0000-00000000ab01',2,'00000000-0000-0000-0000-0000000000d2');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac41','reviewed',
    (select updated_at from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac41'))
  $$, '42501', 'approval requires a different reviewer',
  'a stream reviewer cannot approve their own submission');

-- A fallback reviewer can decide their own row when no second reviewer is available.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac42','reviewed',
    (select updated_at from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac42'))
  $$, 'an ops lead can approve their own submission as the review fallback');
reset role;

-- Both terminal outcomes keep their production facts fixed.
insert into ops.kitchen_logs
  (id,business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi,submitted_by,status)
values
  ('00000000-0000-0000-0000-00000000ac43','00000000-0000-0000-0000-00000000bb01','2026-10-06',
   '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
   '00000000-0000-0000-0000-00000000ab01',4,'00000000-0000-0000-0000-0000000000d1','Approved'),
  ('00000000-0000-0000-0000-00000000ac44','00000000-0000-0000-0000-00000000bb01','2026-10-06',
   '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
   '00000000-0000-0000-0000-00000000ab01',4,'00000000-0000-0000-0000-0000000000d1','Rejected');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select throws_ok($$update ops.kitchen_logs set wip_item_id='00000000-0000-0000-0000-00000000ab02' where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', 'reviewed kitchen log facts are immutable', 'an approved item stays fixed');
select throws_ok($$update ops.kitchen_logs set qty_porsi=99 where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', 'reviewed kitchen log facts are immutable', 'an approved quantity stays fixed');
reset role;
select throws_ok($$update ops.kitchen_logs set item_unit_id=null where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', null, 'an approved unit snapshot stays fixed');
set local role authenticated;
reset role;
select throws_ok($$update ops.kitchen_logs set entry_quantity=9 where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', null, 'an approved entered quantity stays fixed');
select throws_ok($$update ops.kitchen_logs set entry_unit_factor=2 where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', null, 'an approved unit factor stays fixed');
select throws_ok($$update ops.kitchen_logs set entry_unit_name='crate' where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', null, 'an approved unit label stays fixed');
set local role authenticated;
select throws_ok($$update ops.kitchen_logs set log_date='2026-10-07' where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', 'reviewed kitchen log facts are immutable', 'an approved date stays fixed');
select throws_ok($$update ops.kitchen_logs set branch_id='00000000-0000-0000-0000-00000000bf01' where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', 'reviewed kitchen log facts are immutable', 'an approved branch stays fixed');
select throws_ok($$update ops.kitchen_logs set activity='bar' where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', 'reviewed kitchen log facts are immutable', 'an approved activity stays fixed');
select throws_ok($$update ops.kitchen_logs set destination_branch_id='00000000-0000-0000-0000-00000000bf01' where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', 'reviewed kitchen log facts are immutable', 'an approved destination stays fixed');
select throws_ok($$update ops.kitchen_logs set action='transfer' where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', 'reviewed kitchen log facts are immutable', 'an approved action stays fixed');
select throws_ok($$update ops.kitchen_logs set business_unit_id='00000000-0000-0000-0000-0000000000a2' where id='00000000-0000-0000-0000-00000000ac43'$$, '42501', 'reviewed kitchen log facts are immutable', 'an approved business unit stays fixed');
select throws_ok($$update ops.kitchen_logs set wip_item_id='00000000-0000-0000-0000-00000000ab02' where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', 'reviewed kitchen log facts are immutable', 'a rejected item stays fixed');
select throws_ok($$update ops.kitchen_logs set qty_porsi=99 where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', 'reviewed kitchen log facts are immutable', 'a rejected quantity stays fixed');
reset role;
select throws_ok($$update ops.kitchen_logs set item_unit_id=null where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', null, 'a rejected unit snapshot stays fixed');
set local role authenticated;
reset role;
select throws_ok($$update ops.kitchen_logs set entry_quantity=9 where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', null, 'a rejected entered quantity stays fixed');
select throws_ok($$update ops.kitchen_logs set entry_unit_factor=2 where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', null, 'a rejected unit factor stays fixed');
select throws_ok($$update ops.kitchen_logs set entry_unit_name='crate' where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', null, 'a rejected unit label stays fixed');
set local role authenticated;
select throws_ok($$update ops.kitchen_logs set log_date='2026-10-07' where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', 'reviewed kitchen log facts are immutable', 'a rejected date stays fixed');
select throws_ok($$update ops.kitchen_logs set branch_id='00000000-0000-0000-0000-00000000bf01' where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', 'reviewed kitchen log facts are immutable', 'a rejected branch stays fixed');
select throws_ok($$update ops.kitchen_logs set activity='bar' where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', 'reviewed kitchen log facts are immutable', 'a rejected activity stays fixed');
select throws_ok($$update ops.kitchen_logs set destination_branch_id='00000000-0000-0000-0000-00000000bf01' where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', 'reviewed kitchen log facts are immutable', 'a rejected destination stays fixed');
select throws_ok($$update ops.kitchen_logs set action='transfer' where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', 'reviewed kitchen log facts are immutable', 'a rejected action stays fixed');
select throws_ok($$update ops.kitchen_logs set business_unit_id='00000000-0000-0000-0000-0000000000a2' where id='00000000-0000-0000-0000-00000000ac44'$$, '42501', 'reviewed kitchen log facts are immutable', 'a rejected business unit stays fixed');

-- Posting state remains writable to its designated server writer after review.
reset role;
update ops.kitchen_logs set posted_to_esb = true, esb_doc_num = 'ERP-001', posted_at = now()
where id = '00000000-0000-0000-0000-00000000ac43';
select is((select posted_to_esb and esb_doc_num = 'ERP-001' and posted_at is not null
             from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac43'), true,
  'posting state can advance without changing approved production facts');

select * from finish();
rollback;
