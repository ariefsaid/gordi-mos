-- #1430 — the worker posts each (receipt, PO) outbox group as one ESB goods receipt. This migration
-- gives it what it needs from the database: a MOS key on every receipt (FR-1046), the branch code
-- and the group's document key on every member, the group's create-sent and created-number
-- checkpoints (FR-1025/1028), and one service-only RPC that returns what no longer fits a PO's
-- freshly read outstanding to Receipt issues (FR-1026/1027).
--
-- DOWN (manual, reversible):
--   drop trigger esb_push_groups_cafe_receipt_post_failed on integrations.esb_push_groups;
--   drop function ops._hold_failed_cafe_receipt_group();
--   restore ops.cafe_receipt_posting(ops.cafe_receipts) from 20261007003000_ops_cafe_receipt_matching.sql;
--   update ops.cafe_receipt_portions set hold_reason = 'no_longer_fits' where hold_reason = 'post_failed';
--   restore cafe_receipt_portions_hold_reason_check without 'post_failed';
--   drop function ops.return_cafe_receipt_excess(uuid, jsonb);
--   restore ops._enqueue_cafe_receipt_portions(uuid, text) from 20261007003000_ops_cafe_receipt_matching.sql;
--   alter table integrations.esb_push_groups drop column esb_create_sent_at, drop column esb_created_num,
--     drop column mos_key;
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
  add column esb_created_num text check (esb_created_num is null or btrim(esb_created_num) <> ''),
  add column mos_key text check (mos_key is null or mos_key ~ '^[A-Z0-9-]{1,32}$'),
  add constraint esb_push_groups_env_mos_key_uk unique (target_env, mos_key);
comment on column integrations.esb_push_groups.mos_key is
  'The document key ESB carries for this group (a Café goods receipt: the receipt''s MOS key and a sequence). Unique per environment: the worker''s lookup after an ambiguous failure trusts that one key names one document (FR-1028).';
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
  -- Groups are never deleted and keep their dedup key, so this count never goes down even when a
  -- group's members leave it: a document key is never handed out twice.
  select count(*)::int into v_sequence
    from integrations.esb_push_groups g
   where g.org_id = v_receipt.org_id and g.source_module = 'cafe_receipt'
     and g.dedup_key like 'cafe-receipt|' || v_receipt.id || '|%';
  for v_po in
    select q.po_number, min(q.id::text) as first_portion
      from ops.cafe_receipt_portions q
     where q.org_id = v_receipt.org_id and q.receipt_id = v_receipt.id and q.state = 'queued' and q.push_id is null
     group by q.po_number
     order by q.po_number
  loop
    v_sequence := v_sequence + 1;
    insert into integrations.esb_push_groups (org_id, source_module, target_env, dedup_key, mos_key)
    values (v_receipt.org_id, 'cafe_receipt', v_env,
            'cafe-receipt|' || v_receipt.id || '|' || v_po.po_number || '|' || v_po.first_portion || '|' || v_env,
            v_receipt.mos_key || '-' || v_sequence)
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
  -- Only before any create was sent: afterwards ESB may hold the document as it was.
  if not found or v_group.status = 'posted' or v_group.esb_doc_num is not null or v_group.esb_created_num is not null
     or v_group.esb_create_sent_at is not null or jsonb_typeof(p_fits) is distinct from 'array' then
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
  'FR-1026/1027, worker only: after a fresh read of a PO''s outstanding, shrinks each listed member of a goods-receipt group no create has been sent for to what fits and returns the excess to the line''s over or no_po Receipt issue. A member with nothing left leaves the group and is never sent; an emptied group is closed with the reason. Never grows a portion and never touches a posted member. Returns the members still in the group.';
revoke execute on function ops.return_cafe_receipt_excess(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function ops.return_cafe_receipt_excess(uuid, jsonb) to service_role;

comment on table ops.cafe_receipt_portions is
  'The matched part of a receipt line on one open PO. held: matched but not enqueued (posting off, no receiving location, or no longer fits the cache at release; a no-longer-fits portion has no PO). queued: enqueued once as an outbox member (push_id); the worker''s outcome is that member''s status. superseded: replaced by a release''s re-match, or returned whole to Receipt issues by the worker''s re-read of the PO.';

-- ── DD-2026-10-06-1429 (6) a group that failed before any create leaves queued ───────────────────
-- When a goods-receipt group dead-letters with no create sent and no document created, ESB holds
-- nothing of it: its portions become held "not posted" (no longer counted against the PO's
-- outstanding, released again by an ops lead or admin once the cause is fixed) and its members leave
-- the group, keeping their error, so no requeue can send them beside the release. A group that may
-- be in ESB (create sent, or created and not authorized) keeps its portions queued for a person.
alter table ops.cafe_receipt_portions drop constraint cafe_receipt_portions_hold_reason_check;
alter table ops.cafe_receipt_portions add constraint cafe_receipt_portions_hold_reason_check
  check (hold_reason in ('posting_off', 'receiving_location_missing', 'no_longer_fits', 'post_failed'));

create or replace function ops._hold_failed_cafe_receipt_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update ops.cafe_receipt_portions q
     set state = 'held', hold_reason = 'post_failed', push_id = null, updated_at = clock_timestamp()
    from integrations.esb_push e
   where e.push_group_id = new.id and e.status = 'dead_letter'
     and q.org_id = e.org_id and q.push_id = e.id and q.state = 'queued';
  update integrations.esb_push e
     set push_group_id = null
   where e.push_group_id = new.id and e.status = 'dead_letter';
  return null;
end;
$$;
comment on function ops._hold_failed_cafe_receipt_group() is
  'DD-2026-10-06-1429 (6): a goods-receipt group dead-lettered before any create was sent holds its portions as "not posted" and detaches its members, so the PO''s outstanding is freed and only a release sends them again.';
revoke execute on function ops._hold_failed_cafe_receipt_group() from public, anon, authenticated, service_role;
create trigger esb_push_groups_cafe_receipt_post_failed
  after update of status on integrations.esb_push_groups
  for each row
  when (new.source_module = 'cafe_receipt' and new.status = 'dead_letter' and old.status is distinct from 'dead_letter'
        and new.esb_create_sent_at is null and new.esb_created_num is null and new.esb_doc_num is null)
  execute function ops._hold_failed_cafe_receipt_group();

-- FR-1042: a portion that failed to post reads failed, like its dead-lettered member did.
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
                      when bool_or(e.status in ('failed', 'dead_letter')) or bool_or(q.hold_reason = 'post_failed') then 'failed'
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
  'An Approved receipt''s posting state (not_posted, held, queued, posted, failed — failed includes a portion that failed to post), whether it was matched, and how many unmatched portions and open issues it has; null for any other status or a receipt the caller cannot read.';
revoke execute on function ops.cafe_receipt_posting(ops.cafe_receipts) from public, anon;
grant execute on function ops.cafe_receipt_posting(ops.cafe_receipts) to authenticated;
