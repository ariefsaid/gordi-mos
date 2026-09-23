-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Activity gets a catalog: one vocabulary for every (branch, activity) production stream (#215).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Activity was a bare text column with the same allow-list CHECK duplicated on five tables —
-- shared.teams, ops.kitchen_plans, ops.kitchen_logs, ops.kitchen_stock, ops.stream_completeness —
-- plus a sixth restatement inside shared.seed_stream_teams(). Adding an activity meant a
-- migration touching all of them and hoping none was missed. shared.activities is now the single
-- definition and all five surfaces resolve against it by foreign key.
--
-- MIGRATION-OWNED, NOT USER-OWNED. Read is org-wide (it is a vocabulary, not tenant data — the
-- same posture as shared.role_capabilities); there is no write policy and no write grant, so the
-- vocabulary changes by migration and never by a session. Insert/delete only from a migration
-- means no UPDATE path, hence NO updated_at column and no trigger (the rule stated in ...0805000001).
--
-- DOWN (reversal, in order):
--   re-run `create or replace function shared.seed_stream_teams()` from 20260806000001
--     (restores the literal six-pair body this file replaced);
--   alter table shared.teams            drop constraint teams_activity_fkey;
--   alter table ops.kitchen_plans       drop constraint kitchen_plans_activity_fkey;
--   alter table ops.kitchen_logs        drop constraint kitchen_logs_activity_fkey;
--   alter table ops.kitchen_stock       drop constraint kitchen_stock_activity_fkey;
--   alter table ops.stream_completeness drop constraint stream_completeness_activity_fkey;
--   re-add the five CHECK constraints as `check (activity in ('kitchen','bar'))`, named
--     teams_activity_check, kitchen_plans_activity_check, kitchen_logs_activity_check,
--     kitchen_stock_activity_check, stream_completeness_activity_check;
--   drop table shared.activities;       -- drops activities_select_all with it
--   restore the prior column comments on the five activity columns.
--   (Valid ONLY while no row anywhere carries an activity added after this migration — the CHECKs
--    above would refuse to validate. Delete or re-point those rows first, stream teams included.)

-- ── The catalog ──────────────────────────────────────────────────────────────────────────────
create table shared.activities (
  code text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  constraint activities_code_not_blank check (btrim(code) <> ''),
  constraint activities_name_not_blank check (btrim(name) <> '')
);
comment on table shared.activities is
  'Canonical Activity vocabulary for the (branch, activity) production stream. This is the one source of activity codes.';
insert into shared.activities (code, name) values
  ('kitchen', 'Kitchen'),
  ('bar', 'Bar');

revoke all on shared.activities from public, anon, authenticated;
grant select on shared.activities to authenticated;
alter table shared.activities enable row level security;
alter table shared.activities force row level security;
create policy activities_select_all on shared.activities
  for select to authenticated using (true);

-- ── Retire the duplicated allow-lists ────────────────────────────────────────────────────────
-- Applied databases carry these five CHECKs; fresh databases do not, because the source migrations
-- were edited to stop writing the obsolete duplicated vocabulary. IF EXISTS covers both cases in
-- one statement each — no catalog introspection needed, and no chance of resolving a constraint
-- name to the wrong table (conname is not unique across a database).
alter table shared.teams            drop constraint if exists teams_activity_check;
alter table ops.kitchen_plans       drop constraint if exists kitchen_plans_activity_check;
alter table ops.kitchen_logs        drop constraint if exists kitchen_logs_activity_check;
alter table ops.kitchen_stock       drop constraint if exists kitchen_stock_activity_check;
alter table ops.stream_completeness drop constraint if exists stream_completeness_activity_check;

-- ── The five surfaces resolve against the catalog ────────────────────────────────────────────
alter table shared.teams add constraint teams_activity_fkey
  foreign key (activity) references shared.activities(code);
alter table ops.kitchen_plans add constraint kitchen_plans_activity_fkey
  foreign key (activity) references shared.activities(code);
alter table ops.kitchen_logs add constraint kitchen_logs_activity_fkey
  foreign key (activity) references shared.activities(code);
alter table ops.kitchen_stock add constraint kitchen_stock_activity_fkey
  foreign key (activity) references shared.activities(code);
alter table ops.stream_completeness add constraint stream_completeness_activity_fkey
  foreign key (activity) references shared.activities(code);

comment on column shared.teams.activity is
  'Activity half of the production stream; resolves to shared.activities. Set and null together with branch_id.';
comment on column ops.kitchen_plans.activity is
  'Activity half of the production stream; resolves to shared.activities.';
-- The count OD-WAY-42 requires a schema reader to see stays published (ops_04 asserts it reached
-- the database, not just the source file) — but it is now stated as what it is: the branch catalog
-- crossed with the Activity catalog, counted, not a rule this column enforces. Adding a catalog row
-- changes the number and nothing here has to be true about it.
comment on column ops.kitchen_logs.activity is
  'Activity half of the production stream; resolves to shared.activities, which owns the vocabulary — this column does not restate it. Crossed with the three production branches, that catalog yields six distinct streams today (OD-WAY-42); the number is data, so count it rather than assume it.';
comment on column ops.kitchen_stock.activity is
  'Activity half of the production stream; resolves to shared.activities.';
comment on column ops.stream_completeness.activity is
  'Activity half of the production stream; resolves to shared.activities.';

-- ── The stream seeder now reads the catalog (supersedes the body in 20260806000001) ──────────
-- Everything that file's header says about this function still holds and is not repeated here:
-- ONE seeder called by both the migration and supabase/seed.sql (the deduplicated dual-seed
-- pattern), idempotent, VALIDATING rather than trusting ON CONFLICT DO NOTHING, stream teams under
-- the Retail Ops BU, and ROASTERY DELIBERATELY ABSENT — it is a branch but carries no production
-- stream (OD-WAY-42), which is why the branch list is a literal here and not `all branches`.
--
-- The ONE change: the activity half of each pair comes from shared.activities instead of a
-- hard-coded 'kitchen'/'bar' list, so a catalog row is the only edit a new activity needs.
--
-- THE SHORTFALL CHECK STAYS INDEPENDENT OF THE INSERT (FR-005/AC-012a). It restates the expected
-- branch list rather than sharing the INSERT's predicate, because the check must not trust the
-- INSERT's own view of what it tried — keep the two lists identical when editing. The activity
-- half is catalog-derived on both sides by design: the catalog IS the definition now, so agreeing
-- with it is correctness, not collusion. What the check still catches is what it always caught —
-- a reserved team code already held by a non-stream team, silently swallowed by ON CONFLICT — plus
-- a branch list that drifts on one side only.
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
    insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
    select o.org_id, bu.id, b.name || ' ' || a.name, b.code || '_' || a.code, b.id, a.code
    from shared.branches b
    cross join shared.activities a
    join shared.business_units bu
      on bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null
    where b.org_id = o.org_id
      and b.code in ('gordi_hq', 'rumah_rames', 'radiant')
      and b.archived_at is null
    on conflict (org_id, code) do nothing;

    -- Pair-existence, not row-count: what must hold is that each expected (branch, activity) has a
    -- live stream team, whatever its code.
    select string_agg(e.branch_code || '/' || e.activity, ', '
                      order by e.branch_code, e.activity)
      into v_missing
    from (
      select s.branch_code, a.code as activity, b.id as branch_id
      from (values ('gordi_hq'), ('rumah_rames'), ('radiant')) as s(branch_code)
      cross join shared.activities a
      join shared.branches b
        on b.org_id = o.org_id and b.code = s.branch_code and b.archived_at is null
      where exists (select 1 from shared.business_units bu
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
        'already held by a non-stream team; rename it or archive it, the stream catalog must '
        'be complete (FR-005/AC-012a, OD-WAY-42)', o.org_id, v_missing;
    end if;
  end loop;
end;
$$;
comment on function shared.seed_stream_teams() is
  'Seeds one live stream Team for every non-roastery production branch crossed with every '
  'shared.activities row, for each org carrying the Retail Ops BU and the branch catalog, then '
  'VALIDATES that every expected pair exists live and raises on any shortfall (FR-005/AC-012a): '
  'ON CONFLICT DO NOTHING alone would let a code collision ship a thin catalog silently. The '
  'shortfall check restates the branch list independently of the INSERT. Idempotent; called by the '
  'migration and by supabase/seed.sql (the dual-seed pattern, deduplicated). Not an app RPC.';
revoke execute on function shared.seed_stream_teams() from public, anon, authenticated;
select shared.seed_stream_teams();
