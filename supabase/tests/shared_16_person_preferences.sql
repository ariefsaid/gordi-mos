-- shared.person_preferences (#927) — a person reads and writes only their OWN preference row, in
-- their own org. One section per policy, plus the grant surface (no DELETE, nothing for anon).
--
-- Remember the two shapes of "denied": INSERT or a WITH CHECK failure RAISES 42501, while an UPDATE
-- whose USING matches no row silently affects ZERO rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select shared._test_seed_directory();
-- org A = ...0a1 with people d1 (Author), d2 (DirectMgr); org B = ...0b1 with b4 (ForeignMgr)

set local role authenticated;

-- ── person_preferences_insert_self / _select_self: own row ───────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1"}';

select lives_ok($$
  insert into shared.person_preferences (person_id, locale)
  values ('00000000-0000-0000-0000-0000000000d1', 'id')
$$, 'insert_self: a person saves their own language with org_id omitted');

select is(
  (select org_id from shared.person_preferences where person_id = '00000000-0000-0000-0000-0000000000d1'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '...the org is stamped server-side from the session');

select is(
  (select locale from shared.person_preferences),
  'id',
  'select_self: the owner reads back exactly their own saved value');

select lives_ok($$
  update shared.person_preferences set locale = 'en'
   where person_id = '00000000-0000-0000-0000-0000000000d1'
$$, 'update_self: the owner changes their own value');

select is(
  (select locale from shared.person_preferences where person_id = '00000000-0000-0000-0000-0000000000d1'),
  'en',
  '...and the change is stored');

select throws_ok($$
  insert into shared.person_preferences (person_id, locale)
  values ('00000000-0000-0000-0000-0000000000d1', 'fr')
    on conflict (person_id) do update set locale = excluded.locale
$$, '23514', null, 'only en and id are storable');

-- ── Another account: neither readable nor writable ───────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';

select is((select count(*)::int from shared.person_preferences), 0,
  'select_self: a same-org colleague reads zero rows of another person''s preference');

update shared.person_preferences set locale = 'id'
 where person_id = '00000000-0000-0000-0000-0000000000d1';

select throws_ok($$
  insert into shared.person_preferences (person_id, locale)
  values ('00000000-0000-0000-0000-0000000000d1', 'id')
$$, '42501', null, 'insert_self: a colleague cannot write a row claiming another person');

select throws_ok($$
  insert into shared.person_preferences (person_id, org_id, locale)
  values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', 'id')
$$, '42501', null, 'insert_self: a person cannot stamp their own row with a foreign org_id');

select throws_ok($$
  insert into shared.person_preferences (person_id, org_id, locale)
  values ('00000000-0000-0000-0000-0000000000d2', null, 'id')
$$, '42501', null, 'insert_self: an explicit NULL org_id is rejected too');

insert into shared.person_preferences (person_id, locale) values ('00000000-0000-0000-0000-0000000000d2', 'en');

select throws_ok($$
  update shared.person_preferences set person_id = '00000000-0000-0000-0000-0000000000d1'
   where person_id = '00000000-0000-0000-0000-0000000000d2'
$$, '42501', null, 'update_self: a person cannot re-point their row at another person');

select throws_ok($$
  update shared.person_preferences set org_id = '00000000-0000-0000-0000-0000000000b1'
   where person_id = '00000000-0000-0000-0000-0000000000d2'
$$, '42501', null, 'update_self: a person cannot move their row into a foreign org');

select throws_ok($$
  delete from shared.person_preferences where person_id = '00000000-0000-0000-0000-0000000000d2'
$$, '42501', null, 'no DELETE grant: not even the owner deletes a row');

-- ── Another org: a matching person_id claim from org B still reads nothing of org A ──────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4"}';
select is((select count(*)::int from shared.person_preferences), 0,
  'select_self: an org-B session reads zero org-A preference rows');

-- A person_id claim naming an org-A person inside an org-B token is not live: the org seam closes.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000d1"}';
select is((select count(*)::int from shared.person_preferences), 0,
  'select_self: a person_id claim paired with the wrong org reads nothing');

reset role;
select is(
  (select locale from shared.person_preferences where person_id = '00000000-0000-0000-0000-0000000000d1'),
  'en',
  'the colleague''s UPDATE of another person''s row changed nothing');

select ok(
  not has_table_privilege('anon', 'shared.person_preferences', 'SELECT')
  and not has_table_privilege('anon', 'shared.person_preferences', 'INSERT')
  and not has_table_privilege('anon', 'shared.person_preferences', 'UPDATE')
  and not has_table_privilege('authenticated', 'shared.person_preferences', 'DELETE'),
  'grant surface: nothing for anon, no DELETE for authenticated');

select * from finish();
rollback;
