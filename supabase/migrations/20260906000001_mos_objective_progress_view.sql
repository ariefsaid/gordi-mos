-- Home Objectives door roll-up (AC-070).
-- DOWN: drop view mos.objective_progress;
-- security_invoker keeps the existing mos.objectives and mos.tasks RLS policies authoritative.
create or replace view mos.objective_progress as
select
  o.id,
  o.org_id,
  o.name,
  count(t.id)::integer as total,
  count(t.id) filter (where t.status = 'Done')::integer as done
from mos.objectives o
left join mos.tasks t
  on t.org_id = o.org_id
 and t.archived_at is null
 and (t.objective_id = o.id or exists (
   select 1 from mos.work_lines wl
   where wl.id = t.work_line_id and wl.objective_id = o.id and wl.org_id = o.org_id
 ))
where o.archived_at is null
group by o.id, o.org_id, o.name;

alter view mos.objective_progress set (security_invoker = true);
comment on view mos.objective_progress is
  'Derived active Objective progress: linked non-archived Tasks, directly or through work_lines. security_invoker preserves base-table RLS.';
grant select on mos.objective_progress to authenticated;
