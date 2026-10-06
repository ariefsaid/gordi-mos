begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(coalesce(pg_get_indexdef(to_regclass('mos.signals_body_trgm_idx')) like '%USING gin (body gin_trgm_ops)%', false),
  'palette body search is trigram-indexed (#1359)');
select ok(coalesce(pg_get_indexdef(to_regclass('mos.follow_ups_counterparty_trgm_idx')) like '%USING gin (counterparty gin_trgm_ops)%', false),
  'palette counterparty search is trigram-indexed (#1359)');
select ok(coalesce(pg_get_indexdef(to_regclass('mos.tasks_title_trgm_idx')) like '%USING gin (title gin_trgm_ops)%', false),
  'palette task-title search is trigram-indexed (#1359)');
select ok(coalesce(pg_get_indexdef(to_regclass('mos.work_lines_name_trgm_idx')) like '%USING gin (name gin_trgm_ops)%', false),
  'palette work-line search is trigram-indexed (#1359)');
select ok(coalesce(pg_get_indexdef(to_regclass('mos.objectives_name_trgm_idx')) like '%USING gin (name gin_trgm_ops)%', false),
  'palette objective search is trigram-indexed (#1359)');
select ok(coalesce(pg_get_indexdef(to_regclass('mos.follow_ups_org_due_date_idx')) like '%(org_id, due_date)%', false),
  'the follow-up list read path is (org_id, due_date)-indexed (#1359)');
select ok(coalesce(pg_get_indexdef(to_regclass('mos.signals_feed_idx')) like '%(org_id, occurred_at DESC)%', false),
  'the default signal feed is org-prefixed and newest-first (#1359)');
select ok(coalesce((select pg_get_expr(indpred, indrelid) like '%retracted_at IS NULL%'
                    from pg_index where indexrelid = to_regclass('mos.signals_feed_idx')), false),
  'the signal feed index is partial (retracted_at is null)');

select * from finish();
rollback;
