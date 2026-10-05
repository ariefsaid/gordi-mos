-- Activity authority owns the writer and each row policy. Positions are synthetic fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(227);
select set_config('app.allow_test_seeds','on',true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
create temporary table rights_cases (label text, person_id uuid, access_roles text[], scopes text[], kitchen boolean, bar boolean);
insert into rights_cases values
('Kitchen manager','00000000-0000-0000-0000-000000000001'::uuid,array['member','manager']::text[],array['kitchen']::text[],true,false),
('Bar manager','00000000-0000-0000-0000-000000000002'::uuid,array['member','manager']::text[],array['bar']::text[],false,true),
('Ops manager','00000000-0000-0000-0000-000000000003'::uuid,array['member','manager']::text[],array['all']::text[],true,true),
('Ops lead','00000000-0000-0000-0000-000000000004'::uuid,array['member','ops_lead']::text[],array[]::text[],true,true),
('Admin','00000000-0000-0000-0000-000000000005'::uuid,array['member','admin']::text[],array[]::text[],true,true),
('Unconfigured Retail Ops manager','00000000-0000-0000-0000-000000000006'::uuid,array['member','manager']::text[],array[]::text[],false,false),
('Other BU manager','00000000-0000-0000-0000-000000000007'::uuid,array['member','manager']::text[],array[]::text[],false,false),
('Supervisor','00000000-0000-0000-0000-000000000008'::uuid,array['member','supervisor']::text[],array[]::text[],false,false),
('Member','00000000-0000-0000-0000-000000000009'::uuid,array['member']::text[],array[]::text[],false,false),
('Kitchen manager without financial-manager grant','00000000-0000-0000-0000-000000000010'::uuid,array['member']::text[],array['kitchen']::text[],true,false),
('Dual Kitchen and Bar manager','00000000-0000-0000-0000-000000000011'::uuid,array['member','manager']::text[],array['kitchen','bar']::text[],true,true);
grant select on rights_cases to authenticated;
insert into shared.people (id,org_id,full_name,email)
select person_id,'00000000-0000-0000-0000-0000000000a1','Synthetic ' || label,'rights-' || person_id || '@example.test' from rights_cases;
insert into shared.roles (org_id,business_unit_id,name,cafe_item_settings_scope)
select '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','Synthetic settings ' || scope,scope
from unnest(array['kitchen','bar','all']) scope;
insert into shared.person_roles (org_id,person_id,role_id)
select '00000000-0000-0000-0000-0000000000a1',c.person_id,r.id from rights_cases c
join shared.roles r on r.cafe_item_settings_scope = any(c.scopes) and r.name='Synthetic settings ' || r.cafe_item_settings_scope;
-- Both generic managers have a real position; neither position is a configured activity manager.
insert into shared.roles (org_id,business_unit_id,name)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','Synthetic unconfigured manager'),
       ('00000000-0000-0000-0000-0000000000a1',null,'Synthetic other manager');
insert into shared.person_roles (org_id,person_id,role_id)
select '00000000-0000-0000-0000-0000000000a1',c.person_id,r.id from rights_cases c
join shared.roles r on r.name=case c.label when 'Unconfigured Retail Ops manager' then 'Synthetic unconfigured manager' when 'Other BU manager' then 'Synthetic other manager' end;

select set_config('app.cafe_reference_test_org_id','00000000-0000-0000-0000-0000000000a1',true);
select ops.refresh_cafe_item_references($source$[
 {"esb_product_id":"SYNTH-RIGHTS-P","esb_product_detail_id":"SYNTH-RIGHTS-D","name":"Synthetic rights item","category":"KITCHEN","unit_name":"ERP pack","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true,"branch_code":"gordi_hq"}
]$source$::jsonb);
insert into ops.stream_items (org_id,branch_id,activity,wip_item_id,source)
select '00000000-0000-0000-0000-0000000000a1',branch,activity,item.id,'esb'
from unnest(array['00000000-0000-0000-0000-00000000bf01'::uuid,'00000000-0000-0000-0000-00000000bf02'::uuid]) branch
cross join unnest(array['kitchen','bar']) activity
cross join ops.wip_items item where item.esb_product_id='SYNTH-RIGHTS-P' and item.org_id='00000000-0000-0000-0000-0000000000a1'
on conflict (org_id,branch_id,activity,wip_item_id) do nothing;
select set_config('app.allow_test_seeds','off',true);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select ops.save_cafe_item_settings(branch,activity,item.id,'Synthetic rights item',unit.id,array[unit.id],'RAW',true)
from unnest(array['00000000-0000-0000-0000-00000000bf01'::uuid,'00000000-0000-0000-0000-00000000bf02'::uuid]) branch
cross join unnest(array['kitchen','bar']) activity
cross join ops.wip_items item join ops.item_units unit on unit.wip_item_id=item.id
where item.esb_product_id='SYNTH-RIGHTS-P' and unit.esb_product_detail_id='SYNTH-RIGHTS-D';
reset role;

create function pg_temp.check_activity_rights() returns setof text language plpgsql as $$
declare c record; a text; b uuid; allowed boolean; changed integer; v_item uuid; v_unit uuid; v_setting uuid; q text; caption text;
begin
  select id into v_item from ops.wip_items where esb_product_id='SYNTH-RIGHTS-P';
  select id into v_unit from ops.item_units where esb_product_detail_id='SYNTH-RIGHTS-D';
  for c in select * from pg_temp.rights_cases loop
    perform set_config('request.jwt.claims',jsonb_build_object('org_id','00000000-0000-0000-0000-0000000000a1','person_id',c.person_id,'access_roles',c.access_roles)::text,true);
    foreach a in array array['kitchen','bar'] loop
      allowed := case a when 'kitchen' then c.kitchen else c.bar end;
      caption := c.label || ' / ' || a;
      return next extensions.is(ops.can_manage_cafe_item_settings(a),allowed,caption || ': predicate');
      return next extensions.is((select count(*)::int from ops.cafe_item_settings where activity=a and wip_item_id=v_item),2,caption || ': settings remain readable at both branches');
      foreach b in array array['00000000-0000-0000-0000-00000000bf01'::uuid,'00000000-0000-0000-0000-00000000bf02'::uuid] loop
        caption := c.label || ' / ' || a || ' / ' || b;
        select id into v_setting from ops.cafe_item_settings where branch_id=b and activity=a and wip_item_id=v_item;
        q := format('select ops.save_cafe_item_settings(%L,%L,%L,%L,%L,array[%L::uuid],%L,true)',b,a,v_item,'Synthetic rights item',v_unit,v_unit,'RAW');
        if allowed then return next extensions.lives_ok(q,caption || ': writer allows');
        else return next extensions.throws_ok(q,'42501',null,caption || ': writer denies'); end if;
        update ops.cafe_item_settings set mos_name='Synthetic direct edit' where id=v_setting;
        get diagnostics changed = row_count;
        return next extensions.is(changed,case when allowed then 1 else 0 end,caption || ': direct update matches scope');
        q := format('insert into ops.cafe_item_settings (branch_id,activity,wip_item_id,mos_name) values (%L,%L,%L,%L) on conflict do nothing',b,a,v_item,'Synthetic insert');
        if allowed then return next extensions.lives_ok(q,caption || ': parent insert allows');
        else return next extensions.throws_ok(q,'42501',null,caption || ': parent insert denies'); end if;
        q := format('insert into ops.cafe_item_setting_units (cafe_item_setting_id,item_unit_id) values (%L,%L) on conflict do nothing',v_setting,v_unit);
        if allowed then return next extensions.lives_ok(q,caption || ': child insert allows');
        else return next extensions.throws_ok(q,'42501',null,caption || ': child insert denies'); end if;
      end loop;
    end loop;
  end loop;
end;
$$;
set local role authenticated;
select * from pg_temp.check_activity_rights();
select has_function('ops','can_manage_cafe_item_settings',array['text'],'permission reads require the target activity');
select ok(to_regprocedure('ops.can_manage_cafe_item_settings()') is null,'the broad predicate is retired');
select ok(not has_column_privilege('authenticated','shared.roles','cafe_item_settings_scope','UPDATE'),'a caller cannot grant their own position a scope');
select ok(not has_function_privilege('anon','ops.can_manage_cafe_item_settings(text)','EXECUTE'),'anonymous callers cannot read manager authority');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select is(ops.can_manage_cafe_item_settings('roastery'),false,'even broad editors cannot authorize an unknown activity');
select is(ops.can_manage_cafe_item_settings(null),false,'missing activity fails closed');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-000000000001","access_roles":["member","manager"]}';
select is(ops.can_manage_cafe_item_settings('kitchen'),false,'position scopes do not cross organizations');
select * from finish();
rollback;
