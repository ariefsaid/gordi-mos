begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-00000000a901', 'Google sign-in test', 'google-sign-in-test'),
  ('00000000-0000-0000-0000-00000000a902', 'Google sign-in second org', 'google-sign-in-second-org');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b901', 'provisioned@example.test'),
  ('00000000-0000-0000-0000-00000000b902', 'unverified@example.test'),
  ('00000000-0000-0000-0000-00000000b903', 'unknown@example.test'),
  ('00000000-0000-0000-0000-00000000b904', 'shared-address@example.test');

insert into shared.people (id, org_id, full_name, email, user_id) values
  ('00000000-0000-0000-0000-00000000c901', '00000000-0000-0000-0000-00000000a901', 'Provisioned', 'provisioned@example.test', '00000000-0000-0000-0000-00000000b901'),
  ('00000000-0000-0000-0000-00000000c902', '00000000-0000-0000-0000-00000000a901', 'Unverified', 'unverified@example.test', '00000000-0000-0000-0000-00000000b902'),
  ('00000000-0000-0000-0000-00000000c903', '00000000-0000-0000-0000-00000000a901', 'Shared address, first org', 'shared-address@example.test', '00000000-0000-0000-0000-00000000b904'),
  ('00000000-0000-0000-0000-00000000c904', '00000000-0000-0000-0000-00000000a902', 'Same address in another org', 'SHARED-ADDRESS@example.test', null);

insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000c901', 'member');

select lives_ok($$
  insert into auth.identities (id, user_id, provider, provider_id, identity_data)
  values (
    '00000000-0000-0000-0000-00000000d901',
    '00000000-0000-0000-0000-00000000b901',
    'google', 'google-subject-901',
    '{"sub":"google-subject-901","email":"PROVISIONED@example.test","email_verified":true}'::jsonb
  )
$$, 'Google links to the existing login for its case-insensitive provisioned email');
select is(
  (select user_id from auth.identities where id = '00000000-0000-0000-0000-00000000d901'),
  '00000000-0000-0000-0000-00000000b901'::uuid,
  'the verified Google identity stays linked to the pre-existing auth user');
select is(
  (select user_id from shared.people where id = '00000000-0000-0000-0000-00000000c901'),
  '00000000-0000-0000-0000-00000000b901'::uuid,
  'Google sign-in preserves the provisioned person link');
select is(
  (select array_agg(access_role order by access_role) from shared.person_access_roles
    where person_id = '00000000-0000-0000-0000-00000000c901' and revoked_at is null),
  array['member']::shared.access_role[], 'Google sign-in preserves the existing access role');
select is(
  (select count(*)::int from shared.record_history
    where schema_name = 'shared' and table_name = 'people'
      and record_key = '00000000-0000-0000-0000-00000000c901'),
  1, 'linking Google does not add a people history event');

select throws_ok($$
  insert into auth.identities (id, user_id, provider, provider_id, identity_data)
  values (
    '00000000-0000-0000-0000-00000000d902',
    '00000000-0000-0000-0000-00000000b902',
    'google', 'google-subject-902',
    '{"sub":"google-subject-902","email":"unverified@example.test","email_verified":false}'::jsonb
  )
$$, 'P0001', 'Google sign-in requires one provisioned, verified account. Ask an admin for help.',
  'an unverified Google email is refused');
select is(
  (select count(*)::int from auth.identities where id = '00000000-0000-0000-0000-00000000d902'),
  0, 'the refused unverified identity is not linked');

select throws_ok($$
  insert into auth.identities (id, user_id, provider, provider_id, identity_data)
  values (
    '00000000-0000-0000-0000-00000000d903',
    '00000000-0000-0000-0000-00000000b903',
    'google', 'google-subject-903',
    '{"sub":"google-subject-903","email":"unknown@example.test","email_verified":true}'::jsonb
  )
$$, 'P0001', 'Google sign-in requires one provisioned, verified account. Ask an admin for help.',
  'an email without a provisioned person is refused');
select is(
  (select count(*)::int from auth.identities where id = '00000000-0000-0000-0000-00000000d903'),
  0, 'the refused unknown identity is not linked');

select lives_ok($$
  insert into auth.identities (id, user_id, provider, provider_id, identity_data)
  values (
    '00000000-0000-0000-0000-00000000d904',
    '00000000-0000-0000-0000-00000000b904',
    'google', 'google-subject-904',
    '{"sub":"google-subject-904","email":"shared-address@example.test","email_verified":true}'::jsonb
  )
$$, 'a matching address in another org does not prevent linking the provisioned user');
select is(
  (select count(*)::int from auth.identities where id = '00000000-0000-0000-0000-00000000d904'),
  1, 'the verified identity remains linked to its auth user');

select is(
  (select count(*)::int from auth.users where id in (
    '00000000-0000-0000-0000-00000000b901', '00000000-0000-0000-0000-00000000b902',
    '00000000-0000-0000-0000-00000000b903', '00000000-0000-0000-0000-00000000b904'
  )),
  4, 'refused Google identity links create no auth users');
select is(
  (select count(*)::int from shared.people where org_id = '00000000-0000-0000-0000-00000000a901'),
  3, 'the original org has only its three provisioned people');

select throws_ok($$
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (
    '00000000-0000-0000-0000-00000000b905', 'new-google@example.test',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"email_verified":true}'::jsonb
  )
$$, 'P0001', 'Google sign-in requires one provisioned, verified account. Ask an admin for help.',
  'Google sign-in cannot create a new auth account');
select is(
  (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-00000000b905'),
  0, 'a refused Google sign-in leaves no auth user');
select is(
  (select count(*)::int from shared.people where email = 'new-google@example.test'),
  0, 'a refused Google sign-in leaves no shared.people row');

select lives_ok($$
  insert into auth.users (
    id, email, raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-00000000b906', 'email-provider@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"email_verified":true}'::jsonb
  )
$$, 'the Google identity guard leaves email-provider login creation available');

select ok(not (shared.custom_access_token_hook(jsonb_build_object(
  'user_id', '00000000-0000-0000-0000-00000000b901',
  'authentication_method', 'oauth',
  'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated')) ) ? 'error'),
  'a verified Google OAuth sign-in can issue a token for its provisioned account');

update auth.identities
   set identity_data = jsonb_set(identity_data, '{email_verified}', 'false'::jsonb)
 where id = '00000000-0000-0000-0000-00000000d901';
select is((shared.custom_access_token_hook(jsonb_build_object(
  'user_id', '00000000-0000-0000-0000-00000000b901',
  'authentication_method', 'oauth',
  'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated')))
  -> 'error' ->> 'http_code'), '403',
  'an existing Google identity with an unverified email cannot issue an OAuth token');
select is((shared.custom_access_token_hook(jsonb_build_object(
  'user_id', '00000000-0000-0000-0000-00000000b901',
  'authentication_method', 'oauth',
  'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated')))
  -> 'error' ->> 'message'),
  'Google sign-in requires one provisioned, verified account. Ask an admin for help.',
  'the token-hook refusal gives a plain admin-help message');
update auth.identities
   set identity_data = jsonb_set(identity_data, '{email_verified}', 'true'::jsonb)
 where id = '00000000-0000-0000-0000-00000000d901';

select ok(not (shared.custom_access_token_hook(jsonb_build_object(
  'user_id', '00000000-0000-0000-0000-00000000b904',
  'authentication_method', 'oauth',
  'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated'))) ? 'error'),
  'a matching address in another org does not block the user-id-bound Google OAuth sign-in');
select ok(not (shared.custom_access_token_hook(jsonb_build_object(
  'user_id', '00000000-0000-0000-0000-00000000b901',
  'authentication_method', 'password',
  'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated')) ) ? 'error'),
  'an email/password sign-in remains available independently of Google OAuth matching');
select * from finish();
rollback;
