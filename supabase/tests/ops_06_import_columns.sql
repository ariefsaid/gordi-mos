-- ops, squashed baseline — the import columns (AC-011, OD-WAY-38).
--
-- At the flip, Teable's history is imported into ops.kitchen_logs and ops.kitchen_plans THEMSELVES,
-- not into an archive. The argument that decided it is a COGS argument: a COGS series with a seam at
-- the flip date is the exact shape of problem that let July's blow-up hide. Roll-ups, variance and
-- month-over-month comparison must not have to know the flip happened, and an archive table makes
-- every one of those a union somebody eventually forgets to write.
--
-- Landing history in the live table breaks one constraint, and that break is the whole of AC-011:
-- submitted_by was `not null` on both prior chains, and Teable's rows will not all name a MOS person.
-- So the requirement is expressed PER SOURCE — required for MOS-authored rows, optional for imported
-- ones. It is a CHECK the baseline can carry cleanly and it is only cheap during this squash.
--
-- The pairing matters more than either half. "submitted_by is nullable" on its own is a regression:
-- it would let a MOS capture surface write an unattributed production line, which is precisely the
-- accountability the incumbent already has. The constraint is what makes the nullability safe.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select ops._test_seed_cafe();

-- ── The marker exists on both tables the import writes ───────────────────────────────────────
select has_column('ops','kitchen_logs','source',
  'OD-WAY-38: kitchen logs carry a source marker');
select has_column('ops','kitchen_plans','source',
  'OD-WAY-38: kitchen plans carry it too — the import covers the plan history as well as the actuals');

select is(
  (select column_default from information_schema.columns
    where table_schema='ops' and table_name='kitchen_logs' and column_name='source'),
  '''mos''::text',
  'source defaults to mos, so an ordinary capture never has to think about it');

-- ── AC-011, first half: an imported row with no submitter is ACCEPTED ────────────────────────
select is(
  (select count(*)::int from ops.kitchen_logs
    where source = 'teable_import' and submitted_by is null), 1,
  'AC-011: an imported row with a null submitter exists — Teable history will not all name a MOS person');

select lives_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, status, source, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-05-30',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',3,'Approved','teable_import',null)
  $$, 'AC-011: ...and another can be written the same way, which is what the flip-time loader does');

-- ── AC-011, second half: a MOS-authored row with no submitter is REFUSED ─────────────────────
select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, source, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',1,'mos',null)
  $$, '23514', 'new row for relation "kitchen_logs" violates check constraint "kitchen_logs_submitter_required_for_mos"',
  'AC-011: a MOS-authored log with no submitter is refused — nullability is conditional, not general');

select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',1,null)
  $$, '23514', 'new row for relation "kitchen_logs" violates check constraint "kitchen_logs_submitter_required_for_mos"',
  'AC-011: ...and the same holds when source is left to its default, which is the path a capture surface actually takes');

-- ── The marker is a closed vocabulary and cannot be rewritten after the fact ─────────────────
select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, source, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
          '00000000-0000-0000-0000-00000000ab01',1,'somewhere_else',
          '00000000-0000-0000-0000-0000000000d1')
  $$, '23514', 'new row for relation "kitchen_logs" violates check constraint "kitchen_logs_source_check"',
  'source is a closed vocabulary: mos or teable_import, nothing else');

select throws_ok($$
  update ops.kitchen_logs set source = 'teable_import'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'source is immutable on a kitchen log',
  'source is immutable: a MOS row cannot be relabelled as history, which would make the conditional submitter rule meaningless');

select throws_ok($$
  update ops.kitchen_logs set source = 'mos'
   where id = '00000000-0000-0000-0000-00000000aa01'
  $$, '42501', 'source is immutable on a kitchen log',
  '...and history cannot be relabelled as MOS-authored either');

-- ── Imported rows land in the LIVE tables, reachable by the ordinary read path ───────────────
-- This is the property the archive option would have cost, so it is asserted rather than assumed: a
-- date-ranged query that knows nothing about the flip returns both halves of the series.
select is(
  (select count(*)::int from ops.kitchen_logs
    where org_id = '00000000-0000-0000-0000-0000000000a1'
      and log_date between '2026-06-01' and '2026-06-30'
      and status = 'Approved'), 2,
  'a plain date-ranged read returns imported history AND MOS-authored rows together — no union, no seam at the flip date');

select is(
  (select coalesce(array_agg(distinct source order by source), '{}')
     from ops.kitchen_logs where org_id = '00000000-0000-0000-0000-0000000000a1'),
  array['mos','teable_import'],
  '...and both provenances coexist in one table, which is the point of not using an archive');

-- ── The ERP posting history survives the import (OD-K-4's third leg) ─────────────────────────
-- Every imported line corresponds to a document the live ERP already holds, so the columns that
-- record that have to carry across with it. This is the input the enqueue refusal reads; ops_07
-- proves the refusal itself.
select ok(
  (select posted_to_esb and esb_doc_num is not null
     from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000aa01'),
  'OD-K-4: an imported row carries its posted flag and its original ERP document number');

select has_column('ops','kitchen_logs','esb_doc_num',
  'the original ERP document number has somewhere to live — history-preserving migration is a leg of the no-double-post guarantee, not a nicety');

select * from finish();
rollback;
