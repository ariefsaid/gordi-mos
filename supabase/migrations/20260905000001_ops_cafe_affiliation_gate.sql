-- Café capture affiliation gate (#744).
-- DOWN (in order — the two amended insert policies are replaced by the pre-gate policies
-- recreated VERBATIM from 20260805000010_ops_access_control.sql, so a rollback RESTORES
-- capture to every org member and never leaves it closed):
--   drop policy if exists kitchen_logs_insert_member on ops.kitchen_logs;
--   create policy kitchen_logs_insert_member on ops.kitchen_logs
--     for insert to authenticated
--     with check (org_id = shared.current_org_id()
--                 and submitted_by = shared.current_person_id()
--                 and source = 'mos'
--                 and status = 'Submitted');
--   comment on policy kitchen_logs_insert_member on ops.kitchen_logs is
--     'Any member logs their own line, server-attributed, always Submitted. source is pinned to mos so the app tier cannot forge imported history — which is also what keeps the conditional submitted_by constraint honest: the only rows that may omit a submitter are written by service_role at the flip (OD-WAY-38).';
--   drop policy if exists log_entries_insert_member on ops.log_entries;
--   create policy log_entries_insert_member on ops.log_entries
--     for insert to authenticated
--     with check (
--       org_id = shared.current_org_id()
--       and shared.is_org_member()
--       and created_by = shared.current_person_id());
--   comment on policy log_entries_insert_member on ops.log_entries is
--     'Any org member may add a floor record; org_id is unspoofable and created_by is pinned to the session person.';
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

-- Reads remain org-scoped. These policies only replace the insert arms. `if exists` so the
-- UP re-applies after its own DOWN (which restores the pre-gate policy of the same name) —
-- and on any base where the arm is already gone.
drop policy if exists kitchen_logs_insert_member on ops.kitchen_logs;
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

drop policy if exists log_entries_insert_member on ops.log_entries;
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
