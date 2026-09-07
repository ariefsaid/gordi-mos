-- AC-013: the Retail Ops manager may read dispatch rows, but cannot operate the queue.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into shared.roles (id, org_id, business_unit_id, name)
values ('30000000-0000-0000-0000-000000000009',
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000014', 'Retail Ops Manager');
insert into shared.person_roles (org_id, person_id, role_id)
values ('10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000009');
-- The reader set needs a row to read: one unposted row in this org, seeded the way
-- integrations_01 seeds its own — an unmatched source_ref, which the live enqueue-refusal
-- trigger admits (it refuses only a batch already posted to the ERP).
insert into integrations.esb_push (id, org_id, source_module, source_ref, endpoint, target_env, dedup_key, status)
values ('00000000-0000-0000-0000-00000000ba11','10000000-0000-0000-0000-000000000001','kitchen',
        'PR-OUTBOX-READERS-001','assembly-actual','dry_run','kitchen|PR-OUTBOX-READERS-001|dry_run','pending');
set local role authenticated;

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["member","manager"]}';
select cmp_ok((select count(*)::int from integrations.esb_push), '>', 0,
  'AC-013: Retail Ops manager reads the org outbox');
select throws_ok($$insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key)
  values ('10000000-0000-0000-0000-000000000001','test','reader-denied','noop','{}','dry_run','reader-denied')$$,
  '42501', null, 'AC-013: manager cannot retry by inserting an outbox row');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000003","access_roles":["member","manager"]}';
select is((select count(*)::int from integrations.esb_push), 0,
  'AC-013: a manager whose only unit role sits outside Retail Ops reads no outbox rows');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000005","access_roles":["member","manager","finance"]}';
select is((select count(*)::int from integrations.esb_push), 0,
  'AC-013: finance is refused the outbox');
do $$
declare affected integer;
begin
  update integrations.esb_push set payload = payload
   where id = (select id from integrations.esb_push limit 1);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'unexpected update'; end if;
end $$;
select pass('AC-013: manager cannot escalate or retry the queue (UPDATE affects 0 rows)');
select * from finish();
rollback;
