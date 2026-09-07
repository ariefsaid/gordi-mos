-- Objective door roll-up posture (AC-070 / NFR-001).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_view('mos', 'objective_progress', 'Home reads Objective progress from a named view');
select col_type_is('mos', 'objective_progress', 'id', 'uuid', 'Objective progress keeps the Objective id');
select col_type_is('mos', 'objective_progress', 'done', 'integer', 'Objective progress exposes a done count');
select col_type_is('mos', 'objective_progress', 'total', 'integer', 'Objective progress exposes a total count');

select ok(
  (select c.reloptions @> array['security_invoker=true']
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'mos' and c.relname = 'objective_progress'),
  'Objective progress remains security_invoker'
);

-- A direct Objective task and a task reached through its Project/Process both count. Done is the
-- numerator; an archived task is excluded from the denominator and numerator.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000d1', 'Progress Org', 'progress-org'),
  ('00000000-0000-0000-0000-0000000000d2', 'Other Progress Org', 'other-progress-org');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-0000000000d1', 'Progress BU'),
  ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-0000000000d2', 'Other BU');
insert into shared.people (id, org_id, full_name) values
  ('00000000-0000-0000-0000-00000000d110', '00000000-0000-0000-0000-0000000000d1', 'Progress Viewer'),
  ('00000000-0000-0000-0000-00000000d210', '00000000-0000-0000-0000-0000000000d2', 'Other Viewer');
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'Progress Objective');
insert into mos.work_lines (id, org_id, name, type, objective_id) values
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d1', 'Progress Project', 'project',
   '00000000-0000-0000-0000-0000000000d3');
insert into mos.tasks (id, org_id, title, business_unit_id, status, responsible_person_id,
  accountable_person_id, created_by, objective_id, work_line_id) values
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d1', 'Direct Done',
   '00000000-0000-0000-0000-00000000d101', 'Done', '00000000-0000-0000-0000-00000000d110',
   '00000000-0000-0000-0000-00000000d110', '00000000-0000-0000-0000-00000000d110',
   '00000000-0000-0000-0000-0000000000d3', null),
  ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d1', 'Direct Open',
   '00000000-0000-0000-0000-00000000d101', 'Open', '00000000-0000-0000-0000-00000000d110',
   '00000000-0000-0000-0000-00000000d110', '00000000-0000-0000-0000-00000000d110',
   '00000000-0000-0000-0000-0000000000d3', null),
  ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000d1', 'Line Done',
   '00000000-0000-0000-0000-00000000d101', 'Done', '00000000-0000-0000-0000-00000000d110',
   '00000000-0000-0000-0000-00000000d110', '00000000-0000-0000-0000-00000000d110',
   null, '00000000-0000-0000-0000-0000000000d4'),
  ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000d1', 'Line Open',
   '00000000-0000-0000-0000-00000000d101', 'Open', '00000000-0000-0000-0000-00000000d110',
   '00000000-0000-0000-0000-00000000d110', '00000000-0000-0000-0000-00000000d110',
   null, '00000000-0000-0000-0000-0000000000d4'),
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d1', 'Archived Done',
   '00000000-0000-0000-0000-00000000d101', 'Done', '00000000-0000-0000-0000-00000000d110',
   '00000000-0000-0000-0000-00000000d110', '00000000-0000-0000-0000-00000000d110',
   '00000000-0000-0000-0000-0000000000d3', null);
update mos.tasks set archived_at = now()
where id = '00000000-0000-0000-0000-0000000000d9';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000d1","person_id":"00000000-0000-0000-0000-00000000d110","access_roles":["member"]}';
select is((select (done, total)::text from mos.objective_progress where id = '00000000-0000-0000-0000-0000000000d3'), '(2,4)',
  'Objective progress counts direct and work-line tasks, excluding archived tasks');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000d2","person_id":"00000000-0000-0000-0000-00000000d210","access_roles":["member"]}';
select is((select count(*)::int from mos.objective_progress), 0,
  'a non-org persona cannot read another org''s objective progress');

select * from finish();
rollback;
