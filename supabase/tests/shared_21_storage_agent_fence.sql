-- Storage is reached by a person's app session only. A session that carries the client_id claim
-- (an agent app connected over OAuth) has no storage access on any bucket: not to read, add, change
-- or remove. The same person's app session keeps full reach; anon is unchanged.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

reset role;
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body, created_at) values
  ('00000000-0000-0000-0000-000000021001','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','org',null, now(), 'All Teams signal, photo fence', now());

\set org  '00000000-0000-0000-0000-0000000000a1'
\set live :org/00000000-0000-0000-0000-000000021001
\set app_claims '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}'
\set agent_claims '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"],"client_id":"client-good"}'

-- ── the catalog: every policy on storage is fenced ───────────────────────────────────────────
select cmp_ok((select count(*)::int from pg_policies where schemaname = 'storage'), '>=', 2,
  'storage carries the signal-photo policies');
select is((select count(*)::int from pg_policies
            where schemaname = 'storage'
              and coalesce(qual, '') !~ 'claim_client_id'
              and coalesce(with_check, '') !~ 'claim_client_id'), 0,
  'every policy on storage tables refuses a session carrying client_id');
select is((select count(*)::int from pg_policies
            where schemaname = 'storage' and cmd in ('SELECT','DELETE')
              and coalesce(qual, '') !~ 'claim_client_id'), 0,
  'every read and delete policy states the exclusion in its USING clause');
select is((select count(*)::int from pg_policies
            where schemaname = 'storage' and cmd = 'INSERT'
              and coalesce(with_check, '') !~ 'claim_client_id'), 0,
  'every insert policy states the exclusion in its WITH CHECK clause');
select is((select count(*)::int from pg_policies
            where schemaname = 'storage' and cmd in ('UPDATE','ALL')
              and (coalesce(qual, '') !~ 'claim_client_id' or coalesce(with_check, '') !~ 'claim_client_id')), 0,
  'every update or all-command policy states the exclusion in both clauses');

-- ── the person's app session: unchanged ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', :'app_claims', true);

select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'live' || '/00000000-0000-0000-0000-0000000210f1.jpg'), 'the author''s app session adds a photo');
select is((select count(*)::int from storage.objects where bucket_id = 'signal-photos'), 1,
  'the app session reads the photo from storage');
select is((select count(*)::int from mos.signal_photos where signal_id = '00000000-0000-0000-0000-000000021001'), 1,
  'the app session reads the photo through the feed view');

-- ── the same person, an agent session ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', :'agent_claims', true);

select is((select count(*)::int from storage.objects where bucket_id = 'signal-photos'), 0,
  'an agent session reads no object from storage');
select is((select count(*)::int from storage.objects), 0,
  'an agent session reads no object from any bucket');
select is((select count(*)::int from mos.signal_photos), 0,
  'an agent session reads no photo through the feed view');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'live' || '/00000000-0000-0000-0000-0000000210f2.jpg'), '42501', null,
  'an agent session adds no photo, though the same person''s app session may');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('other-bucket', %L)$$,
  'anything/at/all.jpg'), '42501', null, 'an agent session adds nothing to any other bucket');

select set_config('storage.allow_delete_query', 'true', true);
update storage.objects set name = :'live' || '/00000000-0000-0000-0000-0000000210f8.jpg'
 where bucket_id = 'signal-photos';
delete from storage.objects where bucket_id = 'signal-photos';
select is((select count(*)::int from storage.buckets), 0, 'an agent session reads no bucket');

select set_config('request.jwt.claims', :'app_claims', true);
select is((select array_agg(name) from storage.objects where bucket_id = 'signal-photos'),
  array[:'live' || '/00000000-0000-0000-0000-0000000210f1.jpg'],
  'the agent session neither renamed nor removed the photo, and added none');

-- ── an app session whose claims carry no client_id at all, and one with an empty org ─────────
select set_config('request.jwt.claims',
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"],"role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'signal-photos'), 1,
  'app claims that carry other claims but no client_id keep their reach');

-- ── anon: unchanged ──────────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$insert into storage.objects (bucket_id, name) values ('signal-photos',
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-000000021001/00000000-0000-0000-0000-0000000210f3.jpg')$$,
  '42501', null, 'anon cannot add an object');
select is((select count(*)::int from storage.objects), 0, 'anon reads no object');

-- ── the fence follows the claim, not the role ────────────────────────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims', :'agent_claims', true);
select is(api_private.claim_client_id(), 'client-good', 'the exclusion reads the request''s client_id claim');
select set_config('request.jwt.claims', :'app_claims', true);
select is(api_private.claim_client_id(), null, 'an app session has none');

select * from finish();
rollback;
