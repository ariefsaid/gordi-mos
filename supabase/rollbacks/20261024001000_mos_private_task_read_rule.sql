-- DOWN for 20261024001000. Run 20261024001100 and 20261024001200 rollbacks first. Refuses while
-- any Task is private, because dropping the column would silently publish it org-wide.
begin;
do $$
begin
  if exists (select 1 from mos.tasks where is_private) then
    raise exception 'Rollback refused: make every private Task public (or archive the data) first';
  end if;
end $$;
drop table mos.task_viewers;
drop function mos._guard_task_viewers();
drop function mos.can_change_task_privacy(uuid);
drop function mos.can_read_task(uuid);
drop function mos.can_person_read_task(uuid, uuid, boolean);
alter table mos.tasks drop column is_private;
commit;
