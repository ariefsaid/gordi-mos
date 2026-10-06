-- A sample organisation never sends anything to the ERP. Its approvals still work, but their
-- outbox rows target dry_run (which no worker drains). The database refuses any sample-org outbox
-- row aimed at a real ERP environment, and any claim, post or retarget of one. A real org is
-- unaffected. Org A starts as a real org and is flagged sample halfway through.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create function pg_temp.approve(p_log_id uuid) returns text language sql as $$
  select ops.approve_kitchen_log(p_log_id, null,
    (select l.updated_at from ops.kitchen_logs l where l.id = p_log_id))
$$;
create function pg_temp.approve_group(p_log_ids uuid[]) returns uuid language sql as $$
  select group_id from ops.approve_kitchen_logs(p_log_ids, null,
    (select array_agg((select l.updated_at from ops.kitchen_logs l where l.id = requested.id)
                      order by requested.position)
       from unnest(p_log_ids) with ordinality as requested(id, position)))
$$;

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select ops._test_seed_cafe();
-- The deployment points the outbox at a real ERP environment.
select set_config('app.esb_target_env', 'goo', true);

\set org_a '00000000-0000-0000-0000-0000000000a1'
\set org_b '00000000-0000-0000-0000-0000000000b1'
\set lead_claims '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}'

select col_not_null('shared', 'orgs', 'is_sample', 'every org says whether it is a sample org');
select col_default_is('shared', 'orgs', 'is_sample', 'false', 'a new org is real unless flagged');

-- ── A real org: approvals target the deployment's ERP environment and the worker drains them ──
set local role authenticated;
select shared._test_set_access_roles(:'lead_claims');
insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id, wip_item_id, qty_porsi)
values
 ('00000000-0000-0000-0000-00000000e601','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',2),
 ('00000000-0000-0000-0000-00000000e602','00000000-0000-0000-0000-00000000bb01','2026-06-24','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',3),
 ('00000000-0000-0000-0000-00000000e603','00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',1),
 ('00000000-0000-0000-0000-00000000e604','00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',1);
select ok(pg_temp.approve('00000000-0000-0000-0000-00000000e601') is not null, 'a real-org approval mints its batch');
reset role;
select p.id as real_row from integrations.esb_push p
  join ops.kitchen_logs l on l.batch_id = p.source_ref and l.org_id = p.org_id
 where l.id = '00000000-0000-0000-0000-00000000e601' \gset
select is((select target_env from integrations.esb_push where id = :'real_row'), 'goo',
  'a real-org outbox row targets the deployment''s ERP environment');

set local role service_role;
select lives_ok(format($$update integrations.esb_push set status = 'in_flight' where id = %L$$, :'real_row'),
  'the worker claims a real-org row');
reset role;
select lives_ok(format($$insert into integrations.esb_push_groups (org_id, target_env, dedup_key)
  values (%L, 'goo', 'kitchen-group|real-org-probe|goo')$$, :'org_a'),
  'a real-org approval group can target the ERP');
select lives_ok(format($$insert into integrations.esb_push (org_id, source_ref, endpoint, target_env, dedup_key)
  values (%L, 'B-REAL-1', 'assembly-actual', 'goo', 'kitchen|B-REAL-1|goo')$$, :'org_b'),
  'another real org enqueues to the ERP');

-- ── Flag org A as a sample org ────────────────────────────────────────────────────────────────
-- Only an org shaped like the sample org takes the flag: named Gordi Sample, every person at a
-- sample address. Org B gets sample addresses but keeps its name; org A gets the name first.
update shared.people set email = 'b-' || id || '@sample.gordi.test' where org_id = :'org_b'::uuid;
select throws_ok(format($$update shared.orgs set is_sample = true where id = %L$$, :'org_b'),
  '42501', 'only an org named Gordi Sample whose people all have @sample.gordi.test addresses can be a sample organisation',
  'an org with another name is refused the sample flag');
update shared.orgs set name = 'Gordi Sample' where id = :'org_a'::uuid;
update shared.people set email = 'a-' || id || '@sample.gordi.test' where org_id = :'org_a'::uuid;
update shared.people set email = 'staff@example.test' where id = '00000000-0000-0000-0000-0000000000d1';
select throws_ok(format($$update shared.orgs set is_sample = true where id = %L$$, :'org_a'),
  '42501', 'only an org named Gordi Sample whose people all have @sample.gordi.test addresses can be a sample organisation',
  'an org with a person at a non-sample address is refused the sample flag');
update shared.people set email = null where id = '00000000-0000-0000-0000-0000000000d1';
select throws_ok(format($$update shared.orgs set is_sample = true where id = %L$$, :'org_a'),
  '42501', 'only an org named Gordi Sample whose people all have @sample.gordi.test addresses can be a sample organisation',
  'an org with a person with no address is refused the sample flag');
select throws_ok($$insert into shared.orgs (id, name, slug, is_sample)
  values ('00000000-0000-0000-0000-0000000000c7', 'Org C', 'org-c', true)$$,
  '42501', 'only an org named Gordi Sample whose people all have @sample.gordi.test addresses can be a sample organisation',
  'a new org with another name cannot be created flagged');
update shared.people set email = 'a-' || id || '@sample.gordi.test' where org_id = :'org_a'::uuid;
select lives_ok(format($$update shared.orgs set is_sample = true where id = %L$$, :'org_a'),
  'the org named Gordi Sample whose people all have sample addresses can be flagged');
select ok(shared.is_sample_org(:'org_a'::uuid) and not shared.is_sample_org(:'org_b'::uuid),
  'the shared helper names the flagged org and only it');
select is((select count(*)::int from integrations.esb_push
            where org_id = :'org_a'::uuid and status in ('pending','failed','in_flight')), 0,
  'flagging an org retires every outbox row it still had queued or in flight');
select is((select status from integrations.esb_push where dedup_key = 'kitchen|B-REAL-1|goo'), 'pending',
  'the real org''s queued row is untouched');

-- ── Sample-org approvals still work and never target an ERP ──────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles(:'lead_claims');
select ok(pg_temp.approve('00000000-0000-0000-0000-00000000e602') is not null,
  'a sample-org approval still completes');
select ok(pg_temp.approve_group(array['00000000-0000-0000-0000-00000000e603'::uuid,'00000000-0000-0000-0000-00000000e604'::uuid]) is not null,
  'a sample-org group approval still completes');
reset role;
select is((select array_agg(distinct p.target_env) from integrations.esb_push p
            join ops.kitchen_logs l on l.batch_id = p.source_ref and l.org_id = p.org_id
           where l.id in ('00000000-0000-0000-0000-00000000e602','00000000-0000-0000-0000-00000000e603','00000000-0000-0000-0000-00000000e604')),
  array['dry_run'], 'every sample-org outbox row targets dry_run');
-- Same session claims; the helper is owner-only.
select is(integrations.current_esb_target_env(), 'dry_run',
  'a sample-org session''s outbox environment is dry_run whatever the deployment sets');
select is((select array_agg(distinct g.target_env) from integrations.esb_push_groups g
            join ops.kitchen_logs l on l.push_group_id = g.id
           where l.id = '00000000-0000-0000-0000-00000000e603'),
  array['dry_run'], 'the sample-org approval group targets dry_run');
select p.id as sample_row from integrations.esb_push p
  join ops.kitchen_logs l on l.batch_id = p.source_ref and l.org_id = p.org_id
 where l.id = '00000000-0000-0000-0000-00000000e602' \gset
select push_group_id as sample_group from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000e603' \gset

-- ── Every ERP-bound write for a sample-org row is refused, even for the table owner ──────────
select throws_ok(format($$insert into integrations.esb_push (org_id, source_ref, endpoint, target_env, dedup_key)
  values (%L, 'A-SAMPLE-1', 'assembly-actual', 'goo', 'kitchen|A-SAMPLE-1|goo')$$, :'org_a'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'a sample-org outbox row aimed at the ERP sandbox is refused');
select throws_ok(format($$insert into integrations.esb_push (org_id, source_ref, endpoint, target_env, dedup_key)
  values (%L, 'A-SAMPLE-2', 'simple-transfer', 'gkid', 'kitchen|A-SAMPLE-2|gkid')$$, :'org_a'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'a sample-org outbox row aimed at the ERP of record is refused');
select throws_ok(format($$insert into integrations.esb_push_groups (org_id, target_env, dedup_key)
  values (%L, 'goo', 'kitchen-group|sample-probe|goo')$$, :'org_a'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'a sample-org approval group aimed at the ERP is refused');

set local role service_role;
select throws_ok(format($$update integrations.esb_push set status = 'in_flight' where id = %L$$, :'sample_row'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'the worker cannot claim a sample-org row');
select throws_ok(format($$update integrations.esb_push set status = 'posted', esb_doc_num = 'DOC-1', posted_at = now()
  where id = %L$$, :'sample_row'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'a sample-org row cannot be marked posted');
select throws_ok(format($$update integrations.esb_push_groups set status = 'in_flight' where id = %L$$, :'sample_group'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'the worker cannot claim a sample-org approval group');
reset role;
select throws_ok(format($$update integrations.esb_push set target_env = 'goo', dedup_key = dedup_key || '-retarget'
  where id = %L$$, :'sample_row'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'a sample-org row cannot be retargeted at the ERP');
select throws_ok(format($$update integrations.esb_push set org_id = %L where id = %L$$, :'org_b', :'sample_row'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'a sample-org row cannot be moved into a real org');
select throws_ok(format($$update integrations.esb_push set org_id = %L where org_id = %L$$, :'org_a', :'org_b'),
  '42501', 'the sample organisation never sends anything to the ERP',
  'a real-org row cannot be moved into the sample org');
select lives_ok(format($$update integrations.esb_push set status = 'dead_letter', last_error = 'retired'
  where id = %L$$, :'sample_row'),
  'a sample-org row can still be retired out of the queue');

-- ── The flag itself ───────────────────────────────────────────────────────────────────────────
select throws_ok(format($$update shared.orgs set is_sample = false where id = %L$$, :'org_a'),
  '42501', 'a sample organisation stays a sample organisation',
  'the sample flag cannot be cleared, even by the table owner');
select throws_ok(format($$update shared.orgs set name = 'Gordi' where id = %L$$, :'org_a'),
  '42501', 'only an org named Gordi Sample whose people all have @sample.gordi.test addresses can be a sample organisation',
  'a flagged org cannot be renamed away from Gordi Sample');
select lives_ok($$insert into shared.orgs (id, name, slug, is_sample)
  values ('00000000-0000-0000-0000-0000000000c8', 'Gordi Sample', 'gordi-sample-second', true)$$,
  'a new org named Gordi Sample with no people can be created flagged');

-- A person added to a flagged org later must also have a sample address (refused, not tolerated).
select throws_ok(format($$insert into shared.people (org_id, full_name, email) values (%L, 'New staff', 'new.staff@example.test')$$, :'org_a'),
  '42501', 'a sample organisation holds only people with @sample.gordi.test addresses',
  'a person at a non-sample address cannot be added to a sample org');
select throws_ok(format($$insert into shared.people (org_id, full_name) values (%L, 'No address')$$, :'org_a'),
  '42501', 'a sample organisation holds only people with @sample.gordi.test addresses',
  'a person with no address cannot be added to a sample org');
select throws_ok($$update shared.people set email = 'staff@example.test' where id = '00000000-0000-0000-0000-0000000000d1'$$,
  '42501', 'a sample organisation holds only people with @sample.gordi.test addresses',
  'a sample-org person cannot be given a non-sample address');
select lives_ok(format($$insert into shared.people (org_id, full_name, email) values (%L, 'New persona', 'new.persona@sample.gordi.test')$$, :'org_a'),
  'a person at a sample address can be added to a sample org');
set local role authenticated;
select shared._test_set_access_roles(:'lead_claims');
select throws_ok(format($$update shared.orgs set is_sample = false where id = %L$$, :'org_a'),
  '42501', null, 'a signed-in user cannot write the org flag');
reset role;

select * from finish();
rollback;
