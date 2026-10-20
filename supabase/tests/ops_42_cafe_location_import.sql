-- Executes the importer's exact dry-run SQL; shell test pins the generated block.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
select set_config('app.allow_test_seeds','on',true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds','off',true);
-- The directory's stable fixture slug is used by the importer, never a name lookup.
update shared.orgs set slug='org-a' where id='00000000-0000-0000-0000-0000000000a1';
update ops.item_units set confirmed_at=null where id='00000000-0000-0000-0000-00000000de02';
insert into ops.locations(id,org_id,name,use) values
 ('f1420000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Import kitchen','both'),
 ('f1420000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','Import outlet','storage');
insert into ops.location_branches(org_id,location_id,branch_id)
select org_id,id,'00000000-0000-0000-0000-00000000bf02' from ops.locations where id in
 ('f1420000-0000-0000-0000-000000000001','f1420000-0000-0000-0000-000000000002');
create function pg_temp.import_sql() returns text language sql as $function$
select $generated$
-- environment: resolve org by slug, BU by stable code, the two stream branches by code.
-- Exactly-one is enforced below; a short count means the canonical catalog is not loaded.
create temp table _imp_env on commit drop as
select o.id as org_id, bu.id as bu_id, rr.id as br_rr, rad.id as br_rad,
       'f1420000-0000-0000-0000-000000000001'::uuid as kitchen_location, 'f1420000-0000-0000-0000-000000000002'::uuid as outlet_location
  from shared.orgs o
  join shared.business_units bu on bu.org_id = o.id and bu.code = 'retail_ops'
  join shared.branches rr  on rr.org_id  = o.id and rr.code  = 'rumah_rames'
  join shared.branches rad on rad.org_id = o.id and rad.code = 'radiant'
 where o.slug = 'org-a';
do $$
begin
  if (select count(*) from _imp_env) <> 1 then
    raise exception 'kitchen history import: environment resolution failed — expected exactly one org=org-a BU=retail_ops branch rumah_rames+radiant; is the canonical catalog loaded?';
  end if;
  if 'f1420000-0000-0000-0000-000000000001'::uuid is not null and (
    'f1420000-0000-0000-0000-000000000001'::uuid = 'f1420000-0000-0000-0000-000000000002'::uuid or
    (select count(*) from ops.locations l join ops.location_branches b
       on b.org_id=l.org_id and b.location_id=l.id
     where l.org_id=(select org_id from _imp_env) and b.branch_id=(select br_rr from _imp_env)
       and l.id in ('f1420000-0000-0000-0000-000000000001'::uuid,'f1420000-0000-0000-0000-000000000002'::uuid) and l.archived_at is null
       and l.use in ('storage','both')) <> 2
  ) then
    raise exception 'kitchen history import: invalid location ids';
  end if;
end $$;

create temp table _imp_payload on commit drop as
select * from jsonb_to_recordset($json$
[{"kind":"log","src_id":"made","det_id":"465cb6bb-a4b7-5df1-9179-aa24748cdfe3","log_date":"2026-05-02","wip_link_id":"recW1","action":"produce","dest_code":null,"esb_bom_id":"BOM-001","esb_pd_porsi":null,"qty":10,"notes":null,"reviewed_at":null,"posted_to_esb":false,"esb_doc_num":null,"posted_at":null,"created_at":null},{"kind":"log","src_id":"radiant","det_id":"dd2242b2-18ab-5df7-8b1d-049d94d2df09","log_date":"2026-05-02","wip_link_id":"recW1","action":"transfer","dest_code":"radiant","esb_bom_id":"BOM-001","esb_pd_porsi":null,"qty":3,"notes":null,"reviewed_at":null,"posted_to_esb":false,"esb_doc_num":null,"posted_at":null,"created_at":null},{"kind":"move","src_id":"outlet","det_id":"4639f0e9-4f69-5e1f-a551-7ba37c2ce489","log_date":"2026-05-02","wip_link_id":"recW1","action":"outlet_send","dest_code":null,"esb_bom_id":"BOM-001","esb_pd_porsi":null,"qty":4,"notes":null,"reviewed_at":null,"posted_to_esb":false,"esb_doc_num":null,"posted_at":null,"created_at":null},{"kind":"move","src_id":"missing-item","det_id":"aa764482-be5b-54ca-8559-668ff6a955cf","log_date":"2026-05-02","wip_link_id":"missing","action":"outlet_send","dest_code":null,"esb_bom_id":"NO-SUCH-ITEM","esb_pd_porsi":null,"qty":2,"notes":null,"reviewed_at":null,"posted_to_esb":false,"esb_doc_num":null,"posted_at":null,"created_at":null},{"kind":"move","src_id":"missing-unit","det_id":"7180ea55-a463-57b7-aa8a-319ff0f9a16c","log_date":"2026-05-02","wip_link_id":"recW2","action":"outlet_send","dest_code":null,"esb_bom_id":"BOM-002","esb_pd_porsi":null,"qty":2,"notes":null,"reviewed_at":null,"posted_to_esb":false,"esb_doc_num":null,"posted_at":null,"created_at":null}]
$json$) as (kind text, src_id text, det_id uuid, log_date date, wip_link_id text, action text,
  dest_code text, esb_bom_id text, esb_pd_porsi text, qty numeric, notes text,
  reviewed_at timestamptz, posted_to_esb boolean, esb_doc_num text,
  posted_at timestamptz, created_at timestamptz);

-- item resolution through the canonical catalog, keyed by ERP identifier, never by name.
-- n_matches = 0 → not in catalog; > 1 → ambiguous (no unique index on esb_bom_id). Both are
-- reported below and never loaded. flag_active is deliberately not filtered: history may name a
-- retired item, and the catalog never hard-deletes.
create temp table _imp_resolved on commit drop as
select p.*, w.id as wip_item_id,
       (select u.id from ops.item_units u where u.org_id=w.org_id and u.wip_item_id=w.id
         and u.is_default and u.confirmed_at is not null) as item_unit_id,
       count(w.id) over (partition by p.kind, p.src_id)::int as n_matches,
       dest.id as dest_branch_id,
       (p.kind = 'move' or p.action <> 'transfer' or exists (
          select 1 from ops.allowed_kitchen_destinations(
            (select org_id from _imp_env), (select br_rr from _imp_env), 'kitchen') allowed
           where allowed.destination_branch_id = dest.id)) as dest_allowed
  from _imp_payload p
  left join shared.branches dest
    on dest.org_id = (select org_id from _imp_env) and dest.code = p.dest_code
  left join ops.wip_items w
    on w.org_id = (select org_id from _imp_env)
   and (    p.esb_bom_id  is not null and p.esb_bom_id  = w.esb_bom_id
       or (p.esb_bom_id is null and p.esb_pd_porsi is not null
           and p.esb_pd_porsi = w.esb_product_detail_id_porsi));

-- the load. Status is ALWAYS Approved (final — never Submitted), submitted_by/reviewed_by/plan_by
-- and batch_id are NULL (AC-011 + the prior owner call), posting history verbatim. ON CONFLICT DO
-- NOTHING (no target) makes the deterministic-PK re-run and any natural-key supersede a no-op.
-- NOTE WHAT IS ABSENT: nothing in this file writes the outbox. The sole creator of outbox rows
-- is ops.approve_kitchen_log, which refuses anything not Submitted (P0003) — so imported history
-- (landed Approved) can never reach it. Statically pinned by the self-test's regex.
with ins_logs as (
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action,
     destination_branch_id, wip_item_id, qty_porsi, notes, status, source,
     submitted_by, reviewed_by, reviewed_at, batch_id, posted_to_esb, esb_doc_num,
     posted_at, created_at,from_storage_location_id,to_storage_location_id,item_unit_id)
  select r.det_id, e.org_id, e.bu_id, r.log_date, e.br_rr, 'kitchen', r.action,
         r.dest_branch_id,
         r.wip_item_id, r.qty, r.notes, 'Approved', 'teable_import',
         null, null, r.reviewed_at, null, case when r.kind='move' then false else coalesce(r.posted_to_esb, false) end,
         case when r.kind='move' then null else r.esb_doc_num end,
         case when r.kind='move' then null else r.posted_at end, coalesce(r.created_at, now()),
         case when r.kind='move' then e.kitchen_location end, case when r.kind='move' then e.outlet_location end,
         case when r.kind='move' then r.item_unit_id end
    from _imp_resolved r, _imp_env e
   where r.kind in ('log','move') and r.n_matches = 1 and r.dest_allowed
     and (r.kind<>'move' or r.item_unit_id is not null)
  on conflict do nothing
  returning 1
), ins_plans as (
  insert into ops.kitchen_plans
    (id, org_id, log_date, wip_item_id, branch_id, activity, action,
     destination_branch_id, qty_porsi, notes, source, plan_by, created_at)
  select r.det_id, e.org_id, r.log_date, r.wip_item_id, e.br_rr, 'kitchen', r.action,
         r.dest_branch_id,
         r.qty, r.notes, 'teable_import', null, coalesce(r.created_at, now())
    from _imp_resolved r, _imp_env e
   where r.kind = 'plan' and r.n_matches = 1 and r.dest_allowed
  on conflict do nothing
  returning 1
), ins_moves as (
  insert into ops.location_movements
    (id,org_id,branch_id,activity,item_id,item_unit_id,from_location_id,to_location_id,
     quantity,movement_date,kind,source_type,source_id,note)
  select r.det_id,e.org_id,e.br_rr,'kitchen',r.wip_item_id,r.item_unit_id,
         e.kitchen_location,e.outlet_location,r.qty,r.log_date,'move', 'import',r.det_id,
         left('Kitchen app send' || case when r.notes is null then '' else ': ' || r.notes end,500)
    from _imp_resolved r, _imp_env e
   where r.kind='move' and r.n_matches=1 and r.item_unit_id is not null
  on conflict do nothing
  returning 1
)
select jsonb_build_object(
  'logs_loaded',   (select count(*) from ins_logs),
  'plans_loaded',  (select count(*) from ins_plans),
  'moves_loaded',  (select count(*) from ins_moves),
  'unresolved', coalesce((select jsonb_agg(jsonb_build_object(
      'src_id', src_id, 'kind', kind,
      'reason', case when n_matches = 0 then 'wip_item_not_in_catalog'
                     when n_matches > 1 then 'wip_item_ambiguous'
                     when kind='move' and item_unit_id is null then 'item_unit_unresolved'
                     else 'destination_not_allowed' end)
    order by src_id) from _imp_resolved where n_matches <> 1 or not dest_allowed
      or (kind='move' and item_unit_id is null)), '[]'::jsonb));
$generated$;
$function$;
create function pg_temp.load() returns jsonb language plpgsql as $$
declare report jsonb;
begin
  drop table if exists _imp_resolved, _imp_payload, _imp_env;
  execute pg_temp.import_sql() into report;
  return report;
end;
$$;
select set_config('app.import_outbox',(select count(*)::text from integrations.esb_push),true);
select set_config('app.import_logs',(select count(*)::text from ops.kitchen_logs),true);
select set_config('app.import_report',pg_temp.load()::text,true);
select is((current_setting('app.import_report')::jsonb->>'moves_loaded')::int,1,'AC11: Approved outlet send loads one import move');
select is((current_setting('app.import_report')::jsonb->>'logs_loaded')::int,3,'AC11: production, Radiant and outlet send load as reviewed logs');
select ok(current_setting('app.import_report')::jsonb->'unresolved' @> '[{"src_id":"missing-item","reason":"wip_item_not_in_catalog"},{"src_id":"missing-unit","reason":"item_unit_unresolved"}]'::jsonb,'AC11: unresolved items and units are reported');
select is(pg_temp.load()->>'moves_loaded','0','AC11: rerun is a no-op');
select is((select count(*)::text from integrations.esb_push),current_setting('app.import_outbox'),'AC11: import never enqueues');
select is((select count(*) from ops.kitchen_logs),current_setting('app.import_logs')::bigint+3,'AC11: outlet send is a normal record alongside production and Radiant');
select is((select count(*)::int from ops.location_movements where source_type='log'),0,'AC2: imported Approved logs never post locations');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.place_cafe_unassigned_stock('{"stream":{"branch_id":"00000000-0000-0000-0000-00000000bf02","activity":"kitchen"},"to_location_id":"f1420000-0000-0000-0000-000000000001","as_of":"2026-05-04"}','f1420000-0000-0000-0000-000000000003');
select set_config('app.import_balances',ops.cafe_location_balances('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen')::text,true);
select is((select sum((value->>'usable_qty')::numeric) from jsonb_array_elements(current_setting('app.import_balances')::jsonb->'rows') where value->>'location_id'='f1420000-0000-0000-0000-000000000001'),3::numeric,'AC2a: kitchen = production 10 minus Radiant 3 minus outlet send 4');
select is((select sum((value->>'usable_qty')::numeric) from jsonb_array_elements(current_setting('app.import_balances')::jsonb->'rows') where value->>'location_id'='f1420000-0000-0000-0000-000000000002'),4::numeric,'AC2a: outlet keeps the sent four');
select is(current_setting('app.import_balances')::jsonb->>'coverage','complete','AC2a: no unassigned remainder after opening');
select is((select sum((value->>'usable_qty')::numeric) from jsonb_array_elements(current_setting('app.import_balances')::jsonb->'rows')),7::numeric,'AC2a: physical totals equal the RRS stream book seven');
reset role;
-- A wrong or archived identifier aborts the whole import, including otherwise valid logs.
update ops.locations set archived_at=now() where id='f1420000-0000-0000-0000-000000000002';
select throws_ok($$select pg_temp.load()$$,'P0001','kitchen history import: invalid location ids','AC11: invalid place aborts before loading');
select * from finish();
rollback;
