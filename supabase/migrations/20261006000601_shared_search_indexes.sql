-- Fewer, smaller reads (#1359): trigram index for the ⌘K people search (shared.people.full_name).
-- pg_trgm is installed by 20261006000600_mos_search_indexes.sql.
--
-- DOWN (manual):
--   drop index shared.people_full_name_trgm_idx;

create index if not exists people_full_name_trgm_idx on shared.people using gin (full_name gin_trgm_ops);