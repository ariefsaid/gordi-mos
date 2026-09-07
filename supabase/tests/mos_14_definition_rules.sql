-- mos — the work-systems definition rules (#801, OD-WAY-97): who reads and who writes the two
-- definition catalogs (Projects & Processes, Objectives) and a Process's cadence and step
-- definitions. Everyone in the org reads; admin and ops_lead write anywhere; a LEAD writes in a
-- unit they belong to; type locks once an occurrence exists; an Objective carries unit, owner
-- and year.
--
-- Read against the committed dev seed (supabase/seed.sql), the way shared_10_dev_seed.sql does,
-- because the rule under test is about the SHAPE of a real org — a lead with reports, a lead who
-- heads a unit with none, a member on the floor — and the fixture directory has no unit-head
-- without reports. Personas (org …0001; BUs Marketing …0011, Retail Ops …0014):
--   Dewi    …0000  admin                      Managing Director
--   Cahya   …0001  member + ops_lead          Cafe Ops Lead (Retail Ops)
--   Krishna …0002  member                     Kitchen Lead (Retail Ops) — holds reports
--   Fitri   …0005  member + finance           Finance Lead (Finance) — a lead, but not of either unit under test
--   Bulan   …0007  member                     Barista (Retail Ops) — no reports, mid-chain
--   Maya    …001a  manager                    Marketing Lead — heads Marketing, no reports
-- A foreign org (…00e1) supplies the cross-org negatives.
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

-- ── Foreign-org fixture (RLS bypassed) ───────────────────────────────────────────────────────
insert into shared.orgs (id, name, slug) values ('00000000-0000-0000-0000-0000000000e1', 'Elsewhere', 'elsewhere');
insert into shared.business_units (id, org_id, name, code)
  values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'Elsewhere Unit', 'elsewhere_unit');
insert into shared.people (id, org_id, full_name)
  values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e1', 'Elsewhere Person');
insert into mos.objectives (id, org_id, name)
  values ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e1', 'Elsewhere Objective');
insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id)
  values ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e1', 'Elsewhere Process', 'process',
          '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');
insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind)
  values ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e5', 'daily');
insert into mos.process_task_defs (id, org_id, work_line_id, title, pic_person_id)
  values ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e5', 'Elsewhere Step',
          '00000000-0000-0000-0000-0000000000e3');

-- Home-org rows Krishna must NOT be able to touch: a Marketing Process and a Marketing Objective,
-- authored by Dewi through the same policies everyone else goes through.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000000","access_roles":["admin"]}';
insert into mos.work_lines (id, name, type, business_unit_id)
  values ('00000000-0000-0000-0000-00000000801a', 'Marketing Calendar', 'process', '20000000-0000-0000-0000-000000000011');
insert into mos.objectives (id, name, business_unit_id)
  values ('00000000-0000-0000-0000-00000000801b', 'Marketing Objective', '20000000-0000-0000-0000-000000000011');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-001 — an Objective carries unit, owner and year; nothing else was added (OD-WAY-33)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select has_column('mos', 'objectives', 'business_unit_id',      'AC-001: objectives.business_unit_id exists');
select col_is_null('mos', 'objectives', 'business_unit_id',     'AC-001: ...and is nullable');
select has_column('mos', 'objectives', 'accountable_person_id', 'AC-001: objectives.accountable_person_id exists');
select col_is_null('mos', 'objectives', 'accountable_person_id','AC-001: ...and is nullable');
select has_column('mos', 'objectives', 'period_year',           'AC-001: objectives.period_year exists');
select col_is_null('mos', 'objectives', 'period_year',          'AC-001: ...and is nullable');
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'mos' and table_name = 'objectives'
      and column_name ~* '(measure|target|lane|consulted|informed)'),
  0, 'AC-001: no measure, target, lane, consulted or informed column — the catalog stays bare (OD-WAY-33)');

select lives_ok($$
  insert into mos.objectives (id, name, business_unit_id, accountable_person_id, period_year)
  values ('00000000-0000-0000-0000-00000000801c', 'Kitchen Waste Down', '20000000-0000-0000-0000-000000000014',
          '40000000-0000-0000-0000-000000000002', 2026)
$$, 'AC-001: an Objective is created with unit, owner and year');
select is((select period_year from mos.objectives where id = '00000000-0000-0000-0000-00000000801c'),
  2026, 'AC-001: ...and the year round-trips');
select throws_ok($$
  insert into mos.objectives (name, business_unit_id)
  values ('Crossed Unit', '00000000-0000-0000-0000-0000000000e2')
$$, '42501', 'business_unit_id belongs to a different org',
  'AC-001: a foreign org''s unit is refused by the guard');
select throws_ok($$
  insert into mos.objectives (name, accountable_person_id)
  values ('Crossed Owner', '00000000-0000-0000-0000-0000000000e3')
$$, '42501', 'accountable_person_id belongs to a different org',
  'AC-001: a foreign org''s person is refused by the guard');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-002 — mos.can_manage_definition(unit): the truth table
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Dewi, admin: everywhere, the null unit included.
select ok(mos.can_manage_definition('20000000-0000-0000-0000-000000000014'), 'AC-002: Dewi (admin) manages Retail Ops');
select ok(mos.can_manage_definition('20000000-0000-0000-0000-000000000011'), 'AC-002: Dewi manages Marketing');
select ok(mos.can_manage_definition(null), 'AC-002: Dewi manages a definition with no unit');
select ok(not mos.can_manage_definition('00000000-0000-0000-0000-0000000000e2'),
  'AC-002: even admin does not manage a FOREIGN org''s unit — the seam holds inside the predicate');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["member","ops_lead"]}';
select ok(mos.can_manage_definition('20000000-0000-0000-0000-000000000014'), 'AC-002: Cahya (ops_lead) manages Retail Ops');
select ok(mos.can_manage_definition('20000000-0000-0000-0000-000000000011'), 'AC-002: Cahya manages Marketing');
select ok(mos.can_manage_definition(null), 'AC-002: Cahya manages a definition with no unit');

-- Krishna: a member by access role; a lead because Kitchen Supervisor reports to Kitchen Lead.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000002","access_roles":["member"]}';
select ok(mos.can_manage_definition('20000000-0000-0000-0000-000000000014'), 'AC-002: Krishna (holds reports, Retail Ops) manages Retail Ops');
select ok(not mos.can_manage_definition('20000000-0000-0000-0000-000000000011'), 'AC-002: Krishna does not manage Marketing');
select ok(not mos.can_manage_definition(null), 'AC-002: Krishna does not manage a definition with no unit');

-- Maya: heads Marketing (Marketing Lead reports straight to the Managing Director) with no reports.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000001a","access_roles":["manager"]}';
select ok(mos.can_manage_definition('20000000-0000-0000-0000-000000000011'), 'AC-002: Maya (heads Marketing) manages Marketing');
select ok(not mos.can_manage_definition('20000000-0000-0000-0000-000000000014'), 'AC-002: Maya does not manage Retail Ops');

-- Bulan: on the Retail Ops floor, no reports, not a unit head.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
select ok(not mos.can_manage_definition('20000000-0000-0000-0000-000000000014'), 'AC-002: Bulan (member, no reports) does not manage her own unit');
select ok(not mos.can_manage_definition('20000000-0000-0000-0000-000000000011'), 'AC-002: Bulan does not manage Marketing');

-- Fitri: finance is not a definition-writing role, and she belongs to neither unit under test.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000005","access_roles":["member","finance"]}';
select ok(not mos.can_manage_definition('20000000-0000-0000-0000-000000000014'), 'AC-002: Fitri (finance) does not manage Retail Ops');
select ok(not mos.can_manage_definition('20000000-0000-0000-0000-000000000011'), 'AC-002: Fitri does not manage Marketing');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-003 — Krishna writes Projects & Processes in Retail Ops and nowhere else
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000002","access_roles":["member"]}';
select lives_ok($$
  insert into mos.work_lines (id, name, type, business_unit_id, accountable_person_id)
  values ('00000000-0000-0000-0000-000000008031', 'Kitchen Opening', 'process', '20000000-0000-0000-0000-000000000014',
          '40000000-0000-0000-0000-000000000002')
$$, 'AC-003: Krishna creates a Retail Ops Process');
select throws_ok($$
  insert into mos.work_lines (name, type, business_unit_id)
  values ('Krishna in Marketing', 'project', '20000000-0000-0000-0000-000000000011')
$$, '42501', null, 'AC-003: Krishna cannot create a Marketing Project');
select throws_ok($$
  insert into mos.work_lines (name, type) values ('Krishna Unitless', 'project')
$$, '42501', null, 'AC-003: Krishna cannot create a definition with no unit — that is admin/ops_lead only');
select lives_ok($$
  update mos.work_lines set name = 'Kitchen Opening (HQ)' where id = '00000000-0000-0000-0000-000000008031'
$$, 'AC-003: Krishna renames his Retail Ops row');
select throws_ok($$
  update mos.work_lines set name = 'Krishna Rename' where id = '00000000-0000-0000-0000-00000000801a'
$$, '42501', null, 'AC-003: Krishna cannot rename a Marketing row');
select throws_ok($$
  update mos.work_lines set business_unit_id = '20000000-0000-0000-0000-000000000011'
  where id = '00000000-0000-0000-0000-000000008031'
$$, '42501', null, 'AC-003: Krishna cannot move his row INTO Marketing');
select throws_ok($$
  update mos.work_lines set business_unit_id = '20000000-0000-0000-0000-000000000014'
  where id = '00000000-0000-0000-0000-00000000801a'
$$, '42501', null, 'AC-003: Krishna cannot pull a Marketing row OUT into Retail Ops — the guard reads the OLD unit');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["member","ops_lead"]}';
select lives_ok($$
  insert into mos.work_lines (name, type) values ('Org-wide Project', 'project')
$$, 'AC-003: Cahya (ops_lead) creates a definition with no unit');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-004 — Objectives follow the same rule
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000002","access_roles":["member"]}';
select lives_ok($$
  insert into mos.objectives (name, business_unit_id, period_year)
  values ('Kitchen Consistency', '20000000-0000-0000-0000-000000000014', 2026)
$$, 'AC-004: Krishna creates a Retail Ops Objective');
select throws_ok($$
  insert into mos.objectives (name, business_unit_id) values ('Krishna Marketing', '20000000-0000-0000-0000-000000000011')
$$, '42501', null, 'AC-004: Krishna cannot create a Marketing Objective');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000001a","access_roles":["manager"]}';
select lives_ok($$
  insert into mos.objectives (name, business_unit_id) values ('Brand Reach', '20000000-0000-0000-0000-000000000011')
$$, 'AC-004: Maya creates a Marketing Objective — heading a unit is enough, reports are not required');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
select throws_ok($$
  insert into mos.objectives (name, business_unit_id) values ('Bulan Objective', '20000000-0000-0000-0000-000000000014')
$$, '42501', null, 'AC-004: Bulan cannot create an Objective in her own unit');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000005","access_roles":["member","finance"]}';
select throws_ok($$
  insert into mos.objectives (name, business_unit_id) values ('Fitri Objective', '20000000-0000-0000-0000-000000000014')
$$, '42501', null, 'AC-004: Fitri cannot create a Retail Ops Objective');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-005 — type defaults to project and locks once an occurrence exists
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000002","access_roles":["member"]}';
insert into mos.work_lines (id, name, business_unit_id)
  values ('00000000-0000-0000-0000-000000008051', 'Menu Refresh', '20000000-0000-0000-0000-000000000014');
select is((select type from mos.work_lines where id = '00000000-0000-0000-0000-000000008051'),
  'project', 'AC-005: type defaults to project');
select lives_ok($$
  update mos.work_lines set type = 'process' where id = '00000000-0000-0000-0000-000000008051'
$$, 'AC-005: type changes freely while no occurrence exists');

-- An occurrence lands (the spawn RPC's write, done directly under the bypass role).
reset role;
insert into mos.process_runs (org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
                              definition_version, spec_snapshot)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000008051',
          (select id from shared.teams where org_id = '10000000-0000-0000-0000-000000000001' and code = 'hq_operations'),
          '2026-09-01', 'Menu Refresh · 2026-09-01', date '2026-09-01', 1, '{}'::jsonb);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000002","access_roles":["member"]}';

select throws_ok($$
  update mos.work_lines set type = 'project' where id = '00000000-0000-0000-0000-000000008051'
$$, '42501', 'type is locked once an occurrence exists',
  'AC-005: type is refused once a run exists');
select lives_ok($$
  update mos.work_lines set name = 'Menu Refresh Q4' where id = '00000000-0000-0000-0000-000000008051'
$$, 'AC-005: ...while every other column stays editable — the lock is on type alone');
select is((select type from mos.work_lines where id = '00000000-0000-0000-0000-000000008051'),
  'process', 'AC-005: ...and the type stayed');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-006 — a Process's Accountable person writes its cadence and step definitions
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Krishna is A on Kitchen Opening (…8031).
select lives_ok($$
  insert into mos.process_cadences (id, work_line_id, cadence_kind)
  values ('00000000-0000-0000-0000-000000008061', '00000000-0000-0000-0000-000000008031', 'daily')
$$, 'AC-006: the Process A (Krishna) writes its cadence');
select lives_ok($$
  insert into mos.process_task_defs (work_line_id, title, pic_person_id)
  values ('00000000-0000-0000-0000-000000008031', 'Check cold room', '40000000-0000-0000-0000-000000000002')
$$, 'AC-006: the Process A writes a step definition');
select throws_ok($$
  insert into mos.process_task_defs (work_line_id, title)
  values ('00000000-0000-0000-0000-000000008031', 'Ownerless step')
$$, '23514', null, 'AC-006: a step with neither pic_person_id nor pic_role_id is refused — never an ownerless definition');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
select throws_ok($$
  insert into mos.process_task_defs (work_line_id, title, pic_person_id)
  values ('00000000-0000-0000-0000-000000008031', 'Bulan step', '40000000-0000-0000-0000-000000000007')
$$, '42501', null, 'AC-006: Bulan cannot add a step to a Process she is not Accountable for');
-- The UPDATE gate sits in USING, so an unauthorised edit is a silent no-op rather than a raise —
-- the same shape mos_03 asserts for a plain member. The assertion is that nothing moved.
update mos.process_cadences set cadence_kind = 'monthly' where id = '00000000-0000-0000-0000-000000008061';
select is((select cadence_kind from mos.process_cadences where id = '00000000-0000-0000-0000-000000008061'),
  'daily', 'AC-006: Bulan changed no cadence');

-- Maya is a lead, but of another unit and not this Process's A: lead-ness alone opens nothing here.
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000001a","access_roles":["manager"]}';
select throws_ok($$
  insert into mos.process_task_defs (work_line_id, title, pic_person_id)
  values ('00000000-0000-0000-0000-000000008031', 'Maya step', '40000000-0000-0000-0000-00000000001a')
$$, '42501', null, 'AC-006: a lead of another unit cannot add a step — the cadence/step gate is the Process A, admin or ops_lead');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["member","ops_lead"]}';
select lives_ok($$
  update mos.process_cadences set cadence_kind = 'weekly' where id = '00000000-0000-0000-0000-000000008061'
$$, 'AC-006: Cahya (ops_lead) edits the cadence');
select is((select cadence_kind from mos.process_cadences where id = '00000000-0000-0000-0000-000000008061'),
  'weekly', 'AC-006: ...and the edit landed');
select lives_ok($$
  insert into mos.process_task_defs (work_line_id, title, pic_person_id)
  values ('00000000-0000-0000-0000-000000008031', 'Sign the checklist', '40000000-0000-0000-0000-000000000001')
$$, 'AC-006: Cahya adds a step');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AC-007 — everyone reads the org's definitions and nobody reads another org's
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- One view over the four tables, so each actor is two assertions: own-org rows present, foreign
-- rows absent. The foreign fixture guarantees there IS something to leak. security_invoker, so the
-- view evaluates RLS as the querying actor and not as its owner.
reset role;
create temp view definition_rows with (security_invoker = true) as
  select org_id from mos.work_lines        union all
  select org_id from mos.objectives        union all
  select org_id from mos.process_cadences  union all
  select org_id from mos.process_task_defs;
grant select on definition_rows to authenticated;
set local role authenticated;

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000000","access_roles":["admin"]}';
select cmp_ok((select count(*) from definition_rows where org_id = '10000000-0000-0000-0000-000000000001'), '>', 0::bigint,
  'AC-007: Dewi reads the org''s definitions');
select is((select count(*)::int from definition_rows where org_id <> '10000000-0000-0000-0000-000000000001'), 0,
  'AC-007: Dewi reads no foreign row');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["member","ops_lead"]}';
select cmp_ok((select count(*) from definition_rows where org_id = '10000000-0000-0000-0000-000000000001'), '>', 0::bigint,
  'AC-007: Cahya reads the org''s definitions');
select is((select count(*)::int from definition_rows where org_id <> '10000000-0000-0000-0000-000000000001'), 0,
  'AC-007: Cahya reads no foreign row');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000002","access_roles":["member"]}';
select cmp_ok((select count(*) from definition_rows where org_id = '10000000-0000-0000-0000-000000000001'), '>', 0::bigint,
  'AC-007: Krishna reads the org''s definitions');
select is((select count(*)::int from definition_rows where org_id <> '10000000-0000-0000-0000-000000000001'), 0,
  'AC-007: Krishna reads no foreign row');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-00000000001a","access_roles":["manager"]}';
select cmp_ok((select count(*) from definition_rows where org_id = '10000000-0000-0000-0000-000000000001'), '>', 0::bigint,
  'AC-007: Maya reads the org''s definitions');
select is((select count(*)::int from definition_rows where org_id <> '10000000-0000-0000-0000-000000000001'), 0,
  'AC-007: Maya reads no foreign row');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000007","access_roles":["member"]}';
select cmp_ok((select count(*) from definition_rows where org_id = '10000000-0000-0000-0000-000000000001'), '>', 0::bigint,
  'AC-007: Bulan reads the org''s definitions — a member who can write none of them still reads all of them');
select is((select count(*)::int from definition_rows where org_id <> '10000000-0000-0000-0000-000000000001'), 0,
  'AC-007: Bulan reads no foreign row');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000005","access_roles":["member","finance"]}';
select cmp_ok((select count(*) from definition_rows where org_id = '10000000-0000-0000-0000-000000000001'), '>', 0::bigint,
  'AC-007: Fitri reads the org''s definitions');
select is((select count(*)::int from definition_rows where org_id <> '10000000-0000-0000-0000-000000000001'), 0,
  'AC-007: Fitri reads no foreign row');

-- The read policies themselves: one per table, and none of them tests a role or a capability.
reset role;
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'mos' and cmd = 'SELECT'
      and tablename in ('work_lines', 'objectives', 'process_cadences', 'process_task_defs')),
  4, 'AC-007: each of the four definition tables carries exactly one SELECT policy');
select is(
  (select coalesce(array_agg(tablename || ' :: ' || policyname order by tablename), '{}')
     from pg_policies
    where schemaname = 'mos' and cmd = 'SELECT'
      and tablename in ('work_lines', 'objectives', 'process_cadences', 'process_task_defs')
      and coalesce(qual, '') ~* '(access_role|shared\.can\(|can_manage|is_manager_of)'),
  '{}'::text[], 'AC-007: ...and no read policy selects by role or capability — reading is org membership alone');

select * from finish();
rollback;
