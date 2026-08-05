-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Bar capture 1/8 — the stream substrate: a Team IS a (branch, activity) (#231, FR-001..005).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- First ADDITIVE migration on the squashed baseline (OD-WAY-35). The bar-capture spec's ruling
-- (OD-WAY-49) is that where a Team represents a production stream, that fact lives ON the Team —
-- a branch link plus an activity, both set — never as a new stream table and never as a separate
-- person<->stream assignment. One entity then carries three jobs at once: the enumerable six-stream
-- catalog (FR-005, OD-WAY-42), the default-stream resolution from a person's live primary
-- membership (FR-001), and — in a later slice — the reviewer scoping (FR-040).
--
-- THE STREAM IS A DEFAULT, NEVER A WALL (OD-WAY-49/31). Nothing in this file touches an RLS
-- policy, and no member read/write predicate may ever consult these columns. The pgTAP suite
-- asserts that directly (shared_11_stream_teams).
--
-- DOWN (reversal, in order):
--   drop function shared.default_stream();
--   delete from shared.teams where branch_id is not null;   -- the six seeded stream teams per org
--   alter table shared.teams
--     drop constraint teams_branch_same_org_fkey,
--     drop constraint teams_stream_pair_check,
--     drop constraint teams_activity_check,
--     drop column activity,
--     drop column branch_id;                                 -- also drops teams_stream_unique
--   (If memberships have since attached to a stream team, re-point or end them first — the delete
--    above is restricted by shared.team_memberships' FK.)

-- ── The pair, on the Team ────────────────────────────────────────────────────────────────────
-- Nullable on purpose: most Teams are org structure and carry no stream. Both set = the team IS a
-- stream; the CHECK makes half a stream unrepresentable.
alter table shared.teams
  add column branch_id uuid,
  add column activity  text;

alter table shared.teams
  add constraint teams_activity_check
    check (activity in ('kitchen','bar')),
  add constraint teams_stream_pair_check
    check ((branch_id is null) = (activity is null)),
  -- The same-org seam, declaratively: the composite FK targets shared.branches_org_id_key, the
  -- same pattern reporting's fact rows use. A plain existence FK would accept another org's branch
  -- and need a guard; this one refuses it as a foreign key. MATCH SIMPLE (the default) makes the
  -- constraint a no-op while branch_id is NULL, which is exactly the non-stream case.
  add constraint teams_branch_same_org_fkey
    foreign key (org_id, branch_id) references shared.branches (org_id, id);

comment on column shared.teams.branch_id is
  'Branch half of the (branch, activity) production stream this Team IS, when set (FR-004, OD-WAY-49). '
  'Links to the canonical branch catalog (OD-WAY-39) inside the team''s own org (composite FK). NULL = '
  'an ordinary org-structure team. Set and null together with activity. NEVER read by a member '
  'read/write RLS predicate — the stream is a capture default, not authorization (OD-WAY-49/31).';
comment on column shared.teams.activity is
  'Activity half of the production stream — kitchen or bar, the two WIP-producing activities '
  '(OD-WAY-26). Set and null together with branch_id; both set = this Team is a stream team.';

-- One LIVE stream team per (org, branch, activity): what makes the catalog enumerable — the six
-- seeded below cannot silently become seven for one stream. Partial, so archiving a stream team
-- and later seeding its successor stays possible, and ordinary teams (branch_id NULL) never pay.
create unique index teams_stream_unique
  on shared.teams (org_id, branch_id, activity)
  where branch_id is not null and archived_at is null;
comment on index shared.teams_stream_unique is
  'At most one LIVE stream team per (org, branch, activity) — the six-stream catalog (FR-005, '
  'OD-WAY-42) is enumerable because a stream cannot have two live teams.';

-- ── Seed: the six stream teams — {GHQ, RRS, Radiant} x {kitchen, bar} (FR-005, OD-WAY-42) ────
-- Idempotent, per existing org, mirroring the branch-catalog seed pattern (…0001): the migration
-- seeds orgs that exist at migration time; supabase/seed.sql re-seeds the dev org on a fresh reset
-- (the dual-seed pattern — change one, mirror the other).
--
-- ROASTERY IS DELIBERATELY ABSENT and must stay so: it is a branch (its own books in the ERP) but
-- carries NO production stream (OD-WAY-42) — nothing WIP-producing happens under a kitchen/bar
-- activity there. Seeding a roastery stream team would put a stream on the capture surface that no
-- ERP movement can ever match.
--
-- The stream teams live under the Retail Ops BU (the cafe operation, ADR-0019), resolved by code.
-- An org without that BU (or without the branch catalog) seeds nothing here — pgTAP fixture orgs
-- are created inside rolled-back transactions and never see this loop.
do $$
declare o record;
begin
  for o in select id as org_id from shared.orgs loop
    insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
    select o.org_id, bu.id, s.team_name, s.team_code, b.id, s.activity
    from (values
      ('gordi_hq',    'kitchen', 'gordi_hq_kitchen',    'Gordi HQ Kitchen'),
      ('gordi_hq',    'bar',     'gordi_hq_bar',        'Gordi HQ Bar'),
      ('rumah_rames', 'kitchen', 'rumah_rames_kitchen', 'Rumah Rames Kitchen'),
      ('rumah_rames', 'bar',     'rumah_rames_bar',     'Rumah Rames Bar'),
      ('radiant',     'kitchen', 'radiant_kitchen',     'Radiant Kitchen'),
      ('radiant',     'bar',     'radiant_bar',         'Radiant Bar')
    ) as s(branch_code, activity, team_code, team_name)
    join shared.branches b
      on b.org_id = o.org_id and b.code = s.branch_code and b.archived_at is null
    join shared.business_units bu
      on bu.org_id = o.org_id and bu.code = 'retail_ops' and bu.archived_at is null
    on conflict (org_id, code) do nothing;
  end loop;
end $$;

-- ── Default-stream resolution (FR-001/002, AC-001) ───────────────────────────────────────────
-- The capture surface opens on the stream of the caller's LIVE PRIMARY Team membership. One row
-- when a live primary membership exists — with NULL halves when that team is not a stream team
-- (FR-002: the surface must then require an explicit choice) — and no row when there is no live
-- primary membership at all. Both empty shapes mean the same thing to the caller: no default.
--
-- SECURITY INVOKER: teams and team_memberships are org-readable under their own SELECT policies,
-- so the caller resolves their own org's rows and nothing else, exactly like the ops read helpers
-- (…0011). This function is an AFFORDANCE, not authorization — it must never appear in a policy
-- (OD-WAY-49).
create or replace function shared.default_stream()
returns table (branch_id uuid, activity text)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.branch_id, t.activity
  from shared.team_memberships m
  join shared.teams t
    on t.id = m.team_id
   and t.archived_at is null
  where m.person_id = shared.current_person_id()
    and m.org_id = shared.current_org_id()
    and m.is_primary
    and m.effective_from <= current_date
    and m.effective_to is null
$$;
comment on function shared.default_stream() is
  'Default capture stream for the caller (FR-001, AC-001): the (branch_id, activity) of their live '
  'primary Team membership. NULL halves when that team is not a stream team; no row when no live '
  'primary membership exists — either way, no default and the surface requires an explicit choice '
  '(FR-002). SECURITY INVOKER, org-scoped. An affordance only — never an RLS input (OD-WAY-49).';

grant execute on function shared.default_stream() to authenticated;
