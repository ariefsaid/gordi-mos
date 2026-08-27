-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Cikal joins the branch catalog, and brings a BAR stream with it
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-27: "Cikal needs to be added as a branch. it gets a bar stream." Asked and
-- confirmed: bar only, NO kitchen.
--
-- Supersedes AC-012a/OD-WAY-42's "exactly six": the requirement is that the catalog be ENUMERABLE
-- and complete, not its size (FR-005). Extend BOTH the insert and the validation list, never one.
--
-- The grid is ASYMMETRIC on purpose — Cikal bar, no kitchen; roastery no stream at all. Do not
-- "complete" either.
--
-- Reversal:
--   delete from shared.teams where activity = 'bar'
--     and branch_id in (select id from shared.branches where code = 'cikal');
--   delete from shared.branches where code = 'cikal';
--   (then re-run 20260814000001's `create or replace shared.seed_stream_teams()` verbatim —
--    it is the version this file replaced, three-branch code list x the activity catalog)

-- Every org, as 20260805000001 seeded the catalog. A fresh `db reset` creates the Gordi org AFTER
-- migrations run, so seed.sql repeats it — that is why both files name Cikal.
insert into shared.branches (org_id, code, name)
select o.id, 'cikal', 'Cikal'
  from shared.orgs o
on conflict (org_id, code) do nothing;

-- Replaces the seeder as 20260814000001 left it — CATALOG-DRIVEN. The activity half comes from
-- `shared.activities`; do not re-hardcode it (copying the older 20260806000001 shape reverts that,
-- and only `shared_12` catches it).
--
-- The predicate is a UNION of two rules, never a wider product: three full branches x every
-- activity, plus Cikal x bar. A new activity reaches the three and not Cikal.
--
-- THE SHORTFALL CHECK RESTATES BOTH RULES rather than sharing the insert's predicate — it must not
-- trust the insert's own view of what it tried. Keep them in step. Its activity half IS catalog-
-- derived on both sides, deliberately: the catalog is the definition, so agreeing with it is
-- correctness, not collusion. Hardcoding ('kitchen','bar') here silently stops the check demanding
-- a stream for any future activity, and nothing reddens.
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

-- Three published descriptions understate the catalog. The database serves all three to any reader
-- of \d+, and ops_04 asserts one — so the stale number was test-enforced green. A count in a
-- comment is a fact you own on every ruling; `shared_11` now guards the class.
comment on column ops.kitchen_logs.activity is
  'Activity half of the production stream; resolves against shared.activities. Crossed with the '
  'three FULL production branches that catalog yields six streams, plus Cikal which takes bar only '
  '= SEVEN distinct streams today (OD-WAY-42, OD-WAY-79). Adding a catalog row multiplies across '
  'the three full branches and leaves Cikal alone. Adding a BRANCH changes nothing on its own: the '
  'branch half is a literal code list inside shared.seed_stream_teams(), so a new branch gets a '
  'stream only when that function is edited to name it.';

comment on function shared.seed_stream_teams() is
  'Seeds the live stream Teams: the three FULL production branches crossed with every '
  'shared.activities row, PLUS Cikal with bar only (OD-WAY-79). A union of two rules, never a wider '
  'cross product — a new activity reaches the three and not Cikal. Roastery is a branch with no '
  'stream at all (OD-WAY-42). VALIDATES: raises if any expected pair has no live team. Idempotent '
  '(on conflict do nothing); called by this migration and again by seed.sql, which re-seeds the '
  'catalog for the Gordi org created after migrations run. Not an app RPC: no EXECUTE for anon or '
  'authenticated.';

-- From 20260806000001:59-61. Re-issued here, not edited there: a deployed database never re-runs
-- an applied migration.
comment on index shared.teams_stream_unique is
  'At most one LIVE stream team per (org, branch, activity). This is what makes the stream '
  'catalog ENUMERABLE — a capture surface can list the streams rather than guess them — which is '
  'the property FR-005/AC-012a asserts, not any particular count (OD-WAY-42, OD-WAY-79). Partial '
  'index: archiving a stream team and later seeding its successor stays possible, and ordinary '
  'teams (branch_id NULL) never pay.';

select shared.seed_stream_teams();
