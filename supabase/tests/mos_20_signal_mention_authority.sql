-- The BU mention write gate and its synchronous delivery path consume one authority matrix.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();

create temp table mention_ids (signal_id uuid) on commit drop;
insert into mention_ids default values;
grant select, update on mention_ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
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

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.save_role_authority('[{"action":"signal.tag","role":"member","scope":"none"}]'::jsonb);
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
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
