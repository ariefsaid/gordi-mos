-- Café capture affiliation gate (#744).
-- DOWN:
--   drop policy kitchen_logs_insert_member on ops.kitchen_logs;
--   drop policy log_entries_insert_member on ops.log_entries;
--   drop function shared.is_cafe_affiliated();

-- A person works Café when any current Team membership points at a production stream.
-- Branch/activity identify the stream, but never select which stream may be written.
create or replace function shared.is_cafe_affiliated()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from shared.team_memberships m
    join shared.teams t on t.id = m.team_id
    where m.org_id = shared.current_org_id()
      and m.person_id = shared.current_person_id()
      and t.org_id = m.org_id
      and t.branch_id is not null
      and t.activity is not null
      and t.archived_at is null
      and m.effective_from <= current_date
      and (m.effective_to is null or m.effective_to >= current_date)
  )
$$;
comment on function shared.is_cafe_affiliated() is
  'Café write affiliation is existence of one current membership in any production-stream Team. The stream pair is never an access boundary.';
grant execute on function shared.is_cafe_affiliated() to authenticated;

-- Reads remain org-scoped. These policies only replace the insert arms.
drop policy kitchen_logs_insert_member on ops.kitchen_logs;
create policy kitchen_logs_insert_member on ops.kitchen_logs
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and submitted_by = shared.current_person_id()
    and source = 'mos'
    and status = 'Submitted'
    and (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin'))
  );
comment on policy kitchen_logs_insert_member on ops.kitchen_logs is
  'Café production capture requires any current stream-Team membership or ops_lead/admin; stream selection remains open for help-out and submitted_by is session-pinned.';

drop policy log_entries_insert_member on ops.log_entries;
create policy log_entries_insert_member on ops.log_entries
  for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and shared.is_org_member()
    and created_by = shared.current_person_id()
    and (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin'))
  );
comment on policy log_entries_insert_member on ops.log_entries is
  'Café floor records require any current stream-Team membership or ops_lead/admin; created_by remains session-pinned.';
