-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Cikal joins the branch catalog, and brings a BAR stream with it
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-27: "Cikal needs to be added as a branch. it gets a bar stream." Asked and
-- confirmed: bar only, NO kitchen.
--
-- ── This supersedes a ratified count, so read that first ─────────────────────────────────────
-- AC-012a and OD-WAY-42 fixed the stream catalog at EXACTLY SIX — {GHQ, RRS, Radiant} × {kitchen,
-- bar} — and `shared.seed_stream_teams()` raises if any expected pair is missing. That "exactly"
-- was never a claim that six is the permanent size; it was a claim that the catalog is ENUMERABLE
-- and complete, so a capture surface can list the streams rather than guess them. Seven satisfies
-- the same property. What would break it is a branch with a stream nobody declared, which is why
-- the pair list and the validation list below are both extended rather than one of them.
--
-- The grid is now deliberately ASYMMETRIC: Cikal has a bar and no kitchen. That is a fact about
-- the business, not an oversight, and it is the second such fact in this table — roastery is a
-- branch with NO stream at all (OD-WAY-42). Do not "complete" either one.
--
-- Reversal:
--   delete from shared.teams where activity = 'bar'
--     and branch_id in (select id from shared.branches where code = 'cikal');
--   delete from shared.branches where code = 'cikal';
--   (then re-run 20260814000001's `create or replace shared.seed_stream_teams()` verbatim —
--    it is the version this file replaced, three-branch code list x the activity catalog)

-- ── The branch ───────────────────────────────────────────────────────────────────────────────
-- Every org, matching how the catalog was first seeded (20260805000001) — the orgs that exist at
-- migration time. A fresh `db reset` creates the Gordi org AFTER migrations run, so seed.sql
-- repeats the catalog for it; that dual-seed is why this file and seed.sql both name Cikal.
insert into shared.branches (org_id, code, name)
select o.id, 'cikal', 'Cikal'
  from shared.orgs o
on conflict (org_id, code) do nothing;

-- ── The stream ───────────────────────────────────────────────────────────────────────────────
-- `create or replace` on the seeder as 20260814000001 left it — CATALOG-DRIVEN, not a hard-coded
-- pair list. The activity half comes from `shared.activities`, so a catalog row is the only edit a
-- new activity needs. I nearly reverted that by copying the older 20260806000001 shape; the guard
-- that caught it is `shared_12`'s "the catalog Activity is seeded for every production branch".
--
-- Cikal does not fit the cross product, and that is the point: the three full branches take every
-- catalog activity, Cikal takes BAR ONLY. So the predicate is a UNION of the two rules, never a
-- wider product. A future activity — 'prep', say — multiplies across the three and leaves Cikal
-- alone, which is what `shared_12`'s count of 3 asserts.
--
-- THE SHORTFALL CHECK STAYS INDEPENDENT OF THE INSERT (FR-005/AC-012a): it restates both rules
-- rather than sharing the INSERT's predicate, because the check must not trust the INSERT's own
-- view of what it tried. Keep the two in step when editing. The activity half being catalog-derived
-- on both sides is deliberate — the catalog IS the definition, so agreeing with it is correctness,
-- not collusion.
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

-- ── Three published descriptions that now understate the catalog ─────────────────────────────
-- These are not cosmetics. All three are served to readers by the database itself, and one is
-- ASSERTED by ops_04, so the stale number was test-enforced green — the test pinned the wrong fact
-- rather than catching it. The third (the index comment, from 20260806000001) survived the first
-- sweep AND this file's own header, which claimed there were two; ops_04 cannot reach it because
-- that scan is scoped to the `ops` schema. If you add a count to a comment, expect to own it here.
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

-- The third one. Source: 20260806000001:59-61, which named the catalog by its size. Editing that
-- file would fix nothing — a deployed database never re-runs an applied migration — so it is
-- re-issued here, like the other two. (Comments are NOT part of the applied-path fingerprint;
-- leaving history immutable is the reason, not the drift check.)
comment on index shared.teams_stream_unique is
  'At most one LIVE stream team per (org, branch, activity). This is what makes the stream '
  'catalog ENUMERABLE — a capture surface can list the streams rather than guess them — which is '
  'the property FR-005/AC-012a asserts, not any particular count (OD-WAY-42, OD-WAY-79). Partial '
  'index: archiving a stream team and later seeding its successor stays possible, and ordinary '
  'teams (branch_id NULL) never pay.';

select shared.seed_stream_teams();
