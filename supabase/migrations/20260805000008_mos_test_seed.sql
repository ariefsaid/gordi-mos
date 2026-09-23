-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 4 of 4 for `mos`: pgTAP fixtures (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Every fixture here extends the two-org directory the `shared` baseline seeds
-- (shared._test_seed_directory / shared._test_seed_access_roles, ...0004). The fixture UUIDs are
-- unchanged from both prior chains, so an assertion that used to reference a person or a role by id
-- still finds it.
--
-- SECURITY DEFINER so they can write under RLS. Intended ONLY inside a begin;...rollback; pgTAP
-- transaction — the rows never ship. Two independent controls keep that true, and both are needed:
--
--   1. EXECUTE is revoked from public/anon/authenticated. `mos` is exposed through PostgREST, so a
--      default PUBLIC grant would make each of these a reachable RPC that writes arbitrary orgs,
--      people, roles and processes into the directory.
--   2. A fail-closed environment opt-in. Every mutating fixture below raises 42501 unless
--      `app.allow_test_seeds` is 'on'. The pgTAP harness sets it per transaction; nothing else ever
--      does, so the fixtures are inert wherever they have not been explicitly asked for. The revoke
--      alone was judged insufficient because it is one mistaken grant away from being no control at
--      all, while the GUC is opt-in by construction.
--
-- DOWN: drop function mos._test_seed_cafe_opening(); drop function mos._test_seed_process_tree();
--       drop function mos._test_seed_follow_ups(); drop function mos._test_seed_signal_tree();

-- ── The Signal/Team substrate on the shared directory tree ───────────────────────────────────
-- Adds to org A (...0a1):
--   Site  Unit-1 Site  ...5a01
--   Team  OwnTeam      ...5b01  (BU Unit-1 ...0a2, at that Site)
--   Team  SiblingTeam  ...5b02  (same BU, no Site)
-- Memberships (active): Author ...0d1 -> OwnTeam (primary); Peer ...0d4 -> SiblingTeam (primary).
-- BU visibility ranks: Unit-1 ...0a2 = 0; Unit-2 ...0a3 = 2, so a Unit-2 role holder outranks it.
--
-- The read personas this shapes:
--   R1  Author ...0d1 is an OwnTeam member.
--   R2  DirectMgr ...0d2 holds Lead R, a Unit-1 role, over the owning BU.
--   R3  Lead2Holder ...0d7 holds Lead 2 in Unit-2 (rank 2) > owning BU Unit-1 (rank 0).
--
-- DEVIATION, recorded rather than left to be rediscovered: the shared directory gives Peer ...0d4
-- the Staff R role, whose BU is Unit-1 — the owning BU. Under read rule R2 that role alone would
-- grant Peer a read of any Unit-1-owned Signal, which makes "a sibling-Team member with no BU-scoped
-- role sees nothing" unprovable. This fixture therefore strips Peer's role assignments, modelling
-- exactly the persona the default-deny assertions describe. It is a fixture-shaping decision, not a
-- policy change, and mos_07_signals states it at the point of use.
create or replace function mos._test_seed_signal_tree()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_signal_tree is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  perform shared._test_seed_directory();

  delete from shared.person_roles where person_id = '00000000-0000-0000-0000-0000000000d4';

  insert into shared.sites (id, org_id, name, code) values
    ('00000000-0000-0000-0000-000000005a01','00000000-0000-0000-0000-0000000000a1','Unit-1 Site','unit1_site');
  insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
    ('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000005a01','OwnTeam','own_team'),
    ('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',null,'SiblingTeam','sibling_team');
  insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01',true),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000005b02',true);
  update shared.business_units set signal_visibility_rank = 2 where id = '00000000-0000-0000-0000-0000000000a3';
  update shared.business_units set signal_visibility_rank = 0 where id = '00000000-0000-0000-0000-0000000000a2';
end;
$$;
comment on function mos._test_seed_signal_tree() is
  'TEST-ONLY fixture (SECURITY DEFINER): Sites, Teams and memberships on the shared directory tree, for the Signal read-gate suite. Fail-closed behind app.allow_test_seeds. Call inside begin;...rollback;.';
revoke execute on function mos._test_seed_signal_tree() from public, anon, authenticated;

-- ── The Café Opening process, exercising all three PIC-resolution paths ──────────────────────
-- People  Solo ...f001 (RoleSolo, one holder) · Twin A ...f002 + Twin B ...f003 (RoleTwin, two)
--         · Boss ...f004 (the Process's Accountable)
-- Roles   Opener ...e001 (1 holder) · Twin Station ...e002 (2) · Vacant Station ...e003 (0)
-- Process Café Opening ...c001 (type=process, BU Unit-1, A=Boss) + a daily cadence ...c002
-- Defs    TdSolo ...d001 (resolves, 2 checklist items) · TdVacant ...d002 (0 holders)
--         · TdTwin ...d003 (2 holders)
-- The three defs are the whole point: one materialises a Task, the other two must each produce a
-- pending human-choice row rather than a guessed assignee.
create or replace function mos._test_seed_process_tree()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := '00000000-0000-0000-0000-0000000000a1';
  v_bu   uuid := '00000000-0000-0000-0000-0000000000a2';  -- Unit-1
  v_team uuid;
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_process_tree is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  perform mos._test_seed_signal_tree();
  select id into v_team from shared.teams where org_id = v_org and code = 'own_team';

  insert into shared.people (id, org_id, full_name) values
    ('00000000-0000-0000-0000-00000000f001', v_org, 'Solo Holder'),
    ('00000000-0000-0000-0000-00000000f002', v_org, 'Twin A'),
    ('00000000-0000-0000-0000-00000000f003', v_org, 'Twin B'),
    ('00000000-0000-0000-0000-00000000f004', v_org, 'Boss (Process A)')
  on conflict (id) do nothing;

  insert into shared.roles (id, org_id, business_unit_id, name) values
    ('00000000-0000-0000-0000-00000000e001', v_org, v_bu, 'Opener'),
    ('00000000-0000-0000-0000-00000000e002', v_org, v_bu, 'Twin Station'),
    ('00000000-0000-0000-0000-00000000e003', v_org, v_bu, 'Vacant Station')
  on conflict (id) do nothing;
  insert into shared.person_roles (org_id, person_id, role_id) values
    (v_org, '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001'),
    (v_org, '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000e002'),
    (v_org, '00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000e002')
  on conflict do nothing;

  insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
    (v_org, '00000000-0000-0000-0000-00000000f001', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f002', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f003', v_team, false),
    (v_org, '00000000-0000-0000-0000-00000000f004', v_team, false)
  on conflict do nothing;

  insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id, definition_version) values
    ('00000000-0000-0000-0000-00000000c001', v_org, 'Café Opening', 'process', v_bu,
     '00000000-0000-0000-0000-00000000f004', 1) on conflict (id) do nothing;
  insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind) values
    ('00000000-0000-0000-0000-00000000c002', v_org, '00000000-0000-0000-0000-00000000c001', 'daily')
    on conflict (id) do nothing;

  insert into mos.process_task_defs (id, org_id, work_line_id, title, position, due_offset_days, checklist_items, pic_role_id, pic_team_id) values
    ('00000000-0000-0000-0000-00000000d001', v_org, '00000000-0000-0000-0000-00000000c001', 'Open the café', 0, 0,
     '["Unlock door","Turn on machine"]'::jsonb, '00000000-0000-0000-0000-00000000e001', v_team),
    ('00000000-0000-0000-0000-00000000d002', v_org, '00000000-0000-0000-0000-00000000c001', 'Vacant step', 1, 0,
     '[]'::jsonb, '00000000-0000-0000-0000-00000000e003', v_team),
    ('00000000-0000-0000-0000-00000000d003', v_org, '00000000-0000-0000-0000-00000000c001', 'Twin step', 2, 0,
     '[]'::jsonb, '00000000-0000-0000-0000-00000000e002', v_team)
  on conflict (id) do nothing;
end;
$$;
comment on function mos._test_seed_process_tree() is
  'TEST-ONLY fixture (SECURITY DEFINER): a daily Café Opening process on the Signal tree, with one resolvable, one vacant and one ambiguous task-def. Fail-closed behind app.allow_test_seeds.';
revoke execute on function mos._test_seed_process_tree() from public, anon, authenticated;

-- ── Café-meaningful definitions on the same process ──────────────────────────────────────────
-- No separate guard: the fail-closed check fires inside the _test_seed_process_tree call below.
-- Idempotent under re-seed — prior defs on this process are archived so occurrence counts stay
-- deterministic no matter how many times a suite calls it.
create or replace function mos._test_seed_cafe_opening()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid := '00000000-0000-0000-0000-0000000000a1';
  v_team uuid;
begin
  perform mos._test_seed_process_tree();
  select id into v_team from shared.teams where org_id = v_org and code = 'own_team';

  update mos.process_task_defs set archived_at = now()
   where work_line_id = '00000000-0000-0000-0000-00000000c001' and org_id = v_org
     and id not in ('00000000-0000-0000-0000-00000000ca01',
                    '00000000-0000-0000-0000-00000000ca02',
                    '00000000-0000-0000-0000-00000000ca03');

  insert into mos.process_task_defs
    (id, org_id, work_line_id, title, position, due_offset_days, checklist_items, pic_role_id, pic_team_id) values
    -- One operator, several steps -> ONE Task carrying a checklist, not several tasks.
    ('00000000-0000-0000-0000-00000000ca01', v_org, '00000000-0000-0000-0000-00000000c001',
     'Open the café floor', 0, 0,
     '["Unlock the door","Turn on the espresso machine","Check pastry stock","Wipe the bar"]'::jsonb,
     '00000000-0000-0000-0000-00000000e001', v_team),
    -- Independently owned step -> its own Task.
    ('00000000-0000-0000-0000-00000000ca02', v_org, '00000000-0000-0000-0000-00000000c001',
     'Log today''s production', 1, 0, '[]'::jsonb,
     '00000000-0000-0000-0000-00000000e001', v_team),
    -- Two holders -> a pending "to assign" item.
    ('00000000-0000-0000-0000-00000000ca03', v_org, '00000000-0000-0000-0000-00000000c001',
     'Brew station handover', 2, 0, '[]'::jsonb,
     '00000000-0000-0000-0000-00000000e002', v_team)
  on conflict (id) do update
    set title = excluded.title, position = excluded.position, checklist_items = excluded.checklist_items,
        pic_role_id = excluded.pic_role_id, pic_team_id = excluded.pic_team_id, archived_at = null;
end;
$$;
comment on function mos._test_seed_cafe_opening() is
  'TEST-ONLY fixture (SECURITY DEFINER): café-opening definitions on the Café Opening process. Inherits the app.allow_test_seeds guard through _test_seed_process_tree.';
revoke execute on function mos._test_seed_cafe_opening() from public, anon, authenticated;

-- ── The AR bridge fixture ────────────────────────────────────────────────────────────────────
-- Coded BUs (the lane codes the chase gate matches on), one chaser per lane, an open follow-up in
-- each lane, and a foreign-org follow-up as the cross-org control. Author ...0d1 keeps the finance
-- grant the shared fixture gives her, so she is the confirm caller.
create or replace function mos._test_seed_follow_ups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_follow_ups is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  insert into shared.business_units (id, org_id, name, code) values
    ('00000000-0000-0000-0000-000000000a10','00000000-0000-0000-0000-0000000000a1','FU B2B Sales','b2b_sales'),
    ('00000000-0000-0000-0000-000000000a11','00000000-0000-0000-0000-0000000000a1','FU Retail Ops','retail_ops')
  on conflict (id) do nothing;

  insert into shared.roles (id, org_id, business_unit_id, name, reports_to_role_id) values
    ('00000000-0000-0000-0000-000000000f10','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000a10','FU Sales Lead',  '00000000-0000-0000-0000-0000000000f1'),
    ('00000000-0000-0000-0000-000000000f11','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000a11','FU Retail Lead', '00000000-0000-0000-0000-0000000000f1')
  on conflict (id) do nothing;

  insert into shared.people (id, org_id, full_name) values
    ('00000000-0000-0000-0000-000000000d10','00000000-0000-0000-0000-0000000000a1','SalesChaser'),
    ('00000000-0000-0000-0000-000000000d11','00000000-0000-0000-0000-0000000000a1','RetailChaser')
  on conflict (id) do nothing;

  insert into shared.person_roles (org_id, person_id, role_id) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000d10','00000000-0000-0000-0000-000000000f10'),
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000d11','00000000-0000-0000-0000-000000000f11')
  on conflict (person_id, role_id) do nothing;

  insert into mos.follow_ups
    (id, org_id, counterparty, kind, lane, source_invoice_ref, original_amount, running_balance, state, issued_date, due_date)
  values
    ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000a1','PT Big Buyer','b2b_ar','b2b_sales','INV-1001', 1000000, 1000000, 'open', '2026-06-01','2026-06-30'),
    ('00000000-0000-0000-0000-000000000e02','00000000-0000-0000-0000-0000000000a1','Pak Regular','retail_pending','retail_ops','TAB-2002', 250000, 250000, 'open', '2026-06-15', null);

  insert into mos.follow_ups
    (id, org_id, counterparty, kind, lane, source_invoice_ref, original_amount, running_balance, state)
  values
    ('00000000-0000-0000-0000-000000000e03','00000000-0000-0000-0000-0000000000b1','Foreign Co','b2b_ar','b2b_sales','INV-F-1', 500000, 500000, 'open');
end;
$$;
comment on function mos._test_seed_follow_ups() is
  'TEST-ONLY fixture (SECURITY DEFINER): coded lane BUs, one chaser per lane, two open follow-ups and a foreign-org control. Call after shared._test_seed_directory() and shared._test_seed_access_roles(). Fail-closed behind app.allow_test_seeds.';
revoke execute on function mos._test_seed_follow_ups() from public, anon, authenticated;

-- ── One row in every mos table, in BOTH orgs ─────────────────────────────────────────────────
-- The fixture the tenancy and fail-closed suites need. Its whole purpose is that org B is a REAL
-- tenant with real rows in every table, so a zero read by an org-A session proves isolation rather
-- than emptiness — the distinction an "assert it returns nothing" test always misses.
--
-- Ids are mirrored: org A rows carry ...70NN and org B rows ...71NN, so a stray id in an assertion
-- is visible by eye. Actors are Author ...0d1 (org A) and ForeignMgr ...0b4 (org B), each a member
-- of their own org's Team so the Signal read gate's rule R1 resolves for them.
--
-- Deliberately absent: a comment with entity_type='daily_log'. That guard branch reads
-- ops.log_entries, which the `ops` pass authors — a plpgsql body resolves table references at run
-- time, so the branch compiles now and starts working when that schema lands. Seeding one here
-- would fail for a reason that has nothing to do with `mos`.
create or replace function mos._test_seed_rows()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_rows is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  for r in
    select * from (values
      ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid,
       '00000000-0000-0000-0000-0000000000d1'::uuid, '70'::text),
      ('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000b2'::uuid,
       '00000000-0000-0000-0000-0000000000b4'::uuid, '71'::text)
    ) as t(org_id, bu_id, person_id, p)
  loop
    -- Site + Team + membership, so the Signal read gate's R1 arm resolves for this org's actor.
    insert into shared.sites (id, org_id, name, code)
      values (('00000000-0000-0000-0000-0000000' || r.p || '000')::uuid, r.org_id, 'Seam Site ' || r.p, 'seam_site_' || r.p);
    insert into shared.teams (id, org_id, business_unit_id, site_id, name, code)
      values (('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid, r.org_id, r.bu_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '000')::uuid, 'Seam Team ' || r.p, 'seam_team_' || r.p);
    insert into shared.team_memberships (org_id, person_id, team_id)
      values (r.org_id, r.person_id, ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid);

    insert into mos.objectives (id, org_id, name)
      values (('00000000-0000-0000-0000-0000000' || r.p || '002')::uuid, r.org_id, 'Seam Objective ' || r.p);
    -- The Project carries the DD-WAY-15 edge, so every tenancy assertion covers it too.
    insert into mos.work_lines (id, org_id, name, type, objective_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '003')::uuid, r.org_id, 'Seam Project ' || r.p, 'project',
              ('00000000-0000-0000-0000-0000000' || r.p || '002')::uuid);
    insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '004')::uuid, r.org_id, 'Seam Process ' || r.p, 'process',
              r.bu_id, r.person_id);
    insert into mos.process_cadences (id, org_id, work_line_id, cadence_kind)
      values (('00000000-0000-0000-0000-0000000' || r.p || '005')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '004')::uuid, 'daily');
    insert into mos.process_task_defs (id, org_id, work_line_id, title, pic_person_id, pic_team_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '006')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '004')::uuid, 'Seam Step ' || r.p, r.person_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid);
    insert into mos.process_runs (id, org_id, work_line_id, owning_team_id, period_key, caption,
                                  scheduled_date, definition_version, spec_snapshot, started_by)
      values (('00000000-0000-0000-0000-0000000' || r.p || '007')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '004')::uuid,
              ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid,
              '2026-01-01', 'Seam Run ' || r.p, date '2026-01-01', 1, '{}'::jsonb, r.person_id);

    insert into mos.tasks (id, org_id, title, business_unit_id, team_id, responsible_person_id,
                           accountable_person_id, created_by, objective_id, work_line_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, r.org_id, 'Seam Task ' || r.p,
              r.bu_id, ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid,
              r.person_id, r.person_id, r.person_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '002')::uuid,
              ('00000000-0000-0000-0000-0000000' || r.p || '003')::uuid);
    insert into mos.process_run_pending_tasks (id, org_id, process_run_id, task_def_id, reason)
      values (('00000000-0000-0000-0000-0000000' || r.p || '009')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '007')::uuid,
              ('00000000-0000-0000-0000-0000000' || r.p || '006')::uuid, 'none');
    insert into mos.task_checklist_items (id, org_id, task_id, label, position)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00a')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, 'Seam step', 0);
    insert into mos.task_events (id, org_id, task_id, actor_person_id, event_type)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00b')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, r.person_id, 'created');

    insert into mos.signals (id, org_id, author_id, owning_team_id, occurred_at, body)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid, r.org_id, r.person_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '001')::uuid, now(), 'Seam signal ' || r.p);
    insert into mos.signal_mentions (id, org_id, signal_id, mention_kind, target_person_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00d')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid, 'person', r.person_id);
    insert into mos.signal_acknowledgements (id, org_id, signal_id, person_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00e')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid, r.person_id);
    insert into mos.signal_revisions (id, org_id, signal_id, actor_id, field, old_value, new_value)
      values (('00000000-0000-0000-0000-0000000' || r.p || '00f')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid, r.person_id, 'body', 'old', 'new');
    insert into mos.signal_tasks (id, org_id, signal_id, task_id, created_by)
      values (('00000000-0000-0000-0000-0000000' || r.p || '010')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '00c')::uuid,
              ('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, r.person_id);

    insert into mos.weekly_updates (id, org_id, person_id, week_start, created_by)
      values (('00000000-0000-0000-0000-0000000' || r.p || '011')::uuid, r.org_id, r.person_id,
              date '2026-01-05', r.person_id);
    insert into mos.weekly_update_items (id, org_id, weekly_update_id, label, position)
      values (('00000000-0000-0000-0000-0000000' || r.p || '012')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '011')::uuid, 'Seam line', 0);

    insert into mos.comments (id, org_id, author_id, entity_type, entity_id, body)
      values (('00000000-0000-0000-0000-0000000' || r.p || '013')::uuid, r.org_id, r.person_id, 'task',
              ('00000000-0000-0000-0000-0000000' || r.p || '008')::uuid, 'Seam comment');
    insert into mos.notifications (id, org_id, owner_id, title)
      values (('00000000-0000-0000-0000-0000000' || r.p || '014')::uuid, r.org_id, r.person_id, 'Seam notification');
    insert into mos.push_subscriptions (id, org_id, owner_id, endpoint)
      values (('00000000-0000-0000-0000-0000000' || r.p || '015')::uuid, r.org_id, r.person_id,
              'https://push.example/' || r.p);
    insert into mos.user_views (id, org_id, owner_id, name)
      values (('00000000-0000-0000-0000-0000000' || r.p || '016')::uuid, r.org_id, r.person_id, 'Seam view');

    insert into mos.agent_threads (id, org_id, owner_id, title)
      values (('00000000-0000-0000-0000-0000000' || r.p || '017')::uuid, r.org_id, r.person_id, 'Seam thread');
    insert into mos.agent_runs (id, org_id, thread_id, owner_id)
      values (('00000000-0000-0000-0000-0000000' || r.p || '018')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '017')::uuid, r.person_id);
    insert into mos.agent_events (id, org_id, run_id, owner_id, seq, type, text)
      values (('00000000-0000-0000-0000-0000000' || r.p || '019')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '018')::uuid, r.person_id, 1, 'assistant', 'Seam turn');

    -- The registry is migration-seeded per org that exists AT MIGRATION TIME, and these two orgs are
    -- created inside the test transaction, so they get their rows here.
    insert into mos.certified_metrics (org_id, key, name, meaning, unit, grain)
      values (r.org_id, 'cogs.budgeted', 'Budgeted COGS', 'Seam fixture definition', 'IDR', 'menu item');

    insert into mos.budgets (id, org_id, menu_item_esb_code, menu_item_name, scenario_label,
                             owning_bu_id, total_budgeted_cogs, cost_basis_as_of, created_by)
      values (('00000000-0000-0000-0000-0000000' || r.p || '01a')::uuid, r.org_id, 'SKU-' || r.p, 'Seam Item',
              'baseline', r.bu_id, 1000, now(), r.person_id);
    insert into mos.budget_lines (id, org_id, budget_id, ingredient_esb_code, recipe_qty, qty_unit)
      values (('00000000-0000-0000-0000-0000000' || r.p || '01b')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '01a')::uuid, 'ING-' || r.p, 1, 'kg');

    insert into mos.follow_ups (id, org_id, counterparty, kind, lane, source_invoice_ref,
                                original_amount, running_balance)
      values (('00000000-0000-0000-0000-0000000' || r.p || '01c')::uuid, r.org_id, 'Seam Counterparty ' || r.p,
              'b2b_ar', 'b2b_sales', 'SEAM-' || r.p, 100000, 100000);
    insert into mos.follow_up_events (id, org_id, follow_up_id, transition, from_state, to_state)
      values (('00000000-0000-0000-0000-0000000' || r.p || '01d')::uuid, r.org_id,
              ('00000000-0000-0000-0000-0000000' || r.p || '01c')::uuid, 'chase', 'open', 'chased');

    insert into reporting.esb_ar_reduction (org_id, counterparty, period, esb_reduction_amount, snapshot_as_of)
      values (r.org_id, 'Seam Counterparty ' || r.p, '2026-01', 50000, now());
  end loop;
end;
$$;
comment on function mos._test_seed_rows() is
  'TEST-ONLY fixture (SECURITY DEFINER): one row in EVERY mos table, plus the AR landing zone, in BOTH test orgs — so a zero read by an org-A session proves isolation rather than emptiness. Call after shared._test_seed_directory(). Fail-closed behind app.allow_test_seeds.';
revoke execute on function mos._test_seed_rows() from public, anon, authenticated;
