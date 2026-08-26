-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The role tiers under each lead — Jabatan for the people who run a shift
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The role tree stopped at "one org lead plus one lead per unit". There was no Position for a
-- Barista, a Kitchen Supervisor or a Roaster — the people the Café surfaces are actually built for
-- — and therefore no manager chain below a lead for `shared.is_manager_of` to walk.
--
-- WHY A MIGRATION AND NOT JUST THE SEED. `shared.roles` is CATALOG, not fixture: these are
-- positions the org has, the same way branches and stream teams are. The applied-path check (#393)
-- compares a fresh database against a DEPLOYED one carried forward by migrations, and it caught
-- exactly this — adding the tiers to `supabase/seed.sql` alone left every already-deployed database
-- permanently at the seven original roles, because a deployed database never re-runs the seed.
--
-- Same dual-seed shape as the branch catalog and `shared.seed_stream_teams()`: the LIST lives in
-- one place — this function — which the migration calls for every org that exists now, and which
-- `supabase/seed.sql` calls again for the org a fresh `db reset` creates after migrations have run.
-- Do not copy the list back into the seed; that is the drift this shape exists to prevent.
--
-- ⚠️ THIS REACHES PRODUCTION, AND THE ASK WAS SCOPED "LOCALLY".
-- The owner asked to "update the seed users LOCALLY". This function runs `for o in select id from
-- shared.orgs`, so on deploy every org — staging and production included — gains twelve Position
-- names coined for a dev fixture: Bar Supervisor, Head Barista, Barista, Kitchen Supervisor,
-- Kitchen Staff, Ecommerce Lead, Ecommerce Associate, Roaster, Account Executive, Marketing Lead,
-- People Lead, Finance Associate. Real staff will see them in the Jabatan picker.
--
-- The MECHANISM is forced — `shared.roles` is a CATALOG table under the applied-path fingerprint
-- (RLS on, no write policy, no write grant), so a seed-only list makes a migrated database differ
-- from a fresh one and CI goes red. The DECISION is not forced, and is not the Director's to make:
-- these are either Gordi's real positions or they are not. Recorded as DD-WAY-41; if the answer is
-- "not ours", the fix is to narrow the function to the dev org rather than to move the list back
-- into the seed.
--
-- Second-order, disclosed here because nothing else says it: granting insert/update on
-- `shared.team_memberships` (20260826000001) takes THAT table out of the same fingerprint, so the
-- 46 seeded membership rows stop being compared across the applied path. The check's fact count
-- still rose — the two new policies and this function more than replace what was lost — so a
-- rising number is not evidence that coverage grew.
--
-- Reversal:
--   delete from shared.roles r where r.name in (
--     'Bar Supervisor','Head Barista','Barista','Kitchen Supervisor','Kitchen Staff',
--     'Ecommerce Lead','Ecommerce Associate','Roaster','Account Executive',
--     'Marketing Lead','People Lead','Finance Associate');
--   drop function shared.seed_role_tiers();
--   (person_roles rows referencing them are removed by the FK's on delete cascade.)

create or replace function shared.seed_role_tiers()
returns void
language plpgsql
set search_path = ''
as $$
declare
  o record;
  r record;
begin
  for o in select id as org_id from shared.orgs loop
    -- ONE ROW AT A TIME, IN ORDER. Each tier reports to the one above it by NAME, so Head Barista
    -- cannot resolve its parent until Bar Supervisor exists. A single set-based INSERT would
    -- resolve every parent against the pre-INSERT snapshot and silently leave the deeper tiers
    -- with a NULL reporting line — which reads as "reports to nobody" and quietly breaks the
    -- manager chain rather than failing.
    for r in
      select * from (values
        (1,  'Bar Supervisor',      'retail_ops', 'Cafe Ops Lead'),
        (2,  'Head Barista',        'retail_ops', 'Bar Supervisor'),
        (3,  'Barista',             'retail_ops', 'Head Barista'),
        (4,  'Kitchen Supervisor',  'retail_ops', 'Kitchen Lead'),
        (5,  'Kitchen Staff',       'retail_ops', 'Kitchen Supervisor'),
        (6,  'Ecommerce Lead',      'retail_ops', 'Managing Director'),
        (7,  'Ecommerce Associate', 'retail_ops', 'Ecommerce Lead'),
        (8,  'Roaster',             'b2b_ops',    'Roastery Lead'),
        (9,  'Account Executive',   'b2b_sales',  'Sales Lead'),
        (10, 'Marketing Lead',      'marketing',  'Managing Director'),
        (11, 'People Lead',         'hr',         'Managing Director'),
        (12, 'Finance Associate',   'finance',    'Finance Lead')
      ) as t(ord, role_name, bu_code, parent_name)
      order by ord
    loop
      -- The parent join is an INNER join on purpose: an org without the lead this tier hangs from
      -- gets no row rather than an orphan. That is the whole population of the pgTAP fixture orgs
      -- and any future tenant seeded differently, and a Position with no reporting line is worse
      -- than a Position that is absent — `is_manager_of` would walk it and find nothing.
      insert into shared.roles (org_id, business_unit_id, name, reports_to_role_id)
      select o.org_id, bu.id, r.role_name, parent.id
      from shared.business_units bu
      join shared.roles parent
        on parent.org_id = o.org_id and parent.name = r.parent_name
      where bu.org_id = o.org_id and bu.code = r.bu_code and bu.archived_at is null
      on conflict (org_id, name) do nothing;
    end loop;
  end loop;
end;
$$;

comment on function shared.seed_role_tiers() is
  'Seeds the Jabatan tiers below each unit lead (Barista, Kitchen Staff, Roaster, ...) for every '
  'org, idempotently on (org_id, name). The ONE home for that list: called by its own migration '
  'for orgs existing at migration time, and by supabase/seed.sql for the org a fresh db reset '
  'creates afterwards. Inserts in dependency order so each tier resolves its parent by name.';

-- Not an app RPC. `shared` is PostgREST-exposed, so without this the function is reachable at
-- /rest/v1/rpc/seed_role_tiers by anon and authenticated. Nothing can be written through it today —
-- neither role holds INSERT on shared.roles — but that is exactly one layer of depth, and it is the
-- layer the codebase already plans to move (shared.role_capabilities' own comment: per-org role
-- management "lands with the admin-editable-roles slice"). seed_stream_teams(), whose shape this
-- copies, carries the same revoke; this file dropped the line while copying.
revoke execute on function shared.seed_role_tiers() from public, anon, authenticated;

select shared.seed_role_tiers();
