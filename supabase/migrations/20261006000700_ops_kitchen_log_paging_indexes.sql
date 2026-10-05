-- Support the existing org-scoped lists' timestamp/id continuation windows.
create index kitchen_logs_review_page_idx on ops.kitchen_logs
  (org_id, log_date, created_at asc, id asc) where status = 'Submitted';
create index kitchen_logs_review_stream_page_idx on ops.kitchen_logs
  (org_id, log_date, branch_id, activity, created_at asc, id asc) where status = 'Submitted';
create index kitchen_logs_actuals_page_idx on ops.kitchen_logs
  (org_id, log_date, branch_id, activity, id desc) where status <> 'Rejected';

-- Down:
-- drop index if exists ops.kitchen_logs_review_page_idx;
-- drop index if exists ops.kitchen_logs_review_stream_page_idx;
-- drop index if exists ops.kitchen_logs_actuals_page_idx;
