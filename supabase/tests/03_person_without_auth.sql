begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into shared.orgs (id, name, slug)
  values ('00000000-0000-0000-0000-0000000000c1', 'Org C', 'org-c');

-- Two login-less people in the same org: both allowed (NULL user_id does not collide).
select lives_ok($$
  insert into shared.people (org_id, full_name) values
    ('00000000-0000-0000-0000-0000000000c1', 'Login-less One'),
    ('00000000-0000-0000-0000-0000000000c1', 'Login-less Two')
$$, 'two people with NULL user_id insert without unique violation (person-first, OD-P1-2)');

select is(
  (select count(*)::int from shared.people where org_id='00000000-0000-0000-0000-0000000000c1' and user_id is null),
  2,
  'both login-less people persist'
);

select * from finish();
rollback;
