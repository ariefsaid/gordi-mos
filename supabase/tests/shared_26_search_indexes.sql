begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select ok(coalesce(pg_get_indexdef(to_regclass('shared.people_full_name_trgm_idx')) like '%USING gin (full_name gin_trgm_ops)%', false),
  'palette people search is trigram-indexed (#1359)');

select * from finish();
rollback;
