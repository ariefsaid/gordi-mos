-- #1430 — the worker posts each (receipt, PO) outbox group as one ESB goods receipt. This migration
-- gives it what it needs from the database: a MOS key on every receipt (FR-1046), the branch code
-- and the group's document key on every member, the group's create-sent and created-number
-- checkpoints (FR-1025/1028), and one service-only RPC that returns what no longer fits a PO's
-- freshly read outstanding to Receipt issues (FR-1026/1027).
--
-- DOWN (manual, reversible):
--   drop function ops.return_cafe_receipt_excess(uuid, jsonb);
--   restore ops._enqueue_cafe_receipt_portions(uuid, text) from 20261007003000_ops_cafe_receipt_matching.sql;
--   alter table integrations.esb_push_groups drop column esb_create_sent_at, drop column esb_created_num;
--   alter table ops.cafe_receipts drop column mos_key;
--   drop sequence ops.cafe_receipt_mos_key_seq;

-- ── FR-1046 the MOS key: one short ASCII key per receipt, shown to procurement and finance ──────
create sequence ops.cafe_receipt_mos_key_seq;
revoke all on sequence ops.cafe_receipt_mos_key_seq from public, anon, authenticated, service_role;

alter table ops.cafe_receipts
  add column mos_key text not null default ('GR' || lpad(nextval('ops.cafe_receipt_mos_key_seq')::text, 6, '0'))
    constraint cafe_receipts_mos_key_uk unique
    constraint cafe_receipts_mos_key_check check (mos_key ~ '^GR[0-9]{6,}$');
comment on column ops.cafe_receipts.mos_key is
  'The receipt''s MOS key (GR and a number, unique across organisations). Each ESB goods receipt posted from it carries the key and a sequence (GR000123-1) in its information field, so the receipt, its issues and every post attempt find each other.';

-- ── FR-1025/1028 the group's checkpoints ─────────────────────────────────────────────────────────
alter table integrations.esb_push_groups
  add column esb_create_sent_at timestamptz,
  add column esb_created_num text check (esb_created_num is null or btrim(esb_created_num) <> '');
comment on column integrations.esb_push_groups.esb_create_sent_at is
  'Set by the worker just before it sends a create that ESB cannot deduplicate. Once set, every later attempt looks the document up by its key before creating again (FR-1028).';
comment on column integrations.esb_push_groups.esb_created_num is
  'A document ESB created but has not yet authorized (created, awaiting authorization). esb_doc_num is written only once ESB returns the authorized number (FR-1025).';

-- ── FR-1024/1029 members carry the branch code and the group's document key ────────────────────
create or replace function ops._enqueue_cafe_receipt_portions(p_receipt_id uuid, p_location_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_env text := integrations.current_esb_target_env();
  v_branch_code text;
  v_po record;
  v_group uuid;
  v_sequence integer;
begin
  select * into v_receipt from ops.cafe_receipts r where r.id = p_receipt_id;
  select b.code into v_branch_code from shared.branches b where b.org_id = v_receipt.org_id and b.id = v_receipt.branch_id;
  select count(distinct e.push_group_id)::int into v_sequence
    from integrations.esb_push e
   where e.org_id = v_receipt.org_id and e.source_module = 'cafe_receipt'
     and e.payload ->> 'receipt_id' = v_receipt.id::text;
  for v_po in
    select q.po_number, min(q.id::text) as first_portion
      from ops.cafe_receipt_portions q
     where q.org_id = v_receipt.org_id and q.receipt_id = v_receipt.id and q.state = 'queued' and q.push_id is null
     group by q.po_number
     order by q.po_number
  loop
    v_sequence := v_sequence + 1;
    insert into integrations.esb_push_groups (org_id, source_module, target_env, dedup_key)
    values (v_receipt.org_id, 'cafe_receipt', v_env,
            'cafe-receipt|' || v_receipt.id || '|' || v_po.po_number || '|' || v_po.first_portion || '|' || v_env)
    returning id into v_group;
    with members as (
      insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key, push_group_id)
      select v_receipt.org_id, 'cafe_receipt', q.id::text, 'goods-receipt',
             jsonb_build_object('receipt_id', v_receipt.id, 'portion_id', q.id, 'po_number', q.po_number,
                                'po_date', q.po_date, 'arrival_date', v_receipt.arrival_date,
                                'branch_code', v_branch_code,
                                'receiving_location_key', p_location_key,
                                'delivery_note_number', v_receipt.delivery_note_number,
                                'mos_key', v_receipt.mos_key || '-' || v_sequence,
                                'item_unit_id', q.item_unit_id, 'quantity', q.quantity),
             v_env, 'cafe-receipt-portion|' || q.id || '|' || v_env, v_group
        from ops.cafe_receipt_portions q
       where q.org_id = v_receipt.org_id and q.receipt_id = v_receipt.id and q.state = 'queued'
         and q.push_id is null and q.po_number = v_po.po_number
      returning id, source_ref
    )
    update ops.cafe_receipt_portions q
       set push_id = members.id, updated_at = clock_timestamp()
      from members
     where q.id = members.source_ref::uuid;
  end loop;
end;
$$;
comment on function ops._enqueue_cafe_receipt_portions(uuid, text) is
  'FR-1024: one outbox group per (receipt, PO) for the receipt''s queued portions not yet enqueued, one member per portion. Members carry the branch code (the worker''s id map resolves it) and the group''s document key, the receipt''s MOS key and a sequence (FR-1046).';
revoke execute on function ops._enqueue_cafe_receipt_portions(uuid, text) from public, anon, authenticated, service_role;

-- ── FR-1026/1027 the worker returns what no longer fits to Receipt issues ──────────────────────
-- p_fits: [{push_id, fits, kind}] for members of p_group_id. `fits` is how much of the member's
-- quantity still fits the PO's fresh outstanding (0 up to its quantity); the rest becomes an over or
-- no_po issue on the line. A member with nothing left leaves the group and is never sent. Returns the
-- members still in the group with their quantities.
create or replace function ops.return_cafe_receipt_excess(p_group_id uuid, p_fits jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group integrations.esb_push_groups%rowtype;
  v_receipt ops.cafe_receipts%rowtype;
  v_fit record;
  v_portion ops.cafe_receipt_portions%rowtype;
  v_member integrations.esb_push%rowtype;
  v_excess numeric;
begin
  select * into v_group from integrations.esb_push_groups g
   where g.id = p_group_id and g.source_module = 'cafe_receipt';
  if not found or v_group.status = 'posted' or v_group.esb_doc_num is not null or v_group.esb_created_num is not null
     or jsonb_typeof(p_fits) is distinct from 'array' then
    raise exception 'CAFE_RECEIPT_EXCESS_INVALID' using errcode = '22023';
  end if;
  select r.* into v_receipt
    from ops.cafe_receipts r
   where r.org_id = v_group.org_id
     and r.id = (select (e.payload ->> 'receipt_id')::uuid from integrations.esb_push e
                  where e.push_group_id = v_group.id limit 1);
  if found then
    perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-match:' || v_receipt.org_id || ':' || v_receipt.branch_id, 0));
  end if;

  for v_fit in
    select (f ->> 'push_id')::uuid as push_id, (f ->> 'fits')::numeric as fits, f ->> 'kind' as kind
      from jsonb_array_elements(p_fits) f
  loop
    select * into v_member from integrations.esb_push e
     where e.id = v_fit.push_id and e.push_group_id = v_group.id and e.org_id = v_group.org_id
       and e.status in ('pending', 'failed', 'in_flight')
       for update;
    if not found then
      raise exception 'CAFE_RECEIPT_EXCESS_INVALID' using errcode = '22023';
    end if;
    select * into v_portion from ops.cafe_receipt_portions q
     where q.org_id = v_group.org_id and q.push_id = v_member.id and q.state = 'queued'
       for update;
    if not found or v_fit.fits is null or v_fit.fits < 0 or v_fit.fits > v_portion.quantity
       or v_fit.kind is null or v_fit.kind not in ('over', 'no_po') then
      raise exception 'CAFE_RECEIPT_EXCESS_INVALID' using errcode = '22023';
    end if;
    v_excess := v_portion.quantity - v_fit.fits;
    continue when v_excess = 0;

    insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity)
    values (v_portion.org_id, v_portion.receipt_id, v_portion.line_id, v_portion.item_unit_id, v_fit.kind, v_excess)
    on conflict (line_id, kind) do update
      set quantity = ops.cafe_receipt_issues.quantity + excluded.quantity;

    if v_fit.fits > 0 then
      update ops.cafe_receipt_portions q
         set quantity = v_fit.fits, updated_at = clock_timestamp()
       where q.id = v_portion.id;
      update integrations.esb_push e
         set payload = e.payload || jsonb_build_object('quantity', v_fit.fits::numeric(14,4))
       where e.id = v_member.id;
    else
      update ops.cafe_receipt_portions q
         set state = 'superseded', push_id = null, updated_at = clock_timestamp()
       where q.id = v_portion.id;
      update integrations.esb_push e
         set push_group_id = null, status = 'dead_letter',
             last_error = 'Returned to Receipt issues: nothing of it fits the PO''s outstanding now.'
       where e.id = v_member.id;
    end if;
  end loop;

  if not exists (select 1 from integrations.esb_push e where e.push_group_id = v_group.id) then
    update integrations.esb_push_groups g
       set status = 'dead_letter',
           last_error = 'Returned to Receipt issues: nothing of this group fits the PO''s outstanding now; nothing was sent.'
     where g.id = v_group.id;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object('push_id', e.id, 'quantity', (e.payload ->> 'quantity')::numeric(14,4))
                              order by e.created_at, e.id), '[]'::jsonb)
      from integrations.esb_push e
     where e.push_group_id = v_group.id
  );
end;
$$;
comment on function ops.return_cafe_receipt_excess(uuid, jsonb) is
  'FR-1026/1027, worker only: after a fresh read of a PO''s outstanding, shrinks each listed member of a not-yet-created goods-receipt group to what fits and returns the excess to the line''s over or no_po Receipt issue. A member with nothing left leaves the group and is never sent; an emptied group is closed with the reason. Never grows a portion and never touches a posted member. Returns the members still in the group.';
revoke execute on function ops.return_cafe_receipt_excess(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function ops.return_cafe_receipt_excess(uuid, jsonb) to service_role;

comment on table ops.cafe_receipt_portions is
  'The matched part of a receipt line on one open PO. held: matched but not enqueued (posting off, no receiving location, or no longer fits the cache at release; a no-longer-fits portion has no PO). queued: enqueued once as an outbox member (push_id); the worker''s outcome is that member''s status. superseded: replaced by a release''s re-match, or returned whole to Receipt issues by the worker''s re-read of the PO.';
