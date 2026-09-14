-- Café books: explicit producer facts and stream-derived destinations (#777, DD-MVP-9).
--
-- This is deliberately additive on the current chain. It does not replace either existing kitchen
-- guard: focused BEFORE triggers add the new refusal at write time, preserving every later review,
-- provenance, and same-org arm in their current definitions.
--
-- DOWN (manual, in one explicit transaction): first drop the two *_books_guard triggers and
-- ops._guard_cafe_books(), then ops.allowed_kitchen_destinations(uuid,uuid,text); restore
-- shared.seed_stream_teams() from 20260827000001_shared_cikal_branch.sql; only after confirming
-- no stream Team or dependent reader remains, drop teams_produces_pair_check and produces. Do not
-- apply that reversal to a database containing #777 rows without a reviewed migration plan.

alter table shared.teams add column produces boolean;

-- Existing catalog rows receive the adopted, explicit MVP map. Unknown current stream pairs fail
-- closed as receive-only; activity alone is never a production grant.
update shared.teams t
set produces = case
  when b.code in ('gordi_hq', 'rumah_rames') and t.activity in ('kitchen', 'bar') then true
  when b.code in ('radiant', 'cikal') and t.activity = 'bar' then true
  else false
end
from shared.branches b
where b.id = t.branch_id
  and b.org_id = t.org_id
  and t.branch_id is not null
  and t.activity is not null;

alter table shared.teams
  add constraint teams_produces_pair_check
    check ((branch_id is null and activity is null and produces is null)
        or (branch_id is not null and activity is not null and produces is not null));

create or replace function shared._set_team_produces_default()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.branch_id is not null and new.activity is not null and new.produces is null then
    new.produces := false;
  end if;
  return new;
end;
$$;
create trigger teams_produces_default before insert on shared.teams
for each row execute function shared._set_team_produces_default();
comment on column shared.teams.produces is
  'Database-owned permission-to-produce fact for a stream Team. NULL for a non-stream Team; FALSE means receiving-only.';

-- Preserve the Cikal-aware seed shape while making every seeded producer explicit.
create or replace function shared.seed_stream_teams()
returns void language plpgsql set search_path = '' as $$
declare o record; v_missing text;
begin
  for o in select id as org_id from shared.orgs loop
    insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity, produces)
    select o.org_id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code, b.id, a.code,
      case
        when b.code in ('gordi_hq', 'rumah_rames') and a.code in ('kitchen', 'bar') then true
        when b.code in ('radiant', 'cikal') and a.code = 'bar' then true
        else false
      end
    from shared.branches b cross join shared.activities a
    join shared.business_units bu on bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null
    where b.org_id = o.org_id and b.archived_at is null
      and (b.code in ('gordi_hq', 'rumah_rames', 'radiant') or (b.code = 'cikal' and a.code = 'bar'))
    on conflict (org_id, code) do nothing;

    select string_agg(e.branch_code || '/' || e.activity, ', ' order by e.branch_code, e.activity)
      into v_missing
    from (
      select b.code as branch_code, a.code as activity, b.id as branch_id
      from shared.branches b cross join shared.activities a
      where b.org_id = o.org_id and b.archived_at is null
        and (b.code in ('gordi_hq', 'rumah_rames', 'radiant') or (b.code = 'cikal' and a.code = 'bar'))
        and exists (select 1 from shared.business_units bu
                    where bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null)
    ) e
    where not exists (select 1 from shared.teams t
                      where t.org_id = o.org_id and t.branch_id = e.branch_id
                        and t.activity = e.activity and t.archived_at is null);
    if v_missing is not null then
      raise exception 'stream-team seed shortfall for org %: missing %', o.org_id, v_missing;
    end if;
  end loop;
end;
$$;

create or replace function ops.allowed_kitchen_destinations(
  p_org_id uuid, p_origin_branch_id uuid, p_origin_activity text
) returns table(destination_branch_id uuid)
language sql stable security invoker set search_path = '' as $$
  with origin as (
    select t.branch_id, t.activity, t.produces from shared.teams t
    where t.org_id = p_org_id and t.branch_id = p_origin_branch_id
      and t.activity = p_origin_activity and t.archived_at is null
  ), stream_branches as (
    select distinct t.branch_id from shared.teams t join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.branch_id is not null and t.archived_at is null and b.archived_at is null
  ), bar_branches as (
    select distinct t.branch_id from shared.teams t join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.activity = 'bar' and t.archived_at is null and b.archived_at is null
  ), kitchen_branches as (
    select distinct t.branch_id from shared.teams t join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.activity = 'kitchen' and t.archived_at is null and b.archived_at is null
  )
  select b.id from shared.branches b cross join origin o
  where b.org_id = p_org_id and b.archived_at is null and o.produces
    and ((o.activity = 'kitchen' and b.id in (select branch_id from stream_branches) and b.id <> o.branch_id)
      or (o.activity = 'bar' and ((b.id = o.branch_id and b.id in (select branch_id from kitchen_branches))
        or (b.id <> o.branch_id and b.id in (select branch_id from bar_branches)))))
  order by b.name;
$$;
grant execute on function ops.allowed_kitchen_destinations(uuid, uuid, text) to authenticated;

-- A second focused trigger avoids re-authoring the current kitchen guards. It runs only when a
-- movement is first written or moved, so deciding a previously valid held row is not retroactively blocked.
create or replace function ops._guard_cafe_books()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_produces boolean;
begin
  if (tg_op = 'INSERT' or (old.branch_id, old.activity, old.action, old.destination_branch_id)
      is distinct from (new.branch_id, new.activity, new.action, new.destination_branch_id))
     and new.branch_id is not null and new.activity is not null then
    select t.produces into v_produces from shared.teams t
    where t.org_id = new.org_id and t.branch_id = new.branch_id
      and t.activity = new.activity and t.archived_at is null;
    if v_produces is distinct from true then
      raise exception 'the production stream does not produce' using errcode = '42501';
    end if;
    if new.action = 'transfer' and not exists (
      select 1 from ops.allowed_kitchen_destinations(new.org_id, new.branch_id, new.activity) d
      where d.destination_branch_id = new.destination_branch_id
    ) then
      raise exception 'the destination is outside the production stream''s allowed books' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
-- PostgreSQL runs same-timing triggers by name. The `z_` prefix intentionally leaves the existing
-- same-org and NOT NULL guards first, retaining their established SQLSTATE/error contracts.
create trigger kitchen_logs_z_books_guard before insert or update of branch_id, activity, action, destination_branch_id
on ops.kitchen_logs for each row execute function ops._guard_cafe_books();
create trigger kitchen_plans_z_books_guard before insert or update of branch_id, activity, action, destination_branch_id
on ops.kitchen_plans for each row execute function ops._guard_cafe_books();

comment on function ops._guard_cafe_books() is
  'On an inserted or re-pointed Café movement, requires the actual row stream Team to produce and transfer destination to be in ops.allowed_kitchen_destinations (42501). SECURITY INVOKER.';

-- Keep the test-only Café fixture valid under the new boundary: its streams are created before
-- plans/logs, and historical intra-branch rows are bar movements (the held arm), never a kitchen
-- self-transfer. This function is test-only and remains revoked from application roles.
create or replace function ops._test_seed_streams()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_streams is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;
  insert into shared.business_units (id, org_id, name, code) values
    ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar','retail_ops'),
    ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B Kitchen','retail_ops')
  on conflict (id) do nothing;
  insert into shared.branches (id, org_id, code, name) values
    ('00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-0000000000a1','gordi_hq','Gordi HQ'),
    ('00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
    ('00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-0000000000a1','radiant','Radiant'),
    ('00000000-0000-0000-0000-00000000bf09','00000000-0000-0000-0000-0000000000b1','b_branch','B Branch')
  on conflict (id) do nothing;
  insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity, produces)
  select o.id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code,
         b.id, a.code,
         case
           when a.code = 'bar' then true
           when b.code in ('gordi_hq', 'rumah_rames') and a.code = 'kitchen' then true
           when b.code = 'b_branch' and a.code = 'kitchen' then true
           when b.code = 'radiant' and a.code = 'kitchen' then false
           else false
         end
    from shared.orgs o
    join shared.business_units bu on bu.org_id=o.id and bu.code='retail_ops' and bu.archived_at is null
    join shared.branches b on b.org_id=o.id and b.archived_at is null
    cross join shared.activities a
   where (o.id='00000000-0000-0000-0000-0000000000a1' and b.code in ('gordi_hq','rumah_rames','radiant'))
      or (o.id='00000000-0000-0000-0000-0000000000b1' and b.code='b_branch' and a.code='kitchen')
  on conflict (org_id, branch_id, activity) where branch_id is not null and archived_at is null
  do update set produces = excluded.produces;
end;
$$;
comment on function ops._test_seed_streams() is
  'TEST-ONLY fixture: idempotently seeds the test branch, Café business unit, and producing stream Teams.';
revoke execute on function ops._test_seed_streams() from public, anon, authenticated;

create or replace function ops._test_seed_cafe()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_cafe is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  perform ops._test_seed_streams();

  -- shared._test_seed_directory() is NOT called from here, and that is not an oversight. It is not
  -- idempotent — it inserts the two orgs by primary key with no conflict clause — so a fixture that
  -- called it internally would abort any test file that also called it explicitly, which every file
  -- needing the access-role tree must. The `mos` half has the same contract: the caller seeds the
  -- directory, then the schema fixture extends it.
  --
  -- ── Branches ────────────────────────────────────────────────────────────────────────────────
  -- Codes match the catalog's own seed so an assertion written against either finds the same value.
  -- 'Bungur' is NOT here: it is the incumbent's UI label for Rumah Rames, and the one place it
  -- legitimately appears is the label derivation.
  insert into shared.branches (id, org_id, code, name) values
    ('00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-0000000000a1','gordi_hq','Gordi HQ'),
    ('00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
    ('00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-0000000000a1','radiant','Radiant'),
    ('00000000-0000-0000-0000-00000000bf09','00000000-0000-0000-0000-0000000000b1','b_branch','B-Branch')
  on conflict (id) do nothing;

  -- ── Business units ──────────────────────────────────────────────────────────────────────────
  -- `code` is LOAD-BEARING, not decoration: the app resolves the Café BU exclusively by
  -- code='retail_ops' (kitchen-logs.ts resolveKitchenBuId — resolving by display name broke on
  -- rename once already), and #231's stream-team seed joins on the same code. A fixture BU
  -- without it is a BU the app cannot find.
  insert into shared.business_units (id, org_id, name, code) values
    ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar','retail_ops'),
    ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B-Kitchen','retail_ops')
  on conflict (id) do nothing;

  -- ── A live ops_lead grant ───────────────────────────────────────────────────────────────────
  -- Stated plainly so nobody reads more into it than is there: RLS policies consult
  -- shared.has_access_role, which reads the JWT access_roles claim, NOT this table — the claim is
  -- hook-injected from here at login. So an assertion selects its persona by setting the claim, and
  -- this row exists to keep the fixture consistent with the source that claim comes from, not to
  -- drive any policy. The shared fixture seeds Author ...0d1's ops_lead already-revoked, which is
  -- what makes her the honest negative subject; this grants it live to DirectMgr ...0d2.
  insert into shared.person_access_roles (org_id, person_id, access_role) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','ops_lead')
  on conflict do nothing;

  -- ── Master data ─────────────────────────────────────────────────────────────────────────────
  insert into ops.wip_items (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi) values
    ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000a1','Nasi Goreng','Mains',true,'BOM-001','PD-PORSI-001'),
    ('00000000-0000-0000-0000-00000000ab02','00000000-0000-0000-0000-0000000000a1','Ayam Bakar','Mains',true,'BOM-002','PD-PORSI-002'),
    ('00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-0000000000a1','Es Teh','Drinks',true,'BOM-003','PD-PORSI-003')
  on conflict (id) do nothing;
  insert into ops.wip_items (id, org_id, name, flag_active) values
    ('00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-0000000000b1','B-Item',true)
  on conflict (id) do nothing;

  -- ── Item units (#232) ───────────────────────────────────────────────────────────────────────
  -- de01/de02 are the migrated shape: confirmed 'porsi' defaults with confirmed_by NULL, exactly
  -- what the backfill produces. de03 (Es Teh) carries coordinates but NO confirmation — the
  -- DD-WAY-29 negative. de09 is org B's confirmed default, the view's cross-tenant negative.
  insert into ops.item_units
    (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
    ('00000000-0000-0000-0000-00000000de01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab01','porsi','PD-PORSI-001',true,'2026-06-01T00:00:00Z'),
    ('00000000-0000-0000-0000-00000000de02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab02','porsi','PD-PORSI-002',true,'2026-06-01T00:00:00Z')
  on conflict (id) do nothing;
  insert into ops.item_units
    (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default) values
    ('00000000-0000-0000-0000-00000000de03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab03','porsi','PD-PORSI-003',true)
  on conflict (id) do nothing;
  insert into ops.item_units
    (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
    ('00000000-0000-0000-0000-00000000de09','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000ab09','porsi','PD-PORSI-B09',true,'2026-06-01T00:00:00Z')
  on conflict (id) do nothing;

  -- ── Plans ───────────────────────────────────────────────────────────────────────────────────
  insert into ops.kitchen_plans
    (id, org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by) values
    ('00000000-0000-0000-0000-00000000ae01','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,20,'00000000-0000-0000-0000-0000000000d2'),
    ('00000000-0000-0000-0000-00000000ae02','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03',5,'00000000-0000-0000-0000-0000000000d2'),
    ('00000000-0000-0000-0000-00000000ae03','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-00000000bf01','bar','produce',null,4,'00000000-0000-0000-0000-0000000000d2')
  on conflict (id) do nothing;
  insert into ops.kitchen_plans
    (id, org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi) values
    ('00000000-0000-0000-0000-00000000ae09','00000000-0000-0000-0000-0000000000b1','2026-06-20','00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-00000000bf09','kitchen','produce',null,9)
  on conflict (id) do nothing;

  -- ── Logs: the incumbent's stream, all three movement shapes ─────────────────────────────────
  -- 2026-06-20, item ab01, (Rumah Rames, kitchen). ac01..ac03 + ac06 produce; ac04 transfers to
  -- Radiant (a real ERP movement); ac05 is the incumbent's within-branch "Transfer to Bungur",
  -- which the ERP never sees — filed now by the RUMAH RAMES BAR, the only stream the books rules
  -- (#777) still let move within their own branch; a kitchen cannot.
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ac01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',8,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',5,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','bar','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab01',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',2,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;

  -- 2026-06-21 item ab02 and 2026-06-22 item ab03, same stream: the stock arithmetic suite, including
  -- a day whose only movement is a transfer, so the balance goes negative and is preserved (FR-061).
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ad01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab02',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab02',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',9,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-22','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab03',100,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;

  -- Two of the four streams the incumbent never covered — the ones that reach the ERP on a paper
  -- form a supervisor retypes (OD-WAY-27). Same table, same shape, no new surface.
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ac11','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',7,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac12','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','bar','produce',null,'00000000-0000-0000-0000-00000000ab03',6,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;

  -- ── Imported history, and the posted/unposted pair the enqueue refusal is proven against ─────
  -- aa01 is what the flip actually creates (OD-WAY-38): a Teable row with no MOS submitter, landing
  -- Approved, carrying the ERP document the live system ALREADY HOLDS. aa02 is the control — a
  -- MOS-authored batch that has not been posted, so the refusal has something it must still allow.
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, source, submitted_by, batch_id, posted_to_esb, esb_doc_num, posted_at) values
    ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',11,'Approved','teable_import',null,'PR-20260601-001',true,'ESB-HISTORIC-0001','2026-06-01T10:00:00Z'),
    ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-02','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',6,'Approved','mos','00000000-0000-0000-0000-0000000000d1','PR-20260602-001',false,null,null)
  on conflict (id) do nothing;

  -- ── The cross-tenant negative ───────────────────────────────────────────────────────────────
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ac09','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb09','2026-06-20','00000000-0000-0000-0000-00000000bf09','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab09',9,'Submitted','00000000-0000-0000-0000-0000000000b4')
  on conflict (id) do nothing;

  -- ── Stock ───────────────────────────────────────────────────────────────────────────────────
  insert into ops.kitchen_stock (id, org_id, log_date, wip_item_id, branch_id, activity, usable_qty) values
    ('00000000-0000-0000-0000-00000000af01','00000000-0000-0000-0000-0000000000a1','2026-06-19','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen',10),
    ('00000000-0000-0000-0000-00000000af02','00000000-0000-0000-0000-0000000000a1','2026-06-19','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf01','kitchen',3)
  on conflict (id) do nothing;
  insert into ops.kitchen_stock (id, org_id, log_date, wip_item_id, branch_id, activity, usable_qty) values
    ('00000000-0000-0000-0000-00000000af09','00000000-0000-0000-0000-0000000000b1','2026-06-19','00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-00000000bf09','kitchen',99)
  on conflict (id) do nothing;

  -- ── Outbox rows, one per org ────────────────────────────────────────────────────────────────
  -- Both reference UNPOSTED batches: the enqueue refusal is a real trigger on this table, so a
  -- fixture pointing at posted history would fail to seed rather than fail an assertion.
  insert into integrations.esb_push (id, org_id, source_module, source_ref, endpoint, dedup_key) values
    ('00000000-0000-0000-0000-00000000ba01','00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260602-001','assembly-actual','kitchen|PR-20260602-001|dry_run'),
    ('00000000-0000-0000-0000-00000000ba09','00000000-0000-0000-0000-0000000000b1','kitchen','PR-20260620-B01','assembly-actual','kitchen|PR-20260620-B01|dry_run')
  on conflict (id) do nothing;
end;
$$;
comment on function ops._test_seed_cafe() is
  'TEST-ONLY fixture (SECURITY DEFINER): branch catalog for both test orgs, Kitchen-and-Bar BU, WIP items, item units (#232: confirmed defaults + one unconfirmed + a cross-tenant row), plans, Submitted logs across four production streams, imported history, and stock — plus a live ops_lead. Call AFTER shared._test_seed_directory(), inside begin;...rollback; with app.allow_test_seeds=on.';
