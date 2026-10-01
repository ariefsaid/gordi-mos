-- Storage is reached by a person's app session only. A request whose claims hold a client_id key (an
-- agent app connected over OAuth) has no storage access on any bucket: not to read, add, change or
-- remove. One restrictive policy per storage table owns that exclusion, so a permissive policy added
-- later inherits it; the tests below add such a policy and prove the agent still gets nothing.
-- The same key-presence rule (api_private.claims_carry_client_id) also drives the data API fence.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

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
\set empty_client_claims '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"],"client_id":""}'
\set null_client_claims '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"],"client_id":null}'

-- ── the restrictive exclusion exists on both storage tables ──────────────────────────────────
select is((select count(*)::int from pg_policies
            where schemaname = 'storage' and tablename in ('objects', 'buckets')
              and policyname = 'agent_sessions_excluded' and permissive = 'RESTRICTIVE'
              and cmd = 'ALL' and roles = array['authenticated']::name[]), 2,
  'storage.objects and storage.buckets each carry the restrictive agent exclusion');
select is((select count(*)::int from pg_policies
            where schemaname = 'storage' and permissive = 'RESTRICTIVE'), 2,
  'the two exclusions are the only restrictive policies on storage');

-- ── the person's app session: unchanged ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', :'app_claims', true);

select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'live' || '/00000000-0000-0000-0000-0000000210f1.jpg'), 'the author''s app session adds a photo');
select is((select count(*)::int from storage.objects where bucket_id = 'signal-photos'), 1,
  'the app session reads the photo from storage');
select is((select count(*)::int from mos.signal_photos where signal_id = '00000000-0000-0000-0000-000000021001'), 1,
  'the app session reads the photo through the feed view');

-- ── the same person, an agent session, against the existing signal-photo policies ────────────
select set_config('request.jwt.claims', :'agent_claims', true);

select is((select count(*)::int from storage.objects where bucket_id = 'signal-photos'), 0,
  'an agent session reads no signal photo from storage');
select is((select count(*)::int from mos.signal_photos), 0,
  'an agent session reads no photo through the feed view');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'live' || '/00000000-0000-0000-0000-0000000210f2.jpg'), '42501', null,
  'an agent session adds no photo, though the same person''s app session may');

-- ── a permissive policy added later: the exclusion still holds ───────────────────────────────
reset role;
create policy _later_objects on storage.objects for all to authenticated using (true) with check (true);
create policy _later_buckets on storage.buckets for all to authenticated using (true) with check (true);
select set_config('storage.allow_delete_query', 'true', true);
set local role authenticated;

select set_config('request.jwt.claims', :'app_claims', true);
select cmp_ok((select count(*)::int from storage.objects), '>=', 1, 'an app session reads objects through the later policy');
select cmp_ok((select count(*)::int from storage.buckets), '>=', 1, 'an app session reads buckets through the later policy');

select set_config('request.jwt.claims', :'agent_claims', true);
select is((select count(*)::int from storage.objects), 0, 'an agent session reads no object through a later permissive policy');
select is((select count(*)::int from storage.buckets), 0, 'an agent session reads no bucket through a later permissive policy');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('other-bucket', 'a/b.jpg')$$, '42501', null,
  'an agent session adds no object through a later permissive policy');
select throws_ok($$insert into storage.buckets (id, name) values ('agent-made', 'agent-made')$$, '42501', null,
  'an agent session adds no bucket through a later permissive policy');
update storage.objects set name = :'live' || '/00000000-0000-0000-0000-0000000210f8.jpg' where bucket_id = 'signal-photos';
delete from storage.objects where bucket_id = 'signal-photos';

select set_config('request.jwt.claims', :'app_claims', true);
select is((select array_agg(name) from storage.objects where bucket_id = 'signal-photos'),
  array[:'live' || '/00000000-0000-0000-0000-0000000210f1.jpg'],
  'the agent session neither renamed nor removed the photo through a later permissive policy');
select lives_ok($$insert into storage.buckets (id, name) values ('app-made', 'app-made')$$,
  'an app session adds a bucket through the later policy');

-- ── the claim's key is what counts, not its value ────────────────────────────────────────────
select set_config('request.jwt.claims', :'empty_client_claims', true);
select is((select count(*)::int from storage.objects), 0, 'a client_id claim with an empty value reads no object');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('other-bucket', 'a/b.jpg')$$, '42501', null,
  'a client_id claim with an empty value adds no object');
select set_config('request.jwt.claims', :'null_client_claims', true);
select is((select count(*)::int from storage.objects), 0, 'a client_id claim with a null value reads no object');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('other-bucket', 'a/b.jpg')$$, '42501', null,
  'a client_id claim with a null value adds no object');

-- ── storage and the data API fence apply one rule ────────────────────────────────────────────
select set_config('search_path', '"api_v1", "public", "extensions"', true);
select set_config('request.jwt.claims', :'app_claims', true);
select is(api_private.claims_carry_client_id(), false, 'app claims carry no client_id');
select lives_ok($$select api_private.check_request()$$, 'the data API fence passes app claims');
select set_config('request.jwt.claims', :'empty_client_claims', true);
select is(api_private.claims_carry_client_id(), true, 'an empty client_id value still counts as an agent request');
select throws_ok($$select api_private.check_request()$$, 'PT401', null, 'the data API fence refuses the same empty-valued claim');
select set_config('request.jwt.claims', :'null_client_claims', true);
select is(api_private.claims_carry_client_id(), true, 'a null client_id value still counts as an agent request');
select throws_ok($$select api_private.check_request()$$, 'PT401', null, 'the data API fence refuses the same null-valued claim');

-- ── anon: unchanged ──────────────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$insert into storage.objects (bucket_id, name) values ('signal-photos',
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-000000021001/00000000-0000-0000-0000-0000000210f3.jpg')$$,
  '42501', null, 'anon cannot add an object');

select * from finish();
rollback;
