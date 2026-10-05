-- Support the existing org-scoped lists' timestamp/id continuation windows.
create index kitchen_logs_review_page_idx on ops.kitchen_logs
  (org_id, log_date, created_at desc, id desc) where status = 'Submitted';
create index kitchen_logs_review_stream_page_idx on ops.kitchen_logs
  (org_id, log_date, branch_id, activity, created_at desc, id desc) where status = 'Submitted';
create index kitchen_logs_actuals_page_idx on ops.kitchen_logs
  (org_id, log_date, branch_id, activity, id desc) where status <> 'Rejected';
create index signals_read_page_idx on mos.signals (org_id, occurred_at desc, id desc);

-- Down:
-- drop index if exists ops.kitchen_logs_review_page_idx;
-- drop index if exists ops.kitchen_logs_review_stream_page_idx;
-- drop index if exists ops.kitchen_logs_actuals_page_idx;
-- drop index if exists mos.signals_read_page_idx;
