-- Money read means holding manager (#797, OD-WAY-98 (1)).
-- The two reporting read models drop their `admin` arm: revenue is finance · manager · scoped
-- supervisor, margin is finance · manager. `admin` is the users-and-settings role and keeps every
-- write it has (supervisor_revenue_scope, the provisioning RPCs, team memberships) — none of those
-- policies are touched here. mos-app/src/lib/capabilities.ts states the same two lists and a
-- fixture there reads THIS file to pin them equal.
--
-- DOWN (recreates both SELECT policies VERBATIM from 20260805000015_reporting_access_control.sql):
--   drop policy if exists sales_daily_revenue_select on reporting.sales_daily_revenue;
--   create policy sales_daily_revenue_select on reporting.sales_daily_revenue
--     for select to authenticated
--     using (
--       org_id = shared.current_org_id()
--       and (
--         shared.has_access_role('finance')
--         or shared.has_access_role('admin')
--         or shared.has_access_role('manager')
--         or (
--           shared.has_access_role('supervisor')
--           and exists (
--             select 1 from reporting.supervisor_revenue_scope s
--             where s.person_id = shared.current_person_id()
--               and s.org_id    = shared.current_org_id()
--               and s.channel   = sales_daily_revenue.channel
--               and (s.branch_code is null or s.branch_code = sales_daily_revenue.branch_code)
--           )
--         )
--       )
--     );
--   comment on policy sales_daily_revenue_select on reporting.sales_daily_revenue is
--     'Same-org SELECT for finance, admin and manager (all rows) and for supervisor (only rows matching '
--     'one of their own scope grants). A supervisor with no scope row reads nothing — the EXISTS is '
--     'false, so the tier fails closed by construction rather than by a separate check.';
--   drop policy if exists sales_margin_daily_select on reporting.sales_margin_daily;
--   create policy sales_margin_daily_select on reporting.sales_margin_daily
--     for select to authenticated
--     using (
--       org_id = shared.current_org_id()
--       and (
--         shared.has_access_role('finance')
--         or shared.has_access_role('admin')
--         or shared.has_access_role('manager')
--       )
--     );
--   comment on policy sales_margin_daily_select on reporting.sales_margin_daily is
--     'Same-org SELECT for finance, admin and manager. Supervisor is deliberately absent: that tier is '
--     'revenue-only, and margin exposes COGS.';

-- The supervisor arm is unchanged: the correlated EXISTS runs under the caller's own RLS on
-- reporting.supervisor_revenue_scope, which is what keeps it self-scoped (see the baseline policy
-- comment). Restated whole because CREATE POLICY has no "remove one arm".
drop policy if exists sales_daily_revenue_select on reporting.sales_daily_revenue;
create policy sales_daily_revenue_select on reporting.sales_daily_revenue
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
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
  'Same-org SELECT for finance and manager (all rows) and for supervisor (only rows matching one of '
  'their own scope grants). admin is NOT an arm: it is the users-and-settings role, and a person who '
  'administers logins reads revenue only by also holding manager or finance. A supervisor with no '
  'scope row reads nothing — the EXISTS is false, so the tier fails closed by construction.';

drop policy if exists sales_margin_daily_select on reporting.sales_margin_daily;
create policy sales_margin_daily_select on reporting.sales_margin_daily
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('manager')
    )
  );
comment on policy sales_margin_daily_select on reporting.sales_margin_daily is
  'Same-org SELECT for finance and manager. admin is not an arm (users-and-settings role, no money '
  'read of its own). Supervisor is deliberately absent: that tier is revenue-only, and margin '
  'exposes COGS.';
