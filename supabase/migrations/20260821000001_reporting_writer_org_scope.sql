-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- reporting: scope the snapshot writer to ONE org per run.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The warehouse-to-Supabase snapshot job is single-org by construction: one run reads one org id
-- from its environment and stamps it on every row it writes. Until now that fact lived only in the
-- job; the database took the job's word for it. This migration makes the database hold the same
-- fact, so the org a run may write is a declared, enforced property of the session rather than an
-- assumption about the client.
--
-- HOW IT WORKS. The job announces its org once per connection:
--     select set_config('app.reporting_org', '<org uuid>', false);
-- and each writer policy then admits only rows in that org. `false` is session scope, not
-- transaction scope: the announcement is a property of the CONNECTION, which is the same unit as
-- "one run", so it survives the job's commits and cannot be lost by a statement landing in a
-- different transaction than the one that set it.
--
-- ⚠ COUPLED DEPLOY — THIS MIGRATION AND THE JOB SHIP TOGETHER, JOB FIRST.
-- `scripts/reporting_snapshot.py` must be running the version that makes the announcement BEFORE
-- this migration is applied to an environment. The job's change is backward-compatible (announcing
-- an org against the pre-migration policies is a harmless no-op), so the safe order is: deploy the
-- job, watch one scheduled run succeed, then apply this. Applied the other way round, the next
-- scheduled run's writes are refused with 42501 and the run exits non-zero. That is loud, not
-- silent — the wrapper alerts on a non-zero exit, and the snapshot upserts a trailing 60-day
-- window, so the next successful run repairs a missed one with no backfill. Loud and self-healing
-- is the trade this fail-closed design accepts in exchange for a writer that cannot wander.
--
-- WHY FAIL CLOSED. An announcement-optional policy would be decorative: anything that did not
-- announce would keep the old reach, so the enforced property would only apply to callers that had
-- volunteered for it. No announcement means no writes.
--
-- WHAT THIS IS AND IS NOT. It bounds a run to the org it declared. It is not an unspoofable claim
-- the way a JWT org claim is — a custom GUC is settable by whoever holds the session, so this
-- bounds the blast radius of one run rather than authenticating the run. The credential is still
-- server-only, still bounded by custody, and still holds no privilege on the scope table.
--
-- DOWN (fully reversible, symmetric):
--   alter policy sales_daily_revenue_write_reporting_writer   on reporting.sales_daily_revenue
--     using (true) with check (true);
--   alter policy sales_margin_daily_write_reporting_writer    on reporting.sales_margin_daily
--     using (true) with check (true);
--   alter policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines
--     using (true) with check (true);
--   alter policy bom_lines_write_reporting_writer             on reporting.bom_lines
--     using (true) with check (true);
--   drop function if exists reporting.current_writer_org();
--   -- restore the four policy comments from 20260805000015_reporting_access_control.sql
--   -- (the DOWN leaves the job's harmless announcement in place; no job rollback is required)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The declared org
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Same defensive discipline as shared._claim_uuid: absent, empty, or unparseable all resolve to
-- NULL rather than raising, so a malformed announcement is a clean deny (`org_id = null` is NULL,
-- and a WITH CHECK that is not true refuses) instead of a 22P02 surfacing from inside a policy.
-- A policy that can raise a cast error is a policy whose refusals are hard to read in a log.
create or replace function reporting.current_writer_org()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  raw text := current_setting('app.reporting_org', true);
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  return btrim(raw)::uuid;
exception
  when others then
    return null;  -- unparseable announcement -> fail closed (clean deny, never a cast error)
end;
$$;
comment on function reporting.current_writer_org() is
  'The org a snapshot run has declared for its session, via set_config(''app.reporting_org'', <uuid>, false). '
  'Absent, empty or unparseable all return NULL, which no row''s org_id can equal — so a run that has not '
  'declared an org writes nothing. Backs the four *_write_reporting_writer policies.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The four writer policies
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Both halves are scoped, and each does different work. WITH CHECK bounds the row being written.
-- USING bounds the row being written OVER: without it a run could reach an existing row outside its
-- declared org and rewrite it into scope, which the WITH CHECK alone would happily accept. The job's
-- own upserts are unaffected — org_id is part of every conflict target on these tables, so a run
-- only ever collides with rows of the org it declared.
--
-- Names and roles are unchanged (still FOR ALL, still reporting_writer alone) because neither is
-- what changed; the predicate is. Each of the four carries its own positive AND negative proof in
-- supabase/tests/reporting_07_writer_org_scope.sql — a policy re-authored without new proof is a
-- policy whose old green was about a statement that no longer exists.
alter policy sales_daily_revenue_write_reporting_writer on reporting.sales_daily_revenue
  using      (org_id = reporting.current_writer_org())
  with check (org_id = reporting.current_writer_org());
comment on policy sales_daily_revenue_write_reporting_writer on reporting.sales_daily_revenue is
  'The snapshot job''s upsert path, scoped to the org the run declared in app.reporting_org. FOR ALL '
  'because ON CONFLICT DO UPDATE consults the SELECT policies of the conflicting row. A null or '
  'non-existent org_id is already refused by the column''s NOT NULL and its foreign key, so the WITH '
  'CHECK does not restate them; what it adds is that one run writes one org. A run that declared no '
  'org writes nothing.';

alter policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily
  using      (org_id = reporting.current_writer_org())
  with check (org_id = reporting.current_writer_org());
comment on policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily is
  'The snapshot job''s upsert path, scoped to the org the run declared in app.reporting_org; see '
  'sales_daily_revenue_write_reporting_writer for why FOR ALL and why USING is scoped too.';

alter policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines
  using      (org_id = reporting.current_writer_org())
  with check (org_id = reporting.current_writer_org());
comment on policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines is
  'The snapshot job''s upsert path, scoped to the org the run declared in app.reporting_org; see '
  'sales_daily_revenue_write_reporting_writer for why FOR ALL and why USING is scoped too.';

alter policy bom_lines_write_reporting_writer on reporting.bom_lines
  using      (org_id = reporting.current_writer_org())
  with check (org_id = reporting.current_writer_org());
comment on policy bom_lines_write_reporting_writer on reporting.bom_lines is
  'The snapshot job''s upsert path, scoped to the org the run declared in app.reporting_org; see '
  'sales_daily_revenue_write_reporting_writer for why FOR ALL and why USING is scoped too.';
