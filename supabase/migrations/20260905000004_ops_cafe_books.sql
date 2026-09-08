-- Café books and destination rules (#777).
alter table shared.teams add column produces boolean;
update shared.teams set produces = (activity = 'bar' or exists (
  select 1 from shared.branches b where b.id = shared.teams.branch_id
    and b.code in ('gordi_hq', 'rumah_rames')))
 where branch_id is not null and activity is not null;
create or replace function shared.seed_stream_teams()
returns void
language plpgsql
set search_path = ''
as $$
declare
  o         record;
  v_missing text;
begin
  for o in select id as org_id from shared.orgs loop
    insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity, produces)
    select o.org_id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code, b.id, a.code, (a.code = 'bar' or b.code in ('gordi_hq', 'rumah_rames'))
    from shared.branches b
    cross join shared.activities a
    join shared.business_units bu
      on bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null
    where b.org_id = o.org_id
      and b.archived_at is null
      and (    b.code in ('gordi_hq', 'rumah_rames', 'radiant')      -- every catalog activity
            or (b.code = 'cikal' and a.code = 'bar') )               -- bar only (owner, 2026-08-27)
    on conflict (org_id, code) do nothing;

    -- Pair-existence, not row-count: what must hold is that each expected (branch, activity) has a
    -- live stream team, whatever its code.
    select string_agg(e.branch_code || '/' || e.activity, ', '
                      order by e.branch_code, e.activity)
      into v_missing
    from (
      select b.code as branch_code, a.code as activity, b.id as branch_id
      from shared.branches b
      cross join shared.activities a
      where b.org_id = o.org_id
        and b.archived_at is null
        and (    b.code in ('gordi_hq', 'rumah_rames', 'radiant')
              or (b.code = 'cikal' and a.code = 'bar') )
        and exists (select 1 from shared.business_units bu
                     where bu.org_id = o.org_id and bu.code = 'retail_ops'
                       and bu.archived_at is null)
    ) e
    where not exists (
      select 1 from shared.teams t
       where t.org_id = o.org_id
         and t.branch_id = e.branch_id
         and t.activity = e.activity
         and t.archived_at is null);

    if v_missing is not null then
      raise exception 'stream-team seed shortfall for org %: missing % — a reserved team code is '
        'already held by a non-stream team; rename it or archive it, the stream catalog must be '
        'complete (FR-005/AC-012a as amended for Cikal, OD-WAY-42)', o.org_id, v_missing;
    end if;
  end loop;
end;
$$;

alter table shared.teams drop constraint if exists teams_produces_pair_check;
alter table shared.teams add constraint teams_produces_pair_check
  check ((branch_id is null and activity is null and produces is null)
      or (branch_id is not null and activity is not null and produces is not null));
create or replace function shared._set_team_produces_default()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.branch_id is not null and new.activity is not null and new.produces is null then new.produces := false; end if;
  return new;
end;
$$;
comment on function shared._set_team_produces_default() is
  'Defaults stream Teams to receive-only; producing is an explicit fact, while non-stream Teams carry NULL.';
drop trigger if exists teams_produces_default on shared.teams;
create trigger teams_produces_default before insert on shared.teams
for each row execute function shared._set_team_produces_default();
comment on column shared.teams.produces is
  'Whether this production-stream Team may write production lines. Non-stream Teams carry NULL; receive-only kitchens carry FALSE.';

comment on function shared.seed_stream_teams() is
  'Seeds the live stream Teams: the three FULL production branches crossed with every '
  'shared.activities row, PLUS Cikal with bar only (OD-WAY-79). A union of two rules, never a wider '
  'cross product — a new activity reaches the three and not Cikal. Roastery is a branch with no '
  'stream at all (OD-WAY-42). Sets produces: every bar and the Gordi HQ and Rumah Rames kitchens '
  'produce; the Radiant kitchen is receive-only (#777). VALIDATES: raises if any expected pair has '
  'no live team. Idempotent (on conflict do nothing); seed.sql calls it again after migrations, to '
  'seed the catalog for the Gordi org it creates. Not an app RPC: no EXECUTE for anon or authenticated.';

create or replace function ops.allowed_kitchen_destinations(
  p_org_id uuid, p_origin_branch_id uuid, p_origin_activity text
)
returns table(destination_branch_id uuid) language sql stable security invoker set search_path = '' as $$
  with origin as (
    select t.branch_id, t.activity, t.produces from shared.teams t
    where t.org_id = p_org_id and t.branch_id = p_origin_branch_id
      and t.activity = p_origin_activity and t.archived_at is null
  ), branches_with_streams as (
    select distinct t.branch_id from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.branch_id is not null
      and t.archived_at is null and b.archived_at is null
  ), bar_branches as (
    select distinct t.branch_id from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.activity = 'bar'
      and t.archived_at is null and b.archived_at is null
  ), kitchen_branches as (
    select distinct t.branch_id from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id
    where t.org_id = p_org_id and t.activity = 'kitchen'
      and t.archived_at is null and b.archived_at is null
  )
  select b.id from shared.branches b cross join origin o
  where b.org_id = p_org_id and b.archived_at is null and o.produces
    and (
      (o.activity = 'kitchen' and b.id in (select branch_id from branches_with_streams)
       and b.id <> o.branch_id)
      or (o.activity = 'bar' and (
        (b.id = o.branch_id and b.id in (select branch_id from kitchen_branches))
        or (b.id <> o.branch_id and b.id in (select branch_id from bar_branches))
      ))
    )
  -- Ordered by name, not code: this is the same order `movementsForStream` produces by walking
  -- the app's branch catalog (`listActiveBranches`, name-sorted) — the two never need to agree by
  -- coincidence.
  order by b.name;
$$;
comment on function ops.allowed_kitchen_destinations(uuid,uuid,text) is 'One Café derivation: producing kitchens send to other stream branches; producing bars send to their own kitchen-backed branch and other bar branches. Non-producing streams and Roastery send nowhere. Ordered by branch name, matching movementsForStream''s catalog order.';
grant execute on function ops.allowed_kitchen_destinations(uuid,uuid,text) to authenticated;

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

create or replace function ops._guard_kitchen_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org   uuid;
  v_wip_org  uuid;
  v_br_org   uuid;
  v_dest_org uuid;
  v_sub_org  uuid;
  v_rev_org  uuid;
  v_produces boolean;
begin
  -- 20260620000008: submitted_by is immutable post-insert — a log cannot be re-attributed.
  if tg_op = 'UPDATE' and new.submitted_by is distinct from old.submitted_by then
    raise exception 'submitted_by is immutable' using errcode = '42501';
  end if;
  -- 20260620000008: org_id is immutable post-insert (prevents cross-org re-homing on UPDATE).
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- OD-WAY-38: `source` is provenance and never changes. Without this a member could relabel
  -- their own MOS row as imported history, or an imported row as MOS-authored.
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'source is immutable on a kitchen log' using errcode = '42501';
  end if;
  -- 20260620000008, re-gated for #236: EVERY status transition is a reviewer action, and the
  -- reviewer for a row is now decided BY THE ROW'S STREAM (FR-040): its stream reviewer —
  -- supervisor whose live primary Team is this stream's Team — or ops_lead/admin as the
  -- cross-stream fallback (FR-041). Keyed on OLD's stream: the stream columns are frozen through
  -- review by the re-target rule below, so OLD and NEW cannot disagree here.
  --
  -- Review stays ONE-WAY: Approved and Rejected are terminal for the app tier, and a correction
  -- is recorded as a new log (unchanged from ...0010 — see that header for the reasoning).
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not ops.can_review_stream(old.branch_id, old.activity) then
      raise exception 'only the stream''s supervisor or ops_lead/admin may approve or reject a kitchen log'
        using errcode = '42501';
    end if;
    if old.status <> 'Submitted' then
      raise exception 'a reviewed kitchen log keeps its status; record a correction as a new log'
        using errcode = '42501';
    end if;
    -- #236 review finding: THE DECIDE FREEZE. A status transition may change the status and the
    -- review fields — nothing else. Without this, the freeze below (Submitted→Submitted only)
    -- left a decide free to re-home the row's facts in the same statement: the transition was
    -- authorised against the OLD stream while WITH CHECK validated the NEW one, so a reject could
    -- carry branch_id/qty/date changes nobody authorised. Approve's legitimate stamps
    -- (reviewed_by/reviewed_at/review_note/batch_id) are set by the RPC — which by construction
    -- carries NO caller fields (it takes a log id and a note) — and reject's are stamped below;
    -- neither touches the columns listed here, so this arm fires on both paths purely as the
    -- refusal it is. qty and the submitter's note are included deliberately: a reviewer
    -- "correcting" a figure while deciding it is the same silent-rewrite class — a correction is
    -- a new log (or a pre-decision edit the submitter can see), never a side effect of a decision.
    if new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date
       or new.qty_porsi is distinct from old.qty_porsi
       or new.notes is distinct from old.notes then
      raise exception 'a decision changes only the status and the review fields; the log''s facts are frozen'
        using errcode = '42501';
    end if;
  end if;
  -- NEW (#236, FR-043/AC-010): the per-stream ordering gate. The incumbent's rule — transfers
  -- wait for the day's production count to be reviewed, because an approved transfer of WIP whose
  -- production is later rejected has moved stock that was never confirmed to exist — kept, but
  -- keyed on the ROW'S OWN stream and day. Only Submitted production locks; a decided row
  -- (Approved OR Rejected) has been looked at, which is all the ordering ever asked for.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Approved'
     and new.action = 'transfer' then
    if exists (
      select 1 from ops.kitchen_logs l
       where l.org_id    = new.org_id
         and l.branch_id = new.branch_id
         and l.activity  = new.activity
         and l.log_date  = new.log_date
         and l.action    = 'produce'
         and l.status    = 'Submitted'
    ) then
      raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
        using errcode = 'P0004';
    end if;
  end if;
  -- 20260620000012: Submitted→Rejected stamps reviewer provenance server-side (FR-044). Reject is a
  -- plain guarded UPDATE and the client sends only status + review_note, so reviewed_by/reviewed_at
  -- are attributed here. Approve is left to the approval function, which sets them explicitly, so
  -- this stamp deliberately does NOT fire on →Approved.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Rejected' then
    new.reviewed_by := shared.current_person_id();
    new.reviewed_at := now();
  end if;
  -- 20260620000008, extended: a Submitted→Submitted UPDATE that re-targets the row is forbidden —
  -- it would alter the day's actuals silently. The prior chains froze action_type/wip_item/log_date;
  -- the stream and movement columns that replaced action_type are frozen with them.
  if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Submitted' then
    if new.action is distinct from old.action
       or new.destination_branch_id is distinct from old.destination_branch_id
       or new.branch_id is distinct from old.branch_id
       or new.activity is distinct from old.activity
       or new.wip_item_id is distinct from old.wip_item_id
       or new.log_date is distinct from old.log_date then
      raise exception 'the production stream, movement, wip item and date are immutable on a Submitted log'
        using errcode = '42501';
    end if;
  end if;
  -- 20260620000008: SAME-ORG FK seam. business_unit_id and wip_item_id are existence-only FKs and FK
  -- lookups bypass RLS, so a member could reference a foreign-org row. Under INVOKER RLS a same-org
  -- reference is visible and a cross-org one is not, so the lookup returns NULL and raises 23514.
  --
  -- EVERY arm below is guarded on `is not null`, and that is deliberate rather than defensive. A
  -- BEFORE ROW trigger runs before NOT NULL is checked, so an unguarded lookup on a missing value
  -- would report a same-org violation (23514) for what is actually a missing required column
  -- (23502) — the guard would pre-empt the more fundamental rule and give the wrong diagnosis.
  -- AC-007 depends on this: a log written without a stream must be refused BY the NOT NULL column,
  -- so the refusal survives any later change to this guard.
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  if new.wip_item_id is not null then
    select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
    if v_wip_org is distinct from new.org_id then
      raise exception 'wip_item_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  -- branch_id and destination_branch_id are the same class of existence-only FK, into a catalog
  -- that is itself org-scoped.
  if new.branch_id is not null then
    select b.org_id into v_br_org from shared.branches b where b.id = new.branch_id;
    if v_br_org is distinct from new.org_id then
      raise exception 'branch_id must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.destination_branch_id is not null then
    select b.org_id into v_dest_org from shared.branches b where b.id = new.destination_branch_id;
    if v_dest_org is distinct from new.org_id then
      raise exception 'destination_branch_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
  end if;
  -- The two PEOPLE references, held to the same rule as the four above (see ...0010 for why both
  -- arms are null-guarded).
  if new.submitted_by is not null then
    select p.org_id into v_sub_org from shared.people p where p.id = new.submitted_by;
    if v_sub_org is distinct from new.org_id then
      raise exception 'submitted_by must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  if new.reviewed_by is not null then
    select p.org_id into v_rev_org from shared.people p where p.id = new.reviewed_by;
    if v_rev_org is distinct from new.org_id then
      raise exception 'reviewed_by must belong to the same org as the kitchen log' using errcode = '23514';
    end if;
  end if;
  -- #832: both arms below re-check the row's stream against the CURRENT catalog. Run unconditionally
  -- they also re-run on a status decision or any other non-coordinate edit — so a row already
  -- Submitted/Approved on a stream that later stops producing (or loses this destination from its
  -- allowed set) could never be approved, rejected, or otherwise touched again (42501 forever). A
  -- row's stream and movement are only ever SET on INSERT or on a coordinate-changing UPDATE (the
  -- freezes above forbid changing them once Submitted, and once decided at all), so gating on
  -- exactly those two cases re-validates every write that could plant a new (stream, destination)
  -- pair while leaving a decision on an already-planted pair free to proceed.
  if tg_op = 'INSERT' or (old.branch_id, old.activity, old.action, old.destination_branch_id)
       is distinct from (new.branch_id, new.activity, new.action, new.destination_branch_id) then
    if new.branch_id is not null and new.activity is not null then
      select t.produces into v_produces from shared.teams t
       where t.org_id = new.org_id and t.branch_id = new.branch_id
         and t.activity = new.activity and t.archived_at is null;
      if v_produces is distinct from true then
        raise exception 'the production stream does not produce' using errcode = '42501';
      end if;
    end if;
    if new.action = 'transfer' and new.branch_id is not null and new.activity is not null and not exists (
      select 1 from ops.allowed_kitchen_destinations(new.org_id, new.branch_id, new.activity) d
       where d.destination_branch_id = new.destination_branch_id
    ) then
      raise exception 'the destination is outside the production stream''s allowed books'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create or replace function ops._guard_kitchen_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_wip_org  uuid;
  v_br_org   uuid;
  v_dest_org uuid;
  v_plan_org uuid;
  v_produces boolean;
begin
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on a kitchen plan' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'source is immutable on a kitchen plan' using errcode = '42501';
  end if;
  -- Guarded on `is not null` for the same reason as ops._guard_kitchen_log: a BEFORE ROW trigger
  -- runs before NOT NULL is checked, so an unguarded lookup would diagnose a missing stream as a
  -- cross-org reference. AC-008 depends on the NOT NULL column being the thing that refuses.
  if new.wip_item_id is not null then
    select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
    if v_wip_org is distinct from new.org_id then
      raise exception 'wip_item_id must belong to the same org as the kitchen plan' using errcode = '23514';
    end if;
  end if;
  if new.branch_id is not null then
    select b.org_id into v_br_org from shared.branches b where b.id = new.branch_id;
    if v_br_org is distinct from new.org_id then
      raise exception 'branch_id must belong to the same org as the kitchen plan' using errcode = '23514';
    end if;
  end if;
  if new.destination_branch_id is not null then
    select b.org_id into v_dest_org from shared.branches b where b.id = new.destination_branch_id;
    if v_dest_org is distinct from new.org_id then
      raise exception 'destination_branch_id must belong to the same org as the kitchen plan'
        using errcode = '23514';
    end if;
  end if;
  -- The planner. Unlike the kitchen log's submitter, no policy pins this column to the session
  -- person — the write gate is the ops_lead/admin role, which says who may write the row and nothing
  -- about whose name goes on it.
  if new.plan_by is not null then
    select p.org_id into v_plan_org from shared.people p where p.id = new.plan_by;
    if v_plan_org is distinct from new.org_id then
      raise exception 'plan_by must belong to the same org as the kitchen plan' using errcode = '23514';
    end if;
  end if;
  -- #832: same re-check-on-move rule as ops._guard_kitchen_log (see its comment) — INSERT, or an
  -- UPDATE that changes the row's stream or movement, never a plan edit that leaves both alone.
  if tg_op = 'INSERT' or (old.branch_id, old.activity, old.action, old.destination_branch_id)
       is distinct from (new.branch_id, new.activity, new.action, new.destination_branch_id) then
    if new.branch_id is not null and new.activity is not null then
      select t.produces into v_produces from shared.teams t
       where t.org_id = new.org_id and t.branch_id = new.branch_id
         and t.activity = new.activity and t.archived_at is null;
      if v_produces is distinct from true then
        raise exception 'the production stream does not produce' using errcode = '42501';
      end if;
    end if;
    if new.action = 'transfer' and new.branch_id is not null and new.activity is not null and not exists (
      select 1 from ops.allowed_kitchen_destinations(new.org_id, new.branch_id, new.activity) d
       where d.destination_branch_id = new.destination_branch_id
    ) then
      raise exception 'the destination is outside the production stream''s allowed books'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_kitchen_plan() is
  'Guard arms: org_id/source immutable on UPDATE (42501); wip_item_id, branch_id, destination_branch_id and plan_by same-org (23514); on INSERT or a change to (branch_id, activity, action, destination_branch_id) only — producing stream required (42501), transfer destination must be in ops.allowed_kitchen_destinations (42501). SECURITY INVOKER.';


comment on function ops._guard_kitchen_log() is
  'Guard arms: submitted_by/org_id/source immutable on UPDATE (42501); status decisions require the stream reviewer or ops_lead/admin, preserve reviewed facts, and enforce per-stream ordering (42501/P0004); rejected rows receive reviewer provenance; same-org business_unit_id, wip_item_id, branch_id, destination_branch_id, submitted_by and reviewed_by (23514); on INSERT or a change to (branch_id, activity, action, destination_branch_id) only — producing stream required (42501), transfer destination must be in ops.allowed_kitchen_destinations (42501). SECURITY INVOKER.';


-- DOWN (exact inverse of the UP above). Every line is commented SQL: strip the leading "-- " and
-- run the result inside ONE transaction, and the UP file re-applies cleanly on top of the result.
-- The order is load-bearing: ops.allowed_kitchen_destinations reads shared.teams.produces, so it
-- is dropped FIRST; both guards go back to their pre-#777 bodies (log guard: 20260811000001; plan
-- guard: 20260805000010) before the column they no longer read disappears; the producer machinery
-- and the column itself go last.
-- drop function if exists ops.allowed_kitchen_destinations(uuid, uuid, text);

-- ── Restore the pre-#777 log guard (20260811000001): the #777 delta is exactly the two arms at
--    the end of the UP body — producing stream required, destination within allowed books.
-- create or replace function ops._guard_kitchen_log()
-- returns trigger
-- language plpgsql
-- security invoker
-- set search_path = ''
-- as $$
-- declare
--   v_bu_org   uuid;
--   v_wip_org  uuid;
--   v_br_org   uuid;
--   v_dest_org uuid;
--   v_sub_org  uuid;
--   v_rev_org  uuid;
-- begin
--   -- 20260620000008: submitted_by is immutable post-insert — a log cannot be re-attributed.
--   if tg_op = 'UPDATE' and new.submitted_by is distinct from old.submitted_by then
--     raise exception 'submitted_by is immutable' using errcode = '42501';
--   end if;
--   -- 20260620000008: org_id is immutable post-insert (prevents cross-org re-homing on UPDATE).
--   if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
--     raise exception 'org_id is immutable on a kitchen log' using errcode = '42501';
--   end if;
--   -- OD-WAY-38: `source` is provenance and never changes. Without this a member could relabel
--   -- their own MOS row as imported history, or an imported row as MOS-authored.
--   if tg_op = 'UPDATE' and new.source is distinct from old.source then
--     raise exception 'source is immutable on a kitchen log' using errcode = '42501';
--   end if;
--   -- 20260620000008, re-gated for #236: EVERY status transition is a reviewer action, and the
--   -- reviewer for a row is now decided BY THE ROW'S STREAM (FR-040): its stream reviewer —
--   -- supervisor whose live primary Team is this stream's Team — or ops_lead/admin as the
--   -- cross-stream fallback (FR-041). Keyed on OLD's stream: the stream columns are frozen through
--   -- review by the re-target rule below, so OLD and NEW cannot disagree here.
--   --
--   -- Review stays ONE-WAY: Approved and Rejected are terminal for the app tier, and a correction
--   -- is recorded as a new log (unchanged from ...0010 — see that header for the reasoning).
--   if tg_op = 'UPDATE' and new.status is distinct from old.status then
--     if not ops.can_review_stream(old.branch_id, old.activity) then
--       raise exception 'only the stream''s supervisor or ops_lead/admin may approve or reject a kitchen log'
--         using errcode = '42501';
--     end if;
--     if old.status <> 'Submitted' then
--       raise exception 'a reviewed kitchen log keeps its status; record a correction as a new log'
--         using errcode = '42501';
--     end if;
--     -- #236 review finding: THE DECIDE FREEZE. A status transition may change the status and the
--     -- review fields — nothing else. Without this, the freeze below (Submitted→Submitted only)
--     -- left a decide free to re-home the row's facts in the same statement: the transition was
--     -- authorised against the OLD stream while WITH CHECK validated the NEW one, so a reject could
--     -- carry branch_id/qty/date changes nobody authorised. Approve's legitimate stamps
--     -- (reviewed_by/reviewed_at/review_note/batch_id) are set by the RPC — which by construction
--     -- carries NO caller fields (it takes a log id and a note) — and reject's are stamped below;
--     -- neither touches the columns listed here, so this arm fires on both paths purely as the
--     -- refusal it is. qty and the submitter's note are included deliberately: a reviewer
--     -- "correcting" a figure while deciding it is the same silent-rewrite class — a correction is
--     -- a new log (or a pre-decision edit the submitter can see), never a side effect of a decision.
--     if new.action is distinct from old.action
--        or new.destination_branch_id is distinct from old.destination_branch_id
--        or new.branch_id is distinct from old.branch_id
--        or new.activity is distinct from old.activity
--        or new.wip_item_id is distinct from old.wip_item_id
--        or new.log_date is distinct from old.log_date
--        or new.qty_porsi is distinct from old.qty_porsi
--        or new.notes is distinct from old.notes then
--       raise exception 'a decision changes only the status and the review fields; the log''s facts are frozen'
--         using errcode = '42501';
--     end if;
--   end if;
--   -- NEW (#236, FR-043/AC-010): the per-stream ordering gate. The incumbent's rule — transfers
--   -- wait for the day's production count to be reviewed, because an approved transfer of WIP whose
--   -- production is later rejected has moved stock that was never confirmed to exist — kept, but
--   -- keyed on the ROW'S OWN stream and day. Only Submitted production locks; a decided row
--   -- (Approved OR Rejected) has been looked at, which is all the ordering ever asked for.
--   if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Approved'
--      and new.action = 'transfer' then
--     if exists (
--       select 1 from ops.kitchen_logs l
--        where l.org_id    = new.org_id
--          and l.branch_id = new.branch_id
--          and l.activity  = new.activity
--          and l.log_date  = new.log_date
--          and l.action    = 'produce'
--          and l.status    = 'Submitted'
--     ) then
--       raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
--         using errcode = 'P0004';
--     end if;
--   end if;
--   -- 20260620000012: Submitted→Rejected stamps reviewer provenance server-side (FR-044). Reject is a
--   -- plain guarded UPDATE and the client sends only status + review_note, so reviewed_by/reviewed_at
--   -- are attributed here. Approve is left to the approval function, which sets them explicitly, so
--   -- this stamp deliberately does NOT fire on →Approved.
--   if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Rejected' then
--     new.reviewed_by := shared.current_person_id();
--     new.reviewed_at := now();
--   end if;
--   -- 20260620000008, extended: a Submitted→Submitted UPDATE that re-targets the row is forbidden —
--   -- it would alter the day's actuals silently. The prior chains froze action_type/wip_item/log_date;
--   -- the stream and movement columns that replaced action_type are frozen with them.
--   if tg_op = 'UPDATE' and old.status = 'Submitted' and new.status = 'Submitted' then
--     if new.action is distinct from old.action
--        or new.destination_branch_id is distinct from old.destination_branch_id
--        or new.branch_id is distinct from old.branch_id
--        or new.activity is distinct from old.activity
--        or new.wip_item_id is distinct from old.wip_item_id
--        or new.log_date is distinct from old.log_date then
--       raise exception 'the production stream, movement, wip item and date are immutable on a Submitted log'
--         using errcode = '42501';
--     end if;
--   end if;
--   -- 20260620000008: SAME-ORG FK seam. business_unit_id and wip_item_id are existence-only FKs and FK
--   -- lookups bypass RLS, so a member could reference a foreign-org row. Under INVOKER RLS a same-org
--   -- reference is visible and a cross-org one is not, so the lookup returns NULL and raises 23514.
--   --
--   -- EVERY arm below is guarded on `is not null`, and that is deliberate rather than defensive. A
--   -- BEFORE ROW trigger runs before NOT NULL is checked, so an unguarded lookup on a missing value
--   -- would report a same-org violation (23514) for what is actually a missing required column
--   -- (23502) — the guard would pre-empt the more fundamental rule and give the wrong diagnosis.
--   -- AC-007 depends on this: a log written without a stream must be refused BY the NOT NULL column,
--   -- so the refusal survives any later change to this guard.
--   if new.business_unit_id is not null then
--     select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
--     if v_bu_org is distinct from new.org_id then
--       raise exception 'business_unit_id must belong to the same org as the kitchen log'
--         using errcode = '23514';
--     end if;
--   end if;
--   if new.wip_item_id is not null then
--     select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
--     if v_wip_org is distinct from new.org_id then
--       raise exception 'wip_item_id must belong to the same org as the kitchen log'
--         using errcode = '23514';
--     end if;
--   end if;
--   -- branch_id and destination_branch_id are the same class of existence-only FK, into a catalog
--   -- that is itself org-scoped.
--   if new.branch_id is not null then
--     select b.org_id into v_br_org from shared.branches b where b.id = new.branch_id;
--     if v_br_org is distinct from new.org_id then
--       raise exception 'branch_id must belong to the same org as the kitchen log' using errcode = '23514';
--     end if;
--   end if;
--   if new.destination_branch_id is not null then
--     select b.org_id into v_dest_org from shared.branches b where b.id = new.destination_branch_id;
--     if v_dest_org is distinct from new.org_id then
--       raise exception 'destination_branch_id must belong to the same org as the kitchen log'
--         using errcode = '23514';
--     end if;
--   end if;
--   -- The two PEOPLE references, held to the same rule as the four above (see ...0010 for why both
--   -- arms are null-guarded).
--   if new.submitted_by is not null then
--     select p.org_id into v_sub_org from shared.people p where p.id = new.submitted_by;
--     if v_sub_org is distinct from new.org_id then
--       raise exception 'submitted_by must belong to the same org as the kitchen log' using errcode = '23514';
--     end if;
--   end if;
--   if new.reviewed_by is not null then
--     select p.org_id into v_rev_org from shared.people p where p.id = new.reviewed_by;
--     if v_rev_org is distinct from new.org_id then
--       raise exception 'reviewed_by must belong to the same org as the kitchen log' using errcode = '23514';
--     end if;
--   end if;
--   return new;
-- end;
-- $$;
-- comment on function ops._guard_kitchen_log() is
--   'Guard (folds 20260620000008 + 20260620000012; #236 re-gates review per stream): '
--   'Submitted→Approved/Rejected is the row''s stream reviewer — supervisor with live primary '
--   'membership of the row''s stream Team — or ops_lead/admin (FR-040/041, 42501); a decide changes '
--   'only the status and the review fields — the movement, stream, item, date, qty and submitter '
--   'note are frozen through every status transition (42501); a transfer''s Submitted→Approved is '
--   'refused while the same stream/day has Submitted production (FR-043, P0004); Submitted→Rejected '
--   'stamps reviewed_by/reviewed_at; submitted_by, org_id and source are immutable, as is the row''s '
--   'identity on a Submitted→Submitted edit (42501); business_unit_id, wip_item_id, branch_id, '
--   'destination_branch_id, submitted_by and reviewed_by must be same-org (23514). SECURITY INVOKER.';

-- ── Restore the pre-#777 plan guard (20260805000010).
-- create or replace function ops._guard_kitchen_plan()
-- returns trigger
-- language plpgsql
-- security invoker
-- set search_path = ''
-- as $$
-- declare
--   v_wip_org  uuid;
--   v_br_org   uuid;
--   v_dest_org uuid;
--   v_plan_org uuid;
-- begin
--   if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
--     raise exception 'org_id is immutable on a kitchen plan' using errcode = '42501';
--   end if;
--   if tg_op = 'UPDATE' and new.source is distinct from old.source then
--     raise exception 'source is immutable on a kitchen plan' using errcode = '42501';
--   end if;
--   -- Guarded on `is not null` for the same reason as ops._guard_kitchen_log: a BEFORE ROW trigger
--   -- runs before NOT NULL is checked, so an unguarded lookup would diagnose a missing stream as a
--   -- cross-org reference. AC-008 depends on the NOT NULL column being the thing that refuses.
--   if new.wip_item_id is not null then
--     select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
--     if v_wip_org is distinct from new.org_id then
--       raise exception 'wip_item_id must belong to the same org as the kitchen plan' using errcode = '23514';
--     end if;
--   end if;
--   if new.branch_id is not null then
--     select b.org_id into v_br_org from shared.branches b where b.id = new.branch_id;
--     if v_br_org is distinct from new.org_id then
--       raise exception 'branch_id must belong to the same org as the kitchen plan' using errcode = '23514';
--     end if;
--   end if;
--   if new.destination_branch_id is not null then
--     select b.org_id into v_dest_org from shared.branches b where b.id = new.destination_branch_id;
--     if v_dest_org is distinct from new.org_id then
--       raise exception 'destination_branch_id must belong to the same org as the kitchen plan'
--         using errcode = '23514';
--     end if;
--   end if;
--   -- The planner. Unlike the kitchen log's submitter, no policy pins this column to the session
--   -- person — the write gate is the ops_lead/admin role, which says who may write the row and nothing
--   -- about whose name goes on it.
--   if new.plan_by is not null then
--     select p.org_id into v_plan_org from shared.people p where p.id = new.plan_by;
--     if v_plan_org is distinct from new.org_id then
--       raise exception 'plan_by must belong to the same org as the kitchen plan' using errcode = '23514';
--     end if;
--   end if;
--   return new;
-- end;
-- $$;
-- comment on function ops._guard_kitchen_plan() is
--   'Guard: org_id and source immutable on UPDATE (42501); wip_item_id, branch_id, destination_branch_id and plan_by must be same-org (23514, same seam as ops._guard_kitchen_log). SECURITY INVOKER.';

-- ── Restore the previous catalog seed (20260827000001): no produces column, no produce fact.
-- create or replace function shared.seed_stream_teams()
-- returns void
-- language plpgsql
-- set search_path = ''
-- as $$
-- declare
--   o         record;
--   v_missing text;
-- begin
--   for o in select id as org_id from shared.orgs loop
--     insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
--     select o.org_id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code, b.id, a.code
--     from shared.branches b
--     cross join shared.activities a
--     join shared.business_units bu
--       on bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null
--     where b.org_id = o.org_id
--       and b.archived_at is null
--       and (    b.code in ('gordi_hq', 'rumah_rames', 'radiant')      -- every catalog activity
--             or (b.code = 'cikal' and a.code = 'bar') )               -- bar only (owner, 2026-08-27)
--     on conflict (org_id, code) do nothing;
-- 
--     -- Pair-existence, not row-count: what must hold is that each expected (branch, activity) has a
--     -- live stream team, whatever its code.
--     select string_agg(e.branch_code || '/' || e.activity, ', '
--                       order by e.branch_code, e.activity)
--       into v_missing
--     from (
--       select b.code as branch_code, a.code as activity, b.id as branch_id
--       from shared.branches b
--       cross join shared.activities a
--       where b.org_id = o.org_id
--         and b.archived_at is null
--         and (    b.code in ('gordi_hq', 'rumah_rames', 'radiant')
--               or (b.code = 'cikal' and a.code = 'bar') )
--         and exists (select 1 from shared.business_units bu
--                      where bu.org_id = o.org_id and bu.code = 'retail_ops'
--                        and bu.archived_at is null)
--     ) e
--     where not exists (
--       select 1 from shared.teams t
--        where t.org_id = o.org_id
--          and t.branch_id = e.branch_id
--          and t.activity = e.activity
--          and t.archived_at is null);
-- 
--     if v_missing is not null then
--       raise exception 'stream-team seed shortfall for org %: missing % — a reserved team code is '
--         'already held by a non-stream team; rename it or archive it, the stream catalog must be '
--         'complete (FR-005/AC-012a as amended for Cikal, OD-WAY-42)', o.org_id, v_missing;
--     end if;
--   end loop;
-- end;
-- $$;
-- 
-- comment on function shared.seed_stream_teams() is
--   'Seeds the live stream Teams: the three FULL production branches crossed with every '
--   'shared.activities row, PLUS Cikal with bar only (OD-WAY-79). A union of two rules, never a wider '
--   'cross product — a new activity reaches the three and not Cikal. Roastery is a branch with no '
--   'stream at all (OD-WAY-42). VALIDATES: raises if any expected pair has no live team. Idempotent '
--   '(on conflict do nothing); called by this migration and again by seed.sql, which re-seeds the '
--   'catalog for the Gordi org created after migrations run. Not an app RPC: no EXECUTE for anon or '
--   'authenticated.';

-- create or replace function ops._test_seed_cafe()
-- returns void
-- language plpgsql
-- security definer
-- set search_path = ''
-- as $$
-- begin
--   if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
--     raise exception '_test_seed_cafe is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
--       using errcode = '42501';
--   end if;
-- 
--   -- shared._test_seed_directory() is NOT called from here, and that is not an oversight. It is not
--   -- idempotent — it inserts the two orgs by primary key with no conflict clause — so a fixture that
--   -- called it internally would abort any test file that also called it explicitly, which every file
--   -- needing the access-role tree must. The `mos` half has the same contract: the caller seeds the
--   -- directory, then the schema fixture extends it.
--   --
--   -- ── Branches ────────────────────────────────────────────────────────────────────────────────
--   -- Codes match the catalog's own seed so an assertion written against either finds the same value.
--   -- 'Bungur' is NOT here: it is the incumbent's UI label for Rumah Rames, and the one place it
--   -- legitimately appears is the label derivation.
--   insert into shared.branches (id, org_id, code, name) values
--     ('00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-0000000000a1','gordi_hq','Gordi HQ'),
--     ('00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
--     ('00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-0000000000a1','radiant','Radiant'),
--     ('00000000-0000-0000-0000-00000000bf09','00000000-0000-0000-0000-0000000000b1','b_branch','B-Branch')
--   on conflict (id) do nothing;
-- 
--   -- ── Business units ──────────────────────────────────────────────────────────────────────────
--   -- `code` is LOAD-BEARING, not decoration: the app resolves the Café BU exclusively by
--   -- code='retail_ops' (kitchen-logs.ts resolveKitchenBuId — resolving by display name broke on
--   -- rename once already), and #231's stream-team seed joins on the same code. A fixture BU
--   -- without it is a BU the app cannot find.
--   insert into shared.business_units (id, org_id, name, code) values
--     ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar','retail_ops'),
--     ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B-Kitchen','retail_ops')
--   on conflict (id) do nothing;
-- 
--   -- ── A live ops_lead grant ───────────────────────────────────────────────────────────────────
--   -- Stated plainly so nobody reads more into it than is there: RLS policies consult
--   -- shared.has_access_role, which reads the JWT access_roles claim, NOT this table — the claim is
--   -- hook-injected from here at login. So an assertion selects its persona by setting the claim, and
--   -- this row exists to keep the fixture consistent with the source that claim comes from, not to
--   -- drive any policy. The shared fixture seeds Author ...0d1's ops_lead already-revoked, which is
--   -- what makes her the honest negative subject; this grants it live to DirectMgr ...0d2.
--   insert into shared.person_access_roles (org_id, person_id, access_role) values
--     ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','ops_lead')
--   on conflict do nothing;
-- 
--   -- ── Master data ─────────────────────────────────────────────────────────────────────────────
--   insert into ops.wip_items (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi) values
--     ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000a1','Nasi Goreng','Mains',true,'BOM-001','PD-PORSI-001'),
--     ('00000000-0000-0000-0000-00000000ab02','00000000-0000-0000-0000-0000000000a1','Ayam Bakar','Mains',true,'BOM-002','PD-PORSI-002'),
--     ('00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-0000000000a1','Es Teh','Drinks',true,'BOM-003','PD-PORSI-003')
--   on conflict (id) do nothing;
--   insert into ops.wip_items (id, org_id, name, flag_active) values
--     ('00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-0000000000b1','B-Item',true)
--   on conflict (id) do nothing;
-- 
--   -- ── Item units (#232) ───────────────────────────────────────────────────────────────────────
--   -- de01/de02 are the migrated shape: confirmed 'porsi' defaults with confirmed_by NULL, exactly
--   -- what the backfill produces. de03 (Es Teh) carries coordinates but NO confirmation — the
--   -- DD-WAY-29 negative. de09 is org B's confirmed default, the view's cross-tenant negative.
--   insert into ops.item_units
--     (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
--     ('00000000-0000-0000-0000-00000000de01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab01','porsi','PD-PORSI-001',true,'2026-06-01T00:00:00Z'),
--     ('00000000-0000-0000-0000-00000000de02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab02','porsi','PD-PORSI-002',true,'2026-06-01T00:00:00Z')
--   on conflict (id) do nothing;
--   insert into ops.item_units
--     (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default) values
--     ('00000000-0000-0000-0000-00000000de03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab03','porsi','PD-PORSI-003',true)
--   on conflict (id) do nothing;
--   insert into ops.item_units
--     (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
--     ('00000000-0000-0000-0000-00000000de09','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000ab09','porsi','PD-PORSI-B09',true,'2026-06-01T00:00:00Z')
--   on conflict (id) do nothing;
-- 
--   -- ── Plans ───────────────────────────────────────────────────────────────────────────────────
--   insert into ops.kitchen_plans
--     (id, org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by) values
--     ('00000000-0000-0000-0000-00000000ae01','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,20,'00000000-0000-0000-0000-0000000000d2'),
--     ('00000000-0000-0000-0000-00000000ae02','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03',5,'00000000-0000-0000-0000-0000000000d2'),
--     ('00000000-0000-0000-0000-00000000ae03','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-00000000bf01','bar','produce',null,4,'00000000-0000-0000-0000-0000000000d2')
--   on conflict (id) do nothing;
--   insert into ops.kitchen_plans
--     (id, org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi) values
--     ('00000000-0000-0000-0000-00000000ae09','00000000-0000-0000-0000-0000000000b1','2026-06-20','00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-00000000bf09','kitchen','produce',null,9)
--   on conflict (id) do nothing;
-- 
--   -- ── Logs: the incumbent's stream, all three movement shapes ─────────────────────────────────
--   -- 2026-06-20, item ab01, (Rumah Rames, kitchen). ac01..ac03 + ac06 produce; ac04 transfers to
--   -- Radiant (a real ERP movement); ac05 transfers within Rumah Rames's own books — the movement the
--   -- incumbent labels "Transfer to Bungur" and the ERP never sees.
--   insert into ops.kitchen_logs
--     (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
--      wip_item_id, qty_porsi, status, submitted_by) values
--     ('00000000-0000-0000-0000-00000000ac01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ac02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',8,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ac03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',5,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ac04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ac05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab01',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ac06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',2,'Submitted','00000000-0000-0000-0000-0000000000d1')
--   on conflict (id) do nothing;
-- 
--   -- 2026-06-21 item ab02 and 2026-06-22 item ab03, same stream: the stock arithmetic suite, including
--   -- a day whose only movement is a transfer, so the balance goes negative and is preserved (FR-061).
--   insert into ops.kitchen_logs
--     (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
--      wip_item_id, qty_porsi, status, submitted_by) values
--     ('00000000-0000-0000-0000-00000000ad01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ad02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab02',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ad03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab02',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ad04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',9,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ad05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-22','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab03',100,'Submitted','00000000-0000-0000-0000-0000000000d1')
--   on conflict (id) do nothing;
-- 
--   -- Two of the four streams the incumbent never covered — the ones that reach the ERP on a paper
--   -- form a supervisor retypes (OD-WAY-27). Same table, same shape, no new surface.
--   insert into ops.kitchen_logs
--     (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
--      wip_item_id, qty_porsi, status, submitted_by) values
--     ('00000000-0000-0000-0000-00000000ac11','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',7,'Submitted','00000000-0000-0000-0000-0000000000d1'),
--     ('00000000-0000-0000-0000-00000000ac12','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','bar','produce',null,'00000000-0000-0000-0000-00000000ab03',6,'Submitted','00000000-0000-0000-0000-0000000000d1')
--   on conflict (id) do nothing;
-- 
--   -- ── Imported history, and the posted/unposted pair the enqueue refusal is proven against ─────
--   -- aa01 is what the flip actually creates (OD-WAY-38): a Teable row with no MOS submitter, landing
--   -- Approved, carrying the ERP document the live system ALREADY HOLDS. aa02 is the control — a
--   -- MOS-authored batch that has not been posted, so the refusal has something it must still allow.
--   insert into ops.kitchen_logs
--     (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
--      wip_item_id, qty_porsi, status, source, submitted_by, batch_id, posted_to_esb, esb_doc_num, posted_at) values
--     ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',11,'Approved','teable_import',null,'PR-20260601-001',true,'ESB-HISTORIC-0001','2026-06-01T10:00:00Z'),
--     ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-02','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',6,'Approved','mos','00000000-0000-0000-0000-0000000000d1','PR-20260602-001',false,null,null)
--   on conflict (id) do nothing;
-- 
--   -- ── The cross-tenant negative ───────────────────────────────────────────────────────────────
--   insert into ops.kitchen_logs
--     (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
--      wip_item_id, qty_porsi, status, submitted_by) values
--     ('00000000-0000-0000-0000-00000000ac09','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb09','2026-06-20','00000000-0000-0000-0000-00000000bf09','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab09',9,'Submitted','00000000-0000-0000-0000-0000000000b4')
--   on conflict (id) do nothing;
-- 
--   -- ── Stock ───────────────────────────────────────────────────────────────────────────────────
--   insert into ops.kitchen_stock (id, org_id, log_date, wip_item_id, branch_id, activity, usable_qty) values
--     ('00000000-0000-0000-0000-00000000af01','00000000-0000-0000-0000-0000000000a1','2026-06-19','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen',10),
--     ('00000000-0000-0000-0000-00000000af02','00000000-0000-0000-0000-0000000000a1','2026-06-19','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf01','kitchen',3)
--   on conflict (id) do nothing;
--   insert into ops.kitchen_stock (id, org_id, log_date, wip_item_id, branch_id, activity, usable_qty) values
--     ('00000000-0000-0000-0000-00000000af09','00000000-0000-0000-0000-0000000000b1','2026-06-19','00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-00000000bf09','kitchen',99)
--   on conflict (id) do nothing;
-- 
--   -- ── Outbox rows, one per org ────────────────────────────────────────────────────────────────
--   -- Both reference UNPOSTED batches: the enqueue refusal is a real trigger on this table, so a
--   -- fixture pointing at posted history would fail to seed rather than fail an assertion.
--   insert into integrations.esb_push (id, org_id, source_module, source_ref, endpoint, dedup_key) values
--     ('00000000-0000-0000-0000-00000000ba01','00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260602-001','assembly-actual','kitchen|PR-20260602-001|dry_run'),
--     ('00000000-0000-0000-0000-00000000ba09','00000000-0000-0000-0000-0000000000b1','kitchen','PR-20260620-B01','assembly-actual','kitchen|PR-20260620-B01|dry_run')
--   on conflict (id) do nothing;
-- end;
-- $$;
-- comment on function ops._test_seed_cafe() is
--   'TEST-ONLY fixture (SECURITY DEFINER): branch catalog for both test orgs, Kitchen-and-Bar BU, WIP items, item units (#232: confirmed defaults + one unconfirmed + a cross-tenant row), plans, Submitted logs across four production streams, imported history, and stock — plus a live ops_lead. Call AFTER shared._test_seed_directory(), inside begin;...rollback; with app.allow_test_seeds=on.';
-- drop function if exists ops._test_seed_streams();

-- ── Drop the producer default, the pair check, and the column (its comment goes with it).
-- drop trigger if exists teams_produces_default on shared.teams;
-- drop function if exists shared._set_team_produces_default();
-- alter table shared.teams drop constraint if exists teams_produces_pair_check;
-- alter table shared.teams drop column produces;
