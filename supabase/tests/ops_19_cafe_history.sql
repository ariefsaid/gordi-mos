-- ops — Café tables participating in the change-history rollout (#990), now including the
-- per-stream item settings and selected ERP details, write
-- shared.record_history through the one generic trigger; the two trigger-owned clocks on
-- kitchen_logs (reviewed_at, posted_at) leave no trace while the human actions beside them
-- (the review itself, the ERP dispatch record) stay RECORDED; and the schema's one authenticated
-- hard-DELETE — removing an item from a stream's list — stays readable after deletion through the
-- snapshot arm, by the whole owning org and by nobody outside it.
--
-- Personas are the tables' real write authorities: Author ...0d1 (org-A member, given one
-- stream-Team membership below — the affiliation gate's real capture persona) logs and edits her
-- own Submitted kitchen lines (kitchen_logs_insert_member / kitchen_logs_update_own_or_reviewer);
-- DirectMgr ...0d2 (org-A ops_lead) reviews, owns the master data, confirms completeness and
-- prunes stream item lists; ...0b4 is org B's ops_lead — same tier, other org, and the org wall
-- holds against the tier.
begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

create function pg_temp.approve_kitchen_log(p_log_id uuid, p_review_note text)
returns text language sql as $$
  select ops.approve_kitchen_log(p_log_id, p_review_note,
    (select l.updated_at from ops.kitchen_logs l where l.id = p_log_id))
$$;

select set_config('app.allow_test_seeds', 'on', true);
-- The caller seeds the directory (the fixture contract), then the Café fixture extends it with
-- branches, stream Teams, master data, plans, logs and stock. The seeding writes fire the new
-- trigger too, which is why every assertion below keys on a record_key this file minted.
select shared._test_seed_directory();
select ops._test_seed_cafe();

select has_function('shared', 'can_read_history_record', ARRAY['text','text','text','text','jsonb'],
  'the read dispatch is exposed with the (schema, table, key, action, snapshot) shape');

-- ── an INSERT appends exactly one summary row, on each wired table ─────────────────────────────
-- Service writes (no claims on this connection yet): one hand-minted row per table, in org A.
-- stream_items joins below, from the ops_lead segment — the fixture already offers every org-A
-- item on every live stream, so a second row for any of them is not insertable.
insert into ops.log_entries (id, org_id, business_unit_id, title, created_by)
values ('00000000-0000-0000-0000-000000009901', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000bb01', 'History daily log',
        '00000000-0000-0000-0000-0000000000d1');
insert into ops.wip_items (id, org_id, name)
values ('00000000-0000-0000-0000-000000009902', '00000000-0000-0000-0000-0000000000a1',
        'History WIP');
insert into ops.kitchen_plans (id, org_id, log_date, wip_item_id, branch_id, activity, action,
                               qty_porsi)
values ('00000000-0000-0000-0000-000000009903', '00000000-0000-0000-0000-0000000000a1',
        date '2026-09-28', '00000000-0000-0000-0000-00000000ab01',
        '00000000-0000-0000-0000-00000000bf02', 'kitchen', 'produce', 20);
insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, branch_id, activity, action,
                              wip_item_id, qty_porsi, submitted_by)
values ('00000000-0000-0000-0000-000000009904', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000bb01', date '2026-09-28',
        '00000000-0000-0000-0000-00000000bf02', 'kitchen', 'produce',
        '00000000-0000-0000-0000-00000000ab01', 2,
        '00000000-0000-0000-0000-0000000000d1');
insert into ops.item_units (id, org_id, wip_item_id, unit_name)
values ('00000000-0000-0000-0000-000000009905', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000ab02', 'botol');

select is((select count(*)::int from shared.record_history
           where schema_name = 'ops' and table_name = 'log_entries'
             and record_key = '00000000-0000-0000-0000-000000009901'),
  1, 'an INSERT into ops.log_entries appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'ops' and table_name = 'wip_items'
             and record_key = '00000000-0000-0000-0000-000000009902'),
  1, 'an INSERT into ops.wip_items appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'ops' and table_name = 'kitchen_plans'
             and record_key = '00000000-0000-0000-0000-000000009903'),
  1, 'an INSERT into ops.kitchen_plans appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'ops' and table_name = 'kitchen_logs'
             and record_key = '00000000-0000-0000-0000-000000009904'),
  1, 'an INSERT into ops.kitchen_logs appends exactly one history row');
select is((select count(*)::int from shared.record_history
           where schema_name = 'ops' and table_name = 'item_units'
             and record_key = '00000000-0000-0000-0000-000000009905'),
  1, 'an INSERT into ops.item_units appends exactly one history row');

select set_eq(
  $$ select c2.relname
       from pg_trigger t
       join pg_proc p  on p.oid = t.tgfoid
       join pg_class c2 on c2.oid = t.tgrelid
       join pg_namespace n2 on n2.oid = c2.relnamespace
      where n2.nspname = 'ops' and p.proname = '_record_history_write'
        and not t.tgisinternal $$,
  $$ values ('log_entries'), ('kitchen_logs'), ('kitchen_plans'), ('wip_items'),
            ('item_units'), ('stream_completeness'), ('stream_items'),
            ('cafe_item_settings'), ('cafe_item_setting_units'), ('cafe_count_lines') $$,
  'exactly the registered Café tables carry the one history trigger, and no other ops table does');

-- The affiliation gate (20260905000001) requires a current stream-Team membership (or the
-- ops_lead/admin tier) on the café INSERT arms. Give the submitter persona the membership the
-- app would grant her — a place on the (Rumah Rames, kitchen) stream Team — so her write below
-- runs the approved path, not an ops_lead bypass.
insert into shared.team_memberships (org_id, person_id, team_id)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', t.id
  from shared.teams t
 where t.org_id = '00000000-0000-0000-0000-0000000000a1'
   and t.branch_id = '00000000-0000-0000-0000-00000000bf02'
   and t.activity = 'kitchen'
   and t.archived_at is null
 limit 1;

-- ── the submitter's own write: authenticated CREATE + a two-column UPDATE with old and new ─────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');

insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, branch_id, activity, action,
                              wip_item_id, qty_porsi)
values ('00000000-0000-0000-0000-000000009908', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000bb01', date '2026-09-28',
        '00000000-0000-0000-0000-00000000bf02', 'kitchen', 'produce',
        '00000000-0000-0000-0000-00000000ab01', 2);
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908'),
  1, 'the submitter''s own kitchen-log CREATE appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908'),
  '00000000-0000-0000-0000-0000000000d1',
  'the approved-path CREATE stamps the submitter''s person claim as actor');

-- Quantity and notes are mutable under the guard while the row is Submitted (only the stream,
-- movement, item and date are frozen). A two-column edit appends exactly two rows.
update ops.kitchen_logs set qty_porsi = 4, notes = 'first correction'
 where id = '00000000-0000-0000-0000-000000009908';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908'),
  3, 'a two-column kitchen-log UPDATE appends exactly two rows (insert + 2)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908' and field_name = 'qty_porsi'),
  '2.00', 'the quantity change records the old value, numeric-cast honestly');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908' and field_name = 'qty_porsi'),
  '4.00', 'the quantity change records the new value');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908' and field_name = 'notes'),
  null, 'the notes change records a NULL old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908' and field_name = 'notes'),
  'first correction', 'the notes change records the new value');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908' and field_name = 'qty_porsi'),
  '00000000-0000-0000-0000-0000000000d1',
  'the submitter''s edit stamps the session''s person claim as actor');

update ops.kitchen_logs set notes = 'first correction'
 where id = '00000000-0000-0000-0000-000000009908';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908'),
  3, 'an UPDATE that changes no column appends no row');

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904'),
  1, 'a plain member reads a kitchen log''s history — the read gate is plain org membership');

-- ── the reviewer's write: the human review stays RECORDED, its stamped clock stays silent ─────
-- DirectMgr ...0d2 rejects ...9904. The guard stamps reviewed_by/reviewed_at server-side; history
-- records status, review_note and reviewed_by — the review itself — and the reviewed_at clock
-- (the '-reviewed_at' exclude) writes no row beside them.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');

update ops.kitchen_logs set status = 'Rejected', review_note = 'miscounted'
 where id = '00000000-0000-0000-0000-000000009904';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904'),
  4, 'the reject appends exactly three rows (insert + status + review_note + reviewed_by)');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904' and field_name = 'reviewed_at'),
  0, 'the guard-stamped reviewed_at clock writes no history row beside the review it stamps');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904' and field_name = 'status'),
  'Submitted', 'the status change records the old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904' and field_name = 'status'),
  'Rejected', 'the status change records the new value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904' and field_name = 'review_note'),
  'miscounted', 'the review_note change records the new value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904' and field_name = 'reviewed_by'),
  '00000000-0000-0000-0000-0000000000d2',
  'the server-stamped reviewed_by provenance stays RECORDED — the human review is in the history');

-- Master data, through the ops_lead tier: a wip item reclassification and the item-unit
-- confirmation event — whose confirmed_at is server-STAMPED but is the recorded fact itself
-- (the DD-WAY-29 gate predicate), so it is deliberately NOT excluded.
update ops.wip_items set category = 'History cat'
 where id = '00000000-0000-0000-0000-000000009902';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009902'),
  2, 'a master-data UPDATE appends exactly one row (insert + 1)');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009902' and action = 'update'),
  '00000000-0000-0000-0000-0000000000d2',
  'the ops_lead''s master-data edit stamps the session''s person claim as actor');

update ops.item_units set esb_product_detail_id = 'PD-BOTOL-001', confirmed_at = now()
 where id = '00000000-0000-0000-0000-000000009905';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009905'),
  4, 'the confirmation appends exactly three rows (insert + coordinates + confirmed_at + confirmed_by)');
select is((select (old_value is null and new_value is not null) from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009905' and field_name = 'confirmed_at'),
  true, 'the confirmation event records confirmed_at — server-stamped, yet the fact itself');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009905' and field_name = 'confirmed_by'),
  '00000000-0000-0000-0000-0000000000d2',
  'the confirmation records WHO — the session person the server stamped');

-- The plan itself is master data too (kitchen_plans_update_ops_lead_or_admin): the ops_lead's
-- edit lands in the history with its diff, its session actor, and org-scoped visibility (AC1).
update ops.kitchen_plans set qty_porsi = 25
 where id = '00000000-0000-0000-0000-000000009903';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009903'),
  2, 'the plan UPDATE appends exactly one row (insert + qty_porsi)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009903'
             and field_name = 'qty_porsi' and action = 'update'),
  '20.00', 'the plan edit records the old quantity');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009903'
             and field_name = 'qty_porsi' and action = 'update'),
  '25.00', 'the plan edit records the new quantity');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009903' and action = 'update'),
  '00000000-0000-0000-0000-0000000000d2',
  'the plan edit stamps the session''s person claim as actor');

-- The completeness confirmation: written by the stream's reviewer tier (ops.can_review_stream's
-- ops_lead arm).
insert into ops.stream_completeness (id, org_id, branch_id, activity)
values ('00000000-0000-0000-0000-000000009906', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000bf02', 'kitchen');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009906'),
  1, 'an INSERT into ops.stream_completeness appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009906'),
  '00000000-0000-0000-0000-0000000000d2',
  'the completeness confirmation stamps the reviewer''s person claim as actor');

-- The stream item list: the ops_lead adds the batch's new wip item to the (Rumah Rames, kitchen)
-- stream — the one combination the fixture does not already cover.
insert into ops.stream_items (id, org_id, branch_id, activity, wip_item_id, source)
values ('00000000-0000-0000-0000-000000009909', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000bf02', 'kitchen',
        '00000000-0000-0000-0000-000000009902', 'manual');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009909'),
  1, 'an INSERT into ops.stream_items appends exactly one history row');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009909'),
  '00000000-0000-0000-0000-0000000000d2',
  'the stream-list add stamps the ops_lead''s person claim as actor');

-- ── the delete arm: the schema's one authenticated hard-DELETE, read back through the snapshot ─
delete from ops.stream_items
 where id = '00000000-0000-0000-0000-000000009909';
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009909'),
  1, 'after the DELETE the org reads exactly one history row (the delete row; the gone insert row is live-looked-up away)');
select is((select (field_name is null and old_value is null and new_value is null
                   and old_row_snapshot is not null)
             from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000009909'),
  true, 'the delete row names no field and carries the whole-row snapshot');
select is((select old_row_snapshot ->> 'wip_item_id' from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009909'),
  '00000000-0000-0000-0000-000000009902', 'the delete row''s snapshot carries a non-key column');
select is((select old_row_snapshot ->> 'source' from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009909'),
  'manual', 'the delete row''s snapshot round-trips provenance');

-- The read gate on a removed row is the org-wide SELECT predicate, not the ops_lead DELETE tier:
-- every same-org member still reads it.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009909'),
  1, 'a same-org plain member still reads the removed list entry''s delete row');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009903' and action = 'update'),
  1, 'a same-org plain member reads the plan edit''s history row');

-- ── the org wall: the tier does not cross it, in either direction ──────────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","ops_lead"]}');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009909'),
  0, 'org B''s ops_lead reads none of org A''s removed list entry — the tier does not cross the wall');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-00000000ac09'),
  1, 'org B''s ops_lead reads their own seeded kitchen log''s insert row');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904'),
  0, 'org B''s ops_lead reads none of org A''s kitchen-log history');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009903'),
  0, 'org B''s ops_lead reads none of org A''s plan history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-00000000ac09'),
  0, 'an org-A member reads none of org B''s kitchen-log history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-00000000ac09'),
  0, 'org A''s ops_lead reads none of org B''s kitchen-log history — same wall, other direction');

-- ── the approval RPC: ops.approve_kitchen_log is the production approval path (#990 AC1) ─────
-- The direct Rejected UPDATE above is one path; the production approval runs through the RPC,
-- which stamps status, reviewed_by, review_note and batch_id in one statement — a regression in
-- that path must not pass the suite. The history rows carry the caller's claims as actor.
reset role;
set local request.jwt.claims = '';
insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, branch_id, activity, action,
                              wip_item_id, qty_porsi, submitted_by)
values ('00000000-0000-0000-0000-000000009921', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000bb01', date '2026-09-28',
        '00000000-0000-0000-0000-00000000bf02', 'kitchen', 'produce',
        '00000000-0000-0000-0000-00000000ab01', 3,
        '00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select isnt((select pg_temp.approve_kitchen_log('00000000-0000-0000-0000-000000009921', 'History approve')),
  null, 'the approval RPC mints a batch id for the stream''s ops_lead');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009921' and field_name = 'status'),
  'Submitted', 'the RPC''s approval records the old status');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009921' and field_name = 'status'),
  'Approved', '...and the new status');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009921' and field_name = 'reviewed_by'),
  '00000000-0000-0000-0000-0000000000d2', 'the RPC''s reviewed_by provenance is the session person');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009921' and field_name = 'review_note'),
  'History approve', 'the RPC''s review_note lands in the history');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009921' and field_name = 'batch_id'),
  1, 'the minted batch_id is recorded');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009921'),
  5, 'the approval appends exactly the RPC''s four rows (insert + status + reviewed_by + review_note + batch_id)');
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009921' and action = 'update'
             and actor_person_id IS DISTINCT FROM '00000000-0000-0000-0000-0000000000d2'::uuid),
  0, 'every RPC row stamps the caller''s claims as actor — a lost identity (NULL) counts as a mismatch');

-- ── NFR-005: trigger overhead on the highest-volume audited table ─────────────────────────────
-- 200 fresh Submitted logs (service write), then 200 single-row single-column UPDATEs timed with
-- clock_timestamp() around the loop, history trigger attached throughout.
reset role;
set local request.jwt.claims = '';

insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, branch_id, activity, action,
                              wip_item_id, qty_porsi, submitted_by, notes)
select ('00000000-0000-9c00-' || lpad(g::text, 4, '0') || '-000000000000')::uuid,
       '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01',
       date '2026-09-28', '00000000-0000-0000-0000-00000000bf02', 'kitchen', 'produce',
       '00000000-0000-0000-0000-00000000ab01', 1,
       '00000000-0000-0000-0000-0000000000d1', 'NFR-005 baseline'
  from generate_series(1, 200) g;

do $nfr005$
declare
  v_t0 timestamptz;
  v_t1 timestamptz;
begin
  create temp table _nfr005_elapsed (elapsed interval) on commit drop;
  v_t0 := clock_timestamp();
  for i in 1 .. 200 loop
    update ops.kitchen_logs
       set notes = 'NFR-005 timed pass ' || i
     where id = (('00000000-0000-9c00-' || lpad(i::text, 4, '0') || '-000000000000')::uuid);
  end loop;
  v_t1 := clock_timestamp();
  insert into _nfr005_elapsed values (v_t1 - v_t0);
end;
$nfr005$;

-- Measured on the development run: 200 trigger-attached single-row UPDATEs completed in
-- 0.096 s total (~0.5 ms per row). The bound is 1 s total (~5 ms/row) — the spec's
-- few-milliseconds per-row bar (change-history.spec.md, NFR-005) with 10x headroom on the
-- measured figure — and diag() reports THIS run's elapsed, so the output never cites a
-- stale hard-coded measurement.
select is((select extract(epoch from elapsed) < 1.0 from _nfr005_elapsed), true,
  'NFR-005: 200 single-row UPDATEs on ops.kitchen_logs with the history trigger attached stay under 1s total — ~5 ms/row, the spec''s few-milliseconds bar');
select diag('NFR-005 measured this run: ' ||
            coalesce((select round(extract(epoch from elapsed)::numeric, 3)::text || ' s total (' ||
                      round(extract(epoch from elapsed)::numeric * 5, 2)::text || ' ms/row)'
                      from _nfr005_elapsed), 'n/a'));
select is((select count(*)::int from shared.record_history
           where schema_name = 'ops' and table_name = 'kitchen_logs'
             and field_name = 'notes' and new_value like 'NFR-005 timed pass%'),
  200, 'every timed UPDATE recorded its change — the trigger stayed attached for all 200 rows');


-- Batches attach readers to the registry and never restate one another's, so an earlier
-- batch's tables must still be registered (registry rows, not a dispatch body).
select ok(
  exists (select 1 from shared.record_history_readers
           where schema_name = 'mos' and table_name = 'process_run_pending_tasks'),
  'the registry still carries the ...0011 task-cascade arms');
select ok(
  exists (select 1 from shared.record_history_readers
           where schema_name = 'mos' and table_name = 'follow_ups'),
  '...the signal-worklog arms (e.g. follow_ups)');
select ok(
  exists (select 1 from shared.record_history_readers
           where schema_name = 'mos' and table_name = 'certified_metrics'),
  '...the money arms (e.g. certified_metrics, with its composite key)');
select ok(
  exists (select 1 from shared.record_history_readers
           where schema_name = 'shared' and table_name = 'person_roles'),
  '...and the directory arms (e.g. person_roles)');

select * from finish();
rollback;
