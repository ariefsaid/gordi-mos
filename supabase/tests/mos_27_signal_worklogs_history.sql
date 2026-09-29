-- mos — batch 2b of the change-history rollout (#987): the Signal family (signals, mentions,
-- acknowledgements, signal-to-task links), the weekly-update pair and the two work-log tables
-- (events, follow_ups) write shared.record_history through the one generic trigger; the two
-- trigger-owned clocks (signals.edited_at, weekly_updates.submitted_at) leave no trace; per-record
-- read gating follows each table's own read predicate — upward-only for the weekly-update pair,
-- lane-scoped for follow_ups, default-deny for the Signal family — and the batch's one
-- hard-DELETE (a weekly_update_item by its own author) stays readable after deletion through the
-- snapshot arm, by exactly those who could read the item before it was deleted.
--
-- FIXTURE DEVIATION, stated at the point of use: mos._test_seed_signal_tree strips Peer's role
-- assignments (see mos_07_signals) — she is the same-org persona no Signal read rule reaches, and
-- no weekly-update author's manager, so every "same org, still sees nothing" assertion below is
-- about the read gates, not about tenancy.
begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

select set_config('app.allow_test_seeds', 'on', true);
-- mos._test_seed_signal_tree performs the shared directory itself (orgs/roles/people + the
-- Signal Teams), so it must be the ONLY directory seeding here — a second call re-inserts the
-- same org rows and aborts the transaction.
select mos._test_seed_signal_tree();
select mos._test_seed_follow_ups();

-- Org A (...0a1) rows, seeded by hand as a service session (no claims): one retired team-audience
-- Signal by Author ...0d1 on OwnTeam ...5b01 (so Peer ...0d4 — SiblingTeam only, no roles — cannot
-- read it), its three children, a weekly update of Author's with two lines (plus an org-B control
-- pair), one Event, one retail-lane follow-up.
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000009940', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1', 'team', '00000000-0000-0000-0000-000000005b01',
        now(), 'History signal body');
insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-000000009941', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009940', 'person', '00000000-0000-0000-0000-0000000000d2');
insert into mos.signal_acknowledgements (id, org_id, signal_id, person_id)
values ('00000000-0000-0000-0000-000000009942', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009940', '00000000-0000-0000-0000-0000000000d2');
insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id,
                       accountable_person_id, created_by)
values ('00000000-0000-0000-0000-000000009943', '00000000-0000-0000-0000-0000000000a1',
        'History Signal Task', '00000000-0000-0000-0000-0000000000a2',
        '00000000-0000-0000-0000-000000005b01', '00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1');
insert into mos.signal_tasks (id, org_id, signal_id, task_id, created_by)
values ('00000000-0000-0000-0000-000000009944', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009940', '00000000-0000-0000-0000-000000009943',
        '00000000-0000-0000-0000-0000000000d1');
insert into mos.weekly_updates (id, org_id, person_id, created_by, week_start)
values ('00000000-0000-0000-0000-000000009945', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
        date '2026-09-21');
insert into mos.weekly_update_items (id, org_id, weekly_update_id, label, position)
values ('00000000-0000-0000-0000-000000009946', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009945', 'History line', 0);
insert into mos.weekly_update_items (id, org_id, weekly_update_id, label, position)
values ('00000000-0000-0000-0000-000000009947', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009945', 'Second line', 1);
-- The isolation controls: a REAL org-B weekly update + line, whose history org A must not read.
insert into mos.weekly_updates (id, org_id, person_id, created_by, week_start)
values ('00000000-0000-0000-0000-000000009948', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4',
        date '2026-09-21');
insert into mos.weekly_update_items (id, org_id, weekly_update_id, label, position)
values ('00000000-0000-0000-0000-000000009949', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-000000009948', 'Foreign line', 0);
insert into mos.events (id, org_id, title, venue, is_outbound, starts_at, ends_at, created_by)
values ('00000000-0000-0000-0000-000000009950', '00000000-0000-0000-0000-0000000000a1',
        'History Event', 'Main Hall', false, timestamptz '2026-10-10 08:00+07',
        timestamptz '2026-10-10 12:00+07', '00000000-0000-0000-0000-0000000000d1');
insert into mos.follow_ups (id, org_id, counterparty, kind, lane, source_invoice_ref,
                            original_amount, running_balance, promise_date)
values ('00000000-0000-0000-0000-000000009951', '00000000-0000-0000-0000-0000000000a1',
        'PT History', 'retail_pending', 'retail_ops', 'INV-HIST-1', 100000, 100000,
        date '2026-09-28');

select has_function('shared', 'can_read_history_record', ARRAY['text','text','text','text','jsonb'],
  'the read dispatch is exposed with the (schema, table, key, action, snapshot) shape');

-- ── an INSERT appends exactly one summary row, on each of the eight ───────────────────────────
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'signals'
             and record_key = '00000000-0000-0000-0000-000000009940'),
  1, 'an INSERT into mos.signals appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'signal_mentions'
             and record_key = '00000000-0000-0000-0000-000000009941'),
  1, 'an INSERT into mos.signal_mentions appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'signal_acknowledgements'
             and record_key = '00000000-0000-0000-0000-000000009942'),
  1, 'an INSERT into mos.signal_acknowledgements appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'signal_tasks'
             and record_key = '00000000-0000-0000-0000-000000009944'),
  1, 'an INSERT into mos.signal_tasks appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'weekly_updates'
             and record_key = '00000000-0000-0000-0000-000000009945'),
  1, 'an INSERT into mos.weekly_updates appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'weekly_update_items'
             and record_key = '00000000-0000-0000-0000-000000009946'),
  1, 'an INSERT into mos.weekly_update_items appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'events'
             and record_key = '00000000-0000-0000-0000-000000009950'),
  1, 'an INSERT into mos.events appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'follow_ups'
             and record_key = '00000000-0000-0000-0000-000000009951'),
  1, 'an INSERT into mos.follow_ups appends exactly one history row');

-- ── a two-column UPDATE appends exactly two rows, with the old and new values ─────────────────
update mos.follow_ups set notes = 'Called the shop', promise_date = date '2026-10-05'
 where id = '00000000-0000-0000-0000-000000009951';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951'),
  3, 'a two-column UPDATE on mos.follow_ups appends exactly two rows (insert + 2)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951' and field_name = 'notes'),
  null, 'the notes change records a NULL old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951' and field_name = 'notes'),
  'Called the shop', 'the notes change records the new value');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951' and field_name = 'promise_date'),
  '2026-09-28', 'the promise_date change records the old value, date-cast honestly');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951' and field_name = 'promise_date'),
  '2026-10-05', 'the promise_date change records the new value');

-- ── a no-op write appends nothing ─────────────────────────────────────────────────────────────
update mos.follow_ups set notes = 'Called the shop'
 where id = '00000000-0000-0000-0000-000000009951';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951'),
  3, 'an UPDATE that changes no column appends no row');

-- ── an assignment change records the directory reference by value ─────────────────────────────
update mos.follow_ups set assigned_to = '00000000-0000-0000-0000-0000000000d4'
 where id = '00000000-0000-0000-0000-000000009951';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951'),
  4, 'an assignment change appends its row');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951' and field_name = 'assigned_to'),
  '00000000-0000-0000-0000-0000000000d4', 'the assignment records the person id text');
update mos.events set note = null
 where id = '00000000-0000-0000-0000-000000009950';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009950'),
  1, 'setting an already-NULL column appends no row');

-- ── authenticated writes stamp the session's person claim, and only real columns ──────────────
-- The personas are the tables' real write authorities: Signal content is author-only
-- (mos._guard_signals), weekly-update rows are their own author's (can_write_own_update), an Event
-- is editable by its creator, a mention is revocable by its Signal's author.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

update mos.signals set body = 'Edited body', attention = 'Urgent'
 where id = '00000000-0000-0000-0000-000000009940';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009940'),
  3, 'a two-field Signal edit appends exactly two rows (insert + 2)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009940' and field_name = 'body'),
  'History signal body', 'the Signal body change records the old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009940' and field_name = 'body'),
  'Edited body', 'the Signal body change records the new value');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009940' and field_name = 'attention'),
  '00000000-0000-0000-0000-0000000000d1',
  'the author''s Signal edit stamps the session''s person claim as actor');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009940' and field_name = 'edited_at'),
  0, 'the guard-stamped edited_at clock writes no history row beside the content it stamps');

update mos.weekly_update_items set progress = 'done'
 where id = '00000000-0000-0000-0000-000000009946';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009946'),
  2, 'the author''s line edit appends exactly one update row (insert + 1)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009946' and field_name = 'progress'),
  'in_progress', 'the line progress change records the old value');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009946' and field_name = 'progress'),
  '00000000-0000-0000-0000-0000000000d1',
  'the author''s line edit stamps the session''s person claim as actor');

update mos.signal_mentions set revoked_at = now()
 where id = '00000000-0000-0000-0000-000000009941';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009941'),
  2, 'revoking a mention appends exactly one update row (insert + 1)');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009941' and action = 'update'),
  '00000000-0000-0000-0000-0000000000d1',
  'the mention revoke stamps the Signal author''s person claim as actor');

update mos.events set note = 'Vendor confirmed'
 where id = '00000000-0000-0000-0000-000000009950';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009950'),
  2, 'the creator''s Event edit appends exactly one update row (insert + 1)');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009950' and action = 'update'),
  '00000000-0000-0000-0000-0000000000d1',
  'the Event edit stamps the creator''s person claim as actor');

-- ── the delete arm: the batch's one hard-DELETE, read back through the snapshot ───────────────
-- As the line's own author (parent still draft), delete one weekly_update_item. Exactly one
-- action='delete' row — NULL field/old/new, whole-row snapshot — and it stays readable afterwards
-- by exactly those who could read the item before deletion: its author, and the author's manager
-- through the upward gate; never a same-org member the upward gate does not reach.
delete from mos.weekly_update_items
 where id = '00000000-0000-0000-0000-000000009947';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009947'),
  1, 'after the DELETE the author reads exactly one history row (the delete row; the gone insert row is live-looked-up away)');
select is((select action from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009947'),
  'delete', 'the row is an action=''delete'' row');
select is((select field_name from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009947'),
  null, 'the delete row carries no field name');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009947'),
  null, 'the delete row carries no old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009947'),
  null, 'the delete row carries no new value');
select is((select old_row_snapshot ->> 'weekly_update_id' from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009947'),
  '00000000-0000-0000-0000-000000009945', 'the delete row''s snapshot carries the parent weekly_update_id');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009947'),
  1, 'the author''s manager — who could read the item through the upward gate — still reads its delete row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009947'),
  0, 'a same-org member the upward gate does not reach reads no delete row');

-- The org-B control deletes its own line: its author reads the delete row, org A reads none of it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
delete from mos.weekly_update_items
 where id = '00000000-0000-0000-0000-000000009949';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009949'),
  1, 'the org-B author reads exactly their own line''s delete row');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009949'),
  0, 'an org-A member reads none of the org-B line''s history');

-- ── the submit, after the line deletes: status carries the change, the clock stays silent ─────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update mos.weekly_updates set summary = 'Week 39 done', status = 'submitted'
 where id = '00000000-0000-0000-0000-000000009945';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009945'),
  3, 'submitting appends exactly two rows (insert + summary + status)');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009945' and field_name = 'submitted_at'),
  0, 'the guard-owned submitted_at clock writes no history row beside the status that drives it');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009945' and field_name = 'status'),
  '00000000-0000-0000-0000-0000000000d1', 'the submit stamps its own author''s person claim as actor');

-- ── AC-007: history is readable exactly by those who could read the record ────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'signals'
             and record_key = '00000000-0000-0000-0000-000000009940'),
  3, 'the author reads the Signal''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'signal_mentions'
             and record_key = '00000000-0000-0000-0000-000000009941'),
  2, 'the author reads the mention''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'signal_acknowledgements'
             and record_key = '00000000-0000-0000-0000-000000009942'),
  1, 'the author reads the acknowledgement''s history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'signal_tasks'
             and record_key = '00000000-0000-0000-0000-000000009944'),
  1, 'the author reads the signal-to-task link''s history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'weekly_updates'
             and record_key = '00000000-0000-0000-0000-000000009945'),
  3, 'the author reads the weekly update''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'weekly_update_items'
             and record_key = '00000000-0000-0000-0000-000000009946'),
  2, 'the author reads the line''s history');
select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'events'
             and record_key = '00000000-0000-0000-0000-000000009950'),
  2, 'the creator reads the Event''s history');

-- Peer ...0d4: same org, but no Signal read rule reaches her and she is not the update author's
-- manager — the record walls are the history walls.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009940'),
  0, 'a same-org member who cannot read the team Signal reads none of its history');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009941'),
  0, 'the Signal read wall extends to the mention''s history');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009942'),
  0, 'the Signal read wall extends to the acknowledgement''s history');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009944'),
  0, 'the Signal read wall extends to the signal-to-task link''s history');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009945'),
  0, 'a same-org non-manager reads none of the weekly update''s history');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009946'),
  0, 'the upward wall extends to the line''s history');

-- DirectMgr ...0d2: the author's manager reads the update pair through the upward gate.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009945'),
  3, 'the author''s manager reads the weekly update''s history through the upward gate');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009946'),
  2, 'the upward gate extends to the line''s history');

-- follow_ups: org AND lane scoped — the retail chaser reads the retail follow-up's history, the
-- b2b chaser (same org, other lane) reads none of it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d11","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951'),
  4, 'the retail-lane chaser reads the retail follow-up''s history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-000000000d10","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951'),
  0, 'the b2b-lane chaser — same org, other lane — reads none of the retail follow-up''s history');

-- Org B reads its own weekly update's history and none of org A's Signal history.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009948'),
  1, 'org B''s member reads their own weekly update''s insert row');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009949'),
  1, 'org B''s member still reads their own line''s delete row');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009940'),
  0, 'org B''s member reads none of org A''s Signal history');

-- ── NFR-007: tables without a registered delete arm still fail closed ─────────────────────────
reset role;
set local request.jwt.claims = '';
delete from mos.follow_ups where id = '00000000-0000-0000-0000-000000009951';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009951'),
  0, 'a hard-deleted follow-up''s rows — delete row included — are unreadable while no delete arm is registered');

select * from finish();
rollback;
