-- #1430 — the ESB worker posts each café receipt group (one per receipt and PO) as one goods
-- receipt: the database side of that posting.
--   * Each outbox member's payload carries the branch code (the id map's key for the receiving
--     location) and the MOS key the goods receipt carries into ESB (FR-1046).
--   * A group records where its posting stands (posting_stage): a create that may have reached
--     ESB, or a created goods receipt awaiting authorization (FR-1025, FR-1028).
--   * The worker's re-match against the PO's freshly read outstanding keeps what fits and returns
--     the rest to Receipt issues through the #1431 return path, now one helper (FR-1026/1027).
--   * A permanently refused group's portions leave queued until a release (DD-2026-10-06-1429 (6)),
--     held as esb_refused or, when the worker refused before contacting ESB, worker_refused; never
--     while ESB may hold a goods receipt for the group.
--
-- DOWN: see supabase/rollbacks/20261008000500_ops_cafe_receipt_goods_receipt_posting.sql.

-- ── The MOS key: one per receipt, extended per post attempt ─────────────────────────────────
create or replace function ops.cafe_receipt_mos_key(p_receipt_id uuid, p_group_id uuid default null)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select 'MOS-' || upper(left(replace(p_receipt_id::text, '-', ''), 8))
         || coalesce('-' || upper(left(replace(p_group_id::text, '-', ''), 8)), '')
$$;
comment on function ops.cafe_receipt_mos_key(uuid, uuid) is
  'FR-1046: the MOS key procurement and finance see. A receipt''s key is MOS- and eight characters of its id; each post attempt (outbox group) appends eight characters of the group id, so every goods receipt in ESB carries its receipt''s key and the worker can look one attempt up exactly.';
revoke execute on function ops.cafe_receipt_mos_key(uuid, uuid) from public, anon;
grant execute on function ops.cafe_receipt_mos_key(uuid, uuid) to authenticated, service_role;

-- ── Where a group's posting stands ──────────────────────────────────────────────────────────
alter table integrations.esb_push_groups
  add column posting_stage text,
  add constraint esb_push_groups_posting_stage_check check (
    posting_stage is null
    or (posting_stage = 'create_sent' and esb_doc_num is null)
    or (posting_stage = 'awaiting_authorization' and esb_doc_num is not null)
  );
comment on column integrations.esb_push_groups.posting_stage is
  'Goods-receipt groups only. create_sent: a create may have reached ESB with its answer lost, so the worker looks the MOS key up before any create. awaiting_authorization: esb_doc_num is a created goods receipt ESB has not authorized. Null: nothing is pending in ESB; with status posted, esb_doc_num is authorized.';

-- ── Portions: a refused one leaves queued and keeps its outbox link ─────────────────────────
alter table ops.cafe_receipt_portions drop constraint cafe_receipt_portions_hold_reason_check;
alter table ops.cafe_receipt_portions add constraint cafe_receipt_portions_hold_reason_check
  check (hold_reason in ('posting_off', 'receiving_location_missing', 'no_longer_fits', 'esb_refused', 'worker_refused'));
alter table ops.cafe_receipt_portions drop constraint cafe_receipt_portions_posting_check;
alter table ops.cafe_receipt_portions add constraint cafe_receipt_portions_posting_check check (
  (state = 'held') = (hold_reason is not null)
  and (state <> 'queued' or (po_number is not null and po_date is not null))
);
comment on table ops.cafe_receipt_portions is
  'The matched part of a receipt line on one open PO. held: matched but not enqueued (posting off, no receiving location, no longer fits the cache at release, refused by ESB, or refused by the worker before ESB was asked). queued: enqueued once as an outbox member (push_id); the worker''s outcome is that member''s status. superseded: replaced by a release''s re-match, or returned to a Receipt issue. A portion keeps push_id once enqueued, so every post attempt stays traceable.';

-- ── FR-1024 the enqueue: the payload carries the branch code and the MOS key ────────────────
-- Body otherwise as 20261007003000.
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
begin
  select * into v_receipt from ops.cafe_receipts r where r.id = p_receipt_id;
  select b.code into v_branch_code from shared.branches b where b.org_id = v_receipt.org_id and b.id = v_receipt.branch_id;
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
                                'branch_code', v_branch_code,
                                'receiving_location_key', p_location_key,
                                'delivery_note_number', v_receipt.delivery_note_number,
                                'mos_key', ops.cafe_receipt_mos_key(v_receipt.id, v_group),
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

-- ── The #1431 return path, one helper ───────────────────────────────────────────────────────
-- A portion gives back part or all of its quantity: what it keeps stays on its path; the rest is
-- a Receipt issue again. A linked portion returns to the issue procurement linked; any other
-- adds to (or re-opens) the line's issue of that kind. A portion returning everything is
-- superseded. Internal: the release and the worker's re-match call it under the matching lock.
create or replace function ops._return_cafe_receipt_portion(p_portion_id uuid, p_quantity numeric, p_kind text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_portion ops.cafe_receipt_portions%rowtype;
begin
  select * into v_portion from ops.cafe_receipt_portions q where q.id = p_portion_id for update;
  if not found or p_quantity is null or p_quantity <= 0 or p_quantity > v_portion.quantity
     or (v_portion.issue_id is null and coalesce(p_kind not in ('no_po', 'over', 'wrong_unit'), true)) then
    raise exception 'CAFE_RECEIPT_PORTION_RETURN_INVALID' using errcode = '22023';
  end if;
  if p_quantity = v_portion.quantity then
    update ops.cafe_receipt_portions q
       set state = 'superseded', hold_reason = null, updated_at = clock_timestamp()
     where q.id = v_portion.id;
  else
    update ops.cafe_receipt_portions q
       set quantity = q.quantity - p_quantity, updated_at = clock_timestamp()
     where q.id = v_portion.id;
  end if;
  if v_portion.issue_id is not null then
    update ops.cafe_receipt_issues i
       set quantity = case when i.status = 'open' then i.quantity + p_quantity else p_quantity end,
           status = 'open', reopened_po_number = v_portion.po_number,
           linked_po_number = null, linked_po_date = null, linked_po_created_at = null,
           closed_note = null, resolved_by = null, resolved_at = null
     where i.org_id = v_portion.org_id and i.id = v_portion.issue_id;
  else
    insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity, reopened_po_number)
    values (v_portion.org_id, v_portion.receipt_id, v_portion.line_id, v_portion.item_unit_id, p_kind, p_quantity,
            v_portion.po_number)
    on conflict (line_id, kind) do update
      set quantity = case when ops.cafe_receipt_issues.status = 'open'
                          then ops.cafe_receipt_issues.quantity + excluded.quantity else excluded.quantity end,
          status = 'open', reopened_po_number = excluded.reopened_po_number,
          linked_po_number = null, linked_po_date = null, linked_po_created_at = null,
          closed_note = null, resolved_by = null, resolved_at = null;
  end if;
end;
$$;
comment on function ops._return_cafe_receipt_portion(uuid, numeric, text) is
  'Returns part or all of a portion''s quantity to Receipt issues: a linked portion''s to its own issue, any other''s to the line''s issue of the given blocking kind, re-opened with the PO that had no room. Internal to the release and the worker re-match.';
revoke all on function ops._return_cafe_receipt_portion(uuid, numeric, text) from public, anon, authenticated, service_role;

-- ── FR-1030 release, through the shared return path ─────────────────────────────────────────
-- Body as 20261007008200, with the linked portion's return now ops._return_cafe_receipt_portion.
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
        perform ops._return_cafe_receipt_portion(v_link.id, v_link.quantity, null);
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

-- ── FR-1026/1027 the worker's re-match against a freshly read outstanding ───────────────────
create or replace function ops.rematch_cafe_receipt_group(p_group_id uuid, p_po_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_lines jsonb;
  v_po_number text;
  v_po_date date;
  v_po jsonb;
  v_alloc jsonb;
  v_portion record;
  v_keep numeric;
begin
  if jsonb_typeof(coalesce(p_po_lines, '[]'::jsonb)) <> 'array'
     or exists (select 1 from jsonb_array_elements(coalesce(p_po_lines, '[]'::jsonb)) x
                 where jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'item_unit_id') <> 'string'
                    or jsonb_typeof(x -> 'outstanding') <> 'number' or (x ->> 'outstanding')::numeric < 0) then
    raise exception 'CAFE_RECEIPT_PO_LINES_INVALID' using errcode = '22023';
  end if;
  select r.* into v_receipt
    from integrations.esb_push e
    join ops.cafe_receipt_portions q on q.push_id = e.id
    join ops.cafe_receipts r on r.org_id = q.org_id and r.id = q.receipt_id
   where e.push_group_id = p_group_id and e.source_module = 'cafe_receipt'
   limit 1;
  if not found then
    raise exception 'CAFE_RECEIPT_GROUP_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-match:' || v_receipt.org_id || ':' || v_receipt.branch_id, 0));

  -- Only the members this worker holds: queued portions whose outbox row is in flight.
  select jsonb_agg(jsonb_build_object('line_id', q.id, 'item_unit_id', q.item_unit_id, 'quantity', q.quantity)
                   order by q.created_at, q.id),
         min(q.po_number), min(q.po_date)
    into v_lines, v_po_number, v_po_date
    from ops.cafe_receipt_portions q
    join integrations.esb_push e on e.id = q.push_id
   where e.push_group_id = p_group_id and e.status = 'in_flight' and q.state = 'queued';
  if v_lines is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('po_number', v_po_number, 'po_date', v_po_date,
                                               'item_unit_id', x ->> 'item_unit_id',
                                               'outstanding', (x ->> 'outstanding')::numeric)), '[]'::jsonb)
    into v_po
    from jsonb_array_elements(coalesce(p_po_lines, '[]'::jsonb)) x;
  v_alloc := ops.match_cafe_receipt_lines(v_lines, v_po);

  for v_portion in
    select q.id, q.quantity
      from ops.cafe_receipt_portions q
      join integrations.esb_push e on e.id = q.push_id
     where e.push_group_id = p_group_id and e.status = 'in_flight' and q.state = 'queued'
     order by q.created_at, q.id
  loop
    v_keep := coalesce((select sum((a ->> 'quantity')::numeric) from jsonb_array_elements(v_alloc) a
                         where a ->> 'line_id' = v_portion.id::text and a ->> 'kind' = 'matched'), 0);
    if v_keep < v_portion.quantity then
      perform ops._return_cafe_receipt_portion(v_portion.id, v_portion.quantity - v_keep,
        coalesce((select a ->> 'kind' from jsonb_array_elements(v_alloc) a
                   where a ->> 'line_id' = v_portion.id::text and a ->> 'kind' <> 'matched' limit 1), 'over'));
    end if;
  end loop;

  return (
    select coalesce(jsonb_agg(jsonb_build_object('push_id', q.push_id, 'quantity', q.quantity) order by q.created_at, q.id),
                    '[]'::jsonb)
      from ops.cafe_receipt_portions q
      join integrations.esb_push e on e.id = q.push_id
     where e.push_group_id = p_group_id and e.status = 'in_flight' and q.state = 'queued'
  );
end;
$$;
comment on function ops.rematch_cafe_receipt_group(uuid, jsonb) is
  'Worker only (FR-1026/1027): re-matches an in-flight goods-receipt group''s queued portions against its PO''s freshly read outstanding ([{item_unit_id, outstanding}]) with ops.match_cafe_receipt_lines. What fits stays queued; the rest returns to Receipt issues. Returns [{push_id, quantity}] for the members still to send.';
revoke execute on function ops.rematch_cafe_receipt_group(uuid, jsonb) from public, anon, authenticated;
grant execute on function ops.rematch_cafe_receipt_group(uuid, jsonb) to service_role;

-- ── DD-2026-10-06-1429 (6) a refused group's portions leave queued ──────────────────────────
create or replace function ops.refuse_cafe_receipt_portions(p_group_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_moved integer;
begin
  if p_reason is null or p_reason not in ('esb_refused', 'worker_refused') then
    raise exception 'CAFE_RECEIPT_REFUSAL_REASON_INVALID' using errcode = '22023';
  end if;
  select r.* into v_receipt
    from integrations.esb_push e
    join ops.cafe_receipt_portions q on q.push_id = e.id
    join ops.cafe_receipts r on r.org_id = q.org_id and r.id = q.receipt_id
   where e.push_group_id = p_group_id and e.source_module = 'cafe_receipt'
   limit 1;
  if not found then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-match:' || v_receipt.org_id || ':' || v_receipt.branch_id, 0));
  -- ESB may hold a goods receipt for this group: its portions keep counting against the PO.
  if exists (select 1 from integrations.esb_push_groups g
              where g.id = p_group_id and (g.esb_doc_num is not null or g.posting_stage is not null)) then
    return 0;
  end if;
  -- Only members the worker already dead-lettered: a refusal is recorded on the row first.
  update ops.cafe_receipt_portions q
     set state = 'held', hold_reason = p_reason, updated_at = clock_timestamp()
    from integrations.esb_push e
   where e.id = q.push_id and e.push_group_id = p_group_id and e.status = 'dead_letter' and q.state = 'queued';
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;
comment on function ops.refuse_cafe_receipt_portions(uuid, text) is
  'Worker only (DD-2026-10-06-1429 (6)): after a goods-receipt group was refused permanently, by ESB (esb_refused) or by the worker before ESB was asked (worker_refused), its dead-lettered members'' portions leave queued, held with that reason and their outbox link kept, so they stop counting against the PO and a release can re-post them. Moves nothing while ESB may hold a goods receipt for the group (a number or a posting stage).';
revoke execute on function ops.refuse_cafe_receipt_portions(uuid, text) from public, anon, authenticated;
grant execute on function ops.refuse_cafe_receipt_portions(uuid, text) to service_role;
