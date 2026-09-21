-- Signal photos (ticket 680), through real RLS on storage.objects: the author adds photos to their
-- own live Signal inside the capture window and up to four; a photo is read by whoever reads the
-- Signal and by nobody once it is retracted; nothing is edited or removed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

reset role;
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000006803','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a3','Outside Team','outside_team_680');
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body, created_at) values
  ('00000000-0000-0000-0000-000000006801','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','org',null, now(), 'All Teams signal with photos', now()),
  ('00000000-0000-0000-0000-000000006802','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','org',null, now(), 'Signal past its capture window', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000006804','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1','team','00000000-0000-0000-0000-000000006803', now(), 'Historical Team signal', now());

\set org  '00000000-0000-0000-0000-0000000000a1'
\set live :org/00000000-0000-0000-0000-000000006801
\set late :org/00000000-0000-0000-0000-000000006802
\set team :org/00000000-0000-0000-0000-000000006804

-- ── the author ────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'live' || '/00000000-0000-0000-0000-0000000000f1.jpg'), 'the author adds a photo to their own live Signal');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'team' || '/00000000-0000-0000-0000-0000000000f9.jpg'), 'the author adds a photo to their historical Team Signal');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'late' || '/00000000-0000-0000-0000-0000000000f1.jpg'), '42501', null, 'no photo is added after the capture window');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'live' || '/notes.pdf'), '42501', null, 'a path that is not <uuid>.<image ext> is refused');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  '00000000-0000-0000-0000-0000000000b9/00000000-0000-0000-0000-000000006801/00000000-0000-0000-0000-0000000000f1.jpg'),
  '42501', null, 'a path under another org is refused');

select lives_ok(format($$insert into storage.objects (bucket_id, name) values
  ('signal-photos', %L), ('signal-photos', %L)$$,
  :'live' || '/00000000-0000-0000-0000-0000000000f2.jpg', :'live' || '/00000000-0000-0000-0000-0000000000f3.png'),
  'second and third photos land');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'live' || '/00000000-0000-0000-0000-0000000000f4.webp'), 'the fourth photo lands');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'live' || '/00000000-0000-0000-0000-0000000000f5.jpg'), '42501', null, 'a fifth photo is refused');

select is((select count(*)::int from mos.signal_photos where signal_id = '00000000-0000-0000-0000-000000006801'), 4,
  'the author reads the four photos through the feed view');

-- Evidence is not edited or removed. The Storage API deletes with this setting on; without a
-- delete policy its statement matches no row.
select set_config('storage.allow_delete_query', 'true', true);
update storage.objects set name = :'live' || '/00000000-0000-0000-0000-0000000000f8.jpg'
 where name = :'live' || '/00000000-0000-0000-0000-0000000000f1.jpg';
delete from storage.objects where name = :'live' || '/00000000-0000-0000-0000-0000000000f2.jpg';
select is((select count(*)::int from storage.objects where bucket_id = 'signal-photos'
            and name in (:'live' || '/00000000-0000-0000-0000-0000000000f1.jpg', :'live' || '/00000000-0000-0000-0000-0000000000f2.jpg')), 2,
  'the author can neither rename nor delete a photo');

-- ── another member ────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signal_photos where signal_id = '00000000-0000-0000-0000-000000006801'), 4,
  'any same-org member reads an All Teams Signal''s photos');
select is((select count(*)::int from mos.signal_photos where signal_id = '00000000-0000-0000-0000-000000006804'), 0,
  'a member who cannot read the historical Team Signal reads none of its photos');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('signal-photos', %L)$$,
  :'team' || '/00000000-0000-0000-0000-0000000000f6.jpg'), '42501', null, 'a non-author cannot add a photo');

-- ── another org ───────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b9","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from storage.objects where bucket_id = 'signal-photos'), 0,
  'another org reads no photo');

-- ── retracted ─────────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update mos.signals set retracted_at = now(), retract_reason = 'Wrong photo'
 where id = '00000000-0000-0000-0000-000000006801';
select is((select count(*)::int from mos.signal_photos where signal_id = '00000000-0000-0000-0000-000000006801'), 0,
  'a retracted Signal shows no photo, even to its author');

set local role anon;
select throws_ok($$select count(*) from mos.signal_photos$$, '42501', null, 'anon has no access to the feed view');

select * from finish();
rollback;
