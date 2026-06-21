begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

-- All as the privileged test-runner (origin widening is a CHECK, independent of RLS; the BU is the
-- same-org seeded Kitchen-and-Bar to satisfy log_entries_guard). created_by is passed explicitly
-- (the runner role has no person_id claim, so the current_person_id() default is NULL).
select lives_ok($$
  insert into ops.log_entries (org_id, business_unit_id, origin, event_type, title, occurred_at, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','kitchen','production','t',now(),'00000000-0000-0000-0000-0000000000d1')
$$, 'AC-071: origin=kitchen accepted');
select throws_ok($$
  insert into ops.log_entries (org_id, business_unit_id, origin, event_type, title, occurred_at, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','bogus','production','t',now(),'00000000-0000-0000-0000-0000000000d1')
$$, '23514', null, 'AC-071: out-of-set origin still rejected');
select lives_ok($$
  insert into ops.log_entries (org_id, business_unit_id, origin, event_type, title, occurred_at, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','kitchen_app','production','t',now(),'00000000-0000-0000-0000-0000000000d1')
$$, 'AC-071: legacy kitchen_app still accepted (back-compat)');

select * from finish();
rollback;
