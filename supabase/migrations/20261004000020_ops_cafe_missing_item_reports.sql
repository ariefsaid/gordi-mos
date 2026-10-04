-- Route missing Café capture items to stream managers on Café item settings (#1286).
-- Reports do not create or alter ERP items; they are attention items scoped to one stream.
--
-- DOWN (reversible): drop the trigger and guard, policies, table, then any indexes. The
-- reports are operational queue state; rolling this migration back intentionally discards them.

create table ops.cafe_missing_item_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default shared.current_org_id()
    references shared.orgs(id) on delete cascade,
  branch_id uuid not null,
  activity text not null,
  item_name text not null,
  reported_by uuid not null default shared.current_person_id()
    references shared.people(id) on delete restrict,
  reported_at timestamptz not null default now(),
  needs_attention boolean not null default true,
  resolved_by uuid references shared.people(id) on delete set null,
  resolved_at timestamptz,
  constraint cafe_missing_item_reports_item_name_check
    check (btrim(item_name) <> '' and length(btrim(item_name)) <= 160),
  constraint cafe_missing_item_reports_resolution_check
    check ((needs_attention and resolved_by is null and resolved_at is null)
        or (not needs_attention and resolved_by is not null and resolved_at is not null)),
  constraint cafe_missing_item_reports_branch_org_fk
    foreign key (org_id, branch_id) references shared.branches (org_id, id)
    on delete cascade
);
comment on table ops.cafe_missing_item_reports is
  'Needs-attention missing-item reports from Café capture, scoped to a live (branch, activity) stream and resolved by authorized Café item-settings managers. Does not create or modify ERP/MOS items.';
comment on column ops.cafe_missing_item_reports.needs_attention is
  'True until a Café item-settings manager resolves the report; resolution is server-attributed and irreversible.';

create index cafe_missing_item_reports_stream_attention_idx
  on ops.cafe_missing_item_reports (org_id, branch_id, activity, reported_at desc)
  where needs_attention;

create or replace function ops._guard_cafe_missing_item_report()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.org_id is distinct from shared.current_org_id()
       or new.reported_by is distinct from shared.current_person_id()
       or not new.needs_attention
       or new.resolved_by is not null
       or new.resolved_at is not null then
      raise exception 'Café missing-item report attribution and open state are server-owned'
        using errcode = '42501';
    end if;
    if not (shared.is_cafe_affiliated()
            or shared.has_access_role('ops_lead')
            or shared.has_access_role('admin')) then
      raise exception 'only Café capturers may report missing items' using errcode = '42501';
    end if;
    if not exists (
      select 1 from shared.teams team
       where team.org_id = new.org_id
         and team.branch_id = new.branch_id
         and team.activity = new.activity
         and team.archived_at is null
    ) then
      raise exception 'Café missing-item report requires a live stream' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.org_id is distinct from old.org_id
     or new.branch_id is distinct from old.branch_id
     or new.activity is distinct from old.activity
     or new.item_name is distinct from old.item_name
     or new.reported_by is distinct from old.reported_by
     or new.reported_at is distinct from old.reported_at
     or new.needs_attention is distinct from false
     or old.needs_attention is distinct from true
     or new.resolved_by is distinct from old.resolved_by
     or new.resolved_at is distinct from old.resolved_at then
    raise exception 'Café missing-item reports may only be resolved once' using errcode = '42501';
  end if;
  new.resolved_by := shared.current_person_id();
  new.resolved_at := now();
  return new;
end;
$$;
comment on function ops._guard_cafe_missing_item_report() is
  'SECURITY INVOKER guard: capture-gated insert on a live stream; the only app update is one-way resolution, stamped to the current manager and server time.';
revoke execute on function ops._guard_cafe_missing_item_report() from public, anon, authenticated;
create trigger cafe_missing_item_reports_guard
  before insert or update on ops.cafe_missing_item_reports
  for each row execute function ops._guard_cafe_missing_item_report();

alter table ops.cafe_missing_item_reports enable row level security;
alter table ops.cafe_missing_item_reports force row level security;
revoke all on ops.cafe_missing_item_reports from public, anon, authenticated;
grant select, insert on ops.cafe_missing_item_reports to authenticated;
grant update (needs_attention) on ops.cafe_missing_item_reports to authenticated;
grant select on ops.cafe_missing_item_reports to service_role;

create policy cafe_missing_item_reports_select_managers
  on ops.cafe_missing_item_reports for select to authenticated
  using (org_id = shared.current_org_id() and ops.can_manage_cafe_item_settings());
create policy cafe_missing_item_reports_insert_capturers
  on ops.cafe_missing_item_reports for insert to authenticated
  with check (
    org_id = shared.current_org_id()
    and reported_by = shared.current_person_id()
    and needs_attention
    and (shared.is_cafe_affiliated()
         or shared.has_access_role('ops_lead')
         or shared.has_access_role('admin'))
  );
create policy cafe_missing_item_reports_resolve_managers
  on ops.cafe_missing_item_reports for update to authenticated
  using (
    org_id = shared.current_org_id()
    and needs_attention
    and ops.can_manage_cafe_item_settings()
  )
  with check (
    org_id = shared.current_org_id()
    and not needs_attention
    and resolved_by = shared.current_person_id()
    and ops.can_manage_cafe_item_settings()
  );
