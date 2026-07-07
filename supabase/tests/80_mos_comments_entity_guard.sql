-- AC-A2 (round-2 audit 2026-07): mos.comments entity guard — entity_id must resolve to a SAME-ORG row
-- of the declared entity_type. Closes the bare-uuid / no-FK / cross-org seam that comments_insert RLS
-- alone leaves open (existence + tenancy oracle). Guards entity_types task / weekly_update / daily_log /
-- follow_up; exercised here on task (primary) and follow_up (proves the CASE mapping for a second type).
-- Mirrors the ops.log_entries guard test shape; SECURITY INVOKER, cross-org + non-existent -> NULL -> raise.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select mos._test_seed_role_tree();    -- orgs A/B, BUs, people, roles (Author ...0d1, ForeignMgr ...0b4)
select mos._test_seed_follow_ups();   -- coded lane BUs + chasers + 3 follow-ups (...0e01 A b2b_sales, ...0e03 B)

set local role authenticated;

-- ── seed the two work items the guard must resolve ───────────────────────────────────────────────
-- Org-A task (the same-org comment target).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into mos.tasks (id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-00000000c001', 'Same-org task',
        '00000000-0000-0000-0000-0000000000a2',
        '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000d1');

-- Org-B (foreign) task — inserted as a WU-B member so the tasks INSERT policy admits it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
insert into mos.tasks (id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-00000000c002', 'Foreign-org task',
        '00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-0000000000b4',
        '00000000-0000-0000-0000-0000000000b4',
        '00000000-0000-0000-0000-0000000000b4');

-- ── guard assertions as the Org-A Author ─────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- PASS: a comment on a SAME-ORG task resolves and inserts.
select lives_ok($$
  insert into mos.comments (id, entity_type, entity_id, body)
  values ('00000000-0000-0000-0000-00000000c101', 'task',
          '00000000-0000-0000-0000-00000000c001', 'Looks on track')
$$, 'AC-A2: a comment on a SAME-ORG task inserts (entity_id resolves same-org)');

-- RAISE: a comment whose entity_id is a task in the OTHER org (cross-org -> invisible -> NULL -> raise).
select throws_ok($$
  insert into mos.comments (id, entity_type, entity_id, body)
  values ('00000000-0000-0000-0000-00000000c102', 'task',
          '00000000-0000-0000-0000-00000000c002', 'cross-org reach')
$$, '23514', null, 'AC-A2: a comment pointing at a FOREIGN-ORG task is rejected (23514)');

-- RAISE: a comment with a non-existent entity_id (lookup -> NULL -> distinct from new.org_id -> raise).
select throws_ok($$
  insert into mos.comments (id, entity_type, entity_id, body)
  values ('00000000-0000-0000-0000-00000000c103', 'task',
          '11111111-1111-1111-1111-111111111111', 'ghost reference')
$$, '23514', null, 'AC-A2: a comment pointing at a non-existent entity_id is rejected (23514)');

-- ── second entity_type (follow_up) — proves the CASE mapping, as the lane chaser who can READ it ────
-- SalesChaser ...0d10 holds the FU Sales Lead role in the b2b_sales-coded BU, so can_work_lane reads
-- the same-org b2b_ar follow-up ...0e01. Org-A identity, so the comments INSERT policy (org + author
-- pinned) holds; the guard's follow_up CASE branch must resolve it same-org.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d10","access_roles":[]}';

-- PASS: a comment on a SAME-ORG follow_up resolves via the follow_up CASE branch.
select lives_ok($$
  insert into mos.comments (id, entity_type, entity_id, body)
  values ('00000000-0000-0000-0000-00000000c104', 'follow_up',
          '00000000-0000-0000-0000-0000000000e01', 'chasing this')
$$, 'AC-A2: a comment on a SAME-ORG follow_up inserts (CASE mapping for entity_type follow_up)');

-- RAISE: a comment pointing at a FOREIGN-ORG follow_up (...0e03, WU-B) — cross-org -> NULL -> raise.
select throws_ok($$
  insert into mos.comments (id, entity_type, entity_id, body)
  values ('00000000-0000-0000-0000-00000000c105', 'follow_up',
          '00000000-0000-0000-0000-0000000000e03', 'reach across')
$$, '23514', null, 'AC-A2: a comment pointing at a FOREIGN-ORG follow_up is rejected (23514)');

reset role;
select * from finish();
rollback;
