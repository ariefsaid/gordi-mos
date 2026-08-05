-- ops, squashed baseline — the action labels are DERIVED, and the three literals are stored nowhere.
--
-- DD-WAY-13. `ops.kitchen_logs` and `ops.kitchen_plans` on both prior chains constrained action_type
-- to exactly ('Production','Transfer to Bungur','Transfer to Radiant') — copied verbatim from the
-- incumbent, which folded the destination into the action because Teable had ONE FLAT FIELD and
-- there was one production branch. That was a storage workaround, never a domain truth. The ERP was
-- always parameterised: the incumbent's ESB client holds zero branch constants and takes every id as
-- a caller argument; the hardcoding lives entirely in its dispatch table.
--
-- So this file asserts two things that have to hold together:
--   1. Nothing stores the literals. Asserted over the catalog, so re-introducing them anywhere in
--      the schema "for parity" fails here.
--   2. The labels still come out exactly right. OD-K-1 parity is BEHAVIOURAL — same three tabs, same
--      strings, same flow — and deriving delivers it. A test that only proved (1) would be satisfied
--      by deleting the feature.
--
-- The derivation is then pushed past the incumbent's three cases, because the whole reason for the
-- reshape is the four streams it never covered. A rule that happens to produce the right answer for
-- Rumah Rames and Radiant but hardcodes them is not a model.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select ops._test_seed_cafe();

-- ── (1) The literals are not stored ──────────────────────────────────────────────────────────
select is(
  (select coalesce(array_agg(distinct c.relname order by c.relname), '{}')
     from pg_constraint k
     join pg_class c on c.oid = k.conrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ops' and k.contype = 'c'
      and pg_get_constraintdef(k.oid) like '%Transfer to %'),
  '{}'::name[],
  'DD-WAY-13: no CHECK constraint in ops enumerates the three literals — the labels are not a stored vocabulary');

select is(
  (select coalesce(array_agg(distinct t.tablename order by t.tablename), '{}')
     from pg_policies t
    where t.schemaname = 'ops' and (coalesce(t.qual,'') || coalesce(t.with_check,'')) like '%Transfer to %'),
  '{}'::name[],
  'DD-WAY-13: no ops policy predicates on the three literals either');

select has_column('ops','kitchen_logs','action',
  'the stored model says what happened...');
select has_column('ops','kitchen_logs','destination_branch_id',
  '...and separately where it went — the two facts the flat field had to share');

-- The stored vocabulary is exactly the two verbs the domain has.
select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                                wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-25',
          '00000000-0000-0000-0000-00000000bf02','kitchen','Production',
          '00000000-0000-0000-0000-00000000ab01',1,'00000000-0000-0000-0000-0000000000d1')
  $$, '23514', 'new row for relation "kitchen_logs" violates check constraint "kitchen_logs_action_check"',
  'the old label is not even a legal value for `action` — a half-finished port fails loudly rather than storing a lie');

-- ── (2) Parity: the three strings still come out, exactly ────────────────────────────────────
select is(ops.kitchen_action_label('produce', null), 'Production',
  'OD-K-1 parity: produce still reads "Production"');
select is(ops.kitchen_action_label('transfer','00000000-0000-0000-0000-00000000bf03'), 'Transfer to Radiant',
  'OD-K-1 parity: a transfer to Radiant still reads "Transfer to Radiant"');
select is(ops.kitchen_action_label('transfer','00000000-0000-0000-0000-00000000bf02'), 'Transfer to Bungur',
  'OD-K-1 parity: a transfer to Rumah Rames still reads "Transfer to Bungur" — the incumbent''s UI label for that branch, applied at display and stored nowhere');

-- Read through the fact rows themselves, not just the function, so the wiring is proven too.
select is(
  (select ops.action_label(l) from ops.kitchen_logs l where l.id = '00000000-0000-0000-0000-00000000ac01'),
  'Production',
  'the label reads off a real produce row');
select is(
  (select ops.action_label(l) from ops.kitchen_logs l where l.id = '00000000-0000-0000-0000-00000000ac04'),
  'Transfer to Radiant',
  'the label reads off a real cross-branch transfer row');
select is(
  (select ops.action_label(l) from ops.kitchen_logs l where l.id = '00000000-0000-0000-0000-00000000ac05'),
  'Transfer to Bungur',
  'the label reads off a real within-branch transfer row');
select is(
  (select ops.action_label(p) from ops.kitchen_plans p where p.id = '00000000-0000-0000-0000-00000000ae02'),
  'Transfer to Radiant',
  'plans derive their label the same way, from the same function');

-- ── The batch prefix, also derived ───────────────────────────────────────────────────────────
select is(ops.kitchen_batch_prefix('produce','00000000-0000-0000-0000-00000000bf02', null), 'PR',
  'FR-051: the batch prefix for a produce is still PR');
select is(ops.kitchen_batch_prefix('transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000bf03'), 'TR',
  'FR-051: a cross-branch transfer is still TR');
select is(ops.kitchen_batch_prefix('transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000bf02'), 'TB',
  'FR-051: a within-branch transfer is still TB');

-- ── The ERP endpoint, and the no-op for the RIGHT reason ─────────────────────────────────────
-- The incumbent's own module docstring explains its no-op as "stays at Bungur, same location". That
-- is wrong, and the correct reason generalises where the location one does not: the ERP already
-- books the origin branch as having produced it, so a movement inside those books has no
-- counterpart. Expressed as origin-equals-destination, the rule holds for every branch.
select is(ops.esb_endpoint_for('produce','00000000-0000-0000-0000-00000000bf02', null), 'assembly-actual',
  'a produce posts an assembly');
select is(ops.esb_endpoint_for('transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000bf03'), 'simple-transfer',
  'a transfer between two branches posts a real ERP movement');
select is(ops.esb_endpoint_for('transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000bf02'), 'noop',
  'a transfer within one branch''s books posts nothing — because those books never recorded it leaving, not because it stayed in one place');
select is(ops.esb_endpoint_for('transfer','00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-00000000bf01'), 'noop',
  'and the same holds for GORDI HQ, a branch the incumbent never had a case for — the rule is structural, not a hardcoded destination');

select * from finish();
rollback;
