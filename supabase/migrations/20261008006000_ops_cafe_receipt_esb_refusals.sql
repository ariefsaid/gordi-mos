-- A procurement holder or reviewer reads only the permanently ESB-refused receipt portions.
-- The outbox message and MOS key are sensitive posting context; keep their role gate here.
-- DOWN: drop function ops.cafe_receipt_esb_refused_portions(integer, integer);
create or replace function ops.cafe_receipt_esb_refused_portions(p_offset integer default 0, p_limit integer default 1000)
returns table (
  portion_id uuid,
  receipt_id uuid,
  line_id uuid,
  quantity numeric,
  created_at timestamptz,
  po_number text,
  mos_key text,
  esb_message text
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.receipt_id, q.line_id, q.quantity, q.created_at, q.po_number,
         e.payload ->> 'mos_key', e.last_error
    from ops.cafe_receipt_portions q
    join ops.cafe_receipts r on r.org_id = q.org_id and r.id = q.receipt_id
    join integrations.esb_push e on e.id = q.push_id and e.org_id = q.org_id
   where q.org_id = shared.current_org_id()
     and q.state = 'held'
     and q.hold_reason = 'esb_refused'
     and q.po_number is not null
     and e.source_module = 'cafe_receipt'
     and e.status = 'dead_letter'
     and ((select ops.can_manage_cafe_receipt_issues())
          or ops.can_review_stream(r.branch_id, r.activity))
   order by q.created_at, q.id
   limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
   offset greatest(coalesce(p_offset, 0), 0);
$$;
comment on function ops.cafe_receipt_esb_refused_portions(integer, integer) is
  'Read-only paged list of permanently ESB-refused receipt portions, including their MOS key and outbox message. Same-org procurement holders and reviewers of the receipt''s stream only; receivers do not read outbox details.';
revoke execute on function ops.cafe_receipt_esb_refused_portions(integer, integer) from public, anon;
grant execute on function ops.cafe_receipt_esb_refused_portions(integer, integer) to authenticated;
