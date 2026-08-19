begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select has_table('mos', 'events', 'Events is an org-scoped calendar table');
select has_column('mos', 'events', 'starts_at', 'Events keeps a start time');
select has_column('mos', 'events', 'ends_at', 'Events keeps an end time');
select col_not_null('mos', 'events', 'venue', 'venue is required');
select has_index('mos', 'events', 'events_active_month_idx', 'active month overlap index exists');
select is((select has_table_privilege('authenticated', 'mos.events', 'DELETE')), false, 'authenticated cannot delete Events');

select * from finish();
rollback;
