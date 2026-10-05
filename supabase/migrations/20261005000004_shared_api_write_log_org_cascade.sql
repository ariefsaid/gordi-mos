-- An API write log follows the lifetime of its organization (#1155).
--
-- DOWN (manual):
--   alter table shared.api_write_log drop constraint api_write_log_org_id_fkey,
--     add constraint api_write_log_org_id_fkey
--       foreign key (org_id) references shared.orgs(id);

alter table shared.api_write_log
  drop constraint api_write_log_org_id_fkey,
  add constraint api_write_log_org_id_fkey
    foreign key (org_id) references shared.orgs(id) on delete cascade;
