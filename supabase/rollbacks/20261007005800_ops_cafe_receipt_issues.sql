-- #1431 rollback. Refuse if this migration's capability, resolutions or informational issues have been used.
begin;
do $$
begin
  if exists (select 1 from ops.cafe_receipt_issue_access)
     or exists (select 1 from ops.cafe_receipt_issue_events)
     or exists (select 1 from ops.cafe_receipt_issues where kind in ('short', 'damaged_wrong') or status <> 'open')
     or exists (select 1 from ops.cafe_receipt_portions where hold_reason = 'issue_linked') then
    raise exception 'Refusing to remove used Receipt issues access, issue history, information issues, or held linked portions';
  end if;
end $$;

 drop trigger cafe_receipt_matches_information_issues on ops.cafe_receipt_matches;
 drop function ops._record_cafe_receipt_information_issues();
 drop trigger cafe_receipt_issues_fill_reason on ops.cafe_receipt_issues;
 drop function ops._fill_cafe_receipt_issue_reason();
 drop function ops.close_cafe_receipt_issue(uuid, text);
 drop function ops.link_cafe_receipt_issue(uuid, text);
 drop function ops.request_cafe_receipt_issue_po_refresh(uuid);
 drop function ops.cafe_receipt_issue_open_pos(uuid);
 drop function ops.get_cafe_receipt_issue_access(uuid);
 drop function ops.set_cafe_receipt_issue_access(uuid, boolean);
 drop function ops.can_manage_cafe_receipt_issues();

 drop policy cafe_receipt_issue_events_select_visible on ops.cafe_receipt_issue_events;
 drop table ops.cafe_receipt_issue_events;
 drop policy cafe_receipt_issues_select_receiver_reviewer_or_procurement on ops.cafe_receipt_issues;
 drop policy cafe_receipt_issue_access_select_self_or_admin on ops.cafe_receipt_issue_access;
 drop table ops.cafe_receipt_issue_access;

 drop policy cafe_receipt_portions_select_reviewer_or_procurement on ops.cafe_receipt_portions;
 create policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions
   for select to authenticated
   using (
     org_id = (select shared.current_org_id())
     and exists (select 1 from ops.cafe_receipts r
                  where r.org_id = cafe_receipt_portions.org_id and r.id = cafe_receipt_portions.receipt_id
                    and ops.can_review_stream(r.branch_id, r.activity))
   );
 alter table ops.cafe_receipt_portions drop constraint cafe_receipt_portions_hold_reason_check;
 alter table ops.cafe_receipt_portions add constraint cafe_receipt_portions_hold_reason_check
   check (hold_reason in ('posting_off', 'receiving_location_missing', 'no_longer_fits'));

 drop policy cafe_receipts_select_receiver_reviewer_or_procurement on ops.cafe_receipts;
 create policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts
   for select to authenticated
   using (
     org_id = (select shared.current_org_id())
     and (received_by = (select shared.current_person_id()) or ops.can_review_stream(branch_id, activity))
   );
 drop policy cafe_receipt_issues_select_receiver_reviewer_or_procurement on ops.cafe_receipt_issues;
 create policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues
   for select to authenticated
   using (
     org_id = (select shared.current_org_id())
     and exists (select 1 from ops.cafe_receipts r
                  where r.org_id = cafe_receipt_issues.org_id and r.id = cafe_receipt_issues.receipt_id
                    and (r.received_by = (select shared.current_person_id())
                         or ops.can_review_stream(r.branch_id, r.activity)))
   );

 create or replace function ops.can_read_cafe_open_pos(p_branch_id uuid)
 returns boolean
 language sql
 stable
 security invoker
 set search_path = ''
 as $$
   select exists (
     select 1 from shared.teams t
      where t.org_id = shared.current_org_id()
        and t.branch_id = p_branch_id
        and t.activity is not null
        and t.archived_at is null
        and ops.can_review_stream(t.branch_id, t.activity)
   )
 $$;

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
            or (r.status in ('Submitted', 'Approved', 'Rejected') and ops.can_review_stream(r.branch_id, r.activity)))
   );
 end;
 $$;
 comment on function ops.can_read_cafe_receipt_photo(text) is
   'Private photo read follows same-org receipt RLS: its receiver may read their own receipt; stream reviewers may read evidence once submitted. SECURITY DEFINER.';
 revoke execute on function ops.can_read_cafe_receipt_photo(text) from public, anon, authenticated;
 grant execute on function ops.can_read_cafe_receipt_photo(text) to authenticated, service_role;

 alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_org_id_id_uk;
 alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_resolution_pair_ck;
 alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_resolution_status_ck;
 alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_close_note_ck;
 alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_linked_po_ck;
 alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_status_check;
 alter table ops.cafe_receipt_issues drop constraint cafe_receipt_issues_kind_check;
 alter table ops.cafe_receipt_issues drop column reason,
   drop column linked_po_number,
   drop column linked_po_date,
   drop column linked_po_created_at,
   drop column closed_note,
   drop column resolved_by,
   drop column resolved_at;
 alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_kind_check check (kind in ('no_po', 'over', 'wrong_unit'));
 alter table ops.cafe_receipt_issues add constraint cafe_receipt_issues_status_check check (status = 'open');

commit;
