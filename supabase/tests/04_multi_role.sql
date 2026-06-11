begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000d1', 'Org D', 'org-d');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'Unit One'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d1', 'Unit Two');
insert into shared.roles (id, org_id, business_unit_id, name) values
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 'Role One'),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3', 'Role Two');
insert into shared.people (id, org_id, full_name)
  values ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d1', 'Dual Hat');

select lives_ok($$
  insert into shared.person_roles (org_id, person_id, role_id) values
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d4'),
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d5')
$$, 'one person holds two roles (OD-P1-7)');

select is(
  (select count(*)::int from shared.person_roles where person_id='00000000-0000-0000-0000-0000000000d6'),
  2,
  'both role assignments persist'
);

select throws_ok($$
  insert into shared.person_roles (org_id, person_id, role_id) values
    ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000d4')
$$, '23505', null, 'duplicate (person, role) is rejected by the unique constraint');

select * from finish();
rollback;
