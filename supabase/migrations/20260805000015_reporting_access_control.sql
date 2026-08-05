-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — `reporting`, 2 of 2: grants, RLS posture and the visibility tiers (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Who may read money, and by what mechanism. THE DATABASE IS THE BOUNDARY: a route guard decides
-- what a person is offered, a policy decides what they can fetch, and only the second one is a
-- control. Every tier below is enforced in a USING clause that PostgREST cannot be talked out of.
--
-- ⚠ PORTED, NOT REDESIGNED. The six-role model and the two financial tiers are shipped and
-- owner-locked (ADR-0050 manager, ADR-0051 supervisor, confirmed by OD-WAY-18). This file
-- re-authors their policies against the squashed tables; it does not re-decide who sees what.
--
--   finance     everything in the schema
--   admin       everything in the schema
--   manager     revenue + margin, company-wide, read-only          (ADR-0050)
--   supervisor  revenue ONLY, and only within an explicitly granted (channel, branch) scope
--               (ADR-0051) — no margin, no COGS, nothing else
--   ops_lead    nothing here
--   member      nothing here
--
-- ── A NEW POLICY IS A NEW POLICY ─────────────────────────────────────────────────────────────
-- These are re-authored from four migrations that each amended the last with ALTER POLICY. A
-- re-authored policy inherits none of the original's proof, so every one of the eleven below has its
-- own negative assertion in this ticket's suites — for each, a session that must read nothing and
-- does. The inherited suites' green was evidence about statements that no longer exist.
--
-- ── Policy names say what the policy does ────────────────────────────────────────────────────
-- The incumbent names were `*_select_finance_admin`, kept unchanged through two widenings "for
-- DOWN-chain stability" until they named a set two roles smaller than the one they admitted. A
-- squashed baseline has no DOWN chain to keep stable and no reason to carry a name that misleads, so
-- they are simply `*_select`. Same defect class as the two rationale corrections in ...0014.
--
-- ── The snapshot writer ──────────────────────────────────────────────────────────────────────
-- `reporting_writer` is a server-only credential for the warehouse-to-Supabase snapshot job. It is
-- not an app role: no end-user session can assume it, PostgREST never authenticates as it, and it is
-- created without a password so nothing can connect as it until an operator sets one per
-- environment. Its policy is FOR ALL rather than INSERT+UPDATE, and that is required rather than
-- lazy: the job upserts, and `ON CONFLICT DO UPDATE` applies the SELECT policies of the row it
-- conflicts with, so a write-only policy set would make every upsert after the first fail.
--
-- ⚠ ONE INHERITED COMMENT WAS WRONG AND IS NOT CARRIED. The incumbent policy comments described this
-- role as having "NO SELECT grant on these tables (write-only)" while the very migrations carrying
-- that sentence granted it SELECT and gave it a FOR ALL policy. What actually bounds this role is
-- custody of a server-only credential, and that is what the comments below say. A comment crediting
-- a control that is not there is how the next reader removes the one that is.
--
-- DOWN: drop policy supervisor_revenue_scope_delete_admin on reporting.supervisor_revenue_scope;
--       drop policy supervisor_revenue_scope_insert_admin on reporting.supervisor_revenue_scope;
--       drop policy supervisor_revenue_scope_select       on reporting.supervisor_revenue_scope;
--       drop policy bom_lines_write_reporting_writer            on reporting.bom_lines;
--       drop policy bom_lines_select                            on reporting.bom_lines;
--       drop policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines;
--       drop policy ingredient_cost_lines_select                 on reporting.ingredient_cost_lines;
--       drop policy sales_margin_daily_write_reporting_writer    on reporting.sales_margin_daily;
--       drop policy sales_margin_daily_select                    on reporting.sales_margin_daily;
--       drop policy sales_daily_revenue_write_reporting_writer   on reporting.sales_daily_revenue;
--       drop policy sales_daily_revenue_select                   on reporting.sales_daily_revenue;
--       revoke all on all tables in schema reporting from reporting_writer, authenticated, service_role;
--       revoke usage on schema reporting from reporting_writer;
--       drop role if exists reporting_writer;  -- cluster-wide: only if no other database uses it

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The snapshot-writer role
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Roles are cluster-wide, so this is guarded rather than plain — a second database on the same
-- cluster may already have created it. Created WITHOUT a password on purpose: on a fresh local or CI
-- database the role exists and nothing can connect as it, which keeps `supabase db reset` and pgTAP
-- green without a credential ever being written into migration history.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'reporting_writer') then
    create role reporting_writer login nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end
$$;
-- No `comment on role`: commenting on a cluster-wide role needs privileges the migration runner is
-- not guaranteed to hold on every environment, and a migration that fails on a comment is a bad
-- trade for a string nobody reads. What the role is for is recorded here instead.
grant usage on schema reporting to reporting_writer;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Base privileges
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `authenticated` gets SELECT and nothing else on the four snapshot tables. That is the first gate
-- and it denies before any policy is consulted: there is no INSERT/UPDATE/DELETE grant to write a
-- financial figure through, so no policy has to be trusted to refuse one. RLS then decides which
-- rows the SELECT returns.
grant select on reporting.sales_daily_revenue    to authenticated;
grant select on reporting.sales_margin_daily     to authenticated;
grant select on reporting.ingredient_cost_lines  to authenticated;
grant select on reporting.bom_lines              to authenticated;

grant select, insert, update, delete on reporting.sales_daily_revenue   to service_role;
grant select, insert, update, delete on reporting.sales_margin_daily    to service_role;
grant select, insert, update, delete on reporting.ingredient_cost_lines to service_role;
grant select, insert, update, delete on reporting.bom_lines             to service_role;

-- The scope table is different in kind: it is admin-maintained app data, not a snapshot. SELECT,
-- INSERT and DELETE, but deliberately NO UPDATE — a grant is added or removed, never edited. An
-- edited grant would silently re-point somebody's visibility with no row to show for it.
grant select, insert, delete on reporting.supervisor_revenue_scope to authenticated;
grant select, insert, update, delete on reporting.supervisor_revenue_scope to service_role;

-- The snapshot job's reach: the four fed tables, and nothing else in the schema. It has no privilege
-- of any kind on supervisor_revenue_scope — the grant surface is who may hold financial visibility,
-- which is not a thing a warehouse feed has any business touching.
grant select, insert, update on reporting.sales_daily_revenue    to reporting_writer;
grant select, insert, update on reporting.sales_margin_daily     to reporting_writer;
grant select, insert, update on reporting.ingredient_cost_lines  to reporting_writer;
grant select, insert, update on reporting.bom_lines              to reporting_writer;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. RLS posture
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ENABLE plus FORCE on every table. What FORCE adds is narrow and worth stating accurately: it makes
-- policies apply to the TABLE OWNER too. It is not what stops `postgres` or `service_role` — those
-- carry BYPASSRLS and are outside RLS entirely, by design, because the snapshot job and the
-- migration runner have to be. FORCE is here so that a future owner-privileged path inside the
-- database does not quietly read every org's money.
alter table reporting.sales_daily_revenue      enable row level security;
alter table reporting.sales_daily_revenue      force  row level security;
alter table reporting.sales_margin_daily       enable row level security;
alter table reporting.sales_margin_daily       force  row level security;
alter table reporting.ingredient_cost_lines    enable row level security;
alter table reporting.ingredient_cost_lines    force  row level security;
alter table reporting.bom_lines                enable row level security;
alter table reporting.bom_lines                force  row level security;
alter table reporting.supervisor_revenue_scope enable row level security;
alter table reporting.supervisor_revenue_scope force  row level security;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Revenue — finance, admin, manager, and the scoped supervisor arm
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The org seam comes first in every policy in this file and is never optional: shared.current_org_id()
-- reads an unspoofable JWT claim and returns NULL when there is no session, so a claimless request
-- matches nothing rather than everything.
--
-- The supervisor arm is a correlated EXISTS over the scope table, and the thing that makes it safe is
-- easy to mis-credit: it is not the EXISTS, it is that the subquery runs under the CALLER'S OWN RLS
-- on reporting.supervisor_revenue_scope. That table's SELECT policy lets a person see only their own
-- rows, so a supervisor cannot widen their reach by referring to someone else's grant. Weaken that
-- policy and this one widens with it — they are one control in two places.
--
-- branch_code NULL on a scope row means the whole channel. The match is on the ERP's branch_code
-- text, not on the new branch_id link, deliberately: mapping is a labelling step that a human has
-- not finished, and a grant must not evaporate because nobody has mapped its branch yet.
create policy sales_daily_revenue_select on reporting.sales_daily_revenue
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
      or shared.has_access_role('manager')
      or (
        shared.has_access_role('supervisor')
        and exists (
          select 1 from reporting.supervisor_revenue_scope s
          where s.person_id = shared.current_person_id()
            and s.org_id    = shared.current_org_id()
            and s.channel   = sales_daily_revenue.channel
            and (s.branch_code is null or s.branch_code = sales_daily_revenue.branch_code)
        )
      )
    )
  );
comment on policy sales_daily_revenue_select on reporting.sales_daily_revenue is
  'Same-org SELECT for finance, admin and manager (all rows) and for supervisor (only rows matching '
  'one of their own scope grants). A supervisor with no scope row reads nothing — the EXISTS is '
  'false, so the tier fails closed by construction rather than by a separate check.';

create policy sales_daily_revenue_write_reporting_writer on reporting.sales_daily_revenue
  for all to reporting_writer
  using (true) with check (true);
comment on policy sales_daily_revenue_write_reporting_writer on reporting.sales_daily_revenue is
  'The snapshot job''s upsert path. FOR ALL because ON CONFLICT DO UPDATE consults SELECT policies on '
  'the conflicting row. A null or non-existent org_id is already refused by the column''s NOT NULL and '
  'its foreign key, so the WITH CHECK does not restate them. This role is bounded by credential '
  'custody — it is server-only and no end-user session can assume it.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Margin — finance, admin, manager. Supervisor is excluded, and that is the design.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ADR-0051 grants the supervisor tier REVENUE only. Margin carries COGS, and COGS is company-wide
-- cost data that a branch-scoped supervisor has no grant to see — there is no scoped arm here to
-- forget to add.
create policy sales_margin_daily_select on reporting.sales_margin_daily
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
      or shared.has_access_role('manager')
    )
  );
comment on policy sales_margin_daily_select on reporting.sales_margin_daily is
  'Same-org SELECT for finance, admin and manager. Supervisor is deliberately absent: that tier is '
  'revenue-only, and margin exposes COGS.';

create policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily
  for all to reporting_writer
  using (true) with check (true);
comment on policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily is
  'The snapshot job''s upsert path; see sales_daily_revenue_write_reporting_writer for why FOR ALL.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Plan COGS reference data — finance and admin
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Narrower than revenue on purpose: an ingredient cost and a recipe are cost data, and neither
-- financial tier was granted cost. Broadening these to the Plan surface's eventual consumers is a
-- capability question (can('cogs.read')) that ADR-0020's unbuilt half owns, not a policy to widen here.
create policy ingredient_cost_lines_select on reporting.ingredient_cost_lines
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );
comment on policy ingredient_cost_lines_select on reporting.ingredient_cost_lines is
  'Same-org SELECT for finance and admin. Note mos.capture_budget reads this table as SECURITY '
  'DEFINER and is gated by can(''cogs.write'') instead — the RPC does not depend on this policy, so '
  'widening it would not widen budget capture and narrowing it would not close it.';

create policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines
  for all to reporting_writer
  using (true) with check (true);
comment on policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines is
  'The snapshot job''s upsert path; see sales_daily_revenue_write_reporting_writer for why FOR ALL.';

create policy bom_lines_select on reporting.bom_lines
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );
comment on policy bom_lines_select on reporting.bom_lines is
  'Same-org SELECT for finance and admin — the recipe half of the same reference-data gate as ingredient_cost_lines.';

create policy bom_lines_write_reporting_writer on reporting.bom_lines
  for all to reporting_writer
  using (true) with check (true);
comment on policy bom_lines_write_reporting_writer on reporting.bom_lines is
  'The snapshot job''s upsert path; see sales_daily_revenue_write_reporting_writer for why FOR ALL.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. The scope table — admin maintains it, a supervisor reads only their own row
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The self-read arm is not a convenience. Without it the revenue policy's correlated EXISTS returns
-- nothing for the very person it is supposed to authorise, and the supervisor tier reads zero rows
-- for everyone — fail-closed, but for the wrong reason and impossible to diagnose from the surface.
create policy supervisor_revenue_scope_select on reporting.supervisor_revenue_scope
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('admin') or person_id = shared.current_person_id())
  );
comment on policy supervisor_revenue_scope_select on reporting.supervisor_revenue_scope is
  'Admin reads every grant in their org (the scope editor); everyone else reads only grants naming '
  'themselves. The self-read arm is what lets sales_daily_revenue_select''s EXISTS resolve for the '
  'supervisor doing the querying — the two policies are one control.';

-- INSERT is where the org seam is actually held. The column default stamps org_id from the session,
-- but a default is only a default: a client can send an org_id and override it. What refuses a
-- foreign org is this WITH CHECK.
create policy supervisor_revenue_scope_insert_admin on reporting.supervisor_revenue_scope
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));
comment on policy supervisor_revenue_scope_insert_admin on reporting.supervisor_revenue_scope is
  'Admin-only, own-org grants. The WITH CHECK — not the column default — is what refuses a foreign '
  'org_id, because a default is overridable by the client. The BEFORE trigger separately refuses a '
  'target person from another org, which the WITH CHECK cannot see.';

create policy supervisor_revenue_scope_delete_admin on reporting.supervisor_revenue_scope
  for delete to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'));
comment on policy supervisor_revenue_scope_delete_admin on reporting.supervisor_revenue_scope is
  'Admin-only revocation, own org. A non-admin''s DELETE is filtered to zero rows rather than raising '
  '— it succeeds and changes nothing, which is what a USING clause does.';

-- No UPDATE policy anywhere in this schema, and no UPDATE grant to `authenticated` on the scope
-- table either. Belt and braces on purpose: the privilege is the control, the missing policy is the
-- proof that nothing was left half-granted.
