-- P2-3 — ops.log_entries RLS (ADR-0006). RLS is the authority for the PostgREST-exposed ops schema.
-- SELECT/INSERT/UPDATE to authenticated; NO DELETE grant (NFR-004): hard delete is impossible for app tier.
grant select, insert, update on ops.log_entries to authenticated;

-- Edit gate: author OR manager-of-author, org-scoped. SECURITY INVOKER (no DEFINER to revoke; lint clean).
create or replace function ops.can_edit_log_entry(p_entry_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from ops.log_entries e
    where e.id = p_entry_id
      and e.org_id = shared.current_org_id()
      and (
        e.created_by = shared.current_person_id()
        or shared.is_manager_of(e.created_by)
      )
  )
$$;
comment on function ops.can_edit_log_entry(uuid) is
  'Edit/archive gate: current person is the author or a manager of the author (OD-P2-19, FR-021/022).';

alter table ops.log_entries enable row level security;
alter table ops.log_entries force  row level security;

-- SELECT: org-readable floor visibility (OD-P1-3, FR-010). Archived rows hidden by query predicate, not RLS.
create policy log_entries_select_org on ops.log_entries
  for select to authenticated
  using (org_id = shared.current_org_id());

-- INSERT: any org member; org_id + created_by defaulted, org_id checked unspoofable, created_by pinned.
create policy log_entries_insert_member on ops.log_entries
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.is_org_member()
    and created_by = shared.current_person_id()
  );

-- UPDATE: author-or-manager gate covers edit AND archive (same gate, no guard trigger — OD-P2-19).
create policy log_entries_update_editor on ops.log_entries
  for update to authenticated
  using (ops.can_edit_log_entry(id))
  with check (org_id = shared.current_org_id() and ops.can_edit_log_entry(id));

-- NO delete policy (NFR-004): hard delete denied to authenticated; service_role bypasses RLS.

-- DOWN: drop policy log_entries_update_editor on ops.log_entries;
--       drop policy log_entries_insert_member on ops.log_entries;
--       drop policy log_entries_select_org on ops.log_entries;
--       drop function ops.can_edit_log_entry(uuid);
