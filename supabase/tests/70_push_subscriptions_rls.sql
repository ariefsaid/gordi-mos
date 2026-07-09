-- mos.push_subscriptions RLS (P3a Phase G).
-- AC/NFR-P3-NF-001: push subscription endpoints are owner-scoped; org_id/owner_id are pinned
-- from JWT; cross-owner/cross-org reads are denied. VAPID keys remain op-managed and are not
-- represented in database rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select mos._test_seed_role_tree();

set local role authenticated;

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'push_subscriptions'),
  'T30: mos.push_subscriptions has RLS enabled and forced');

select ok(
  (select with_check is not null
     from pg_policies
    where schemaname = 'mos' and tablename = 'push_subscriptions' and policyname = 'push_subscriptions_insert'),
  'T30: push_subscriptions INSERT policy carries a WITH CHECK');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok($$
  insert into mos.push_subscriptions (id, endpoint, keys)
  values ('00000000-0000-0000-0000-00000000d001',
          'https://push.example/sub-1',
          '{"p256dh":"pub","auth":"auth"}'::jsonb)
$$, 'T30: owner INSERT without org_id/owner_id succeeds (stamped from JWT)');

select is(
  (select org_id::text from mos.push_subscriptions where id = '00000000-0000-0000-0000-00000000d001'),
  '00000000-0000-0000-0000-0000000000a1',
  'T30: org_id stamped from JWT');

select is(
  (select owner_id::text from mos.push_subscriptions where id = '00000000-0000-0000-0000-00000000d001'),
  '00000000-0000-0000-0000-0000000000d1',
  'T30: owner_id stamped from JWT');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.push_subscriptions where id = '00000000-0000-0000-0000-00000000d001'),
  0, 'T30: same-org non-owner sees 0 push subscriptions');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.push_subscriptions where id = '00000000-0000-0000-0000-00000000d001'),
  0, 'T30: cross-org caller sees 0 push subscriptions');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into mos.push_subscriptions (owner_id, endpoint, keys)
  values ('00000000-0000-0000-0000-0000000000d2', 'https://push.example/forged', '{}'::jsonb)
$$, '42501', null, 'T30: direct cross-owner INSERT is denied by RLS');

reset role;

select * from finish();
rollback;
