-- Historical Team-audience Signals (ticket 874): the author and an effective retraction authority
-- read the row through real RLS, the authority's retraction UPDATE lands, both keep the tombstone
-- after Team archival, and the tombstone's audience is frozen.
--
-- The row lives on a Team in Unit-2 (visibility rank 2). Author d1 and ops lead d3 hold Unit-1 roles
-- and no membership there, so none of the Team-rooted read rules reaches it for either of them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

reset role;
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000005b03','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a3','Outside Team','outside_team');
insert into mos.signals (id, org_id, author_id, audience, owning_team_id, occurred_at, body)
values ('00000000-0000-0000-0000-000000009874','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1','team','00000000-0000-0000-0000-000000005b03',
        now(), 'Historical outside-Team signal');
insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
values ('00000000-0000-0000-0000-00000000e874','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009874','person','00000000-0000-0000-0000-0000000000d5');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000009874'), 1,
  'an outside-Team author reads their historical Team Signal');
-- Controls for the freeze below: both mention writes land while the Signal is active.
select lives_ok($$
  insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
  values ('00000000-0000-0000-0000-00000000e875','00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000009874','person','00000000-0000-0000-0000-0000000000d2')
$$, 'the author can add a mention while the Signal is active');
select lives_ok($$
  update mos.signal_mentions set revoked_at = now()
   where id = '00000000-0000-0000-0000-00000000e875'
$$, 'the author can revoke a mention while the Signal is active');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000009874'), 0,
  'a same-org member with no rule reads zero');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000009874'), 0,
  'the same outside person without the ops_lead role reads zero — the role is the grant');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000009874'), 1,
  'an org-scoped moderator outside the Team reads the historical Team Signal');
with moved as (
  update mos.signals
     set retracted_at = now(), retract_reason = 'Moderated historical row'
   where id = '00000000-0000-0000-0000-000000009874'
  returning 1
)
select is((select count(*)::int from moved), 1,
  'the moderator''s retraction UPDATE changes one row');

-- Mention freeze on the tombstone.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_person_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000009874',
          'person','00000000-0000-0000-0000-0000000000d4')
$$, '42501', null, 'an author cannot add a mention after the Signal becomes a tombstone');
select throws_ok($$
  update mos.signal_mentions set revoked_at = now()
   where id = '00000000-0000-0000-0000-00000000e874'
$$, '42501', null, 'an author cannot remove an original mention after the Signal becomes a tombstone');
select throws_ok($$
  update mos.signal_mentions set revoked_at = null
   where id = '00000000-0000-0000-0000-00000000e875'
$$, '42501', null, 'a revoked mention cannot be restored after the Signal becomes a tombstone');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000009874'), 0,
  'a person outside the original audience gains no read of the tombstone');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000009874'), 1,
  'a person in the original audience keeps read of the tombstone');

reset role;
update shared.teams set archived_at = now() where id = '00000000-0000-0000-0000-000000005b03';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000009874'), 1,
  'the author keeps read of the tombstone after Team archival');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select is((select count(*)::int from mos.signals where id = '00000000-0000-0000-0000-000000009874'), 1,
  'the moderator keeps read of the tombstone after Team archival');
select is((select retracted_by from mos.signals where id = '00000000-0000-0000-0000-000000009874'),
  '00000000-0000-0000-0000-0000000000d3'::uuid,
  'the tombstone names the moderator as the retraction actor');

select * from finish();
rollback;
