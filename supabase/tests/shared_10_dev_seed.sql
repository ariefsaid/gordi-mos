-- shared, squashed baseline — the committed dev seed lands as intended.
--
-- Read as the migration/seed owner, against the REAL rows supabase/seed.sql wrote. No fixture wrap:
-- the subject is the seed itself. begin;...rollback; keeps it read-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- The seed admin row exists despite the admin-only RLS rule AND the self-escalation guard: the seed
-- runs under a connection that bypasses RLS, and the guard's self-assign check is keyed on
-- current_person_id(), which is NULL there. If either of those ever changed, a fresh reset would
-- ship an org with no admin and no way to make one.
select ok(
  exists (select 1 from shared.person_access_roles
           where person_id = '40000000-0000-0000-0000-000000000000' and access_role = 'admin'),
  'the seed grants admin to the owner stand-in, past the admin-only RLS and the self-assign guard');

select is(
  (select granted_by from shared.person_access_roles
    where person_id = '40000000-0000-0000-0000-000000000000' and access_role = 'admin'),
  null, 'and granted_by is NULL — honest: a seed insert has no acting person to attribute it to');

select ok(
  exists (select 1 from shared.person_access_roles
           where person_id = '40000000-0000-0000-0000-000000000001' and access_role = 'member'),
  'an ordinary seeded person holds member, the default');

-- The Jabatan seed runs through _guard_person_roles, whose org check is skipped only because the
-- seed connection has no org claim. If that exemption were removed the whole seed would 42501.
select cmp_ok(
  (select count(*) from shared.person_roles
    where org_id = '10000000-0000-0000-0000-000000000001'),
  '>', 0::bigint,
  'the Jabatan seed survives the org-seam guard — the null-org service/seed path stays exempt');

-- ── Every surface-bearing section is present ─────────────────────────────────────────────────
-- These four sections have now been dropped from this file twice while their schemas were being
-- reshaped, and both times the symptom was a surface rendering EMPTY on a fresh reset — which reads
-- as a broken app rather than as a missing seed, and cost a render-verification the first time. The
-- assertions are deliberately about presence rather than exact counts, so ordinary edits to the
-- roster do not churn them, but removing a section wholesale goes red.
select cmp_ok((select count(*) from ops.wip_items), '>', 0::bigint,
  'the WIP item catalog is seeded — without it the Cafe capture surfaces have nothing to log against and render empty');

select cmp_ok((select count(*) from ops.kitchen_plans where log_date = current_date), '>', 0::bigint,
  'a plan for today is seeded — the Plan editor''s horizon and the Log variance gate both read it');

select cmp_ok((select count(*) from reporting.ingredient_cost_lines), '>', 0::bigint,
  'the ingredient cost lines are seeded — mos.capture_budget prices a budget from them, so Budget is unusable without them');

select cmp_ok((select count(*) from reporting.bom_lines), '>', 0::bigint,
  'and the BOM lines beside them — the two together are what make Budget and Pricing real in local dev rather than empty forms');

-- The registry the two reporting tables above are certified against. Seeded in BOTH the migration
-- (for orgs existing at migration time) and this file (for the dev org, created after migrations),
-- which is the dual-seed pattern the branch catalog uses. Asserted here because a fresh reset only
-- exercises the seed.sql half.
select is((select count(*)::int from mos.certified_metrics
            where org_id = '10000000-0000-0000-0000-000000000001'), 2,
  'the certified-metric registry lands for the dev org — the seed.sql half of the dual seed, which is the only half a fresh reset runs');

select * from finish();
rollback;
