-- #1431 — procurement's Receipt issues list, per-person access, resolutions and audit history.
-- Linking records a matched portion as held. This migration never creates or enqueues an ESB outbox row.
--
-- DOWN: see supabase/rollbacks/20261007008200_ops_cafe_receipt_issues.sql.

-- ── Procurement is a separate, admin-granted capability, not an access role ─────────────────
create table ops.cafe_receipt_issue_access (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  person_id   uuid not null references shared.people(id) on delete cascade,
  granted_by  uuid not null references shared.people(id),
  granted_at  timestamptz not null default clock_timestamp(),
  revoked_by  uuid references shared.people(id),
  revoked_at  timestamptz,
  constraint cafe_receipt_issue_access_revoke_pair_ck check ((revoked_by is null) = (revoked_at is null))
);
create unique index cafe_receipt_issue_access_one_active_uk
  on ops.cafe_receipt_issue_access (org_id, person_id) where revoked_at is null;
create index cafe_receipt_issue_access_person_history_idx
  on ops.cafe_receipt_issue_access (org_id, person_id, granted_at desc);
comment on table ops.cafe_receipt_issue_access is
  'Admin-granted, organisation-scoped procurement capability. Grant and revoke events are retained as rows; this capability is not an access role.';

alter table ops.cafe_receipt_issue_access enable row level security;
alter table ops.cafe_receipt_issue_access force row level security;
revoke all on ops.cafe_receipt_issue_access from public, anon, authenticated, service_role;
grant select on ops.cafe_receipt_issue_access to authenticated, service_role;
create policy cafe_receipt_issue_access_select_self_or_admin on ops.cafe_receipt_issue_access
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (person_id = (select shared.current_person_id()) or shared.has_access_role('admin'))
  );

create or replace function ops.can_manage_cafe_receipt_issues()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select shared.current_org_id() is not null
     and shared.current_person_id() is not null
     and exists (
       select 1 from ops.cafe_receipt_issue_access a
        where a.org_id = shared.current_org_id()
          and a.person_id = shared.current_person_id()
          and a.revoked_at is null
     )
$$;
comment on function ops.can_manage_cafe_receipt_issues() is
  'True only for a same-org person with an active procurement capability grant. SECURITY DEFINER so receipt RLS can use the grant without opening its table.';
revoke all on function ops.can_manage_cafe_receipt_issues() from public, anon;
grant execute on function ops.can_manage_cafe_receipt_issues() to authenticated;

create or replace function ops.get_cafe_receipt_issue_access(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
begin
  if v_org_id is null or not shared.has_access_role('admin') then
    raise exception 'CAFE_RECEIPT_ISSUE_ACCESS_ADMIN_ONLY' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.people p where p.org_id = v_org_id and p.id = p_person_id) then
    raise exception 'CAFE_RECEIPT_ISSUE_ACCESS_PERSON_INVALID' using errcode = '22023';
  end if;
  return jsonb_build_object('enabled', exists (
    select 1 from ops.cafe_receipt_issue_access a
     where a.org_id = v_org_id and a.person_id = p_person_id and a.revoked_at is null
  ));
end;
$$;
comment on function ops.get_cafe_receipt_issue_access(uuid) is
  'Admin-only read of one same-organisation person''s active procurement capability.';
revoke all on function ops.get_cafe_receipt_issue_access(uuid) from public, anon, authenticated;
grant execute on function ops.get_cafe_receipt_issue_access(uuid) to authenticated;

create or replace function ops.set_cafe_receipt_issue_access(p_person_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
begin
  if v_org_id is null or v_actor is null or not shared.has_access_role('admin') then
    raise exception 'CAFE_RECEIPT_ISSUE_ACCESS_ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_enabled is null or not exists (
    select 1 from shared.people p where p.org_id = v_org_id and p.id = p_person_id and p.archived_at is null
  ) then
    raise exception 'CAFE_RECEIPT_ISSUE_ACCESS_PERSON_INVALID' using errcode = '22023';
  end if;
  if p_enabled then
    insert into ops.cafe_receipt_issue_access (org_id, person_id, granted_by)
    values (v_org_id, p_person_id, v_actor)
    on conflict (org_id, person_id) where revoked_at is null do nothing;
  else
    update ops.cafe_receipt_issue_access
       set revoked_by = v_actor, revoked_at = clock_timestamp()
     where org_id = v_org_id and person_id = p_person_id and revoked_at is null;
  end if;
  return jsonb_build_object('enabled', p_enabled);
end;
$$;
comment on function ops.set_cafe_receipt_issue_access(uuid, boolean) is
  'Admin-only grant/revoke. Every grant is a new row; revoke stamps the active grant, preserving actor and time.';
revoke all on function ops.set_cafe_receipt_issue_access(uuid, boolean) from public, anon, authenticated;
grant execute on function ops.set_cafe_receipt_issue_access(uuid, boolean) to authenticated;

-- ── Issue state and append-only history ──────────────────────────────────────────────────────
alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_kind_check;
alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_kind_check
  check (kind in ('no_po', 'over', 'wrong_unit', 'short', 'damaged_wrong'));
alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_status_check;
alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_status_check
  check (status in ('open', 'linked', 'closed'));
alter table ops.cafe_receipt_issues
  add column reason text,
  add column linked_po_number text,
  add column linked_po_date date,
  add column linked_po_created_at timestamptz,
  add column closed_note text,
  add column resolved_by uuid references shared.people(id),
  add column resolved_at timestamptz,
  add constraint cafe_receipt_issues_resolution_pair_ck check ((resolved_by is null) = (resolved_at is null)),
  add constraint cafe_receipt_issues_resolution_status_ck check ((status = 'open') = (resolved_at is null)),
  add constraint cafe_receipt_issues_close_note_ck check (closed_note is null or (btrim(closed_note) <> '' and char_length(closed_note) <= 500)),
  add constraint cafe_receipt_issues_linked_po_ck check ((linked_po_number is null) = (linked_po_date is null));
alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_org_id_id_uk unique (org_id, id);

update ops.cafe_receipt_issues i
   set reason = nullif(btrim(l.condition_reason), '')
  from ops.cafe_receipt_lines l
 where l.org_id = i.org_id and l.receipt_id = i.receipt_id and l.id = i.line_id;
create or replace function ops._fill_cafe_receipt_issue_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line_reason text;
begin
  if new.reason is not null and btrim(new.reason) <> '' then return new; end if;
  select l.condition_reason into v_line_reason from ops.cafe_receipt_lines l
   where l.org_id = new.org_id and l.receipt_id = new.receipt_id and l.id = new.line_id;
  new.reason := coalesce(nullif(btrim(v_line_reason), ''), case new.kind
    when 'no_po' then 'No matching open purchase order was available.'
    when 'over' then 'Received quantity exceeded open-PO outstanding.'
    when 'wrong_unit' then 'No open purchase order used this item unit.'
    when 'short' then 'Received quantity was below open-PO outstanding.'
    when 'damaged_wrong' then 'The received line was flagged as damaged or wrong.'
  end);
  return new;
end;
$$;
comment on function ops._fill_cafe_receipt_issue_reason() is
  'Preserves the line explanation where present and otherwise records a system reason for the unmatched or informational condition.';
revoke all on function ops._fill_cafe_receipt_issue_reason() from public, anon, authenticated, service_role;
create trigger cafe_receipt_issues_fill_reason
  before insert on ops.cafe_receipt_issues
  for each row execute function ops._fill_cafe_receipt_issue_reason();
comment on column ops.cafe_receipt_issues.reason is
  'Reason/evidence retained with the issue; initially copied from the line explanation when present.';
comment on column ops.cafe_receipt_issues.linked_po_created_at is
  'Worker cache creation timestamp captured at link time; arrival-before-creation is shown as quiet text.';

create table ops.cafe_receipt_issue_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade,
  issue_id    uuid not null,
  action      text not null check (action in ('linked', 'closed')),
  from_status text not null check (from_status = 'open'),
  to_status   text not null check (to_status in ('linked', 'closed')),
  actor_id    uuid not null references shared.people(id),
  note        text,
  po_number   text,
  po_date     date,
  po_created_at timestamptz,
  created_at  timestamptz not null default clock_timestamp(),
  constraint cafe_receipt_issue_events_transition_ck check (
    (action = 'linked' and to_status = 'linked' and po_number is not null and note is null)
    or (action = 'closed' and to_status = 'closed' and po_number is null and note is not null and btrim(note) <> '')
  ),
  constraint cafe_receipt_issue_events_issue_fk foreign key (org_id, issue_id)
    references ops.cafe_receipt_issues (org_id, id) on delete cascade
);
create index cafe_receipt_issue_events_history_idx on ops.cafe_receipt_issue_events (org_id, issue_id, created_at desc);
comment on table ops.cafe_receipt_issue_events is
  'Append-only issue resolution history. No authenticated write path; the link/close RPCs stamp actor, transition, note and PO snapshot.';
alter table ops.cafe_receipt_issue_events enable row level security;
alter table ops.cafe_receipt_issue_events force row level security;
revoke all on ops.cafe_receipt_issue_events from public, anon, authenticated, service_role;
grant select on ops.cafe_receipt_issue_events to authenticated, service_role;
create policy cafe_receipt_issue_events_select_visible on ops.cafe_receipt_issue_events
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (
      select 1
        from ops.cafe_receipt_issues i
        join ops.cafe_receipts r on r.org_id = i.org_id and r.id = i.receipt_id
       where i.org_id = cafe_receipt_issue_events.org_id
         and i.id = cafe_receipt_issue_events.issue_id
         and (r.received_by = (select shared.current_person_id())
              or ops.can_manage_cafe_receipt_issues())
    )
  );

-- Existing issue and receipt evidence is visible to procurement, but only on their own org.
drop policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues;
create policy cafe_receipt_issues_select_receiver_reviewer_or_procurement on ops.cafe_receipt_issues
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (
      select 1 from ops.cafe_receipts r
       where r.org_id = cafe_receipt_issues.org_id and r.id = cafe_receipt_issues.receipt_id
         and (r.received_by = (select shared.current_person_id())
              or ops.can_review_stream(r.branch_id, r.activity)
              or ops.can_manage_cafe_receipt_issues())
    )
  );
comment on policy cafe_receipt_issues_select_receiver_reviewer_or_procurement on ops.cafe_receipt_issues is
  'The receiver reads their own issues, stream reviewers read their stream, and the explicitly granted procurement capability reads all same-org issues.';

drop policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts;
create policy cafe_receipts_select_receiver_reviewer_or_procurement on ops.cafe_receipts
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (received_by = (select shared.current_person_id())
         or ops.can_review_stream(branch_id, activity)
         or ops.can_manage_cafe_receipt_issues())
  );
comment on policy cafe_receipts_select_receiver_reviewer_or_procurement on ops.cafe_receipts is
  'Receivers read their own receipts; stream reviewers and procurement capability holders read evidence needed for their work.';

-- Procurement can read the related line, private photo metadata and signed private photos too.
create or replace function ops.can_read_cafe_receipt_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_line_id uuid := ops.cafe_receipt_photo_line_id(p_name);
begin
  if v_line_id is null or split_part(p_name, '/', 1) <> shared.current_org_id()::text then return false; end if;
  return exists (
    select 1 from ops.cafe_receipt_lines l
    join ops.cafe_receipts r on r.id = l.receipt_id and r.org_id = l.org_id
    where l.id = v_line_id and l.org_id = shared.current_org_id()
      and split_part(p_name, '/', 2) = r.id::text
      and (r.received_by = shared.current_person_id()
           or (r.status in ('Submitted', 'Approved', 'Rejected') and ops.can_review_stream(r.branch_id, r.activity))
           or ops.can_manage_cafe_receipt_issues())
  );
end;
$$;
comment on function ops.can_read_cafe_receipt_photo(text) is
  'Private photo read follows same-org receipt access: receiver, stream reviewer after submit, or procurement capability holder. SECURITY DEFINER.';
revoke execute on function ops.can_read_cafe_receipt_photo(text) from public, anon, authenticated;
grant execute on function ops.can_read_cafe_receipt_photo(text) to authenticated, service_role;

-- Extend the matching migration's reviewer-only read gates without changing the floor identity-only cache read.
create or replace function ops.can_read_cafe_open_pos(p_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select ops.can_manage_cafe_receipt_issues()
      or exists (
        select 1 from shared.teams t
         where t.org_id = shared.current_org_id()
           and t.branch_id = p_branch_id
           and t.activity is not null
           and t.archived_at is null
           and ops.can_review_stream(t.branch_id, t.activity)
      )
$$;
comment on function ops.can_read_cafe_open_pos(uuid) is
  'Reviewers of a branch and procurement capability holders read its cached open POs with outstanding quantities; floor members keep the identity-only read.';

drop policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions;
create policy cafe_receipt_portions_select_reviewer_or_procurement on ops.cafe_receipt_portions
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (
      select 1 from ops.cafe_receipts r
       where r.org_id = cafe_receipt_portions.org_id and r.id = cafe_receipt_portions.receipt_id
         and (ops.can_review_stream(r.branch_id, r.activity) or ops.can_manage_cafe_receipt_issues())
    )
  );
comment on policy cafe_receipt_portions_select_reviewer_or_procurement on ops.cafe_receipt_portions is
  'Reviewers and procurement read matched held portions; a floor receiver still sees only the text status returned for their own receipt.';

alter table ops.cafe_receipt_portions drop constraint cafe_receipt_portions_hold_reason_check;
alter table ops.cafe_receipt_portions add constraint cafe_receipt_portions_hold_reason_check
  check (hold_reason is null or hold_reason in ('posting_off', 'receiving_location_missing', 'no_longer_fits', 'issue_linked'));
comment on column ops.cafe_receipt_portions.hold_reason is
  'issue_linked marks a procurement-linked portion held for a later explicit release; linking never posts it to ESB.';

-- Record short and damaged/wrong conditions alongside the blocking allocations generated by #1429.
create or replace function ops._record_cafe_receipt_information_issues()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_line record;
  v_open_quantity numeric;
begin
  select * into v_receipt from ops.cafe_receipts r where r.org_id = new.org_id and r.id = new.receipt_id;
  if not found then return new; end if;
  for v_line in
    select l.id, l.item_unit_id, l.item_name, l.received_quantity, l.condition_reason, l.conditions
      from ops.cafe_receipt_lines l
     where l.org_id = v_receipt.org_id and l.receipt_id = v_receipt.id
  loop
    if 'damaged_wrong' = any(v_line.conditions) then
      insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity, reason)
      values (v_receipt.org_id, v_receipt.id, v_line.id, v_line.item_unit_id, 'damaged_wrong',
              v_line.received_quantity, nullif(btrim(v_line.condition_reason), ''))
      on conflict (line_id, kind) do nothing;
    end if;
    select coalesce(sum((x ->> 'outstanding')::numeric), 0)
      into v_open_quantity
      from jsonb_array_elements(ops._cafe_receipt_po_lines(v_receipt.org_id, v_receipt.branch_id)) x
     where (x ->> 'item_unit_id')::uuid = v_line.item_unit_id;
    if v_open_quantity > v_line.received_quantity then
      insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity, reason)
      values (v_receipt.org_id, v_receipt.id, v_line.id, v_line.item_unit_id, 'short',
              v_open_quantity - v_line.received_quantity, 'Received quantity is below current open-PO outstanding.')
      on conflict (line_id, kind) do nothing;
    end if;
  end loop;
  return new;
end;
$$;
comment on function ops._record_cafe_receipt_information_issues() is
  'Adds informational short and damaged/wrong issue rows at the first matching pass; these do not change the matched allocation or outbox.';
revoke all on function ops._record_cafe_receipt_information_issues() from public, anon, authenticated, service_role;
create trigger cafe_receipt_matches_information_issues
  after insert on ops.cafe_receipt_matches
  for each row execute function ops._record_cafe_receipt_information_issues();

-- No caller supplies org, actor, receipt state, match state or ESB/outbox data.
create or replace function ops.cafe_receipt_issue_open_pos(p_issue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_issue ops.cafe_receipt_issues%rowtype;
  v_receipt ops.cafe_receipts%rowtype;
  v_as_of timestamptz;
  v_is_current boolean := false;
  v_refresh_requested_at timestamptz;
  v_options jsonb := '[]'::jsonb;
begin
  if v_org_id is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY' using errcode = '42501';
  end if;
  select * into v_issue from ops.cafe_receipt_issues i
   where i.org_id = v_org_id and i.id = p_issue_id and i.status = 'open';
  if not found or v_issue.kind not in ('no_po', 'over', 'wrong_unit') then
    raise exception 'CAFE_RECEIPT_ISSUE_NOT_LINKABLE' using errcode = '22023';
  end if;
  select * into v_receipt from ops.cafe_receipts r
   where r.org_id = v_org_id and r.id = v_issue.receipt_id;
  select s.as_of, s.refresh_requested_at,
         ops._cafe_open_po_cache_current(v_org_id, v_receipt.branch_id)
    into v_as_of, v_refresh_requested_at, v_is_current
    from ops.cafe_open_po_branches s
   where s.org_id = v_org_id and s.branch_id = v_receipt.branch_id;
  if v_is_current then
    select coalesce(jsonb_agg(jsonb_build_object(
             'po_number', p.po_number,
             'supplier_name', p.supplier_name,
             'po_date', p.po_date,
             'date_eligible', p.po_date <= v_receipt.arrival_date,
             'esb_created_at', p.esb_created_at)
           order by p.po_date, p.po_number), '[]'::jsonb)
      into v_options
      from ops.cafe_open_pos p
     where p.org_id = v_org_id and p.branch_id = v_receipt.branch_id
       and exists (
         select 1 from ops.cafe_open_po_lines pl
          where pl.org_id = p.org_id and pl.po_id = p.id and pl.item_unit_id = v_issue.item_unit_id
       );
  end if;
  return jsonb_build_object(
    'options', v_options,
    'cache_as_of', v_as_of,
    'is_current', coalesce(v_is_current, false),
    'refresh_requested_at', v_refresh_requested_at
  );
end;
$$;
comment on function ops.cafe_receipt_issue_open_pos(uuid) is
  'Procurement-only current cache read: same-branch open POs containing this exact product detail, plus cache as-of/current state. Does not contact ESB.';
revoke all on function ops.cafe_receipt_issue_open_pos(uuid) from public, anon, authenticated;
grant execute on function ops.cafe_receipt_issue_open_pos(uuid) to authenticated;

create or replace function ops.request_cafe_receipt_issue_po_refresh(p_issue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_branch_id uuid;
  v_requested_at timestamptz := clock_timestamp();
begin
  if v_org_id is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY' using errcode = '42501';
  end if;
  select r.branch_id into v_branch_id
    from ops.cafe_receipt_issues i
    join ops.cafe_receipts r on r.org_id = i.org_id and r.id = i.receipt_id
   where i.org_id = v_org_id and i.id = p_issue_id and i.status = 'open';
  if not found then raise exception 'CAFE_RECEIPT_ISSUE_NOT_FOUND' using errcode = '22023'; end if;
  insert into ops.cafe_open_po_branches (org_id, branch_id, refresh_requested_at, updated_at)
  values (v_org_id, v_branch_id, v_requested_at, v_requested_at)
  on conflict (org_id, branch_id) do update
    set refresh_requested_at = coalesce(ops.cafe_open_po_branches.refresh_requested_at, excluded.refresh_requested_at),
        updated_at = excluded.updated_at;
  return jsonb_build_object('requested_at', (
    select s.refresh_requested_at from ops.cafe_open_po_branches s
     where s.org_id = v_org_id and s.branch_id = v_branch_id
  ));
end;
$$;
comment on function ops.request_cafe_receipt_issue_po_refresh(uuid) is
  'Requests a worker-owned refresh for the issue''s branch cache; never reads ESB from the browser.';
revoke all on function ops.request_cafe_receipt_issue_po_refresh(uuid) from public, anon, authenticated;
grant execute on function ops.request_cafe_receipt_issue_po_refresh(uuid) to authenticated;

create or replace function ops.link_cafe_receipt_issue(p_issue_id uuid, p_po_number text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_issue ops.cafe_receipt_issues%rowtype;
  v_receipt ops.cafe_receipts%rowtype;
  v_po ops.cafe_open_pos%rowtype;
  v_available numeric;
begin
  if v_org_id is null or v_actor is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY' using errcode = '42501';
  end if;
  if p_po_number is null or btrim(p_po_number) = '' then
    raise exception 'CAFE_RECEIPT_ISSUE_PO_REQUIRED' using errcode = '22023';
  end if;
  select * into v_issue from ops.cafe_receipt_issues i
   where i.org_id = v_org_id and i.id = p_issue_id for update;
  if not found or v_issue.status <> 'open' or v_issue.kind not in ('no_po', 'over', 'wrong_unit') then
    raise exception 'CAFE_RECEIPT_ISSUE_NOT_LINKABLE' using errcode = '22023';
  end if;
  select * into v_receipt from ops.cafe_receipts r
   where r.org_id = v_org_id and r.id = v_issue.receipt_id;
  if v_receipt.status <> 'Approved' then
    raise exception 'CAFE_RECEIPT_ISSUE_RECEIPT_NOT_APPROVED' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-match:' || v_org_id || ':' || v_receipt.branch_id, 0));
  perform 1 from ops.cafe_open_po_branches s
   where s.org_id = v_org_id and s.branch_id = v_receipt.branch_id
   for share;
  if not found or not ops._cafe_open_po_cache_current(v_org_id, v_receipt.branch_id) then
    raise exception 'CAFE_RECEIPT_ISSUE_CACHE_STALE' using errcode = '22023';
  end if;
  select * into v_po from ops.cafe_open_pos p
   where p.org_id = v_org_id and p.branch_id = v_receipt.branch_id and p.po_number = btrim(p_po_number);
  if not found or not exists (
    select 1 from ops.cafe_open_po_lines l where l.org_id = v_org_id and l.po_id = v_po.id and l.item_unit_id = v_issue.item_unit_id
  ) then
    raise exception 'CAFE_RECEIPT_ISSUE_PO_INELIGIBLE' using errcode = '22023';
  end if;
  if v_po.po_date > v_receipt.arrival_date then
    raise exception 'CAFE_RECEIPT_ISSUE_PO_AFTER_ARRIVAL' using errcode = '22023';
  end if;
  select coalesce(sum(l.outstanding_quantity), 0)
         - coalesce((
             select sum(q.quantity)
               from ops.cafe_receipt_portions q
               join ops.cafe_receipts qr on qr.org_id = q.org_id and qr.id = q.receipt_id
              where q.org_id = v_org_id and qr.branch_id = v_receipt.branch_id
                and q.po_number = v_po.po_number and q.item_unit_id = v_issue.item_unit_id
                and q.state in ('queued', 'held') and (q.hold_reason = 'issue_linked' or q.state = 'queued')
           ), 0)
    into v_available
    from ops.cafe_open_po_lines l
   where l.org_id = v_org_id and l.po_id = v_po.id and l.item_unit_id = v_issue.item_unit_id;
  if v_available < v_issue.quantity then
    raise exception 'CAFE_RECEIPT_ISSUE_PO_INSUFFICIENT_OUTSTANDING' using errcode = '22023';
  end if;

  -- Linking makes a held matched portion for a later, explicit release. It never inserts into
  -- integrations.esb_push or integrations.esb_push_groups; this feature keeps ESB posting off.
  insert into ops.cafe_receipt_portions (
    org_id, receipt_id, line_id, item_unit_id, po_number, po_date, quantity, state, hold_reason
  ) values (
    v_org_id, v_receipt.id, v_issue.line_id, v_issue.item_unit_id,
    v_po.po_number, v_po.po_date, v_issue.quantity, 'held', 'issue_linked'
  );
  update ops.cafe_receipt_issues
     set status = 'linked', linked_po_number = v_po.po_number, linked_po_date = v_po.po_date,
         linked_po_created_at = v_po.esb_created_at, resolved_by = v_actor, resolved_at = clock_timestamp()
   where org_id = v_org_id and id = v_issue.id;
  insert into ops.cafe_receipt_issue_events (
    org_id, issue_id, action, from_status, to_status, actor_id, po_number, po_date, po_created_at
  ) values (
    v_org_id, v_issue.id, 'linked', 'open', 'linked', v_actor,
    v_po.po_number, v_po.po_date, v_po.esb_created_at
  );
  return jsonb_build_object('status', 'linked', 'linked_po_number', v_po.po_number);
end;
$$;
comment on function ops.link_cafe_receipt_issue(uuid, text) is
  'Procurement-only link. Rechecks same-branch open PO, item detail, current cache, arrival-date rule and outstanding; records a held portion and audit event. Never enqueues ESB.';
revoke all on function ops.link_cafe_receipt_issue(uuid, text) from public, anon, authenticated;
grant execute on function ops.link_cafe_receipt_issue(uuid, text) to authenticated;

create or replace function ops.close_cafe_receipt_issue(p_issue_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_actor uuid := shared.current_person_id();
  v_issue ops.cafe_receipt_issues%rowtype;
  v_note text := nullif(btrim(p_note), '');
  v_now timestamptz := clock_timestamp();
begin
  if v_org_id is null or v_actor is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) > 500 then
    raise exception 'CAFE_RECEIPT_ISSUE_NOTE_REQUIRED' using errcode = '22023';
  end if;
  select * into v_issue from ops.cafe_receipt_issues i
   where i.org_id = v_org_id and i.id = p_issue_id for update;
  if not found or v_issue.status <> 'open' then
    raise exception 'CAFE_RECEIPT_ISSUE_NOT_OPEN' using errcode = '22023';
  end if;
  update ops.cafe_receipt_issues
     set status = 'closed', closed_note = v_note, resolved_by = v_actor, resolved_at = v_now
   where org_id = v_org_id and id = v_issue.id;
  insert into ops.cafe_receipt_issue_events (
    org_id, issue_id, action, from_status, to_status, actor_id, note
  ) values (v_org_id, v_issue.id, 'closed', 'open', 'closed', v_actor, v_note);
  return jsonb_build_object('status', 'closed');
end;
$$;
comment on function ops.close_cafe_receipt_issue(uuid, text) is
  'Procurement-only close. Requires a bounded non-blank note; keeps receipt, line, issue and photo evidence unchanged and appends audit history.';
revoke all on function ops.close_cafe_receipt_issue(uuid, text) from public, anon, authenticated;
grant execute on function ops.close_cafe_receipt_issue(uuid, text) to authenticated;
