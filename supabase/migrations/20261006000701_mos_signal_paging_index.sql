-- Support the existing org-scoped Signal continuation window.
create index signals_read_page_idx on mos.signals (org_id, occurred_at desc, id desc);

-- Down:
-- drop index if exists mos.signals_read_page_idx;
