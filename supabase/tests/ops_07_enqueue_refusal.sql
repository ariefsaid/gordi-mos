-- ops, squashed baseline — the schema refuses to enqueue an outbox row for a log the ERP already
-- holds (AC-012, DD-WAY-20).
--
-- Read the ruling before changing anything here, because the obvious mental model of this control is
-- the wrong one and a session already got it wrong once.
--
-- OD-K-4 makes "at most one ERP document per batch" hard safety. OD-WAY-38's flip-time import
-- re-arms it: every imported log line corresponds to a document the live ERP ALREADY HOLDS. The
-- standing instruction was that the importer stamps posted_to_esb and the danger passes. It does
-- not. On both prior chains posted_to_esb was NEVER READ AS A PREDICATE — not in a policy, not in a
-- function, not in the app. It was an audit mirror of what the worker had stamped, and stamping it
-- guaranteed nothing on its own. What actually prevented a re-POST was structural and indirect: no
-- outbox row exists for a row that never passed through approval, and the approval guard refuses
-- anything not Submitted.
--
-- Those two hold for the paths that exist today and not for the ones the flip and bar capture are
-- about to add — a loader status-mapping slip, a backfill enqueue, a bulk-approve path. This file
-- proves the flag has become load-bearing, which is the only thing that makes the standing
-- instruction true as written.
--
-- ⚠ THE CENTRAL ASSERTION IS THE FIFTH ONE, and it is deliberately built as a mutation rather than a
-- static check. The same enqueue is run twice against the same batch with NOTHING changed between
-- the two runs except the posted flag. It succeeds the first time and raises the second. That is
-- what distinguishes a predicate that is read from one that merely exists: a guard ignoring the flag
-- would pass both runs, and a guard refusing everything would fail both.
--
-- The writer here is the table owner rather than `authenticated`, because that is who actually
-- enqueues: the approval path is SECURITY DEFINER and the worker holds service_role. A refusal that
-- only bound the app tier would bind nobody who can reach this table.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select ops._test_seed_cafe();

-- Fixture reminder: aa01 is imported history — Approved, posted, batch PR-20260601-001, carrying its
-- original ERP document number. aa02 is a MOS-authored Approved batch PR-20260602-001 that has NOT
-- been posted. They differ in exactly the flag under test.

-- ── AC-012: the refusal ──────────────────────────────────────────────────────────────────────
select throws_ok($$
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260601-001','assembly-actual',
          'kitchen|PR-20260601-001|gkid')
  $$, '55000', 'batch PR-20260601-001 is already posted to the ERP; refusing to enqueue an outbox row for it',
  'AC-012: an outbox row for a batch already posted to the ERP is refused at the schema level');

select is((select count(*)::int from integrations.esb_push where source_ref = 'PR-20260601-001'), 0,
  'AC-012: ...and no row was created — the refusal is a raise, not a silent filter');

-- ── Control: an unposted batch still enqueues ────────────────────────────────────────────────
select lives_ok($$
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260602-001','assembly-actual',
          'kitchen|PR-20260602-001|gkid')
  $$, 'control: an unposted batch enqueues normally, so the refusal is not a table that rejects everything');

-- The dedup key remains the central double-post guard, and its precise limit is worth pinning
-- because it is easy to over-trust (DD-WAY-14): the target environment is INSIDE the key, so the
-- guarantee is at most one post per batch PER ENVIRONMENT. Correct by design — a dry-run post is not
-- a real one — but it means the flip's safety comes from stopping the other writer, not from dedup.
select throws_ok($$
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260602-001','assembly-actual',
          'kitchen|PR-20260602-001|gkid')
  $$, '23505', null,
  'OD-K-4: the dedup key is unique, so one batch cannot be enqueued twice for the same target environment');

-- ── The flag is what is being read, proven by changing only the flag ─────────────────────────
update ops.kitchen_logs set posted_to_esb = true, esb_doc_num = 'ESB-JUST-POSTED'
 where id = '00000000-0000-0000-0000-00000000aa02';

select throws_ok($$
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260602-001','assembly-actual',
          'kitchen|PR-20260602-001|goo')
  $$, '55000', 'batch PR-20260602-001 is already posted to the ERP; refusing to enqueue an outbox row for it',
  'DD-WAY-20: the SAME enqueue is now refused with only the posted flag changed — the flag is load-bearing, not an audit mirror');

-- ── The refusal covers the routes an approval path does not control ──────────────────────────
-- A schema-level control has to cover the paths that do not exist yet: a backfill, a bulk approve, a
-- loader that lands a row in the wrong status. None of those go through approval.
select throws_ok($$
  update integrations.esb_push set source_ref = 'PR-20260601-001'
   where id = '00000000-0000-0000-0000-00000000ba01'
  $$, '55000', 'batch PR-20260601-001 is already posted to the ERP; refusing to enqueue an outbox row for it',
  'AC-012: an existing outbox row cannot be RE-POINTED at a posted batch — enqueue is not the only way to arrive there');

-- The worker holds service_role and can mutate these rows. It is bound by the same refusal, which is
-- what "schema level" has to mean: not a rule the enqueuing code agrees to follow.
set local role service_role;
select throws_ok($$
  update integrations.esb_push set source_ref = 'PR-20260601-001'
   where id = '00000000-0000-0000-0000-00000000ba01'
  $$, '55000', 'batch PR-20260601-001 is already posted to the ERP; refusing to enqueue an outbox row for it',
  'AC-012: the worker''s own role is refused too — the guard binds every writer that can reach the table');
reset role;

-- ── It refuses the right thing, and only the right thing ─────────────────────────────────────
-- source_ref names a kitchen batch only for the kitchen module. A roastery row whose reference
-- happens to collide with a posted kitchen batch id is a different fact and must not be blocked.
select lives_ok($$
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, dedup_key)
  values ('00000000-0000-0000-0000-0000000000a1','roastery','PR-20260601-001','assembly-actual',
          'roastery|PR-20260601-001|gkid')
  $$, 'a non-kitchen outbox row is not matched against a kitchen batch id — the guard is scoped to the module that owns the reference');

-- Another tenant's identically-named batch is a different batch. The lookup is org-scoped, so a
-- collision across tenants can neither block a legitimate enqueue nor reveal that the other exists.
select lives_ok($$
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, dedup_key)
  values ('00000000-0000-0000-0000-0000000000b1','kitchen','PR-20260601-001','assembly-actual',
          'kitchen|PR-20260601-001|orgb')
  $$, 'the lookup is org-scoped: another tenant''s batch of the same name is a different batch');

-- ── And the flag it reads is genuinely reachable state, not a constant ───────────────────────
select ok(
  (select posted_to_esb from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000aa01')
  and not exists (select 1 from ops.kitchen_logs
                   where org_id = '00000000-0000-0000-0000-0000000000a1'
                     and status = 'Submitted' and posted_to_esb),
  'the posted flag is set on history and unset on everything still awaiting review — the two states the refusal distinguishes both exist');

select * from finish();
rollback;
