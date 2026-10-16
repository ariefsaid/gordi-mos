-- Rollback for 20261009000200_ops_cafe_receipt_issue_lock_order.sql (#1508).
-- Restores the link function's prior lock order.
begin;
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
commit;
