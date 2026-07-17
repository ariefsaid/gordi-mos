-- SECURITY LOW-3 fix (Step-4 review). mos._test_seed_signal_tree() is a data-mutating TEST-ONLY
-- fixture that shipped resident in prod with no environment guard: anyone who could EXECUTE it (it is
-- revoked from authenticated, but a mistaken grant / a superuser path) would mutate real data.
--
-- GUARD MECHANISM (documented choice): the repo has no pre-existing environment marker on any
-- _test_seed_* function and no reliable prod-vs-local signal at the DB level (current_database() is
-- `postgres` in both; there is no app.settings.environment GUC set by Supabase). We therefore guard on
-- an OPT-IN GUC, app.allow_test_seeds, which the pgTAP harness sets per-transaction
-- (`select set_config('app.allow_test_seeds','on',true)`) right before invoking the fixture. It is
-- fail-closed by construction: prod never sets it, so the fixture raises 42501 there; `supabase test db`
-- opts in explicitly, so the suite stays green. Mirrors the GUC pattern already used for
-- app.esb_target_env (20260620000007). This re-creates the function from 20260716000006 verbatim, with
-- the guard prepended (new migration — never edit an applied one).
create or replace function mos._test_seed_signal_tree()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- LOW-3: fail-closed unless the caller has explicitly opted in (local/CI only). Prod never sets it.
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_signal_tree is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  perform mos._test_seed_role_tree();

  -- Peer(...0d4) becomes a pure sibling-Team member with no BU-scoped role (see DEVIATION note in
  -- 20260716000006_mos_signal_test_seed.sql).
  delete from shared.person_roles where person_id = '00000000-0000-0000-0000-0000000000d4';

  insert into shared.sites (id, org_id, name, code) values
    ('00000000-0000-0000-0000-000000005a01','00000000-0000-0000-0000-0000000000a1','Unit-1 Site','unit1_site');
  insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
    ('00000000-0000-0000-0000-000000005b01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000005a01','OwnTeam','own_team'),
    ('00000000-0000-0000-0000-000000005b02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',null,'SiblingTeam','sibling_team');
  insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000005b01',true),  -- Author→OwnTeam
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000005b02',true);  -- Peer→SiblingTeam
  update shared.business_units set signal_visibility_rank = 2 where id = '00000000-0000-0000-0000-0000000000a3'; -- Unit-2
  update shared.business_units set signal_visibility_rank = 0 where id = '00000000-0000-0000-0000-0000000000a2'; -- Unit-1
end $$;
revoke execute on function mos._test_seed_signal_tree() from public, anon, authenticated;
comment on function mos._test_seed_signal_tree() is
  'TEST-ONLY fixture (SECURITY DEFINER): Signal Team substrate on the WU-A tree. Guarded by app.allow_test_seeds=on (LOW-3, fail-closed in prod). Call inside begin;...rollback;.';

-- DOWN (manual, pre-production): restore mos._test_seed_signal_tree from 20260716000006 (without the guard).
