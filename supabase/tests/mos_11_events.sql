begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();

-- Two actual tenants make every zero below an isolation assertion rather than an empty-table pass.
insert into mos.events (id, org_id, title, venue, is_outbound, starts_at, ends_at, created_by) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','Org A event','Office',false,'2026-08-01 01:00+00','2026-08-01 02:00+00','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-0000000000b1','Org B event','Foreign office',false,'2026-08-01 01:00+00','2026-08-01 02:00+00','00000000-0000-0000-0000-0000000000b4');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.events), 1, 'org A member reads its own event');
select is((select count(*)::int from mos.events where org_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'org seam: org A reads zero org-B events');
select lives_ok($$ insert into mos.events (title, venue, is_outbound, starts_at, ends_at) values ('Stamped','Office',false,'2026-08-02 01:00+00','2026-08-02 02:00+00') $$, 'member inserts an event in their org');
select is((select org_id from mos.events where title = 'Stamped'), '00000000-0000-0000-0000-0000000000a1'::uuid, 'insert stamps the session org');
select is((select created_by from mos.events where title = 'Stamped'), '00000000-0000-0000-0000-0000000000d1'::uuid, 'insert stamps the session author');
select throws_ok($$ insert into mos.events (org_id, title, venue, is_outbound, starts_at, ends_at) values ('00000000-0000-0000-0000-0000000000b1','Spoof org','Office',false,'2026-08-02 01:00+00','2026-08-02 02:00+00') $$, '42501', null, 'foreign org id is refused');
select throws_ok($$ insert into mos.events (created_by, title, venue, is_outbound, starts_at, ends_at) values ('00000000-0000-0000-0000-0000000000d2','Spoof author','Office',false,'2026-08-02 01:00+00','2026-08-02 02:00+00') $$, '42501', null, 'created_by spoof is refused');
select lives_ok($$ update mos.events set title = 'Author updated' where id = '00000000-0000-0000-0000-00000000e001' $$, 'author updates own event');
select throws_ok($$ update mos.events set created_by = '00000000-0000-0000-0000-0000000000d2' where id = '00000000-0000-0000-0000-00000000e001' $$, '42501', null, 'event author is immutable');
select throws_ok($$ update mos.events set org_id = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-00000000e001' $$, '42501', null, 'event org ownership is immutable');
select throws_ok($$ insert into mos.events (title, venue, is_outbound, starts_at, ends_at) values ('Bad window','Office',false,'2026-08-02 02:00+00','2026-08-02 02:00+00') $$, '23514', null, 'event end must be after start');
update mos.events set archived_at = now() where id = '00000000-0000-0000-0000-00000000e001';
select is((select count(*)::int from mos.events where archived_at is null and id = '00000000-0000-0000-0000-00000000e001'), 0, 'default active list excludes archived event');

-- Direct manager succeeds; peer does not. Both are real org-A people from the directory fixture.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["manager"]}';
select lives_ok($$ update mos.events set archived_at = null where id = '00000000-0000-0000-0000-00000000e001' $$, 'author manager can unarchive');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
update mos.events set title = 'Peer edit' where id = '00000000-0000-0000-0000-00000000e001';
select is((select title from mos.events where id = '00000000-0000-0000-0000-00000000e001'), 'Author updated', 'peer cannot update another author event');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from mos.events where id = '00000000-0000-0000-0000-00000000e001'), 0, 'org B cannot read org A event');
update mos.events set title = 'Foreign edit' where id = '00000000-0000-0000-0000-00000000e001';
select is((select count(*)::int from mos.events where id = '00000000-0000-0000-0000-00000000e001' and title = 'Foreign edit'), 0, 'org B cannot update org A event');
set local request.jwt.claims = '{"person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from mos.events), 0, 'claimless authenticated session reads zero events');
select throws_ok($$ insert into mos.events (title, venue, is_outbound, starts_at, ends_at) values ('Claimless','Office',false,'2026-08-02 01:00+00','2026-08-02 02:00+00') $$, '42501', null, 'claimless authenticated session cannot write');
select is((select has_table_privilege('authenticated', 'mos.events', 'DELETE')), false, 'authenticated cannot delete Events');

select * from finish();
rollback;
