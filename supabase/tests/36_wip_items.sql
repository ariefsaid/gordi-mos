begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

-- AC-006: member can READ active items, cannot INSERT/UPDATE; ops_lead can.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from ops.wip_items where flag_active and org_id = '00000000-0000-0000-0000-0000000000a1'),
          3, 'AC-006: member reads the seeded active WIP items');
select throws_ok($$
  insert into ops.wip_items (org_id, name) values ('00000000-0000-0000-0000-0000000000a1','Test')
$$, '42501', null, 'AC-006: member INSERT denied (master data)');
-- ops_lead claim (the JWT access_roles claim is what shared.has_access_role reads — independent of
-- the seeded grant; …0d3 is an org-A person used as the ops_lead session here).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select lives_ok($$
  insert into ops.wip_items (org_id, name, esb_bom_id, esb_product_detail_id_porsi)
  values ('00000000-0000-0000-0000-0000000000a1','Soto Ayam','BOM-099','PD-PORSI-099')
$$, 'AC-006: ops_lead INSERT ok');
-- cross-org isolation: an org-B member sees ONLY its own org's items (the seeded B-Item …ab09),
-- never org-A's rows. (The fixture seeds one org-B WIP item for the same-org guard test.)
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from ops.wip_items where org_id<>'00000000-0000-0000-0000-0000000000b1'), 0,
  'AC-006: foreign-org member reads no other-org items');
select is((select count(*)::int from ops.wip_items where org_id='00000000-0000-0000-0000-0000000000a1'), 0,
  'AC-006: foreign-org member cannot read org-A items (org isolation)');

reset role;
select * from finish();
rollback;
