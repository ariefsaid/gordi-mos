-- shared, squashed baseline — the committed dev seed lands as intended.
--
-- Read as the migration/seed owner, against the REAL rows supabase/seed.sql wrote. No fixture wrap:
-- the subject is the seed itself. begin;...rollback; keeps it read-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

-- "Today" is the JAKARTA date, not `current_date`. The seed was fixed for this (#469) — it writes
-- `(now() at time zone 'Asia/Jakarta')::date` — but THIS assertion, the one that checks the seed,
-- kept comparing against UTC. Postgres `current_date` in these containers is UTC, so between 17:00
-- and 24:00 UTC (00:00–07:00 WIB, seven hours of every day) the two are different dates and this
-- goes red on a correct seed. Caught at 17:04 UTC on 2026-08-26, when the seeded plan landed on
-- 08-27 and `current_date` still read 08-26. Same expression as the seed, or the test and the thing
-- it tests do not agree about what day it is.
select cmp_ok((select count(*) from ops.kitchen_plans
                where log_date = (now() at time zone 'Asia/Jakarta')::date), '>', 0::bigint,
  'a plan for today (Jakarta) is seeded — the Plan editor''s horizon and the Log variance gate both read it');

-- ...and the count is the DEV ORG's three, not a total across tenants. `> 0` passes on one plan
-- belonging to anyone, so a seed that dropped two of the three, or wrote them under another org,
-- read green. Named rows, org-scoped, exact count.
select is(
  (select count(*)::int from ops.kitchen_plans
    where org_id = '10000000-0000-0000-0000-000000000001'
      and log_date = (now() at time zone 'Asia/Jakarta')::date
      and wip_item_id in ('a1100000-0000-0000-0000-000000000001',
                          'a1100000-0000-0000-0000-000000000002',
                          'a1100000-0000-0000-0000-000000000006')),
  3,
  'all three dev-org plans are dated today (WIB) — the Plan editor''s horizon and the Log variance gate both read them');

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

-- ── Team memberships — the section that was never seeded at all ──────────────────────────────
-- `shared.team_memberships` had no roster seed until 2026-08-26, while the table, its RLS, its
-- same-org guard and its one-live-primary index had all existed since the squashed baseline. The
-- only rows on a fresh reset were three NON-PRIMARY ones, written one each by seed.dev-processes
-- (Dewi/hq_operations), seed.dev-cafe-opening (Cahya/radiant_operations) and seed.dev-signals
-- (Krishna/roastery_team) — the last DECLARES all three but its `not exists` guard skips the two
-- already present, and says so in its own comment. So "how many memberships exist" was already > 0
-- and would have passed as an assertion while every team still read as effectively empty. The
-- assertions below ask the questions that were actually false.

-- Every seeded person has a home team. Before the roster seed this was 3 of 6 people with any
-- membership at all and ZERO with a primary, so "which team is this person on" had no answer.
select is(
  (select count(*)::int from shared.people p
    where p.org_id = '10000000-0000-0000-0000-000000000001'
      and p.archived_at is null
      and not exists (select 1 from shared.team_memberships m
                       where m.person_id = p.id and m.is_primary and m.effective_to is null)),
  0,
  'every seeded person has exactly one live PRIMARY team — a person with no home team is what made every team surface read empty');

-- AC-001 / OD-WAY-49: a person's live PRIMARY team is what resolves their capture stream, so the
-- seed must put the line staff's primary ON a stream team. The first cut made every primary an
-- ORG team and left all 30 people resolving to no stream at all — and the assertion written beside
-- it ("some stream team has members") passed on exactly the non-primary rows default_stream() can
-- never use. This asks the question that was false: does anyone actually resolve a stream?
select cmp_ok(
  (select count(*) from shared.team_memberships m
     join shared.teams t on t.id = m.team_id
    where m.org_id = '10000000-0000-0000-0000-000000000001'
      and m.is_primary and m.effective_to is null
      and t.branch_id is not null and t.activity is not null),
  '>', 0::bigint,
  'seeded line staff have a PRODUCTION STREAM as their live primary team — without that shared.default_stream() resolves to nothing and every capture surface opens unset');

-- ...and the back office correctly does NOT. A seed that gave everyone a stream would pass the
-- assertion above while making the "no default stream" branch unreachable in dev.
select cmp_ok(
  (select count(*) from shared.team_memberships m
     join shared.teams t on t.id = m.team_id
    where m.org_id = '10000000-0000-0000-0000-000000000001'
      and m.is_primary and m.effective_to is null
      and t.branch_id is null),
  '>', 0::bigint,
  'and back-office people keep an ORG team as primary — the no-stream path stays exercisable in dev');

-- ...and a unit LEAD is not line staff, so a lead's primary stays an ORG team. Without this the
-- correction has no owner: flipping Cahya and Krishna back onto their streams as primary leaves
-- all three assertions above green, because 14-vs-16 is still ">0" on both sides.
-- `seed.dev-cafe-opening.sql` says why in as many words — "a primary would re-point Cahya's
-- default context app-wide".
select is(
  (select count(*)::int
     from shared.team_memberships m
     join shared.teams t   on t.id = m.team_id
     join shared.person_roles pr on pr.person_id = m.person_id
     join shared.roles r   on r.id = pr.role_id
    where m.org_id = '10000000-0000-0000-0000-000000000001'
      and m.is_primary and m.effective_to is null
      and t.branch_id is not null
      and (r.name like '%Lead' or r.name = 'Managing Director')),
  0,
  'no unit LEAD has a production stream as their live primary — a lead runs several lines, and a primary would re-point their default capture context app-wide');

select * from finish();
rollback;
