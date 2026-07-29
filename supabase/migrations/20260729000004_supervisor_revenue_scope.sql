-- Per-person, per-branch revenue-scope substrate for the `supervisor` tier (ADR-0051 D2/D3/D6).
-- reporting.supervisor_revenue_scope: one row per (person, channel, branch_code); branch_code NULL =
-- whole channel. Admin-only writes (mirror shared.person_roles admin RLS, ADR-0050 D5); supervisor may
-- read OWN rows so the revenue policy's correlated EXISTS resolves under RLS. Margin policy UNCHANGED.

create table reporting.supervisor_revenue_scope (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  channel     text not null check (channel in ('POS','B2B')),
  branch_code text,  -- NULL = the whole channel (all branches)
  granted_by  uuid references shared.people(id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table reporting.supervisor_revenue_scope is
  'Per-person revenue-visibility grants for the supervisor tier (ADR-0051). One row per (person, channel, branch_code); branch_code NULL = whole channel. Admin-writes only; feeds sales_daily_revenue''s supervisor RLS arm.';
comment on column reporting.supervisor_revenue_scope.branch_code is
  'NULL = the whole channel (every branch). Non-null = one specific warehouse branch_code (free-text pass-through; not FK-validated — no branch table exists).';

-- org_id + granted_by stamped server-side (unspoofable), mirroring shared.person_access_roles.
alter table reporting.supervisor_revenue_scope alter column org_id set default shared.current_org_id();
alter table reporting.supervisor_revenue_scope alter column granted_by set default shared.current_person_id();

-- Uniqueness (portable across PG versions): at most one specific-branch row per (person,channel,branch)
-- AND at most one whole-channel row per (person,channel).
create unique index supervisor_revenue_scope_branch_uniq
  on reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  where branch_code is not null;
create unique index supervisor_revenue_scope_channel_uniq
  on reporting.supervisor_revenue_scope (person_id, channel)
  where branch_code is null;

-- Lookup index backing the revenue policy's correlated EXISTS.
create index supervisor_revenue_scope_lookup_idx
  on reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code);

-- Base privileges: SELECT/INSERT/DELETE to authenticated (no UPDATE — scope is add/remove). RLS is authority.
grant select, insert, delete on reporting.supervisor_revenue_scope to authenticated;

-- Guard: org seam (target person in caller's org) + force granted_by server-side (FR-303). SECURITY INVOKER.
create or replace function reporting._guard_supervisor_revenue_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.granted_by := shared.current_person_id();
    if not exists (select 1 from shared.people p
                    where p.id = new.person_id and p.org_id = shared.current_org_id()) then
      raise exception 'person is not in your org' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function reporting._guard_supervisor_revenue_scope() is
  'Guard (ADR-0051): a supervisor scope row must target a person in the caller''s org (42501 otherwise); granted_by forced server-side. org_id server-stamped by the column default. SECURITY INVOKER.';

create trigger supervisor_revenue_scope_guard
  before insert on reporting.supervisor_revenue_scope
  for each row execute function reporting._guard_supervisor_revenue_scope();

alter table reporting.supervisor_revenue_scope enable row level security;
alter table reporting.supervisor_revenue_scope force row level security;

-- SELECT (FR-304): admin reads all org rows (for the /admin scope editor); a supervisor reads OWN rows
-- (so the revenue policy's correlated EXISTS resolves under RLS as the querying supervisor — ADR-0051 D3).
create policy supervisor_revenue_scope_select on reporting.supervisor_revenue_scope
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('admin') or person_id = shared.current_person_id())
  );

-- INSERT (FR-303): admin-only, org-scoped (org_id server-stamped + WITH CHECK-bound, unspoofable).
create policy supervisor_revenue_scope_insert_admin on reporting.supervisor_revenue_scope
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- DELETE (FR-303): admin-only, org-scoped hard delete.
create policy supervisor_revenue_scope_delete_admin on reporting.supervisor_revenue_scope
  for delete to authenticated
  using (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- Extend the revenue SELECT policy with a scoped supervisor arm (FR-305). ALTER POLICY replaces ONLY the
-- USING expression — the policy name + finance/admin/manager arms + reporting_writer write policy untouched (FR-309).
alter policy sales_daily_revenue_select_finance_admin
  on reporting.sales_daily_revenue
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('finance')
      or shared.has_access_role('admin')
      or shared.has_access_role('manager')
      or (
        shared.has_access_role('supervisor')
        and exists (
          select 1 from reporting.supervisor_revenue_scope s
          where s.person_id = shared.current_person_id()
            and s.org_id    = shared.current_org_id()
            and s.channel   = sales_daily_revenue.channel
            and (s.branch_code is null or s.branch_code = sales_daily_revenue.branch_code)
        )
      )
    )
  );
comment on policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue is
  'SELECT for finance/admin/manager (all org rows) + supervisor (scoped to reporting.supervisor_revenue_scope) in the same org (ADR-0050 + ADR-0051). Name kept for DOWN-chain stability. Margin policy is unchanged (supervisor excluded).';

-- Live branch catalog for the admin scope picker (NFR-303). SECURITY INVOKER: RLS on the base table still
-- governs (admin sees all → distinct works). Never a hardcoded list.
create or replace function reporting.list_revenue_branches()
returns table (channel text, branch_code text, branch_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct r.channel, r.branch_code, r.branch_name
  from reporting.sales_daily_revenue r
  where r.org_id = shared.current_org_id()
  order by r.channel, r.branch_name
$$;
comment on function reporting.list_revenue_branches() is
  'Distinct (channel, branch_code, branch_name) for the admin Revenue-scope picker (ADR-0051, NFR-303). SECURITY INVOKER — reporting RLS governs. Never a hardcoded list.';
grant execute on function reporting.list_revenue_branches() to authenticated;

-- DOWN:
--   drop function reporting.list_revenue_branches();
--   alter policy sales_daily_revenue_select_finance_admin on reporting.sales_daily_revenue
--     using (org_id = shared.current_org_id() and (shared.has_access_role('finance') or shared.has_access_role('admin') or shared.has_access_role('manager')));
--   drop policy supervisor_revenue_scope_delete_admin on reporting.supervisor_revenue_scope;
--   drop policy supervisor_revenue_scope_insert_admin on reporting.supervisor_revenue_scope;
--   drop policy supervisor_revenue_scope_select on reporting.supervisor_revenue_scope;
--   drop trigger supervisor_revenue_scope_guard on reporting.supervisor_revenue_scope;
--   drop function reporting._guard_supervisor_revenue_scope();
--   drop table reporting.supervisor_revenue_scope cascade;
