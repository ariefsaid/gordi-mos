-- DOWN for 20261020003000_ops_cafe_receipt_read_sets.sql. Restores the preceding read policies.
begin;
do $$
begin
  if to_regprocedure('ops.cafe_receipt_review_stream_keys()') is null then
    raise exception 'Receipt read-set migration is not installed';
  end if;
end;
$$;
alter policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts
using (
  org_id = (select shared.current_org_id())
  and ((status = 'Approved' and (select ops.can_manage_cafe_receipt_issues()))
    or received_by = (select shared.current_person_id())
    or ops.can_review_stream(branch_id, activity))
);
comment on policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts is
  'A procurement capability holder reads Approved receipts; a receiver reads their own; a stream reviewer reads that stream, and ops lead and admin read every stream.';
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
  'Procurement reads issues on Approved receipts, receivers read their own issues and stream reviewers read their stream issues.';
alter policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions
using (
  org_id = (select shared.current_org_id())
  and exists (select 1 from ops.cafe_receipts r
    where r.org_id = cafe_receipt_portions.org_id and r.id = cafe_receipt_portions.receipt_id
      and ((select ops.can_manage_cafe_receipt_issues()) or ops.can_review_stream(r.branch_id, r.activity)))
);
comment on policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions is
  'Only procurement and reviewers of the receipt stream read matched quantities; receivers read posting state as text.';
drop function ops.cafe_receipt_review_stream_keys();
commit;
