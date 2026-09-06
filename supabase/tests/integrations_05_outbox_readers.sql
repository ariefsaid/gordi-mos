-- AC-013: the Retail Ops manager may read dispatch rows, but cannot operate the queue.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
set local role authenticated;

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000001","access_roles":["member","manager"]}';
select cmp_ok((select count(*) from integrations.esb_push), '>', 0,
  'AC-013: Retail Ops manager reads the org outbox');
select throws_ok($$insert into integrations.esb_push (org_id, source_module, source_ref, target_system, payload)
  values ('10000000-0000-0000-0000-000000000001','test','reader-denied','noop','{}','reader-denied')$$,
  '42501', null, 'AC-013: manager cannot retry by inserting an outbox row');

set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000002","access_roles":["member","manager"]}';
select is((select count(*)::int from integrations.esb_push), 0,
  'AC-013: a wrong-unit manager reads no outbox rows');
set local request.jwt.claims = '{"org_id":"10000000-0000-0000-0000-000000000001","person_id":"40000000-0000-0000-0000-000000000005","access_roles":["member","manager","finance"]}';
select is((select count(*)::int from integrations.esb_push), 0,
  'AC-013: finance is refused the outbox');
select throws_ok($$update integrations.esb_push set payload = payload
  where id = (select id from integrations.esb_push limit 1)$$,
  '42501', null, 'AC-013: manager cannot escalate or retry the queue');
select * from finish();
rollback;
