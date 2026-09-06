-- Task permission rules ratified for #742 (OD-WAY-94) — the PIC-value rule (who may be PIC), the
-- narrowed edit/archive gates (who may edit PIC/Supervisor/Due, who may archive), and the
-- created_by default+immutability pairing. AC-053..058.
--
-- Personas from shared._test_seed_directory (see its own header for the full tree):
--   Author      ...d1  Staff R  — the PIC under test; manages Report only
--   DirectMgr   ...d2  Lead R   — one level above Author; downline = {Author, Peer, DualHat, Report}
--   GrandMgr    ...d3  Exec     — two levels above Author (and above DirectMgr)
--   Peer        ...d4  Staff R  — same role as Author: a peer, not a downline member
--   Report      ...d5  SubR     — below Author; holds a LEAF role, so Report itself has no downline
--   DualHat     ...d6  Staff R + Staff 2 — manageable via EITHER chain; used as Supervisor so it has
--                       a manager (Lead2Holder, via the Staff 2 half) who is NOT above the PIC
--   Lead2Holder ...d7  Lead 2   — manages DualHat (Staff 2 half) but never manages Author
--
-- mos_05_tasks.sql keeps the create/read/tenancy/immutability contract; this file owns only what
-- #742 changed or added: the PIC-value clause and the narrowed edit/archive gates.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select shared._test_seed_directory();

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-053 — a member with no downline (Report): PIC=self succeeds, PIC=a peer is refused
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('AC-053 self','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d5',
          '00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d5')
$$, 'AC-053: Report (no downline) may make themself PIC');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('AC-053 peer','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d4',
          '00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000d5')
$$, '42501', null,
  'AC-053: Report cannot name Peer as PIC — Peer is neither self nor in Report''s (empty) downline');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-054 — a manager (DirectMgr): PIC=a downline person succeeds, PIC outside the downline fails
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('AC-054 downline','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d2')
$$, 'AC-054: DirectMgr may name Author (in their downline) as PIC');
select throws_ok($$
  insert into mos.tasks (title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('AC-054 outside','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d7',
          '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d2')
$$, '42501', null,
  'AC-054: DirectMgr cannot name Lead2Holder as PIC — a different branch, outside DirectMgr''s downline');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-055 — existing task (PIC=Author, Supervisor=DirectMgr): the PIC re-pointing PIC to a peer is
-- refused; the Supervisor re-pointing PIC to their own downline succeeds
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Insert as Author (the intended PIC naming self) so fixture setup passes the same PIC-value
-- clause the tests below exercise, rather than reaching for reset role to bypass it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000006001','00000000-0000-0000-0000-0000000000a1','AC-055 task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1');

select throws_ok($$
  update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d4'
  where id = '00000000-0000-0000-0000-000000006001'
$$, '42501', null,
  'AC-055: the PIC (Author) cannot re-point PIC to Peer — a sideways move, not a downline one');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set responsible_person_id = '00000000-0000-0000-0000-0000000000d5'
  where id = '00000000-0000-0000-0000-000000006001'
$$, 'AC-055: the Supervisor (DirectMgr) may re-point PIC to Report — in DirectMgr''s own downline');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-056 — task PIC=Author, Supervisor=DualHat: Due is editable by PIC, Supervisor, the PIC's line
-- manager, and the PIC's manager's manager; refused for a peer and for a manager of the Supervisor
-- who is not above the PIC (Lead2Holder manages DualHat via the Staff 2 half, never Author)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Insert as Author (naming self PIC), same reason as AC-055's fixture.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000006002','00000000-0000-0000-0000-0000000000a1','AC-056 task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d1');

select lives_ok($$
  update mos.tasks set due_date = '2026-10-01' where id = '00000000-0000-0000-0000-000000006002'
$$, 'AC-056: the PIC (Author) may edit Due');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set due_date = '2026-10-02' where id = '00000000-0000-0000-0000-000000006002'
$$, 'AC-056: the Supervisor (DualHat) may edit Due');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set due_date = '2026-10-03' where id = '00000000-0000-0000-0000-000000006002'
$$, 'AC-056: the PIC''s line manager (DirectMgr) may edit Due');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set due_date = '2026-10-04' where id = '00000000-0000-0000-0000-000000006002'
$$, 'AC-056: the PIC''s manager''s manager (GrandMgr) may edit Due');

-- These two are refused by the general edit gate's USING clause alone (no trigger fires for a
-- plain field edit), so Postgres RLS silently excludes the row from the UPDATE rather than
-- raising — the assertion is that Due did NOT move, the same no-op shape mos_05_tasks.sql uses
-- for its "Peer Rewrite" edit-gate case.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update mos.tasks set due_date = '2026-10-05' where id = '00000000-0000-0000-0000-000000006002';
select is((select due_date from mos.tasks where id = '00000000-0000-0000-0000-000000006002')::text,
  '2026-10-04', 'AC-056: a peer (Peer) may not edit Due — the RLS-invisible row is silently skipped, not moved');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
update mos.tasks set due_date = '2026-10-06' where id = '00000000-0000-0000-0000-000000006002';
select is((select due_date from mos.tasks where id = '00000000-0000-0000-0000-000000006002')::text,
  '2026-10-04',
  'AC-056: a manager of the Supervisor who is not above the PIC (Lead2Holder) may not edit Due');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-057 — task PIC=Author, Supervisor=DualHat: the PIC may set status Done but not archived_at;
-- the Supervisor and the PIC's manager may set AND clear archived_at
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Insert as Author (naming self PIC), same reason as AC-055's fixture.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000006003','00000000-0000-0000-0000-0000000000a1','AC-057 task',
        '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d1');

select lives_ok($$
  update mos.tasks set status = 'Done' where id = '00000000-0000-0000-0000-000000006003'
$$, 'AC-057: the PIC may set status Done');
select throws_ok($$
  update mos.tasks set archived_at = now() where id = '00000000-0000-0000-0000-000000006003'
$$, '42501', null, 'AC-057: the PIC alone may not set archived_at — that is Supervisor/manager-above territory');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set archived_at = now() where id = '00000000-0000-0000-0000-000000006003'
$$, 'AC-057: the Supervisor may set archived_at');
select lives_ok($$
  update mos.tasks set archived_at = null where id = '00000000-0000-0000-0000-000000006003'
$$, 'AC-057: ...and clear it');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select lives_ok($$
  update mos.tasks set archived_at = now() where id = '00000000-0000-0000-0000-000000006003'
$$, 'AC-057: the PIC''s manager (DirectMgr) may set archived_at');
select lives_ok($$
  update mos.tasks set archived_at = null where id = '00000000-0000-0000-0000-000000006003'
$$, 'AC-057: ...and clear it too');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-058 — created_by defaults to the caller when omitted; an update that changes it is refused
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select lives_ok($$
  insert into mos.tasks (id, title, business_unit_id, responsible_person_id, accountable_person_id)
  values ('00000000-0000-0000-0000-000000006004','AC-058 task','00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000d4')
$$, 'AC-058: created_by may be omitted on insert');
select is(
  (select created_by from mos.tasks where id = '00000000-0000-0000-0000-000000006004'),
  '00000000-0000-0000-0000-0000000000d4'::uuid,
  'AC-058: ...and is stamped with the caller by the column default');
select throws_ok($$
  update mos.tasks set created_by = '00000000-0000-0000-0000-0000000000d2'
  where id = '00000000-0000-0000-0000-000000006004'
$$, '42501', null, 'AC-058: an update that changes created_by is refused');

reset role;
select * from finish();
rollback;
