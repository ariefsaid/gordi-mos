-- Sec-M1 hardening (docs/reviews/dev.md "Before prod"): least-privilege snapshot writer.
-- The warehouse->Supabase snapshot cron previously connected as the `postgres` superuser via the
-- pooler. `reporting.sales_daily_revenue` has FORCE ROW LEVEL SECURITY with a SELECT-only policy for
-- `authenticated`, so a scoped, non-superuser writer role needs its own INSERT/UPDATE policy — without
-- weakening the existing finance/admin SELECT policy for app roles.
--
-- The role is created here idempotently WITHOUT a password — the password is set per-environment
-- out-of-band (staging: set 2026-07-04 via a direct superuser session; cred at
-- ~/.reporting-writer-cred on the Tencent VPS — see docs/reference/warehouse-online.md). On fresh
-- local/CI databases the role exists but has no password and nothing connects as it, keeping
-- `supabase db reset` + pgTAP green (roles are cluster-wide, so guard with a DO block).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'reporting_writer') then
    create role reporting_writer login nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end
$$;

grant usage on schema reporting to reporting_writer;
grant select, insert, update on reporting.sales_daily_revenue to reporting_writer;

-- Idempotent: this SQL was applied directly to staging on 2026-07-04 (outside migration tracking),
-- so a later `supabase db push` must not fail re-running it.
drop policy if exists sales_daily_revenue_write_reporting_writer on reporting.sales_daily_revenue;
create policy sales_daily_revenue_write_reporting_writer
  on reporting.sales_daily_revenue
  for all
  to reporting_writer
  using (true)
  with check (true);

comment on policy sales_daily_revenue_write_reporting_writer on reporting.sales_daily_revenue is
  'Sec-M1: scoped snapshot-writer role bypass for FORCE RLS. Grain-narrowing happens at the app/query '
  'layer (single-org snapshot job); this role has no SELECT-policy exposure to end users.';

-- DOWN: drop policy sales_daily_revenue_write_reporting_writer on reporting.sales_daily_revenue;
--       revoke select, insert, update on reporting.sales_daily_revenue from reporting_writer;
--       revoke usage on schema reporting from reporting_writer;
--       drop role if exists reporting_writer;  -- cluster-wide; only if no other DB uses it
