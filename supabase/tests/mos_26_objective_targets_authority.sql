-- mos — Objective targets/write-up authority (#992, OD-OBJ-1): the structural-vs-content split.
--
-- Structural facts of an Objective (name, Business Unit/Company-wide, period, archive) are
-- admin-only (`objective.manage`); the write-up and a key result's current value are open to
-- ops leads (org-wide `objective.edit_content`) and to the apex head of the Objective's OWN
-- Business Unit (`shared.is_business_unit_head`) — never across a BU boundary, never on a
-- Company-wide or unset Objective. Key results (`mos.objective_key_results`) split the same way:
-- admin owns every target field and add/remove; content writers move `current_value` alone.
-- Company-wide and unset stay distinct row shapes; the period quarter admits only Q1–Q4; the
-- write-up must be a top-level JSON array within the size limit; every reference stays same-org.
--
-- Personas (org A …0a1; BUs Unit-1 …0a2, Unit-2 …0a3; foreign org B …0b1), all JWT-claimed:
--   DirectMgr …0d2  claims ops_lead  — org-wide content authority, no structural authority
--   Lead2Holder …0d7 claims member   — apex head of Unit-2 (Lead 2 → Exec, whose BU is Unit-1)
--   GrandMgr …0d3   claims admin / member — apex head of Unit-1 (Exec, no parent) when claimed bare
--   Author …0d1     claims member    — ordinary reader
--   ForeignMgr …0b4 org B            — cross-org negative control
begin;
create extension if not exists pgtap with schema extensions;
select plan(110);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();

-- ── Fixtures (service path: RLS bypassed, triggers run with no authenticated writer) ─────────
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000000b1', 'Elsewhere Objective');
insert into mos.objectives (id, org_id, name, business_unit_id) values
  ('00000000-0000-0000-0000-0000000009e2', '00000000-0000-0000-0000-0000000000a1', 'Unit-1 Target',
   '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000009e3', '00000000-0000-0000-0000-0000000000a1', 'Unit-2 Target',
   '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000009e5', '00000000-0000-0000-0000-0000000000a1', 'Unhomed Objective', null);
insert into mos.objectives (id, org_id, name, is_company_wide) values
  ('00000000-0000-0000-0000-0000000009e4', '00000000-0000-0000-0000-0000000000a1', 'Company Focus', true);

insert into mos.objective_key_results (id, org_id, objective_id, what, target_value, current_value, unit) values
  ('00000000-0000-0000-0000-0000000009e6', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000009e3', 'Weekly orders', 60, 40, 'orders'),
  ('00000000-0000-0000-0000-0000000009e7', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000009e3', 'Mystery metric', null, null, null),
  ('00000000-0000-0000-0000-0000000009e8', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000009e2', 'Unit-1 measure', 10, 1, 'events'),
  ('00000000-0000-0000-0000-0000000009e9', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000009e5', 'Unhomed measure', null, null, null),
  ('00000000-0000-0000-0000-0000000009ea', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000009e4', 'Company measure', 5, null, 'branches');
insert into mos.objective_key_results (id, org_id, objective_id, what) values
  ('00000000-0000-0000-0000-0000000009eb', '00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000009e1', 'Foreign measure');

-- ── Shape: the new columns, their nullability, and the new predicate ─────────────────────────
select has_table('mos', 'objective_key_results',
  'the key-result table exists');
select has_column('mos', 'objectives', 'is_company_wide', 'objectives.is_company_wide exists');
select col_type_is('mos', 'objectives', 'is_company_wide', 'boolean', 'is_company_wide is a boolean');
select col_not_null('mos', 'objectives', 'is_company_wide', 'is_company_wide is not null (defaults false)');
select col_default_is('mos', 'objectives', 'is_company_wide', 'false', 'is_company_wide defaults to false');
select has_column('mos', 'objectives', 'period_quarter', 'objectives.period_quarter exists');
select col_type_is('mos', 'objectives', 'period_quarter', 'smallint', 'period_quarter is a smallint');
select col_is_null('mos', 'objectives', 'period_quarter', 'period_quarter is nullable — whole year by default');
select has_column('mos', 'objectives', 'write_up', 'objectives.write_up exists');
select col_type_is('mos', 'objectives', 'write_up', 'jsonb', 'write_up is jsonb');
select col_is_null('mos', 'objectives', 'write_up', 'write_up is nullable');
select has_function('mos', 'can_edit_objective_content', ARRAY['uuid'],
  'the content-authority predicate is exposed with the (objective id) shape');

-- ═══ AC-001 — Company-wide and a real unit are mutually exclusive by CHECK ═══════════════════
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$
  update mos.objectives set is_company_wide = true where id = '00000000-0000-0000-0000-0000000009e2'
$$, '23514', null,
  'AC-001: flagging a unit-owned Objective Company-wide without clearing the unit is a CHECK rejection');
select throws_ok($$
  update mos.objectives set business_unit_id = '00000000-0000-0000-0000-0000000000a2'
  where id = '00000000-0000-0000-0000-0000000009e4'
$$, '23514', null,
  'AC-001: ...and so is giving a Company-wide Objective a unit — the CHECK holds both ways');

-- ═══ AC-002 — Company-wide is a distinct, readable row shape (never "unset") ═════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select (is_company_wide, business_unit_id)::text from mos.objectives
           where id = '00000000-0000-0000-0000-0000000009e4'),
  '(t,)', 'AC-002: an org member reads the Company-wide Objective as (true, null)');
select is((select (is_company_wide, business_unit_id)::text from mos.objectives
           where id = '00000000-0000-0000-0000-0000000009e5'),
  '(f,)', 'AC-002: an unset Objective keeps the different (false, null) shape — never conflated');

-- ═══ AC-004 — the period quarter admits only Q1–Q4 ══════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$
  update mos.objectives set period_year = 2027, period_quarter = 4 where id = '00000000-0000-0000-0000-0000000009e2'
$$, 'AC-004: an admin sets a year and a Q1–Q4 quarter alongside it');
select throws_ok($$
  update mos.objectives set period_quarter = 5 where id = '00000000-0000-0000-0000-0000000009e2'
$$, '23514', null, 'AC-004: quarter 5 is a CHECK rejection');
select throws_ok($$
  insert into mos.objectives (name, period_quarter) values ('Zero Quarter', 0)
$$, '23514', null, 'AC-004: quarter 0 is a CHECK rejection on insert too');
select throws_ok($$
  update mos.objectives set period_year = null, period_quarter = 2 where id = '00000000-0000-0000-0000-0000000009e2'
$$, '23514', null, 'AC-004: a quarter without its year is a CHECK rejection — the quarter rides the year');

-- ═══ AC-005..007 — ops_lead: no structural writes, write-up yes ══════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select throws_ok($$
  insert into mos.objectives (name) values ('Ops Lead Objective')
$$, '42501', null, 'AC-005: ops_lead cannot create an Objective (42501, admin-only)');

select throws_ok($$
  update mos.objectives set archived_at = now() where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null, 'AC-006: ops_lead cannot archive');
select throws_ok($$
  update mos.objectives set name = 'Ops Lead Rename' where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null, 'AC-006: ops_lead cannot rename');
select throws_ok($$
  update mos.objectives set business_unit_id = '00000000-0000-0000-0000-0000000000a3'
  where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null, 'AC-006: ops_lead cannot re-home the Business Unit');
select throws_ok($$
  update mos.objectives set period_year = 2028 where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null, 'AC-006: ops_lead cannot re-period the year');
select throws_ok($$
  update mos.objectives set period_quarter = 2 where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null, 'AC-006: ops_lead cannot re-period the quarter');
select throws_ok($$
  update mos.objectives set is_company_wide = true where id = '00000000-0000-0000-0000-0000000009e5'
$$, '42501', null, 'AC-006: ops_lead cannot mark an Objective Company-wide');

select lives_ok($$
  update mos.objectives
     set write_up = '[{"type":"paragraph","content":[{"type":"text","text":"Q3 was slow"}]}]'::jsonb
   where id = '00000000-0000-0000-0000-0000000009e2'
$$, 'AC-007: ops_lead updates the write-up column alone');
select is((select write_up -> 0 -> 'content' -> 0 ->> 'text' from mos.objectives
           where id = '00000000-0000-0000-0000-0000000009e2'),
  'Q3 was slow', 'AC-007: ...and the write-up landed');

-- ── The capability vocabulary the split is built on ─────────────────────────────────────────
select ok(shared.can('objective.edit_content'),
  'ops_lead holds objective.edit_content — the narrowed grant (OD-OBJ-1)');
select ok(not shared.can('objective.manage'),
  'ops_lead no longer holds objective.manage — OD-OBJ-1 narrows OD-V4-1');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select ok(shared.can('objective.manage'), 'admin keeps objective.manage');
select ok(shared.can('objective.edit_content'), 'admin also holds objective.edit_content');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select ok(not shared.can('objective.edit_content'),
  'a plain member holds neither Objective authority');

-- ── The content predicate: the BU apex head, and only over their own unit ═══════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select ok(mos.can_edit_objective_content('00000000-0000-0000-0000-0000000009e3'),
  'the Unit-2 apex head holds content authority over a Unit-2 Objective');
select ok(not mos.can_edit_objective_content('00000000-0000-0000-0000-0000000009e2'),
  '...not over a Unit-1 Objective');
select ok(not mos.can_edit_objective_content('00000000-0000-0000-0000-0000000009e4'),
  '...not over a Company-wide Objective — there is no unit to head');
select ok(not mos.can_edit_objective_content('00000000-0000-0000-0000-0000000009e5'),
  '...not over an unset Objective');

-- ═══ AC-008 — the BU head writes the write-up, never the structural fields ══════════════════
select lives_ok($$
  update mos.objectives
     set write_up = '[{"type":"heading","content":[{"type":"text","text":"Unit-2 plan"}]}]'::jsonb
   where id = '00000000-0000-0000-0000-0000000009e3'
$$, 'AC-008: the Unit-2 head updates their own Objective''s write-up');
select throws_ok($$
  update mos.objectives set name = 'Head Rename' where id = '00000000-0000-0000-0000-0000000009e3'
$$, '42501', null, 'AC-008: the BU head cannot rename');
select throws_ok($$
  update mos.objectives set business_unit_id = '00000000-0000-0000-0000-0000000000a2'
  where id = '00000000-0000-0000-0000-0000000009e3'
$$, '42501', null, 'AC-008: the BU head cannot re-home');
select throws_ok($$
  update mos.objectives set period_year = 2027 where id = '00000000-0000-0000-0000-0000000009e3'
$$, '42501', null, 'AC-008: the BU head cannot set the year');
select throws_ok($$
  update mos.objectives set period_quarter = 1 where id = '00000000-0000-0000-0000-0000000009e3'
$$, '42501', null, 'AC-008: the BU head cannot set the quarter');
select throws_ok($$
  update mos.objective_key_results set target_value = 99 where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null,
  'AC-011: the BU head cannot retarget a key result — the target is structural authority');
select throws_ok($$
  update mos.objective_key_results set what = 'Replaced by the head' where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null,
  'AC-011: ...nor rewrite what the key result measures');
select throws_ok($$
  update mos.objective_key_results set unit = 'cases' where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: the BU head cannot change the unit');
select throws_ok($$
  update mos.objective_key_results set due_date = date '2026-12-31'
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: the BU head cannot change the due date');
select throws_ok($$
  update mos.objective_key_results set owner_person_id = '00000000-0000-0000-0000-0000000000d1'
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: the BU head cannot change the owner');
select throws_ok($$
  update mos.objective_key_results set objective_id = '00000000-0000-0000-0000-0000000009e2'
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: the BU head cannot move a key result to another Objective');
select throws_ok($$
  update mos.objectives set archived_at = now() where id = '00000000-0000-0000-0000-0000000009e3'
$$, '42501', null, 'AC-008: the BU head cannot archive');
select throws_ok($$
  update mos.objectives set is_company_wide = true where id = '00000000-0000-0000-0000-0000000009e3'
$$, '42501', null, 'AC-008: the BU head cannot mark Company-wide');

-- ═══ AC-009 — the BU head stops at their unit boundary ══════════════════════════════════════
select throws_ok($$
  update mos.objectives set write_up = '[{"type":"paragraph","content":[]}]'::jsonb
  where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null, 'AC-009: the Unit-2 head cannot write the write-up of a Unit-1 Objective');
select throws_ok($$
  update mos.objectives set write_up = '[{"type":"paragraph","content":[]}]'::jsonb
  where id = '00000000-0000-0000-0000-0000000009e4'
$$, '42501', null, 'AC-009: ...nor of a Company-wide Objective');
select throws_ok($$
  update mos.objectives set write_up = '[{"type":"paragraph","content":[]}]'::jsonb
  where id = '00000000-0000-0000-0000-0000000009e5'
$$, '42501', null, 'AC-009: ...nor of an unset Objective');
select throws_ok($$
  update mos.objective_key_results set current_value = 99
  where id = '00000000-0000-0000-0000-0000000009e8'
$$, '42501', null, 'AC-009: the Unit-2 head cannot move a Unit-1 key result''s current value');
select throws_ok($$
  update mos.objective_key_results set current_value = 1
  where id = '00000000-0000-0000-0000-0000000009ea'
$$, '42501', null, 'AC-009: ...nor a Company-wide Objective''s key result');
select throws_ok($$
  update mos.objective_key_results set current_value = 1
  where id = '00000000-0000-0000-0000-0000000009e9'
$$, '42501', null, 'AC-009: ...nor an unset Objective''s key result');

-- ═══ AC-010 — admin performs every write the others were refused ════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.objectives (id, name, business_unit_id, period_year, period_quarter, write_up)
  values ('00000000-0000-0000-0000-0000000009ec', 'Admin Objective',
          '00000000-0000-0000-0000-0000000000a2', 2026, 3,
          '[{"type":"paragraph","content":[]}]'::jsonb)
$$, 'AC-010: admin creates an Objective with unit, period and write-up');
select lives_ok($$
  update mos.objectives set name = 'Admin Renamed' where id = '00000000-0000-0000-0000-0000000009ec'
$$, 'AC-010: admin renames');
select lives_ok($$
  update mos.objectives set business_unit_id = '00000000-0000-0000-0000-0000000000a3'
  where id = '00000000-0000-0000-0000-0000000009ec'
$$, 'AC-010: admin re-homes');
select lives_ok($$
  update mos.objectives set period_year = 2027, period_quarter = 1
  where id = '00000000-0000-0000-0000-0000000009ec'
$$, 'AC-010: admin re-periods');
select lives_ok($$
  update mos.objectives set archived_at = now() where id = '00000000-0000-0000-0000-0000000009ec'
$$, 'AC-010: admin archives');
select lives_ok($$
  update mos.objectives set archived_at = null where id = '00000000-0000-0000-0000-0000000009ec'
$$, 'AC-010: admin unarchives');
select lives_ok($$
  update mos.objectives set is_company_wide = true, business_unit_id = null
  where id = '00000000-0000-0000-0000-0000000009ec'
$$, 'AC-010: admin flips to Company-wide by clearing the unit in the same write');
select lives_ok($$
  update mos.objectives
     set write_up = '[{"type":"paragraph","content":[{"type":"text","text":"admin page"}]}]'::jsonb
   where id = '00000000-0000-0000-0000-0000000009e5'
$$, 'AC-010: admin writes an unset Objective''s write-up');

-- ═══ AC-011 — key results: content writers move current_value ALONE ═════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select lives_ok($$
  update mos.objective_key_results set current_value = 42
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, 'AC-011: ops_lead updates a key result''s current value');
select lives_ok($$
  update mos.objective_key_results set current_value = 2
  where id = '00000000-0000-0000-0000-0000000009e8'
$$, 'AC-011: ops_lead content authority is org-wide — a Unit-1 key result too');
select throws_ok($$
  update mos.objective_key_results set what = 'Rewritten by ops' where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: ops_lead cannot change what');
select throws_ok($$
  update mos.objective_key_results set target_value = 100 where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: ops_lead cannot change the target');
select throws_ok($$
  update mos.objective_key_results set unit = 'cases' where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: ops_lead cannot change the unit');
select throws_ok($$
  update mos.objective_key_results set due_date = date '2026-12-31'
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: ops_lead cannot change the due date');
select throws_ok($$
  update mos.objective_key_results set owner_person_id = '00000000-0000-0000-0000-0000000000d1'
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: ops_lead cannot change the owner');
select throws_ok($$
  update mos.objective_key_results set objective_id = '00000000-0000-0000-0000-0000000009e2'
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-011: ops_lead cannot move a key result to another Objective');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select lives_ok($$
  update mos.objective_key_results set current_value = 7
  where id = '00000000-0000-0000-0000-0000000009e7'
$$, 'AC-011: the Unit-2 head updates their own key result''s current value');

-- ═══ AC-012 — add/remove is admin-only ═══════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select throws_ok($$
  insert into mos.objective_key_results (objective_id, what) values
    ('00000000-0000-0000-0000-0000000009e3', 'Ops Lead KR')
$$, '42501', null, 'AC-012: ops_lead cannot add a key result');
select throws_ok($$
  delete from mos.objective_key_results where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-012: ops_lead cannot remove one (42501, not a silent no-op)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select throws_ok($$
  insert into mos.objective_key_results (objective_id, what) values
    ('00000000-0000-0000-0000-0000000009e3', 'BU Head KR')
$$, '42501', null, 'AC-012: the BU head cannot add a key result either');
select throws_ok($$
  delete from mos.objective_key_results where id = '00000000-0000-0000-0000-0000000009e7'
$$, '42501', null, 'AC-012: ...nor can the BU head remove one');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$
  insert into mos.objective_key_results (id, objective_id, what, target_value, unit, due_date, owner_person_id)
  values ('00000000-0000-0000-0000-0000000009ed', '00000000-0000-0000-0000-0000000009e3',
          'Admin KR', 12, 'orders', date '2026-12-31', '00000000-0000-0000-0000-0000000000d1')
$$, 'AC-012: admin adds a key result with every target field');
select lives_ok($$
  delete from mos.objective_key_results where id = '00000000-0000-0000-0000-0000000009ed'
$$, 'AC-012: admin removes a key result');

-- ═══ AC-013 — the org seam: every reference same-org or 42501 ═══════════════════════════════
select throws_ok($$
  insert into mos.objective_key_results (objective_id, what) values
    ('00000000-0000-0000-0000-0000000009e1', 'Cross-org KR')
$$, '42501', null, 'AC-013: a key result cannot point at another org''s Objective');
select throws_ok($$
  insert into mos.objective_key_results (objective_id, what, owner_person_id) values
    ('00000000-0000-0000-0000-0000000009e3', 'Foreign owner KR', '00000000-0000-0000-0000-0000000000b4')
$$, '42501', null, 'AC-013: a key result cannot be owned by another org''s person');
select throws_ok($$
  update mos.objective_key_results set owner_person_id = '00000000-0000-0000-0000-0000000000b4'
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-013: the owner cannot be re-pointed across the org seam');
select throws_ok($$
  update mos.objective_key_results set objective_id = '00000000-0000-0000-0000-0000000009e1'
  where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'AC-013: the objective cannot be re-pointed across the org seam');

-- ═══ AC-014 — the write-up validates at the database layer ══════════════════════════════════
select throws_ok($$
  update mos.objectives set write_up = '{"type":"doc","content":[]}'::jsonb
  where id = '00000000-0000-0000-0000-0000000009e2'
$$, '23514', null, 'AC-014: a top-level JSON object is refused — the document must be an array');
select throws_ok($$
  update mos.objectives set write_up = jsonb_build_array(repeat('x', 300000))
  where id = '00000000-0000-0000-0000-0000000009e2'
$$, '23514', null, 'AC-014: a write-up over the size limit is refused');
-- On a different Objective than the history count below watches: this valid save appends its own
-- summary-only history row, and it must not land in 9e2's ledger.
select lives_ok($$
  update mos.objectives set write_up = '[{"type":"paragraph","content":[]}]'::jsonb
  where id = '00000000-0000-0000-0000-0000000009ec'
$$, 'AC-014: a valid small array document is accepted');

-- ── Read visibility mirrors the Objective's org-wide read; history stays wired ───────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.objective_key_results), 5,
  'an org member reads all five org-A key results and no org-B row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from mos.objective_key_results), 1,
  'an org-B member reads only their own org''s key result');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select is((
  select count(*)::int from shared.record_history
   where schema_name = 'mos' and table_name = 'objectives'
     and record_key = '00000000-0000-0000-0000-0000000009e2'
     and action = 'update' and field_name = 'write_up'
     and old_value is null and new_value is null),
  1, 'a write-up save records one summary-only history row — never the content (change-history DA-2)');

-- ═══ Review round 1 — the guard is default-deny, and a removal keeps readable history ════════
-- The row policy admits any org member, so the guard is what refuses columns no tier owns.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update mos.objectives set accountable_person_id = '00000000-0000-0000-0000-0000000000d4'
   where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null,
  'a plain member cannot re-point an Objective''s Accountable owner — structural authority');
select throws_ok($$
  update mos.objectives set id = '00000000-0000-0000-0000-0000000009f1'
   where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null,
  'a row''s identity is not editable in place — default-deny, no tier owns it');
select throws_ok($$
  update mos.objectives set name = name where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null,
  'a value-identical UPDATE is refused — it must not advance the clock under member authority');
select throws_ok($$
  update mos.objectives set updated_at = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null,
  'the clock is server-owned — a caller-supplied updated_at is refused, so it cannot ride past the value-identical check');
select throws_ok($$
  update mos.objectives set write_up = '[{"type":"paragraph","content":[]}]'::jsonb
   where id = '00000000-0000-0000-0000-0000000009e2'
$$, '42501', null,
  'a plain member holds no content tier — the write-up is refused for them');
select throws_ok($$
  update mos.objective_key_results set current_value = 41 where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null,
  '...and the same content wall holds on a key result''s current_value');
select throws_ok($$
  update mos.objective_key_results set updated_at = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000000009e6'
$$, '42501', null, 'the same server-owned clock hold on a key result');

-- A key-result removal keeps its history, readable through the org-wide predicate over the
-- snapshot columns (the registered delete arm).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
delete from mos.objective_key_results where id = '00000000-0000-0000-0000-0000000009e9';
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'objective_key_results'
             and record_key = '00000000-0000-0000-0000-0000000009e9' and action = 'delete'),
  1, 'an admin key-result removal appends exactly one delete row with the whole-row snapshot');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-0000000009e9' and action = 'delete'),
  1, 'an org member reads the removed key result''s delete row (org-wide read over the snapshot)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-0000000009e9'),
  0, 'another org reads none of it');

-- ── Key-result history: an update row is read through the live row, same org only ───────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select cmp_ok((select count(*)::int from shared.record_history
                where schema_name = 'mos' and table_name = 'objective_key_results'
                  and record_key = '00000000-0000-0000-0000-0000000009e6'
                  and action = 'update' and field_name = 'current_value'),
  '>=', 1, 'an org member reads a key result''s current_value update row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
            where record_key = '00000000-0000-0000-0000-0000000009e6'),
  0, 'a reader in another org sees none of a key result''s insert or update history');

-- ═══ Column drift — a column added later needs objective.manage, guard untouched ═════════════
-- Both guards compare the whole row minus the content column, so a probe column no migration has
-- named is refused for every writer without objective.manage. Owner-side DDL, inside the
-- transaction and dropped again below.
reset role;
alter table mos.objectives            add column t_probe int;
alter table mos.objective_key_results add column t_probe int;
set local role authenticated;

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$ update mos.objectives set t_probe = 1 where id = '00000000-0000-0000-0000-0000000009e3' $$,
  '42501', null, 'drift: a member cannot set a column added after the guard was written (Objective)');
select throws_ok($$ update mos.objective_key_results set t_probe = 1 where id = '00000000-0000-0000-0000-0000000009e7' $$,
  '42501', null, 'drift: ...nor on a key result');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select throws_ok($$ update mos.objectives set t_probe = 1 where id = '00000000-0000-0000-0000-0000000009e3' $$,
  '42501', null, 'drift: an ops_lead (content authority only) cannot set it on an Objective');
select throws_ok($$ update mos.objective_key_results set t_probe = 1 where id = '00000000-0000-0000-0000-0000000009e7' $$,
  '42501', null, 'drift: ...nor on a key result');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}';
select throws_ok($$ update mos.objectives set t_probe = 1 where id = '00000000-0000-0000-0000-0000000009e3' $$,
  '42501', null, 'drift: the BU head of the Objective''s own unit cannot set it on an Objective');
select throws_ok($$ update mos.objective_key_results set t_probe = 1 where id = '00000000-0000-0000-0000-0000000009e7' $$,
  '42501', null, 'drift: ...nor on a key result');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$ update mos.objectives set t_probe = 1 where id = '00000000-0000-0000-0000-0000000009e3' $$,
  'drift: admin (objective.manage) sets it on an Objective');
select lives_ok($$ update mos.objective_key_results set t_probe = 1 where id = '00000000-0000-0000-0000-0000000009e7' $$,
  'drift: ...and on a key result');

reset role;
alter table mos.objectives            drop column t_probe;
alter table mos.objective_key_results drop column t_probe;


select * from finish();
rollback;
