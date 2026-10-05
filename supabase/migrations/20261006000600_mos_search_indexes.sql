-- Fewer, smaller reads (#1359): pg_trgm GIN indexes serve the ⌘K palette's leading-wildcard
-- ilike searches, plus the two org-scoped list paths the app reads most (follow-ups by due
-- date; the default Signal feed). RLS remains the read authority; org_id leads every list
-- index so the org seam governs the scan.
--
-- DOWN (manual):
--   drop index mos.signals_feed_idx;
--   drop index mos.follow_ups_org_due_date_idx;
--   drop index mos.objectives_name_trgm_idx;
--   drop index mos.work_lines_name_trgm_idx;
--   drop index mos.tasks_title_trgm_idx;
--   drop index mos.follow_ups_counterparty_trgm_idx;
--   drop index mos.signals_body_trgm_idx;
-- pg_trgm may pre-exist and may serve other indexes, so rollback leaves the extension installed.

create extension if not exists pg_trgm;

create index if not exists signals_body_trgm_idx on mos.signals using gin (body gin_trgm_ops);
create index if not exists follow_ups_counterparty_trgm_idx on mos.follow_ups using gin (counterparty gin_trgm_ops);
create index if not exists tasks_title_trgm_idx on mos.tasks using gin (title gin_trgm_ops);
create index if not exists work_lines_name_trgm_idx on mos.work_lines using gin (name gin_trgm_ops);
create index if not exists objectives_name_trgm_idx on mos.objectives using gin (name gin_trgm_ops);
create index if not exists follow_ups_org_due_date_idx on mos.follow_ups (org_id, due_date);
-- The default Signal feed: RLS resolves org, the query hides tombstones and pages newest-first
-- (listReadableSignals: is retracted_at null, order occurred_at desc).
create index if not exists signals_feed_idx on mos.signals (org_id, occurred_at desc) where retracted_at is null;