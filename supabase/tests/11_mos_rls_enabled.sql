begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- RLS ENABLED on every mos business table (3 tables).
select ok(c.relrowsecurity, format('RLS enabled on mos.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='mos' and c.relname in ('tasks','task_checklist_items','task_events')
order by c.relname;

-- RLS FORCED on every mos business table (owner not exempt). The order-by lines up tasks,
-- task_checklist_items, task_events — but we only need the boolean per row, 3 asserts.
select ok(c.relforcerowsecurity, format('RLS forced on mos.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='mos' and c.relname in ('tasks','task_checklist_items','task_events')
order by c.relname;

-- AC-034 (structural arm) / NFR-002: NO DELETE grant for authenticated on any mos table.
select ok(
  not has_table_privilege('authenticated', 'mos.tasks', 'DELETE')
  and not has_table_privilege('authenticated', 'mos.task_checklist_items', 'DELETE')
  and not has_table_privilege('authenticated', 'mos.task_events', 'DELETE'),
  'AC-034: authenticated has NO DELETE privilege on any mos table (NFR-002, FR-053)'
);

select * from finish();
rollback;
