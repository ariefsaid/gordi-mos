-- Rollback for 20261007008200_ops_cafe_receipt_issues.sql (#1431).
-- Refuses once the capability was granted or an issue was linked, closed or recorded as informational.
begin;
do $$
begin
  if exists (select 1 from ops.cafe_receipt_issue_access)
     or exists (select 1 from ops.cafe_receipt_issues where kind in ('short', 'damaged_wrong') or status <> 'open') then
    raise exception 'manual rollback blocked: Receipt issue grants, resolutions or informational issues exist; export or retain them first';
  end if;
end;
$$;

-- Record history: observers first, then the registry rows, the readers and their rows.
drop trigger record_history_cafe_receipts on ops.cafe_receipts;
drop trigger record_history_cafe_receipt_lines on ops.cafe_receipt_lines;
drop trigger record_history_cafe_receipt_portions on ops.cafe_receipt_portions;
drop trigger record_history_cafe_receipt_issues on ops.cafe_receipt_issues;
drop trigger record_history_cafe_receipt_issue_access on ops.cafe_receipt_issue_access;
delete from shared.record_history_readers where schema_name = 'ops' and table_name in (
  'cafe_receipts', 'cafe_receipt_lines', 'cafe_receipt_portions', 'cafe_receipt_issues', 'cafe_receipt_issue_access');
drop function shared._history_reader_ops_cafe_receipts(text, text, jsonb);
drop function shared._history_reader_ops_cafe_receipt_lines(text, text, jsonb);
drop function shared._history_reader_ops_cafe_receipt_portions(text, text, jsonb);
drop function shared._history_reader_ops_cafe_receipt_issues(text, text, jsonb);
drop function shared._history_reader_ops_cafe_receipt_issue_access(text, text, jsonb);
delete from shared.record_history where schema_name = 'ops' and table_name in (
  'cafe_receipts', 'cafe_receipt_lines', 'cafe_receipt_portions', 'cafe_receipt_issues', 'cafe_receipt_issue_access');
alter table ops.cafe_receipt_portions drop constraint cafe_receipt_portions_org_fk;
alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_org_fk;

drop function ops.close_cafe_receipt_issue(uuid, text);
drop function ops.link_cafe_receipt_issue(uuid, text);
drop function ops.request_cafe_receipt_issue_po_refresh(uuid);
drop function ops.cafe_receipt_issue_open_pos(uuid);
drop trigger cafe_receipt_matches_information_issues on ops.cafe_receipt_matches;
drop function ops._record_cafe_receipt_information_issues();
drop function ops.cafe_receipt_portion_po_created_after_delivery(ops.cafe_receipt_portions);
drop function ops.cafe_receipt_line_po_created_after_delivery(ops.cafe_receipt_lines);

-- The receipt posting summary as 20261007003000.
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
                          where i.org_id = v_receipt.org_id and i.receipt_id = v_receipt.id),
           'open_issues', (select count(*)::int from ops.cafe_receipt_issues i
                            where i.org_id = v_receipt.org_id and i.receipt_id = v_receipt.id and i.status = 'open'))
    into v_result
    from ops.cafe_receipt_portions q
    left join integrations.esb_push e on e.id = q.push_id
   where q.org_id = v_receipt.org_id and q.receipt_id = v_receipt.id and q.state <> 'superseded';
  return v_result;
end;
$$;
comment on function ops.cafe_receipt_posting(ops.cafe_receipts) is
  'An Approved receipt''s posting state (not_posted, held, queued, posted, failed), whether it was matched, and how many unmatched portions and open issues it has; null for any other status or a receipt the caller cannot read.';
revoke execute on function ops.cafe_receipt_posting(ops.cafe_receipts) from public, anon;
grant execute on function ops.cafe_receipt_posting(ops.cafe_receipts) to authenticated;

-- The open-PO reader as 20261007001700.
create or replace function ops.can_read_cafe_open_pos(p_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
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
  'Who reads a branch''s cached open POs with quantities: a reviewer of any stream at that branch, and ops lead and admin through ops.can_review_stream. Procurement joins here with its capability (#1431). Floor members get ops.cafe_open_po_identities instead (DD-CAFE-MVP-6).';

-- The photo evidence reader as 20261007006000.
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
       and (r.received_by = shared.current_person_id()
            or (r.status in ('Submitted', 'Approved', 'Rejected') and ops.can_review_stream(r.branch_id, r.activity)))
  );
$$;
comment on function ops.can_read_cafe_receipt_evidence(uuid) is
  'Who reads a receipt''s photo evidence: same org, and its receiver, or a stream reviewer once it is Submitted, Approved or Rejected. SECURITY DEFINER.';
revoke execute on function ops.can_read_cafe_receipt_evidence(uuid) from public, anon, authenticated;

-- The three read policies as 20261007000100 and 20261007003000.
alter policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts
  using (
    org_id = (select shared.current_org_id())
    and (received_by = (select shared.current_person_id())
         or ops.can_review_stream(branch_id, activity))
  );
comment on policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts is
  'A receiver reads their own receipts; a stream reviewer reads that stream''s, and ops lead and admin read every stream (ops.can_review_stream).';
alter policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r
                 where r.org_id = cafe_receipt_issues.org_id and r.id = cafe_receipt_issues.receipt_id
                   and (r.received_by = (select shared.current_person_id())
                        or ops.can_review_stream(r.branch_id, r.activity)))
  );
comment on policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues is
  'The receiver reads the issues on their own receipts (FR-1040) and reviewers of the stream read the stream''s; procurement joins with its capability (#1431).';
alter policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r
                 where r.org_id = cafe_receipt_portions.org_id and r.id = cafe_receipt_portions.receipt_id
                   and ops.can_review_stream(r.branch_id, r.activity))
  );
comment on policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions is
  'Matched quantities per PO reveal outstanding, so only reviewers of the receipt''s stream read them (DD-CAFE-MVP-6); the receiver reads the posting state as text through ops.cafe_receipt_posting.';

-- The issue table as 20261007003000.
alter table ops.cafe_receipt_issues
  drop constraint cafe_receipt_issues_resolution_ck,
  drop column linked_po_number,
  drop column linked_po_date,
  drop column linked_po_created_at,
  drop column po_created_after_delivery,
  drop column closed_note,
  drop column resolved_by,
  drop column resolved_at;
alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_status_check;
alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_status_check check (status = 'open');
alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_kind_check;
alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_kind_check check (kind in ('no_po', 'over', 'wrong_unit'));
comment on table ops.cafe_receipt_issues is
  'A blocking Receipt issue: the part of a line that matched no open-PO line (no_po), was above total outstanding (over) or came in a unit no PO line orders (wrong_unit). Created at matching; procurement''s link and close arrive with #1431.';

drop function ops.set_cafe_receipt_issue_access(uuid, boolean);
drop function ops.get_cafe_receipt_issue_access(uuid);
drop function ops.can_manage_cafe_receipt_issues();
drop table ops.cafe_receipt_issue_access;

commit;
