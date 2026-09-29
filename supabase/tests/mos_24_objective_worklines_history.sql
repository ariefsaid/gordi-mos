-- mos — per-record read gating on the two Slice-1 audited tables (#983 AC-007/AC-008): history
-- is readable exactly by those who could read the record, and a table the dispatch does not
-- register (or a delete row before its snapshot arm exists) is unreadable by everyone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select shared._test_seed_directory();

select has_function('shared', 'can_read_history_record', ARRAY['text','text','text','text','jsonb'],
  'the read dispatch is exposed with the (schema, table, key, action, snapshot) shape');

-- Org A (...0a1) records; the directory fixture supplies org B (...0b1) as the negative control.
insert into mos.objectives (id, org_id, name)
values ('00000000-0000-0000-0000-000000009905', '00000000-0000-0000-0000-0000000000a1', 'History Objective');
insert into mos.work_lines (id, org_id, name, type, objective_id)
values ('00000000-0000-0000-0000-000000009906', '00000000-0000-0000-0000-0000000000a1', 'History Project', 'project',
        '00000000-0000-0000-0000-000000009905');

-- An authenticated edit, so the work line has one insert row AND one update row.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
update mos.work_lines set name = 'History Project v2'
where id = '00000000-0000-0000-0000-000000009906';

-- ── AC-007: a reader of the record reads its history ─────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'objectives'
             and record_key = '00000000-0000-0000-0000-000000009905'),
  1, 'AC-007: an org member reads the Objective''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'work_lines'
             and record_key = '00000000-0000-0000-0000-000000009906'),
  2, 'AC-007: an org member reads the Project/Process''s insert and update rows');
select is((select actor_person_id::text from shared.record_history
           where schema_name = 'mos' and table_name = 'work_lines'
             and record_key = '00000000-0000-0000-0000-000000009906' and action = 'update'),
  '00000000-0000-0000-0000-0000000000d3',
  'AC-007: the member sees WHO made the authenticated edit');

-- ── AC-007: a person who cannot read the record reads none of its history ────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history),
  0, 'AC-007: another org''s member reads no org-A history at all');

-- ── AC-008: a table the dispatch does not register fails closed ──────────────────────────────
reset role;
set local request.jwt.claims = '';
insert into shared.record_history (org_id, schema_name, table_name, record_key, action, field_name, old_value, new_value)
values ('00000000-0000-0000-0000-0000000000a1', 'mos', 'weekly_updates',
        '00000000-0000-0000-0000-0000000000e1', 'update', 'summary', 'before', 'after');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history where table_name = 'weekly_updates'),
  0, 'AC-008: an unregistered table''s history row is unreadable (fail closed, member)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history where table_name = 'weekly_updates'),
  0, 'AC-008: an unregistered table''s history row is unreadable (fail closed, admin)');

-- ── an archived record's history stays readable by its org (the row still exists) ────────────
reset role;
set local request.jwt.claims = '';
update mos.objectives set archived_at = now()
where id = '00000000-0000-0000-0000-000000009905';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009905'),
  2, 'an org member reads an archived Objective''s insert and archive rows');

-- ── NFR-007: a delete row is unreadable until its snapshot arm is registered ─────────────────
reset role;
set local request.jwt.claims = '';
insert into mos.objectives (id, org_id, name)
values ('00000000-0000-0000-0000-000000009907', '00000000-0000-0000-0000-0000000000a1', 'Deleted Objective');
delete from mos.objectives where id = '00000000-0000-0000-0000-000000009907';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009907'),
  0, 'NFR-007: with no registered delete arm, nothing of a hard-deleted row — delete row included — is readable');

select * from finish();
rollback;
