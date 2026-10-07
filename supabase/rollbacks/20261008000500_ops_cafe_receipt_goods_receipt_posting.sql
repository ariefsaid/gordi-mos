-- Rollback for 20261008000500_ops_cafe_receipt_goods_receipt_posting.sql (#1430).
-- Refuses once the worker has used what this migration added: a group with a posting stage, a
-- portion refused by ESB, or a portion that left queued while keeping its outbox link.
begin;
do $$
begin
  if exists (select 1 from integrations.esb_push_groups where posting_stage is not null)
     or exists (select 1 from ops.cafe_receipt_portions
                 where hold_reason in ('esb_refused', 'worker_refused') or (push_id is not null and state <> 'queued')) then
    raise exception 'manual rollback blocked: goods-receipt posting stages or refused or returned portions exist; settle or export them first';
  end if;
end;
$$;

drop function ops.refuse_cafe_receipt_portions(uuid, text);
drop function ops.rematch_cafe_receipt_group(uuid, jsonb);

-- The release as 20261007008200 defined it, then the shared return helper it now calls.
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
drop function ops._return_cafe_receipt_portion(uuid, numeric, text);

-- The enqueue as 20261007003000 defined it (no branch code or MOS key in the payload).
create or replace function ops._enqueue_cafe_receipt_portions(p_receipt_id uuid, p_location_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_env text := integrations.current_esb_target_env();
  v_po record;
  v_group uuid;
begin
  select * into v_receipt from ops.cafe_receipts r where r.id = p_receipt_id;
  for v_po in
    select q.po_number, min(q.id::text) as first_portion
      from ops.cafe_receipt_portions q
     where q.org_id = v_receipt.org_id and q.receipt_id = v_receipt.id and q.state = 'queued' and q.push_id is null
     group by q.po_number
     order by q.po_number
  loop
    insert into integrations.esb_push_groups (org_id, source_module, target_env, dedup_key)
    values (v_receipt.org_id, 'cafe_receipt', v_env,
            'cafe-receipt|' || v_receipt.id || '|' || v_po.po_number || '|' || v_po.first_portion || '|' || v_env)
    returning id into v_group;
    with members as (
      insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key, push_group_id)
      select v_receipt.org_id, 'cafe_receipt', q.id::text, 'goods-receipt',
             jsonb_build_object('receipt_id', v_receipt.id, 'portion_id', q.id, 'po_number', q.po_number,
                                'po_date', q.po_date, 'arrival_date', v_receipt.arrival_date,
                                'receiving_location_key', p_location_key,
                                'delivery_note_number', v_receipt.delivery_note_number,
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
revoke execute on function ops._enqueue_cafe_receipt_portions(uuid, text) from public, anon, authenticated, service_role;
drop function ops.cafe_receipt_mos_key(uuid, uuid);

alter table ops.cafe_receipt_portions drop constraint cafe_receipt_portions_posting_check;
alter table ops.cafe_receipt_portions add constraint cafe_receipt_portions_posting_check check (
  (state = 'held') = (hold_reason is not null)
  and (state <> 'queued' or (po_number is not null and po_date is not null))
  and (push_id is null or state = 'queued')
);
alter table ops.cafe_receipt_portions drop constraint cafe_receipt_portions_hold_reason_check;
alter table ops.cafe_receipt_portions add constraint cafe_receipt_portions_hold_reason_check
  check (hold_reason in ('posting_off', 'receiving_location_missing', 'no_longer_fits'));
comment on table ops.cafe_receipt_portions is
  'The matched part of a receipt line on one open PO. held: matched but not enqueued (posting off, no receiving location, or no longer fits the cache at release; a no-longer-fits portion has no PO). queued: enqueued once as an outbox member (push_id); the worker''s outcome is that member''s status. superseded: replaced by a release''s re-match.';

alter table integrations.esb_push_groups drop constraint esb_push_groups_posting_stage_check;
alter table integrations.esb_push_groups drop column posting_stage;

commit;
