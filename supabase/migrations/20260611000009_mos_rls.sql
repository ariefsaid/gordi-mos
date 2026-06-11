-- P2-1 — mos RLS (ADR-0004). RLS is the authority for the PostgREST-exposed mos schema.
-- Base privileges: SELECT/INSERT/UPDATE to authenticated on all three tables. NO DELETE grant
-- anywhere (NFR-002, FR-053): hard delete is structurally impossible for the app tier.
grant select, insert, update on mos.tasks                to authenticated;
grant select, insert, update on mos.task_checklist_items to authenticated;
grant select, insert          on mos.task_events          to authenticated; -- append-only: no UPDATE (audit L1, immutability privilege-enforced)

-- can_edit_task(task_id): the edit predicate (R OR A OR mgr-of-R OR mgr-of-A), org-scoped.
-- Reused by the tasks UPDATE policy and the child-table write policies (D3).
create or replace function mos.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from mos.tasks t
    where t.id = p_task_id
      and t.org_id = shared.current_org_id()
      and (
        t.responsible_person_id = shared.current_person_id()
        or t.accountable_person_id = shared.current_person_id()
        or shared.is_manager_of(t.responsible_person_id)
        or shared.is_manager_of(t.accountable_person_id)
      )
  )
$$;
comment on function mos.can_edit_task(uuid) is 'Edit gate: current person is R/A/mgr-of-(R or A) for the task (OD-P2-3, FR-050).';

-- Archive gate (ADR-0004 D2): archived_at may change ONLY when the actor is A or mgr-of-(R or A) —
-- narrower than the general edit gate (which also allows a non-A Responsible). Covers archive
-- (NULL->ts) and unarchive (ts->NULL) symmetrically. Raises 42501 (insufficient_privilege).
create or replace function mos._guard_archive()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at then
    if not (
      old.accountable_person_id = shared.current_person_id()
      or shared.is_manager_of(old.responsible_person_id)
      or shared.is_manager_of(old.accountable_person_id)
    ) then
      raise exception 'archive requires Accountable or a manager' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_guard_archive
  before update on mos.tasks
  for each row execute function mos._guard_archive();

----------------------------------------------------------------------
-- mos.tasks: org-readable (FR-020/021); insert any org member (FR-006); update gated by
-- can_edit_task (FR-050). archived_at column further gated by the _guard_archive trigger.
----------------------------------------------------------------------
alter table mos.tasks enable row level security;
alter table mos.tasks force  row level security;

-- SELECT: org-readable (cross-unit visibility is the product, OD-P1-3).
create policy tasks_select_org on mos.tasks
  for select to authenticated
  using (org_id = shared.current_org_id());

-- INSERT: any org member; org_id defaulted + checked unspoofable; R and A must be set (NOT NULL backs it).
create policy tasks_insert_member on mos.tasks
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.is_org_member()
  );

-- UPDATE: R/A/mgr-of-(R or A). USING gates which rows are visible-for-update; WITH CHECK keeps the
-- row in-org and still-editable after the change. archived_at column is further gated by the trigger.
create policy tasks_update_editor on mos.tasks
  for update to authenticated
  using (mos.can_edit_task(id))
  with check (org_id = shared.current_org_id() and mos.can_edit_task(id));

-- NO delete policy (FR-053): hard delete denied to authenticated; service_role bypasses RLS.

----------------------------------------------------------------------
-- task_checklist_items: read org-scoped; insert/update gated to who-can-edit-the-task (D3, D4).
----------------------------------------------------------------------
alter table mos.task_checklist_items enable row level security;
alter table mos.task_checklist_items force  row level security;
create policy task_checklist_select_org on mos.task_checklist_items
  for select to authenticated using (org_id = shared.current_org_id());
create policy task_checklist_insert_editor on mos.task_checklist_items
  for insert to authenticated
  with check (org_id = shared.current_org_id() and mos.can_edit_task(task_id));
create policy task_checklist_update_editor on mos.task_checklist_items
  for update to authenticated
  using (mos.can_edit_task(task_id))
  with check (org_id = shared.current_org_id() and mos.can_edit_task(task_id));

----------------------------------------------------------------------
-- task_events: read org-scoped; insert gated to editors (so only authorized writes advance activity).
-- No update/delete policy: events are append-only (immutable audit).
----------------------------------------------------------------------
alter table mos.task_events enable row level security;
alter table mos.task_events force  row level security;
create policy task_events_select_org on mos.task_events
  for select to authenticated using (org_id = shared.current_org_id());
create policy task_events_insert_editor on mos.task_events
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and actor_person_id = shared.current_person_id()
    and mos.can_edit_task(task_id)
  );
