-- #1504: compute receipt review authority once per statement, preserving the existing grants.
-- DOWN: run supabase/rollbacks/20261020003000_ops_cafe_receipt_read_sets.sql.

create function ops.cafe_receipt_review_stream_keys()
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when shared.has_access_role('ops_lead') or shared.has_access_role('admin') then array['*']::text[]
    when shared.has_access_role('supervisor') then coalesce((
      select array_agg(distinct t.branch_id::text || '|' || t.activity)
      from shared.teams t
      where t.org_id = shared.current_org_id()
        and t.branch_id is not null and t.activity is not null
        and ops.can_review_stream(t.branch_id, t.activity)
    ), '{}'::text[])
    else '{}'::text[]
  end
$$;
comment on function ops.cafe_receipt_review_stream_keys() is
  'Receipt read authority as a statement-local set: the existing stream predicate evaluated over teams, or * for the existing ops-lead/admin fallback. No archived-branch filter; historical receipts retain their read access.';
revoke execute on function ops.cafe_receipt_review_stream_keys() from public, anon;
grant execute on function ops.cafe_receipt_review_stream_keys() to authenticated;

alter policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts
using (
  org_id = (select shared.current_org_id())
  and ((status = 'Approved' and (select ops.can_manage_cafe_receipt_issues()))
    or received_by = (select shared.current_person_id())
    or array[branch_id::text || '|' || activity, '*'] && (select ops.cafe_receipt_review_stream_keys()))
);
comment on policy cafe_receipts_select_receiver_or_reviewer on ops.cafe_receipts is
  'Same-org receivers read their own receipts; procurement reads Approved receipts; reviewers read their streams, with the existing ops-lead/admin fallback. Review authority is a statement-local set.';

-- Lines already use this same parent visibility. Issues have identical reader grants to receipts,
-- so their parent policy supplies the complete check without repeating review authority per row.
alter policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues
using (
  org_id = (select shared.current_org_id())
  and exists (select 1 from ops.cafe_receipts r
    where r.org_id = cafe_receipt_issues.org_id and r.id = cafe_receipt_issues.receipt_id)
);
comment on policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues is
  'Issues have exactly their parent receipt''s reader grants, including the org seam.';

-- Portions still exclude a receiver without independent procurement or review authority.
alter policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions
using (
  org_id = (select shared.current_org_id())
  and exists (select 1 from ops.cafe_receipts r
    where r.org_id = cafe_receipt_portions.org_id and r.id = cafe_receipt_portions.receipt_id
      and ((select ops.can_manage_cafe_receipt_issues())
        or array[r.branch_id::text || '|' || r.activity, '*'] && (select ops.cafe_receipt_review_stream_keys())))
);
comment on policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions is
  'Only procurement and reviewers of the parent receipt''s stream read matched quantities. Review authority is a statement-local set; receipt and portion org seams remain enforced.';
