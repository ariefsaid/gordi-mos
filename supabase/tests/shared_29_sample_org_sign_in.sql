-- The one-click sample login can only enter a sample organisation. A sample account
-- (@sample.gordi.test) is issued a token only for a person in a sample org. A sample session
-- reads none of a real org's rows, and storage paths stay org-scoped: it can neither read nor
-- write another org's photo objects. Real staff sign-in is unaffected.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();

\set real_org   '00000000-0000-0000-0000-0000000000a1'
\set sample_org '00000000-0000-0000-0000-00000000a5a1'
\set real_sig   '00000000-0000-0000-0000-00000000a5c1'
\set sample_sig '00000000-0000-0000-0000-00000000a5c2'
\set real_log   '00000000-0000-0000-0000-00000000a5d1'
\set sample_claims '{"org_id":"00000000-0000-0000-0000-00000000a5a1","person_id":"00000000-0000-0000-0000-00000000a5f1","access_roles":["member","admin"]}'
\set real_claims   '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}'

insert into shared.orgs (id, name, slug) values (:'sample_org', 'Gordi Sample', 'gordi-sample-test');
update shared.orgs set is_sample = true where id = :'sample_org';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a5e1', 'cahya@sample.gordi.test'),
  ('00000000-0000-0000-0000-00000000a5e2', 'dewi@sample.gordi.test'),
  ('00000000-0000-0000-0000-00000000a5e3', 'Sinta@Sample.Gordi.TEST'),
  ('00000000-0000-0000-0000-00000000a5e4', 'kartika@sample.gordi.test'),
  ('00000000-0000-0000-0000-00000000a5e5', 'real.staff@example.test');
insert into shared.people (id, org_id, full_name, email, user_id) values
  ('00000000-0000-0000-0000-00000000a5f1', :'sample_org', 'Sample persona', 'cahya@sample.gordi.test', '00000000-0000-0000-0000-00000000a5e1'),
  ('00000000-0000-0000-0000-00000000a5f2', :'real_org', 'Sample address in the real org', 'dewi@sample.gordi.test', '00000000-0000-0000-0000-00000000a5e2'),
  ('00000000-0000-0000-0000-00000000a5f3', :'real_org', 'Mixed-case sample address', 'sinta@sample.gordi.test', '00000000-0000-0000-0000-00000000a5e3'),
  ('00000000-0000-0000-0000-00000000a5f5', :'real_org', 'Real staff', 'real.staff@example.test', '00000000-0000-0000-0000-00000000a5e5');

create function pg_temp.mint(p_user uuid, p_method text default 'password') returns jsonb language sql as $$
  select shared.custom_access_token_hook(jsonb_build_object(
    'user_id', p_user, 'authentication_method', p_method,
    'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated')))
$$;

-- ── Token issue ───────────────────────────────────────────────────────────────────────────────
select is(pg_temp.mint('00000000-0000-0000-0000-00000000a5e1') -> 'claims' ->> 'org_id', :'sample_org',
  'a sample account in the sample org signs in to the sample org');
select is(pg_temp.mint('00000000-0000-0000-0000-00000000a5e2') -> 'error' ->> 'http_code', '403',
  'a sample account linked to a real-org person is refused a token');
select is(pg_temp.mint('00000000-0000-0000-0000-00000000a5e2') -> 'error' ->> 'message',
  'Sample accounts sign in only to the sample organisation.',
  'the refusal says why in plain words');
select ok(not (pg_temp.mint('00000000-0000-0000-0000-00000000a5e2') ? 'claims'),
  'the refusal carries no claims, so no real-org session');
select is(pg_temp.mint('00000000-0000-0000-0000-00000000a5e2', 'token_refresh') -> 'error' ->> 'http_code', '403',
  'an existing session of that account cannot be refreshed into the real org');
select is(pg_temp.mint('00000000-0000-0000-0000-00000000a5e3') -> 'error' ->> 'http_code', '403',
  'the sample domain is matched without regard to letter case');
select is(pg_temp.mint('00000000-0000-0000-0000-00000000a5e4') -> 'error' ->> 'http_code', '403',
  'a sample account with no person is refused rather than issued an empty session');
select is(pg_temp.mint('00000000-0000-0000-0000-00000000a5e5') -> 'claims' ->> 'org_id', :'real_org',
  'real staff still sign in to the real org');
select ok(not (pg_temp.mint('00000000-0000-0000-0000-00000000a5e5') ? 'error'),
  'real staff sign-in carries no error');

-- ── A sample session reads nothing of the real org ───────────────────────────────────────────
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body, created_at) values
  (:'real_sig', :'real_org', '00000000-0000-0000-0000-0000000000d1', 'org', null, now(), 'Real-org signal', now()),
  (:'sample_sig', :'sample_org', '00000000-0000-0000-0000-00000000a5f1', 'org', null, now(), 'Sample-org signal', now());
insert into storage.objects (bucket_id, name) values
  ('signal-photos', :'real_org' || '/' || :'real_sig' || '/00000000-0000-0000-0000-00000000a501.jpg'),
  ('waste-photos',  :'real_org' || '/' || :'real_log' || '/00000000-0000-0000-0000-00000000a502.jpg');

set local role authenticated;
select shared._test_set_access_roles(:'real_claims');
select is((select count(*)::int from storage.objects where bucket_id = 'signal-photos'
            and name like :'real_org' || '/%'), 1,
  'control: the real-org author reads the real-org photo');

select shared._test_set_access_roles(:'sample_claims');
select is((select array_agg(id) from shared.orgs), array[:'sample_org'::uuid],
  'a sample session sees only its own org');
select is((select count(*)::int from shared.people where org_id = :'real_org'::uuid), 0,
  'a sample session reads no real-org person');
select is((select count(*)::int from mos.signals where org_id = :'real_org'::uuid), 0,
  'a sample session reads no real-org signal');
select is((select count(*)::int from mos.signals where id = :'sample_sig'::uuid), 1,
  'control: a sample session reads its own org''s signal');

-- ── Storage paths are org-scoped ──────────────────────────────────────────────────────────────
select is((select count(*)::int from storage.objects where name like :'real_org' || '/%'), 0,
  'a sample session reads no real-org photo object in any bucket');
select is((select count(*)::int from mos.signal_photos where path like :'real_org' || '/%'), 0,
  'a sample session reads no real-org signal photo through the feed view');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'real_org' || '/' || :'real_sig' || '/00000000-0000-0000-0000-00000000a503.jpg'),
  '42501', null, 'a sample session cannot write a signal photo under the real org''s path');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'sample_org' || '/' || :'real_sig' || '/00000000-0000-0000-0000-00000000a504.jpg'),
  '42501', null, 'a sample session cannot attach a photo to a real-org signal under its own prefix');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('waste-photos', %L)$$,
  :'real_org' || '/' || :'real_log' || '/00000000-0000-0000-0000-00000000a505.jpg'),
  '42501', null, 'a sample session cannot write a waste photo under the real org''s path');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('waste-photos', %L)$$,
  :'sample_org' || '/' || :'real_log' || '/00000000-0000-0000-0000-00000000a506.jpg'),
  '42501', null, 'a sample session cannot attach a waste photo to a real-org log under its own prefix');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'sample_org' || '/' || :'sample_sig' || '/00000000-0000-0000-0000-00000000a507.jpg'),
  'control: a sample session adds a photo to its own signal under its own path');
reset role;
select is((select count(*)::int from storage.objects where name like :'real_org' || '/%'), 2,
  'the real org''s objects are unchanged');

select * from finish();
rollback;
