-- SEC-1 (MEDIUM) — kitchen-logs write hardening. Closes two gaps the security audit confirmed on
-- ops.kitchen_logs (both pre-existing on origin/main; identical policy):
--   (a) queue pollution — the INSERT WITH CHECK let ANY org member submit a Submitted log, even one
--       with no working relationship to the kitchen. Fix: require BU membership (or ops_lead/admin).
--   (b) pre-approval tampering — the UPDATE policy was org-only, so member A could edit member B's
--       pending Submitted row. Fix: scope non-privileged edits to submitted_by = self; leads/admin
--       retain review-edit (the approve/reject transition stays their exclusive right via the guard).
--
-- New fail-closed helper shared.is_member_of_bu(uuid): true iff the current person holds an
-- effective-dated team membership under a live team of the given BU. Mirrors shared.is_manager_of's
-- conventions exactly — SQL, STABLE, SECURITY INVOKER, set search_path = '' — so it reads the
-- org-readable shared.teams / shared.team_memberships under the caller's RLS (a member sees only
-- their own org's rows) and the definer-revoke CI lint has nothing to flag. NULL current_person_id
-- (no session) or NULL p_bu -> no matching row -> false (fail closed).
--
-- NOTE (BU seam, ADR-0019 remap): kitchen_logs.business_unit_id resolves to the Retail Ops team BU
-- (code retail_ops, id …014) post-20260705000002 — "Kitchen and Bar" is an archived legacy row.
-- So the membership predicate checks the log's ACTUAL BU (Retail Ops), which the teams substrate
-- (20260716000001) seeds three teams under (HQ Operations / Radiant Operations / Ecommerce).
--
-- Reversible: DOWN at foot restores the pre-hardening org-only policies + drops the helper.

----------------------------------------------------------------------
-- 1. Fail-closed BU-membership helper (mirrors shared.is_manager_of).
----------------------------------------------------------------------
create or replace function shared.is_member_of_bu(p_bu uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from shared.team_memberships tm
    join shared.teams t on t.id = tm.team_id
    where tm.person_id = shared.current_person_id()
      and t.business_unit_id = p_bu
      and t.archived_at is null
      and tm.effective_from <= current_date
      and (tm.effective_to is null or tm.effective_to >= current_date)
  )
$$;
comment on function shared.is_member_of_bu(uuid) is
  'True iff current person holds an effective-dated membership under a live team of BU p_bu. '
  'Fail-closed (NULL person/BU -> false). SECURITY INVOKER — reads shared.teams/team_memberships under caller RLS. SEC-1.';

----------------------------------------------------------------------
-- 2. INSERT — require BU membership (or lead/admin). Closes queue pollution (a).
--    org_id + submitted_by remain server-stamped + WITH-CHECK-bound; status stays Submitted.
----------------------------------------------------------------------
drop policy kitchen_logs_insert_member on ops.kitchen_logs;
create policy kitchen_logs_insert_member on ops.kitchen_logs
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and submitted_by = shared.current_person_id()
              and status = 'Submitted'
              and (shared.has_access_role('ops_lead')
                   or shared.has_access_role('admin')
                   or shared.is_member_of_bu(business_unit_id)));

----------------------------------------------------------------------
-- 3. UPDATE — non-privileged edits scoped to own row. Closes pre-approval tampering (b).
--    ops_lead/admin retain review-edit (and remain the ONLY roles the guard lets flip status out of
--    Submitted). A plain member may only see-for-update + edit their OWN Submitted row; member A's
--    attempt on member B's row matches no USING row -> silent no-op (0 rows), never a leak.
--    submitted_by is guard-immutable, so the WITH CHECK submitted_by = self cannot be spoofed.
----------------------------------------------------------------------
drop policy kitchen_logs_update_reviewer on ops.kitchen_logs;
create policy kitchen_logs_update_reviewer on ops.kitchen_logs
  for update to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead')
              or shared.has_access_role('admin')
              or submitted_by = shared.current_person_id()))
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead')
                   or shared.has_access_role('admin')
                   or submitted_by = shared.current_person_id()));

----------------------------------------------------------------------
-- 4. Seed caveat (the auditor's availability warning). The new predicate FAILS CLOSED, so kitchen
--    staff need a team membership under the Retail Ops BU or their submit right vanishes. The teams
--    substrate seeds the teams but NO memberships, so this wires the demo/kitchen personas. Dual-seed
--    pattern (mirrors 20260716000001 / certified_metrics): this migration seeds any pre-existing DB;
--    seed.sql re-seeds for a fresh `supabase db reset`. Org-existence guarded (empty on bare reset).
--    Krishna Kitchen (submitter, member) is the one that MUST be wired; Cahya Cafe (reviewer) too.
----------------------------------------------------------------------
do $$
declare
  v_team_hq uuid;
begin
  if exists (select 1 from shared.orgs where id = '10000000-0000-0000-0000-000000000001') then
    select id into v_team_hq
      from shared.teams
     where org_id = '10000000-0000-0000-0000-000000000001' and code = 'hq_operations';
    if v_team_hq is not null then
      -- is_primary=false: a SECONDARY retail_ops membership (grants kitchen write access without
      -- claiming the persona's primary owning-team slot) — avoids team_memberships_one_primary.
      insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
      values
        ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002', v_team_hq, false),  -- Krishna Kitchen (submitter)
        ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001', v_team_hq, false)   -- Cahya Cafe (reviewer)
      on conflict do nothing;
    end if;
  end if;
end $$;

----------------------------------------------------------------------
-- 5. pgTAP fixture parity. Redefine the TEST-ONLY mos._test_seed_kitchen() (…000011) to also seed a
--    Kitchen team under the test's Kitchen-and-Bar BU (…bb01) + memberships for Author (…0d1) and
--    Peer (…0d4), so every suite that calls it keeps a working kitchen submitter under the new
--    membership predicate (test 38's member-INSERT would otherwise fail closed). Body is the original
--    (…000011) plus the team/membership block; still SECURITY DEFINER, service-role only.
----------------------------------------------------------------------
create or replace function mos._test_seed_kitchen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into shared.business_units (id, org_id, name)
  values ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar')
  on conflict (id) do nothing;
  insert into shared.business_units (id, org_id, name)
  values ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B-Kitchen')
  on conflict (id) do nothing;

  insert into ops.wip_items (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi)
  values
    ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000a1','Nasi Goreng','Mains',true,'BOM-001','PD-PORSI-001'),
    ('00000000-0000-0000-0000-00000000ab02','00000000-0000-0000-0000-0000000000a1','Ayam Bakar','Mains',true,'BOM-002','PD-PORSI-002'),
    ('00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-0000000000a1','Es Teh','Drinks',true,'BOM-003','PD-PORSI-003')
  on conflict (id) do nothing;
  insert into ops.wip_items (id, org_id, name, flag_active)
  values ('00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-0000000000b1','B-Item',true)
  on conflict (id) do nothing;

  -- SEC-1: a Kitchen team under the Kitchen-and-Bar BU + memberships for Author (…0d1) and Peer
  -- (…0d4) so both are effective-dated members of the log BU (…bb01). Fixed uuids, org A.
  insert into shared.teams (id, org_id, business_unit_id, name, code)
  values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','Kitchen Team','kitchen_test')
  on conflict (id) do nothing;
  insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
  values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1', true),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000e1', false)
  on conflict do nothing;

  insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, status, submitted_by)
  values
    ('00000000-0000-0000-0000-00000000ac01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',8,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Transfer to Radiant','00000000-0000-0000-0000-00000000ab01',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Transfer to Bungur','00000000-0000-0000-0000-00000000ab01',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',2,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;
  insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, status, submitted_by)
  values
    ('00000000-0000-0000-0000-00000000ad01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Production','00000000-0000-0000-0000-00000000ab02',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Transfer to Radiant','00000000-0000-0000-0000-00000000ab02',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Transfer to Bungur','00000000-0000-0000-0000-00000000ab02',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Production','00000000-0000-0000-0000-00000000ab02',9,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-22','Transfer to Bungur','00000000-0000-0000-0000-00000000ab03',100,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;
end;
$$;
revoke execute on function mos._test_seed_kitchen() from public, anon, authenticated;

-- DOWN (pre-production, manual):
--   -- restore the org-only INSERT/UPDATE policies:
--   drop policy kitchen_logs_update_reviewer on ops.kitchen_logs;
--   create policy kitchen_logs_update_reviewer on ops.kitchen_logs
--     for update to authenticated
--     using (org_id = shared.current_org_id()) with check (org_id = shared.current_org_id());
--   drop policy kitchen_logs_insert_member on ops.kitchen_logs;
--   create policy kitchen_logs_insert_member on ops.kitchen_logs
--     for insert to authenticated
--     with check (org_id = shared.current_org_id()
--                 and submitted_by = shared.current_person_id() and status = 'Submitted');
--   -- drop the helper + the seeded memberships (and revert _test_seed_kitchen to …000011's body):
--   drop function shared.is_member_of_bu(uuid);
--   delete from shared.team_memberships
--    where org_id = '10000000-0000-0000-0000-000000000001'
--      and person_id in ('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002');
--
-- FOLLOW-UP (deferred, not in this slice): the full route-level RequireTeamInBU guard. It needs the
-- viewer's team memberships at route-resolution time; the viewer payload (src/lib/db/viewer.ts) does
-- NOT yet carry them and lib/team-context is pure row-logic (no DB read), so a real guard does not
-- fall out naturally here. This slice does the minimum-viable route hygiene instead: the Café rail
-- entry is already role-name scoped (destinations.tsx workMatch), and Home's failed-checks deep-link
-- is now gated to cafe-affiliated / ops_lead / admin viewers. Upgrade to a team-membership-backed
-- viewer payload + RequireTeamInBU when the team seam is wired into auth (FLAG-B / G2 / census).
