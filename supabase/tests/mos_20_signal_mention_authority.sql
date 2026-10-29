-- The BU mention write gate and its synchronous delivery path consume one authority matrix.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

create temp table mention_ids (signal_id uuid) on commit drop;
insert into mention_ids default values;
grant select, update on mention_ids to authenticated;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
update mention_ids
   set signal_id = mos.create_signal_with_mentions(
     'Member BU mention',
     now(),
     jsonb_build_array(jsonb_build_object(
       'kind', 'bu',
       'targetId', '00000000-0000-0000-0000-0000000000a2')));
select ok((select signal_id is not null from mention_ids),
  'a default member can create a BU mention under the signal.tag authority matrix');
select is((select count(*)::int from mos.signal_mentions
            where signal_id = (select signal_id from mention_ids)), 1,
  'the permitted BU mention is committed with the Signal');
reset role;
select set_eq($$
  select owner_id from mos.notifications
   where metadata ->> 'source' = 'signal_mention'
     and metadata #>> '{entity,id}' = (select signal_id::text from mention_ids)
$$, $$
  values
    ('00000000-0000-0000-0000-0000000000d2'::uuid),
    ('00000000-0000-0000-0000-0000000000d3'::uuid),
    ('00000000-0000-0000-0000-0000000000d4'::uuid),
    ('00000000-0000-0000-0000-0000000000d5'::uuid),
    ('00000000-0000-0000-0000-0000000000d6'::uuid)
$$, 'BU fan-out reaches each active Team member and BU-role holder except the author');
select is((select count(*)::int from mos.notifications
            where metadata ->> 'source' = 'signal_mention'
              and metadata #>> '{entity,id}' = (select signal_id::text from mention_ids)), 5,
  'the permitted BU mention creates one notification per eligible recipient');
-- #774: every mention notification's metadata now carries `actor` — the Signal author (the
-- fixture author is d1/'Author') — the SAME shape mos.signal_retraction already proves, so
-- the Inbox can render "<Actor> mentioned you" instead of the one frozen fallback title.
select is((select metadata->'actor'->>'id' from mos.notifications
            where metadata ->> 'source' = 'signal_mention'
              and metadata #>> '{entity,id}' = (select signal_id::text from mention_ids)
            limit 1), '00000000-0000-0000-0000-0000000000d1',
  'a mention notification''s metadata carries the Signal author as actor.id (#774)');
select is((select metadata->'actor'->>'name' from mos.notifications
            where metadata ->> 'source' = 'signal_mention'
              and metadata #>> '{entity,id}' = (select signal_id::text from mention_ids)
            limit 1), 'Author',
  'a mention notification''s metadata carries the Signal author''s name as actor.name (#774)');

-- A roster can retain an archived person after the membership was created.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000005b02', false);
update shared.people set archived_at = now() where id in ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d5');
set local role authenticated;
select lives_ok($$ select mos.create_signal_with_mentions('Mixed Team', now(),
  '[{"kind":"team","targetId":"00000000-0000-0000-0000-000000005b02"}]'::jsonb) $$,
  'a Team mention posts with an archived roster member');
select lives_ok($$ select mos.create_signal_with_mentions('Mixed BU', now(),
  '[{"kind":"bu","targetId":"00000000-0000-0000-0000-0000000000a2"}]'::jsonb) $$,
  'a BU mention posts with an archived roster member');
reset role;
select is((select count(*)::int from mos.notifications n join mos.signals s on n.metadata #>> '{entity,id}' = s.id::text
  where s.body = 'Mixed Team' and n.owner_id = '00000000-0000-0000-0000-0000000000d2'), 1,
  'the active Team member receives exactly one notice');
select is((select count(*)::int from mos.notifications n join mos.signals s on n.metadata #>> '{entity,id}' = s.id::text
  where s.body = 'Mixed BU' and n.owner_id = '00000000-0000-0000-0000-0000000000d2'), 1,
  'the active BU recipient receives exactly one notice despite overlapping membership');
select is((select count(*)::int from mos.notifications n join mos.signals s on n.metadata #>> '{entity,id}' = s.id::text
  where s.body in ('Mixed Team', 'Mixed BU') and n.owner_id in ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d5')), 0,
  'the archived person receives no notice');
-- Direct mentions are validated at write time; this exercises a previously valid mention after archival.
delete from mos.notifications where owner_id = '00000000-0000-0000-0000-0000000000d4'
  and metadata #>> '{entity,id}' = (select signal_id::text from mention_ids);
insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-0000000000a1', (select signal_id from mention_ids), 'person', '00000000-0000-0000-0000-0000000000d4');
set local role authenticated;
select lives_ok($$ select mos.fan_out_signal_mention((select signal_id from mention_ids)) $$,
  'a previously mentioned person archived since posting is skipped');
reset role;
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d2';
set local role authenticated;
select lives_ok($$ select mos.create_signal_with_mentions('Archived Team', now(),
  '[{"kind":"team","targetId":"00000000-0000-0000-0000-000000005b02"}]'::jsonb) $$,
  'an all-archived Team roster does not prevent posting');
reset role;
update shared.people set archived_at = null where id in ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d5');
set local role authenticated;
select mos.fan_out_signal_mention((select signal_id from mention_ids));
reset role;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');
select shared.save_role_authority('[{"action":"signal.tag","role":"member","scope":"none"}]'::jsonb);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$
  select mos.create_signal_with_mentions(
    'Denied BU mention',
    now(),
    jsonb_build_array(jsonb_build_object(
       'kind', 'bu',
       'targetId', '00000000-0000-0000-0000-0000000000a2')))
$$, '42501', null,
  'an explicit signal.tag deny blocks a member from creating a BU mention');
reset role;
select is((select count(*)::int from mos.signals where body = 'Denied BU mention'), 0,
  'a denied BU mention does not leave a Signal behind');
select is((select count(*)::int from mos.notifications
            where org_id = '00000000-0000-0000-0000-0000000000a1'
              and metadata ->> 'source' = 'signal_mention'
              and metadata #>> '{entity,id}' = (select signal_id::text from mention_ids)), 5,
  'the fixture Signal retains exactly its five notifications after the denied attempt');

select * from finish();
rollback;
