-- #1431 — procurement's Receipt issues: an admin-granted per-person capability, read of every issue
-- in the organisation, link to an open PO (FR-1035/1036/1038) or close with a note (FR-1037), the
-- informational short and damaged/wrong issues (FR-1034), and record history for receipts, lines,
-- portions, issues and the capability grants (FR-1039).
--
-- A link re-matches the issue's quantity against the linked PO through the #1429 posting path:
-- queued and enqueued once when the branch posts receipts and has a receiving location, otherwise
-- held with that path's reason for a later release. The ESB worker's posting is #1430.
--
-- DOWN: see supabase/rollbacks/20261007008200_ops_cafe_receipt_issues.sql.

-- ── The procurement capability: one admin-granted row per grant, revoked in place ─────────────
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
comment on table ops.cafe_receipt_issue_access is
  'Who holds the procurement capability (FR-1040): one row per admin grant, revoked in place, never deleted. Written only by ops.set_cafe_receipt_issue_access; record history keeps who granted and revoked it and when.';

alter table ops.cafe_receipt_issue_access enable row level security;
alter table ops.cafe_receipt_issue_access force row level security;
revoke all on ops.cafe_receipt_issue_access from public, anon, authenticated, service_role;
grant select on ops.cafe_receipt_issue_access to authenticated, service_role;
create policy cafe_receipt_issue_access_select_self_or_admin on ops.cafe_receipt_issue_access
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and (person_id = (select shared.current_person_id()) or (select shared.has_access_role('admin')))
  );
comment on policy cafe_receipt_issue_access_select_self_or_admin on ops.cafe_receipt_issue_access is
  'A person reads their own grants; an admin reads the organisation''s.';

create or replace function ops.can_manage_cafe_receipt_issues()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from ops.cafe_receipt_issue_access a
     where a.org_id = shared.current_org_id()
       and a.person_id = shared.current_person_id()
       and a.revoked_at is null
  )
$$;
comment on function ops.can_manage_cafe_receipt_issues() is
  'True only for a same-org person with an active procurement grant. SECURITY DEFINER so receipt policies can ask it without opening the grant table.';
revoke execute on function ops.can_manage_cafe_receipt_issues() from public, anon;
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
  'Admin-only: whether one same-organisation person holds the procurement capability.';
revoke execute on function ops.get_cafe_receipt_issue_access(uuid) from public, anon, authenticated;
grant execute on function ops.get_cafe_receipt_issue_access(uuid) to authenticated;

-- Like the authority-bearing access roles, the capability is never self-granted.
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
  -- A grant needs an active person; a revoke also reaches someone archived while holding it.
  if p_enabled is null or not exists (
    select 1 from shared.people p where p.org_id = v_org_id and p.id = p_person_id
       and (p.archived_at is null or not p_enabled)
  ) then
    raise exception 'CAFE_RECEIPT_ISSUE_ACCESS_PERSON_INVALID' using errcode = '22023';
  end if;
  if p_enabled and p_person_id = v_actor then
    raise exception 'CAFE_RECEIPT_ISSUE_ACCESS_NOT_SELF' using errcode = '42501';
  end if;
  -- One grant at a time per person: concurrent grants wait here instead of racing the unique index.
  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-issue-access:' || v_org_id || ':' || p_person_id, 0));
  if p_enabled then
    insert into ops.cafe_receipt_issue_access (org_id, person_id, granted_by)
    select v_org_id, p_person_id, v_actor
     where not exists (select 1 from ops.cafe_receipt_issue_access a
                        where a.org_id = v_org_id and a.person_id = p_person_id and a.revoked_at is null);
  else
    update ops.cafe_receipt_issue_access
       set revoked_by = v_actor, revoked_at = clock_timestamp()
     where org_id = v_org_id and person_id = p_person_id and revoked_at is null;
  end if;
  return jsonb_build_object('enabled', p_enabled);
end;
$$;
comment on function ops.set_cafe_receipt_issue_access(uuid, boolean) is
  'Admin-only grant or revoke of the procurement capability for a same-organisation person: a grant to an active person other than the admin adds a row, a revoke (archived people included) stamps the active one; both are idempotent.';
revoke execute on function ops.set_cafe_receipt_issue_access(uuid, boolean) from public, anon, authenticated;
grant execute on function ops.set_cafe_receipt_issue_access(uuid, boolean) to authenticated;

-- ── Issue kinds, resolution and the PO-created-after-delivery record ─────────────────────────
alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_kind_check;
alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_kind_check
  check (kind in ('no_po', 'over', 'wrong_unit', 'short', 'damaged_wrong'));
alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_status_check;
alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_status_check
  check (status in ('open', 'linked', 'closed'));
alter table ops.cafe_receipt_issues
  add column linked_po_number text,
  add column linked_po_date date,
  add column linked_po_created_at timestamptz,
  add column po_created_after_delivery boolean not null default false,
  add column reopened_po_number text,
  add column closed_note text,
  add column resolved_by uuid references shared.people(id),
  add column resolved_at timestamptz,
  add constraint cafe_receipt_issues_resolution_ck check (
    (status = 'open') = (resolved_by is null and resolved_at is null)
    and (status = 'linked') = (linked_po_number is not null and linked_po_date is not null)
    and (status = 'closed') = (closed_note is not null)
    and (closed_note is null or (btrim(closed_note) <> '' and char_length(closed_note) <= 500))
  );
comment on table ops.cafe_receipt_issues is
  'A Receipt issue on one receipt line. Blocking kinds (no_po, over, wrong_unit) are the part matching left unposted; informational kinds (short, damaged_wrong) are recorded at matching and never block posting. Open until procurement links it to a PO or closes it with a note; written only by the matching path and the procurement RPCs.';
comment on column ops.cafe_receipt_issues.po_created_after_delivery is
  'FR-1038: a PO linked to all or part of this issue was created in ESB (Asia/Jakarta date) after the receipt''s arrival date. Recorded at link and kept; shown as quiet text, never a block.';
comment on column ops.cafe_receipt_issues.reopened_po_number is
  'The linked PO a release last found without room for this issue''s part, which re-opened the issue for a new link or a close (#1431).';

-- A link's portion belongs to its issue and its PO: a release re-checks it against that PO only.
alter table ops.cafe_receipt_portions
  add column issue_id uuid references ops.cafe_receipt_issues(id) on delete cascade,
  add column po_created_after_delivery boolean not null default false,
  add constraint cafe_receipt_portions_link_ck check (issue_id is null or po_number is not null);
comment on column ops.cafe_receipt_portions.issue_id is
  'The Receipt issue whose link made this portion; it posts only on the PO procurement chose, or goes back to that issue (#1431).';
comment on column ops.cafe_receipt_portions.po_created_after_delivery is
  'FR-1038 on the posting trail: this portion posts against a PO that ESB created after the arrival date.';

-- ── Who reads what: procurement joins the receipt, issue, portion and open-PO reads ──────────
-- Procurement reads Approved receipts only: issues exist only there, and a Counted or Submitted
-- receipt stays with its receiver and reviewers. In each read the capability, evaluated once per
-- statement, comes before ops.can_review_stream, which runs once per row.
alter policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts
  using (
    org_id = (select shared.current_org_id())
    and ((status = 'Approved' and (select ops.can_manage_cafe_receipt_issues()))
         or received_by = (select shared.current_person_id())
         or ops.can_review_stream(branch_id, activity))
  );
comment on policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts is
  'A procurement capability holder reads Approved receipts (#1431); a receiver reads their own; a stream reviewer reads that stream''s, and ops lead and admin read every stream (ops.can_review_stream). The capability is tested first, once per statement, so a holder never pays the per-row stream check.';

alter policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r
                 where r.org_id = cafe_receipt_issues.org_id and r.id = cafe_receipt_issues.receipt_id
                   and ((r.status = 'Approved' and (select ops.can_manage_cafe_receipt_issues()))
                        or r.received_by = (select shared.current_person_id())
                        or ops.can_review_stream(r.branch_id, r.activity)))
  );
comment on policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues is
  'A procurement capability holder reads every issue of the organisation''s Approved receipts (#1431), the receiver reads the issues on their own receipts (FR-1040), and reviewers of the stream read the stream''s. The capability is tested first, once per statement, so a holder never pays the per-row stream check.';

alter policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r
                 where r.org_id = cafe_receipt_portions.org_id and r.id = cafe_receipt_portions.receipt_id
                   and ((select ops.can_manage_cafe_receipt_issues())
                        or ops.can_review_stream(r.branch_id, r.activity)))
  );
comment on policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions is
  'Matched quantities per PO reveal outstanding, so only procurement capability holders and reviewers of the receipt''s stream read them (DD-CAFE-MVP-6); the receiver reads the posting state as text through ops.cafe_receipt_posting. The capability is tested first, once per statement, so a holder never pays the per-row stream check.';

create or replace function ops.can_read_cafe_receipt_evidence(p_receipt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from ops.cafe_receipts r
     where r.id = p_receipt_id and r.org_id = shared.current_org_id()
       and ((r.status = 'Approved' and ops.can_manage_cafe_receipt_issues())
            or r.received_by = shared.current_person_id()
            or (r.status in ('Submitted', 'Approved', 'Rejected') and ops.can_review_stream(r.branch_id, r.activity)))
  );
$$;
comment on function ops.can_read_cafe_receipt_evidence(uuid) is
  'Who reads a receipt''s photo evidence: same org, and its receiver, a stream reviewer once it is Submitted, Approved or Rejected, or a procurement capability holder once it is Approved. SECURITY DEFINER.';
revoke execute on function ops.can_read_cafe_receipt_evidence(uuid) from public, anon, authenticated;

create or replace function ops.can_read_cafe_open_pos(p_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select ops.can_manage_cafe_receipt_issues()
      or exists (
        select 1
          from shared.teams t
         where t.org_id = shared.current_org_id()
           and t.branch_id = p_branch_id
           and t.activity is not null
           and t.archived_at is null
           and ops.can_review_stream(t.branch_id, t.activity)
      )
$$;
comment on function ops.can_read_cafe_open_pos(uuid) is
  'Who reads a branch''s cached open POs with quantities: a reviewer of any stream at that branch, ops lead and admin through ops.can_review_stream, and procurement capability holders (#1431). Floor members get ops.cafe_open_po_identities instead (DD-CAFE-MVP-6).';

-- ── PO created after delivery on the receipt line ────────────────────────────────────────────
-- The line reads its issues, which receivers, reviewers and procurement may all read.
create or replace function ops.cafe_receipt_line_po_created_after_delivery(p_line ops.cafe_receipt_lines)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from ops.cafe_receipt_issues i
     where i.org_id = p_line.org_id and i.line_id = p_line.id and i.po_created_after_delivery
  )
$$;
comment on function ops.cafe_receipt_line_po_created_after_delivery(ops.cafe_receipt_lines) is
  'FR-1038 on the receipt line: a PO linked to one of its issues was created in ESB after the arrival date. Reads under the caller''s issue policy.';
revoke execute on function ops.cafe_receipt_line_po_created_after_delivery(ops.cafe_receipt_lines) from public, anon;
grant execute on function ops.cafe_receipt_line_po_created_after_delivery(ops.cafe_receipt_lines) to authenticated;


-- ── Informational issues at the first matching pass (FR-1034) ────────────────────────────────
-- Short is the existing difference rule: received below the branch's summed outstanding for the
-- same product detail. Neither kind changes the allocation, the portions or the outbox.
create or replace function ops._record_cafe_receipt_information_issues()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
begin
  select * into v_receipt from ops.cafe_receipts r where r.org_id = new.org_id and r.id = new.receipt_id;
  insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity)
  select l.org_id, l.receipt_id, l.id, l.item_unit_id, 'damaged_wrong', l.received_quantity
    from ops.cafe_receipt_lines l
   where l.org_id = v_receipt.org_id and l.receipt_id = v_receipt.id and 'damaged_wrong' = any (l.conditions)
  on conflict (line_id, kind) do nothing;
  insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity)
  select l.org_id, l.receipt_id, l.id, l.item_unit_id, 'short', o.outstanding - l.received_quantity
    from ops.cafe_receipt_lines l
    join (select (x ->> 'item_unit_id')::uuid as item_unit_id, sum((x ->> 'outstanding')::numeric) as outstanding
            from jsonb_array_elements(ops._cafe_receipt_po_lines(v_receipt.org_id, v_receipt.branch_id)) x
           group by 1) o on o.item_unit_id = l.item_unit_id
   where l.org_id = v_receipt.org_id and l.receipt_id = v_receipt.id and o.outstanding > l.received_quantity
  on conflict (line_id, kind) do nothing;
  return new;
end;
$$;
comment on function ops._record_cafe_receipt_information_issues() is
  'When a receipt is first matched, records its informational issues: damaged_wrong for each line the receiver flagged, short where the line is below the branch''s open-PO outstanding for that product detail.';
revoke execute on function ops._record_cafe_receipt_information_issues() from public, anon, authenticated, service_role;
create trigger cafe_receipt_matches_information_issues
  after insert on ops.cafe_receipt_matches
  for each row execute function ops._record_cafe_receipt_information_issues();

-- An informational issue, and a blocking one procurement linked to a PO, is not an unmatched
-- portion: the posting summary counts only unlinked blocking issues as unmatched. Body otherwise
-- as 20261007003000.
create or replace function ops.cafe_receipt_posting(p_receipt ops.cafe_receipts)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_result jsonb;
begin
  select * into v_receipt from ops.cafe_receipts r
   where r.id = p_receipt.id and r.org_id = shared.current_org_id()
     and (r.received_by = shared.current_person_id() or ops.can_review_stream(r.branch_id, r.activity));
  if not found or v_receipt.status <> 'Approved' then
    return null;
  end if;
  select jsonb_build_object(
           'state', case
                      when bool_or(e.status in ('failed', 'dead_letter')) then 'failed'
                      when bool_or(e.status in ('pending', 'in_flight')) then 'queued'
                      when bool_or(q.hold_reason = 'receiving_location_missing')
                        or (count(q.id) = 0 and v_receipt.posting_status = 'held') then 'held'
                      when count(q.id) filter (where q.state = 'queued') > 0
                        and count(q.id) filter (where q.state = 'held') = 0 then 'posted'
                      else 'not_posted'
                    end,
           'matched', exists (select 1 from ops.cafe_receipt_matches m where m.receipt_id = v_receipt.id),
           'unmatched', (select count(*)::int from ops.cafe_receipt_issues i
                          where i.org_id = v_receipt.org_id and i.receipt_id = v_receipt.id
                            and i.kind in ('no_po', 'over', 'wrong_unit') and i.status <> 'linked'),
           'open_issues', (select count(*)::int from ops.cafe_receipt_issues i
                            where i.org_id = v_receipt.org_id and i.receipt_id = v_receipt.id and i.status = 'open'))
         -- FR-1038 on the posting trail, present only when true so the summary's shape is unchanged otherwise.
         || case when bool_or(q.po_created_after_delivery) then jsonb_build_object('po_created_after_delivery', true)
                 else '{}'::jsonb end
    into v_result
    from ops.cafe_receipt_portions q
    left join integrations.esb_push e on e.id = q.push_id
   where q.org_id = v_receipt.org_id and q.receipt_id = v_receipt.id and q.state <> 'superseded';
  return v_result;
end;
$$;
comment on function ops.cafe_receipt_posting(ops.cafe_receipts) is
  'An Approved receipt''s posting state (not_posted, held, queued, posted, failed), whether it was matched, how many unmatched portions (blocking issues not linked to a PO) it has, how many issues are open and, when true, po_created_after_delivery; null for any other status or a receipt the caller cannot read.';
revoke execute on function ops.cafe_receipt_posting(ops.cafe_receipts) from public, anon;
grant execute on function ops.cafe_receipt_posting(ops.cafe_receipts) to authenticated;

-- ── Procurement's PO picker, refresh request, link and close ─────────────────────────────────
-- No caller supplies org, actor, receipt, match, posting or outbox data.

-- What a PO still has for one product detail, for a link: the cache less unposted queued portions,
-- as approval and release compute it (ops._cafe_receipt_po_lines), less the portions held against
-- it, so links made while posting is off cannot promise the same outstanding twice. Internal: the
-- picker and the link call it.
create or replace function ops._cafe_receipt_issue_po_available(p_org_id uuid, p_branch_id uuid, p_po_number text, p_item_unit_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(
    coalesce((select sum((x ->> 'outstanding')::numeric)
                from jsonb_array_elements(ops._cafe_receipt_po_lines(p_org_id, p_branch_id)) x
               where x ->> 'po_number' = p_po_number and (x ->> 'item_unit_id')::uuid = p_item_unit_id), 0)
    - coalesce((select sum(q.quantity)
                  from ops.cafe_receipt_portions q
                  join ops.cafe_receipts r on r.org_id = q.org_id and r.id = q.receipt_id
                 where q.org_id = p_org_id and r.branch_id = p_branch_id and q.state = 'held'
                   and q.po_number = p_po_number and q.item_unit_id = p_item_unit_id), 0),
    0)
$$;
revoke all on function ops._cafe_receipt_issue_po_available(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
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
  v_cache ops.cafe_open_po_branches%rowtype;
  v_is_current boolean;
  v_options jsonb := '[]'::jsonb;
begin
  if v_org_id is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY' using errcode = '42501';
  end if;
  select * into v_issue from ops.cafe_receipt_issues i
   where i.org_id = v_org_id and i.id = p_issue_id;
  if not found or v_issue.status <> 'open' or v_issue.kind not in ('no_po', 'over', 'wrong_unit') then
    raise exception 'CAFE_RECEIPT_ISSUE_NOT_LINKABLE' using errcode = '22023';
  end if;
  select * into v_receipt from ops.cafe_receipts r where r.org_id = v_org_id and r.id = v_issue.receipt_id;
  select * into v_cache from ops.cafe_open_po_branches s
   where s.org_id = v_org_id and s.branch_id = v_receipt.branch_id;
  v_is_current := ops._cafe_open_po_cache_current(v_org_id, v_receipt.branch_id);
  if v_is_current then
    select coalesce(jsonb_agg(jsonb_build_object(
             'po_number', p.po_number,
             'supplier_name', p.supplier_name,
             'po_date', p.po_date,
             'esb_created_at', p.esb_created_at,
             'date_eligible', p.po_date <= v_receipt.arrival_date,
             'available', trim_scale(ops._cafe_receipt_issue_po_available(v_org_id, v_receipt.branch_id, p.po_number, v_issue.item_unit_id))::text,
             'created_after_delivery', p.esb_created_at is not null
               and (p.esb_created_at at time zone 'Asia/Jakarta')::date > v_receipt.arrival_date)
           order by p.po_date, p.po_number), '[]'::jsonb)
      into v_options
      from ops.cafe_open_pos p
     where p.org_id = v_org_id and p.branch_id = v_receipt.branch_id
       and exists (select 1 from ops.cafe_open_po_lines pl
                    where pl.org_id = p.org_id and pl.po_id = p.id and pl.item_unit_id = v_issue.item_unit_id);
  end if;
  return jsonb_build_object(
    'options', v_options,
    'cache_as_of', v_cache.as_of,
    'is_current', v_is_current,
    'refresh_requested_at', v_cache.refresh_requested_at
  );
end;
$$;
comment on function ops.cafe_receipt_issue_open_pos(uuid) is
  'Procurement only (FR-1035): the open POs of the issue''s branch holding its exact product detail, from a current cache, each with what it still has for the item, whether its date allows the link and whether ESB created it after delivery; plus the cache as-of time and refresh request. Never contacts ESB.';
revoke execute on function ops.cafe_receipt_issue_open_pos(uuid) from public, anon, authenticated;
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
begin
  if v_org_id is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY' using errcode = '42501';
  end if;
  select r.branch_id into v_branch_id
    from ops.cafe_receipt_issues i
    join ops.cafe_receipts r on r.org_id = i.org_id and r.id = i.receipt_id
   where i.org_id = v_org_id and i.id = p_issue_id and i.status = 'open';
  if not found then
    raise exception 'CAFE_RECEIPT_ISSUE_NOT_OPEN' using errcode = '22023';
  end if;
  insert into ops.cafe_open_po_branches (org_id, branch_id, refresh_requested_at)
  values (v_org_id, v_branch_id, clock_timestamp())
  on conflict (org_id, branch_id) do update
    set refresh_requested_at = coalesce(ops.cafe_open_po_branches.refresh_requested_at, excluded.refresh_requested_at),
        updated_at = clock_timestamp();
  return jsonb_build_object('requested_at', (
    select s.refresh_requested_at from ops.cafe_open_po_branches s
     where s.org_id = v_org_id and s.branch_id = v_branch_id
  ));
end;
$$;
comment on function ops.request_cafe_receipt_issue_po_refresh(uuid) is
  'Procurement only (FR-1032): asks the worker to refresh the open-PO cache of an open issue''s branch; an earlier unanswered request is kept.';
revoke execute on function ops.request_cafe_receipt_issue_po_refresh(uuid) from public, anon, authenticated;
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
  v_matched numeric;
  v_location text;
  v_hold text;
  v_after_delivery boolean;
begin
  if v_org_id is null or v_actor is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY' using errcode = '42501';
  end if;
  select * into v_issue from ops.cafe_receipt_issues i
   where i.org_id = v_org_id and i.id = p_issue_id
   for update;
  if not found or v_issue.status <> 'open' or v_issue.kind not in ('no_po', 'over', 'wrong_unit') then
    raise exception 'CAFE_RECEIPT_ISSUE_NOT_LINKABLE' using errcode = '22023';
  end if;
  select * into v_receipt from ops.cafe_receipts r where r.org_id = v_org_id and r.id = v_issue.receipt_id;
  -- The matching lock: approval, release and links of one branch match one at a time.
  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-match:' || v_org_id || ':' || v_receipt.branch_id, 0));
  if not ops._cafe_open_po_cache_current(v_org_id, v_receipt.branch_id) then
    raise exception 'CAFE_RECEIPT_ISSUE_PO_DATA_NOT_CURRENT' using errcode = '55000';
  end if;
  select * into v_po from ops.cafe_open_pos p
   where p.org_id = v_org_id and p.branch_id = v_receipt.branch_id and p.po_number = btrim(coalesce(p_po_number, ''));
  if not found or not exists (select 1 from ops.cafe_open_po_lines l
                               where l.org_id = v_org_id and l.po_id = v_po.id and l.item_unit_id = v_issue.item_unit_id) then
    raise exception 'CAFE_RECEIPT_ISSUE_PO_INELIGIBLE' using errcode = '22023';
  end if;
  if v_po.po_date > v_receipt.arrival_date then
    raise exception 'CAFE_RECEIPT_ISSUE_PO_AFTER_ARRIVAL: the PO must be dated on or before the arrival date' using errcode = '22023';
  end if;

  -- FR-1035 re-match against what the PO still has for this product detail.
  v_matched := least(v_issue.quantity,
                     ops._cafe_receipt_issue_po_available(v_org_id, v_receipt.branch_id, v_po.po_number, v_issue.item_unit_id));
  if v_matched <= 0 then
    raise exception 'CAFE_RECEIPT_ISSUE_PO_NO_OUTSTANDING' using errcode = '22023';
  end if;

  -- FR-1024: queued and enqueued once when the branch posts and has a receiving location,
  -- otherwise held with that reason until a release.
  v_after_delivery := v_po.esb_created_at is not null
    and (v_po.esb_created_at at time zone 'Asia/Jakarta')::date > v_receipt.arrival_date;
  v_location := ops._cafe_receipt_location(v_org_id, v_receipt.branch_id, v_receipt.receiving_location_key);
  v_hold := ops._cafe_receipt_hold_reason(v_org_id, v_receipt.branch_id, v_location);
  insert into ops.cafe_receipt_portions (org_id, receipt_id, line_id, item_unit_id, po_number, po_date, quantity, state, hold_reason,
                                         issue_id, po_created_after_delivery)
  values (v_org_id, v_receipt.id, v_issue.line_id, v_issue.item_unit_id, v_po.po_number, v_po.po_date, v_matched,
          case when v_hold is null then 'queued' else 'held' end, v_hold, v_issue.id, v_after_delivery);
  if v_hold is null then
    perform ops._enqueue_cafe_receipt_portions(v_receipt.id, v_location);
  end if;

  if v_matched < v_issue.quantity then
    -- The rest is above what this PO still has, so it stays an open over-delivery issue.
    update ops.cafe_receipt_issues
       set kind = 'over', quantity = v_issue.quantity - v_matched,
           po_created_after_delivery = po_created_after_delivery or v_after_delivery
     where org_id = v_org_id and id = v_issue.id;
  else
    update ops.cafe_receipt_issues
       set status = 'linked', linked_po_number = v_po.po_number, linked_po_date = v_po.po_date,
           linked_po_created_at = v_po.esb_created_at,
           po_created_after_delivery = po_created_after_delivery or v_after_delivery,
           resolved_by = v_actor, resolved_at = clock_timestamp()
     where org_id = v_org_id and id = v_issue.id;
  end if;
  return jsonb_build_object(
    'status', case when v_matched < v_issue.quantity then 'open' else 'linked' end,
    'linked_po_number', v_po.po_number,
    'matched_quantity', trim_scale(v_matched)::text,
    'remaining_quantity', trim_scale(v_issue.quantity - v_matched)::text,
    'posting', case when v_hold is null then 'queued' else 'held' end,
    'po_created_after_delivery', v_after_delivery
  );
end;
$$;
comment on function ops.link_cafe_receipt_issue(uuid, text) is
  'Procurement only (FR-1035/1036/1038). Links an open blocking issue to an open PO of the receipt''s branch holding its product detail, dated on or before arrival, from a current cache. What the PO still has becomes a portion on the #1429 posting path (queued and enqueued once, or held); a remainder stays an open over-delivery issue. Records PO created after delivery.';
revoke execute on function ops.link_cafe_receipt_issue(uuid, text) from public, anon, authenticated;
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
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_org_id is null or v_actor is null or not ops.can_manage_cafe_receipt_issues() then
    raise exception 'CAFE_RECEIPT_ISSUE_PROCUREMENT_ONLY' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'CAFE_RECEIPT_ISSUE_NOTE_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'CAFE_RECEIPT_ISSUE_NOTE_TOO_LONG' using errcode = '22023';
  end if;
  update ops.cafe_receipt_issues
     set status = 'closed', closed_note = v_note, resolved_by = v_actor, resolved_at = clock_timestamp()
   where org_id = v_org_id and id = p_issue_id and status = 'open';
  if not found then
    raise exception 'CAFE_RECEIPT_ISSUE_NOT_OPEN' using errcode = '22023';
  end if;
  return jsonb_build_object('status', 'closed');
end;
$$;
comment on function ops.close_cafe_receipt_issue(uuid, text) is
  'Procurement only (FR-1037): closes an open issue with a required note of at most 500 characters. Its portion is never posted; the receipt, line, photos and issue stay.';
revoke execute on function ops.close_cafe_receipt_issue(uuid, text) from public, anon, authenticated;
grant execute on function ops.close_cafe_receipt_issue(uuid, text) to authenticated;

-- ── FR-1030 release, with linked portions kept on their PO (#1431) ────────────────────────────
-- A portion a procurement link made stays on the PO procurement chose: the release re-checks it
-- against that PO alone, before any re-match. When that PO no longer has the quantity, the part
-- goes back to its issue, open, for procurement to link again or close. Every other held portion
-- is re-matched as 20261007003000 does.
create or replace function ops.release_cafe_receipts(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_started timestamptz := clock_timestamp();
  v_receipt ops.cafe_receipts%rowtype;
  v_link ops.cafe_receipt_portions%rowtype;
  v_location text;
  v_lines jsonb;
  v_alloc jsonb;
  v_reason text;
begin
  if v_org_id is null or shared.current_person_id() is null
     or not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_RECEIPT_RELEASE_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.branches b where b.org_id = v_org_id and b.id = p_branch_id) then
    raise exception 'CAFE_RECEIPT_RELEASE_BRANCH_NOT_FOUND' using errcode = '22023';
  end if;
  if not coalesce((select s.posting_enabled from ops.cafe_receipt_posting_switches s
                     where s.org_id = v_org_id and s.branch_id = p_branch_id), false) then
    raise exception 'CAFE_RECEIPT_POSTING_OFF' using errcode = '55000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-match:' || v_org_id || ':' || p_branch_id, 0));

  if not ops._cafe_open_po_cache_current(v_org_id, p_branch_id) then
    insert into ops.cafe_open_po_branches (org_id, branch_id, refresh_requested_at)
    values (v_org_id, p_branch_id, clock_timestamp())
    on conflict (org_id, branch_id) do update
      set refresh_requested_at = coalesce(ops.cafe_open_po_branches.refresh_requested_at, excluded.refresh_requested_at),
          updated_at = clock_timestamp();
    v_reason := 'po_data_not_current';
  else
    -- Receipts approved while PO data was missing are matched now, which also enqueues what fits.
    perform ops._match_waiting_cafe_receipts_at(v_org_id, p_branch_id);

    -- Linked portions release before approval-held ones: procurement's pick wins a lowered outstanding.
    -- Oldest arrival first, each is enqueued before the next is checked, so two links on one PO
    -- never post its outstanding twice.
    for v_link in
      select q.* from ops.cafe_receipt_portions q
        join ops.cafe_receipts r on r.org_id = q.org_id and r.id = q.receipt_id
       where q.org_id = v_org_id and r.branch_id = p_branch_id and r.status = 'Approved'
         and q.state = 'held' and q.issue_id is not null
       order by r.arrival_date, r.received_at, q.created_at, q.id
    loop
      select * into v_receipt from ops.cafe_receipts r where r.org_id = v_org_id and r.id = v_link.receipt_id;
      v_location := ops._cafe_receipt_location(v_org_id, p_branch_id, v_receipt.receiving_location_key);
      if v_location is null then
        update ops.cafe_receipt_portions q
           set hold_reason = 'receiving_location_missing', updated_at = clock_timestamp()
         where q.id = v_link.id and q.hold_reason is distinct from 'receiving_location_missing';
        continue;
      end if;
      if v_link.quantity > coalesce((select sum((x ->> 'outstanding')::numeric)
                                       from jsonb_array_elements(ops._cafe_receipt_po_lines(v_org_id, p_branch_id)) x
                                      where x ->> 'po_number' = v_link.po_number
                                        and (x ->> 'item_unit_id')::uuid = v_link.item_unit_id), 0) then
        -- The linked PO has no room for the part: it leaves the posting path and its issue is open
        -- again for that quantity, added to any part still open.
        update ops.cafe_receipt_portions q
           set state = 'superseded', hold_reason = null, updated_at = clock_timestamp()
         where q.id = v_link.id;
        update ops.cafe_receipt_issues i
           set quantity = case when i.status = 'open' then i.quantity + v_link.quantity else v_link.quantity end,
               status = 'open', reopened_po_number = v_link.po_number,
               linked_po_number = null, linked_po_date = null, linked_po_created_at = null,
               closed_note = null, resolved_by = null, resolved_at = null
         where i.org_id = v_org_id and i.id = v_link.issue_id;
        continue;
      end if;
      update ops.cafe_receipt_portions q
         set state = 'superseded', hold_reason = null, updated_at = clock_timestamp()
       where q.id = v_link.id;
      insert into ops.cafe_receipt_portions (org_id, receipt_id, line_id, item_unit_id, po_number, po_date, quantity,
                                             state, hold_reason, issue_id, po_created_after_delivery)
      values (v_org_id, v_link.receipt_id, v_link.line_id, v_link.item_unit_id, v_link.po_number, v_link.po_date,
              v_link.quantity, 'queued', null, v_link.issue_id, v_link.po_created_after_delivery);
      perform ops._enqueue_cafe_receipt_portions(v_link.receipt_id, v_location);
    end loop;

    for v_receipt in
      select r.* from ops.cafe_receipts r
       where r.org_id = v_org_id and r.branch_id = p_branch_id and r.status = 'Approved'
         and exists (select 1 from ops.cafe_receipt_portions q
                      where q.org_id = r.org_id and q.receipt_id = r.id and q.state = 'held' and q.issue_id is null)
       order by r.arrival_date, r.received_at, r.id
    loop
      v_location := ops._cafe_receipt_location(v_org_id, p_branch_id, v_receipt.receiving_location_key);
      select jsonb_agg(jsonb_build_object('line_id', l.id, 'item_unit_id', l.item_unit_id, 'wip_item_id', l.wip_item_id,
                                          'quantity', h.quantity) order by l.created_at, l.id)
        into v_lines
        from (select q.line_id, sum(q.quantity) as quantity from ops.cafe_receipt_portions q
               where q.org_id = v_org_id and q.receipt_id = v_receipt.id and q.state = 'held' and q.issue_id is null
               group by q.line_id) h
        join ops.cafe_receipt_lines l on l.id = h.line_id;
      v_alloc := ops.match_cafe_receipt_lines(v_lines, ops._cafe_receipt_po_lines(v_org_id, p_branch_id));
      if v_location is null or not exists (select 1 from jsonb_array_elements(v_alloc) a where a ->> 'kind' = 'matched') then
        update ops.cafe_receipt_portions q
           set hold_reason = case when v_location is null then 'receiving_location_missing' else 'no_longer_fits' end,
               updated_at = clock_timestamp()
         where q.org_id = v_org_id and q.receipt_id = v_receipt.id and q.state = 'held' and q.issue_id is null
           and q.hold_reason is distinct from case when v_location is null then 'receiving_location_missing' else 'no_longer_fits' end;
        continue;
      end if;
      update ops.cafe_receipt_portions q
         set state = 'superseded', hold_reason = null, updated_at = clock_timestamp()
       where q.org_id = v_org_id and q.receipt_id = v_receipt.id and q.state = 'held' and q.issue_id is null;
      insert into ops.cafe_receipt_portions (org_id, receipt_id, line_id, item_unit_id, po_number, po_date, quantity, state, hold_reason)
      select v_org_id, v_receipt.id, l.id, l.item_unit_id,
             case when a ->> 'kind' = 'matched' then a ->> 'po_number' end,
             case when a ->> 'kind' = 'matched' then (a ->> 'po_date')::date end,
             (a ->> 'quantity')::numeric,
             case when a ->> 'kind' = 'matched' then 'queued' else 'held' end,
             case when a ->> 'kind' = 'matched' then null else 'no_longer_fits' end
        from jsonb_array_elements(v_alloc) a
        join ops.cafe_receipt_lines l on l.id = (a ->> 'line_id')::uuid;
      perform ops._enqueue_cafe_receipt_portions(v_receipt.id, v_location);
    end loop;
  end if;

  return (
    select jsonb_strip_nulls(jsonb_build_object('reason', v_reason)) || jsonb_build_object(
             'released_receipts', count(distinct q.receipt_id) filter (where q.state = 'queued' and q.created_at >= v_started),
             'queued_portions', count(*) filter (where q.state = 'queued' and q.created_at >= v_started),
             'held_portions', count(*) filter (where q.state = 'held'),
             'held_receipts', count(distinct q.receipt_id) filter (where q.state = 'held'),
             'held_location_missing', count(*) filter (where q.hold_reason = 'receiving_location_missing'))
      from ops.cafe_receipt_portions q
      join ops.cafe_receipts r on r.org_id = q.org_id and r.id = q.receipt_id
     where q.org_id = v_org_id and r.branch_id = p_branch_id
  );
end;
$$;
comment on function ops.release_cafe_receipts(uuid) is
  'FR-1030: an ops lead or admin releases a branch''s held Approved receipts once its posting switch is on. A portion a procurement link made posts only on its linked PO; when that PO has no room, its issue is open again for that quantity. Every other held quantity is re-matched against the current cache less what is already enqueued, queues what fits once and keeps the rest held with a reason; a rerun enqueues nothing new. Without current PO data it enqueues nothing, asks for a refresh and says why.';
revoke execute on function ops.release_cafe_receipts(uuid) from public, anon, authenticated;
grant execute on function ops.release_cafe_receipts(uuid) to authenticated;

-- ── Record history (FR-1039) ─────────────────────────────────────────────────────────────────
-- The history writer relies on every audited table's org_id referencing shared.orgs.
alter table ops.cafe_receipt_portions
  add constraint cafe_receipt_portions_org_fk foreign key (org_id) references shared.orgs(id) on delete cascade;
alter table ops.cafe_receipt_issues
  add constraint cafe_receipt_issues_org_fk foreign key (org_id) references shared.orgs(id) on delete cascade;
-- Each reader is the source table's own read under the caller's RLS. No table here hard-deletes
-- through the app, so delete rows (an org removal) read as false. Photos are immutable storage
-- objects that carry their own owner and created time.
create or replace function shared._history_reader_ops_cafe_receipts(p_record_key text, p_action text, p_snapshot jsonb)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_action in ('insert', 'update')
     and p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from ops.cafe_receipts r where r.id = p_record_key::uuid and r.org_id = (select shared.current_org_id()))
$$;
create or replace function shared._history_reader_ops_cafe_receipt_lines(p_record_key text, p_action text, p_snapshot jsonb)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_action in ('insert', 'update')
     and p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from ops.cafe_receipt_lines l where l.id = p_record_key::uuid and l.org_id = (select shared.current_org_id()))
$$;
create or replace function shared._history_reader_ops_cafe_receipt_portions(p_record_key text, p_action text, p_snapshot jsonb)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_action in ('insert', 'update')
     and p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from ops.cafe_receipt_portions q where q.id = p_record_key::uuid and q.org_id = (select shared.current_org_id()))
$$;
create or replace function shared._history_reader_ops_cafe_receipt_issues(p_record_key text, p_action text, p_snapshot jsonb)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_action in ('insert', 'update')
     and p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from ops.cafe_receipt_issues i where i.id = p_record_key::uuid and i.org_id = (select shared.current_org_id()))
$$;
create or replace function shared._history_reader_ops_cafe_receipt_issue_access(p_record_key text, p_action text, p_snapshot jsonb)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_action in ('insert', 'update')
     and p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from ops.cafe_receipt_issue_access a where a.id = p_record_key::uuid and a.org_id = (select shared.current_org_id()))
$$;
comment on function shared._history_reader_ops_cafe_receipts(text, text, jsonb) is
  'History read predicate for ops.cafe_receipts (#1431): the receipt''s own read policy over the live row.';
comment on function shared._history_reader_ops_cafe_receipt_lines(text, text, jsonb) is
  'History read predicate for ops.cafe_receipt_lines (#1431): the line''s own read policy over the live row.';
comment on function shared._history_reader_ops_cafe_receipt_portions(text, text, jsonb) is
  'History read predicate for ops.cafe_receipt_portions (#1431): the portion''s own read policy over the live row.';
comment on function shared._history_reader_ops_cafe_receipt_issues(text, text, jsonb) is
  'History read predicate for ops.cafe_receipt_issues (#1431): the issue''s own read policy over the live row.';
comment on function shared._history_reader_ops_cafe_receipt_issue_access(text, text, jsonb) is
  'History read predicate for ops.cafe_receipt_issue_access (#1431): the grant''s own read policy (self or admin) over the live row.';
revoke all on function
  shared._history_reader_ops_cafe_receipts(text, text, jsonb),
  shared._history_reader_ops_cafe_receipt_lines(text, text, jsonb),
  shared._history_reader_ops_cafe_receipt_portions(text, text, jsonb),
  shared._history_reader_ops_cafe_receipt_issues(text, text, jsonb),
  shared._history_reader_ops_cafe_receipt_issue_access(text, text, jsonb)
  from public, anon;
grant execute on function
  shared._history_reader_ops_cafe_receipts(text, text, jsonb),
  shared._history_reader_ops_cafe_receipt_lines(text, text, jsonb),
  shared._history_reader_ops_cafe_receipt_portions(text, text, jsonb),
  shared._history_reader_ops_cafe_receipt_issues(text, text, jsonb),
  shared._history_reader_ops_cafe_receipt_issue_access(text, text, jsonb)
  to authenticated;
insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('ops', 'cafe_receipts', 'shared._history_reader_ops_cafe_receipts(text, text, jsonb)'),
  ('ops', 'cafe_receipt_lines', 'shared._history_reader_ops_cafe_receipt_lines(text, text, jsonb)'),
  ('ops', 'cafe_receipt_portions', 'shared._history_reader_ops_cafe_receipt_portions(text, text, jsonb)'),
  ('ops', 'cafe_receipt_issues', 'shared._history_reader_ops_cafe_receipt_issues(text, text, jsonb)'),
  ('ops', 'cafe_receipt_issue_access', 'shared._history_reader_ops_cafe_receipt_issue_access(text, text, jsonb)');
create trigger record_history_cafe_receipts
  after insert or update or delete on ops.cafe_receipts
  for each row execute function shared._record_history_write('-row_version');
create trigger record_history_cafe_receipt_lines
  after insert or update or delete on ops.cafe_receipt_lines
  for each row execute function shared._record_history_write();
create trigger record_history_cafe_receipt_portions
  after insert or update or delete on ops.cafe_receipt_portions
  for each row execute function shared._record_history_write();
create trigger record_history_cafe_receipt_issues
  after insert or update or delete on ops.cafe_receipt_issues
  for each row execute function shared._record_history_write();
create trigger record_history_cafe_receipt_issue_access
  after insert or update or delete on ops.cafe_receipt_issue_access
  for each row execute function shared._record_history_write();
