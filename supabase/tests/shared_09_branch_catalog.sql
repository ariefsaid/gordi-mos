-- shared, squashed baseline — the canonical branch catalog (OD-WAY-39).
--
-- Before this table "branch" was spelled three ways and none of them was a list. The assertions here
-- are as much about what the catalog is NOT as what it is: it is not shared.sites, its seed is not
-- the sites seed, and it does not carry an ERP code.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ── The seed, against the dev org that supabase/seed.sql creates ─────────────────────────────
-- Asserted as a set, so a row silently added or dropped fails here rather than drifting.
select set_eq($$
  select code from shared.branches
   where org_id = '10000000-0000-0000-0000-000000000001' and archived_at is null
$$, array['gordi_hq','rumah_rames','radiant','roastery'],
  'the catalog is seeded with exactly the four branches in use');

select is(
  (select name from shared.branches
    where org_id = '10000000-0000-0000-0000-000000000001' and code = 'rumah_rames'),
  'Rumah Rames',
  'Rumah Rames is in the catalog — the branch the incumbent kitchen app labels "Bungur", and the one shared.sites omits entirely');

-- "Bungur" is the incumbent's UI label for Rumah Rames, not a fifth branch. Seeding it would
-- re-create the collision the catalog exists to end.
select is(
  (select count(*)::int from shared.branches where lower(name) like '%bungur%' or code like '%bungur%'),
  0, 'Bungur is NOT a separate branch row — it is the incumbent app''s label for Rumah Rames');

-- ── A Site is not a Branch (DD-WAY-17) ───────────────────────────────────────────────────────
-- Both tables exist, both are seeded, and they differ — which is the whole point of keeping them
-- apart. If someone "simplifies" by harvesting one from the other, this fails.
select isnt(
  (select array_agg(code order by code) from shared.sites
    where org_id = '10000000-0000-0000-0000-000000000001'),
  (select array_agg(code order by code) from shared.branches
    where org_id = '10000000-0000-0000-0000-000000000001'),
  'the sites seed and the branch catalog are DIFFERENT sets — a site is org structure, a branch is whose books a movement lands in');

select cmp_ok(
  (select count(*) from shared.sites where org_id = '10000000-0000-0000-0000-000000000001'),
  '>', 0::bigint,
  'shared.sites is still built and seeded — the catalog does not replace it');

-- ── The catalog stays out of the ERP's namespace (propose-not-reject) ────────────────────────
-- The ERP's own branch_code lives on the reporting fact rows, which carry a separate nullable link
-- to this table. A code column here would be a second home for a value the fact row already owns,
-- and a hard FK on the fact table is what turns a new ERP branch into a failed nightly job.
select hasnt_column('shared','branches','esb_code',
  'the catalog carries no ERP code column — the ERP namespace stays beside the fact rows, not inside the catalog');
select hasnt_column('shared','branches','branch_code',
  'nor an ERP branch_code — `code` here is MOS''s own stable identifier');

-- ── Shape ────────────────────────────────────────────────────────────────────────────────────
select col_is_unique('shared','branches', array['org_id','code'],
  'a branch code is unique within its org');
select has_column('shared','branches','archived_at',
  'branches soft-retire rather than being deleted — historical movements reference them');

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000c1','Branch Org C','branch-org-c');
insert into shared.branches (org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000c1','c_branch','C Branch');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000c1"}';
select is((select count(*)::int from shared.branches), 1,
  'an org reads its OWN branches and no other org''s — including none of the seeded dev org''s four');

set local request.jwt.claims = '{}';
select is((select count(*)::int from shared.branches), 0,
  'a claimless session reads zero branches (fail closed)');

-- The admin maintenance screen is deferred out of cohort 1, so there is deliberately no write
-- surface yet. Asserted at the privilege layer, because a missing GRANT denies before any policy is
-- consulted — and because a standing write grant with no caller is attack surface for nothing.
reset role;
select ok(
  not has_table_privilege('authenticated','shared.branches','INSERT')
  and not has_table_privilege('authenticated','shared.branches','UPDATE')
  and not has_table_privilege('authenticated','shared.branches','DELETE'),
  'the catalog has no app write surface at all — it is seeded, and the admin mapping screen is deferred');

select * from finish();
rollback;
