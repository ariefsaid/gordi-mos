-- #1429 — an Approved Café receipt is matched to its branch's open-PO outstanding (FR-1022);
-- unmatched portions become Receipt issues; a per-branch receipt-posting switch, default off and
-- admin-only, decides whether matched portions reach the ESB outbox as one group per receipt and
-- PO (FR-1023/1024); an ops lead or admin releases held receipts once posting is on (FR-1030).
-- The worker's posting of a group is #1430: this migration stops at the outbox.
--
-- DOWN (manual, reversible):
--   drop trigger cafe_open_po_branches_match_waiting on ops.cafe_open_po_branches;
--   drop trigger cafe_receipts_match_on_approval on ops.cafe_receipts;
--   drop function ops._match_waiting_cafe_receipts();
--   drop function ops._match_waiting_cafe_receipts_at(uuid, uuid);
--   drop function ops._match_approved_cafe_receipt();
--   drop function ops.cafe_held_receipts();
--   drop function ops.release_cafe_receipts(uuid);
--   drop function ops.cafe_receipt_posting(ops.cafe_receipts);
--   drop function ops._match_cafe_receipt(uuid);
--   drop function ops._enqueue_cafe_receipt_portions(uuid, text);
--   drop function ops._cafe_receipt_hold_reason(uuid, uuid, text);
--   drop function ops._cafe_receipt_location(uuid, uuid, text);
--   drop function ops._cafe_receipt_po_lines(uuid, uuid);
--   drop function ops.match_cafe_receipt_lines(jsonb, jsonb);
--   drop function ops.set_cafe_receipt_posting_enabled(uuid, boolean);
--   delete from integrations.esb_push where source_module = 'cafe_receipt';
--   delete from integrations.esb_push_groups where source_module = 'cafe_receipt';
--   drop table ops.cafe_receipt_issues, ops.cafe_receipt_portions, ops.cafe_receipt_matches,
--     ops.cafe_receipt_posting_switches;
--   restore the three CHECKs below to their previous lists (source_module kitchen|roastery,
--     endpoint assembly-actual|simple-transfer|noop, group source_module kitchen).

-- ── Outbox: the goods-receipt family ────────────────────────────────────────────────────────
alter table integrations.esb_push drop constraint esb_push_source_module_check;
alter table integrations.esb_push add constraint esb_push_source_module_check
  check (source_module in ('kitchen', 'roastery', 'cafe_receipt'));
alter table integrations.esb_push drop constraint esb_push_endpoint_check;
alter table integrations.esb_push add constraint esb_push_endpoint_check
  check (endpoint in ('assembly-actual', 'simple-transfer', 'noop', 'goods-receipt'));
alter table integrations.esb_push_groups drop constraint esb_push_groups_source_module_check;
alter table integrations.esb_push_groups add constraint esb_push_groups_source_module_check
  check (source_module in ('kitchen', 'cafe_receipt'));

-- ── The branch receipt-posting switch: no row or false means off ────────────────────────────
create table ops.cafe_receipt_posting_switches (
  org_id          uuid not null references shared.orgs(id) on delete cascade,
  branch_id       uuid not null,
  posting_enabled boolean not null default false,
  updated_by      uuid references shared.people(id),
  updated_at      timestamptz not null default now(),
  primary key (org_id, branch_id),
  constraint cafe_receipt_posting_switches_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade
);
comment on table ops.cafe_receipt_posting_switches is
  'Fail-closed receipt-posting switch per branch: a missing row or false means an Approved receipt''s matched portions are held, never enqueued. Written only by the admin RPC.';

alter table ops.cafe_receipt_posting_switches enable row level security;
alter table ops.cafe_receipt_posting_switches force row level security;
revoke all on ops.cafe_receipt_posting_switches from public, anon, authenticated, service_role;
grant select on ops.cafe_receipt_posting_switches to authenticated, service_role;
create policy cafe_receipt_posting_switches_select_org on ops.cafe_receipt_posting_switches
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.is_org_member()));
comment on policy cafe_receipt_posting_switches_select_org on ops.cafe_receipt_posting_switches is
  'Org members may read whether a branch posts receipts; writes are only through the admin RPC.';

create or replace function ops.set_cafe_receipt_posting_enabled(p_branch_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_person_id uuid := shared.current_person_id();
begin
  if v_org_id is null or v_person_id is null or not shared.has_access_role('admin') then
    raise exception 'CAFE_RECEIPT_POSTING_ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_enabled is null
     or not exists (select 1 from shared.branches b where b.org_id = v_org_id and b.id = p_branch_id) then
    raise exception 'CAFE_RECEIPT_POSTING_BRANCH_INVALID' using errcode = '22023';
  end if;
  insert into ops.cafe_receipt_posting_switches (org_id, branch_id, posting_enabled, updated_by, updated_at)
  values (v_org_id, p_branch_id, p_enabled, v_person_id, clock_timestamp())
  on conflict (org_id, branch_id) do update
    set posting_enabled = excluded.posting_enabled,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  return jsonb_build_object('branch_id', p_branch_id, 'posting_enabled', p_enabled);
end;
$$;
comment on function ops.set_cafe_receipt_posting_enabled(uuid, boolean) is
  'Admin-only writer for a branch''s receipt-posting switch. Turning it on enqueues nothing by itself; held receipts wait for a release.';
revoke execute on function ops.set_cafe_receipt_posting_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function ops.set_cafe_receipt_posting_enabled(uuid, boolean) to authenticated;

-- ── Matching results ────────────────────────────────────────────────────────────────────────
create table ops.cafe_receipt_matches (
  receipt_id  uuid primary key,
  org_id      uuid not null,
  cache_as_of timestamptz not null,
  matched_at  timestamptz not null default now(),
  constraint cafe_receipt_matches_receipt_fk foreign key (org_id, receipt_id)
    references ops.cafe_receipts (org_id, id) on delete cascade
);
comment on table ops.cafe_receipt_matches is
  'One row once an Approved receipt has been matched, with the as-of time of the open-PO cache it was matched against. No row means the receipt waits for current PO data.';

create table ops.cafe_receipt_portions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  receipt_id   uuid not null,
  line_id      uuid not null references ops.cafe_receipt_lines(id) on delete cascade,
  item_unit_id uuid not null references ops.item_units(id) on delete restrict,
  po_number    text check (po_number is null or (btrim(po_number) <> '' and char_length(po_number) <= 64)),
  po_date      date,
  quantity     numeric(14,4) not null check (quantity > 0),
  state        text not null check (state in ('held', 'queued', 'superseded')),
  hold_reason  text check (hold_reason in ('posting_off', 'receiving_location_missing', 'no_longer_fits')),
  push_id      uuid unique references integrations.esb_push(id),
  created_at   timestamptz not null default clock_timestamp(),
  updated_at   timestamptz not null default clock_timestamp(),
  constraint cafe_receipt_portions_receipt_fk foreign key (org_id, receipt_id)
    references ops.cafe_receipts (org_id, id) on delete cascade,
  constraint cafe_receipt_portions_posting_check check (
    (state = 'held') = (hold_reason is not null)
    and (state <> 'queued' or (po_number is not null and po_date is not null))
    and (push_id is null or state = 'queued')
  )
);
comment on table ops.cafe_receipt_portions is
  'The matched part of a receipt line on one open PO. held: matched but not enqueued (posting off, no receiving location, or no longer fits the cache at release; a no-longer-fits portion has no PO). queued: enqueued once as an outbox member (push_id); the worker''s outcome is that member''s status. superseded: replaced by a release''s re-match.';
create index cafe_receipt_portions_receipt_idx on ops.cafe_receipt_portions (org_id, receipt_id);
create index cafe_receipt_portions_queued_idx on ops.cafe_receipt_portions (org_id, po_number, item_unit_id)
  where state = 'queued';

create table ops.cafe_receipt_issues (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  receipt_id   uuid not null,
  line_id      uuid not null references ops.cafe_receipt_lines(id) on delete cascade,
  item_unit_id uuid not null references ops.item_units(id) on delete restrict,
  kind         text not null check (kind in ('no_po', 'over', 'wrong_unit')),
  quantity     numeric(14,4) not null check (quantity > 0),
  status       text not null default 'open' check (status = 'open'),
  created_at   timestamptz not null default clock_timestamp(),
  constraint cafe_receipt_issues_receipt_fk foreign key (org_id, receipt_id)
    references ops.cafe_receipts (org_id, id) on delete cascade,
  constraint cafe_receipt_issues_line_kind_uk unique (line_id, kind)
);
comment on table ops.cafe_receipt_issues is
  'A blocking Receipt issue: the part of a line that matched no open-PO line (no_po), was above total outstanding (over) or came in a unit no PO line orders (wrong_unit). Created at matching; procurement''s link and close arrive with #1431.';
create index cafe_receipt_issues_receipt_idx on ops.cafe_receipt_issues (org_id, receipt_id);

alter table ops.cafe_receipt_matches enable row level security;
alter table ops.cafe_receipt_matches force row level security;
alter table ops.cafe_receipt_portions enable row level security;
alter table ops.cafe_receipt_portions force row level security;
alter table ops.cafe_receipt_issues enable row level security;
alter table ops.cafe_receipt_issues force row level security;
revoke all on ops.cafe_receipt_matches, ops.cafe_receipt_portions, ops.cafe_receipt_issues
  from public, anon, authenticated, service_role;
grant select on ops.cafe_receipt_matches, ops.cafe_receipt_portions, ops.cafe_receipt_issues
  to authenticated, service_role;

create policy cafe_receipt_matches_select_reviewer on ops.cafe_receipt_matches
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r
                 where r.org_id = cafe_receipt_matches.org_id and r.id = cafe_receipt_matches.receipt_id
                   and ops.can_review_stream(r.branch_id, r.activity))
  );
comment on policy cafe_receipt_matches_select_reviewer on ops.cafe_receipt_matches is
  'Reviewers of the receipt''s stream (ops lead and admin for every stream) read when it was matched.';
create policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r
                 where r.org_id = cafe_receipt_portions.org_id and r.id = cafe_receipt_portions.receipt_id
                   and ops.can_review_stream(r.branch_id, r.activity))
  );
comment on policy cafe_receipt_portions_select_reviewer on ops.cafe_receipt_portions is
  'Matched quantities per PO reveal outstanding, so only reviewers of the receipt''s stream read them (DD-CAFE-MVP-6); the receiver reads the posting state as text through ops.cafe_receipt_posting.';
create policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_receipts r
                 where r.org_id = cafe_receipt_issues.org_id and r.id = cafe_receipt_issues.receipt_id
                   and (r.received_by = (select shared.current_person_id())
                        or ops.can_review_stream(r.branch_id, r.activity)))
  );
comment on policy cafe_receipt_issues_select_receiver_or_reviewer on ops.cafe_receipt_issues is
  'The receiver reads the issues on their own receipts (FR-1040) and reviewers of the stream read the stream''s; procurement joins with its capability (#1431).';

-- ── FR-1022 the matching rule, one pure function ────────────────────────────────────────────
-- Lines: [{line_id, item_unit_id, wip_item_id, quantity}]. PO lines: [{po_number, po_date,
-- item_unit_id, wip_item_id, outstanding}]. Each line fills the same product detail's PO lines
-- oldest PO date first, up to what each still has; the rest is over (the detail is ordered),
-- wrong_unit (only another unit of the product is ordered) or no_po.
create or replace function ops.match_cafe_receipt_lines(p_lines jsonb, p_po_lines jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_line jsonb;
  v_po record;
  v_left numeric;
  v_take numeric;
  v_key text;
  v_used jsonb := '{}'::jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_left := (v_line ->> 'quantity')::numeric;
    for v_po in
      select po ->> 'po_number' as po_number, (po ->> 'po_date')::date as po_date,
             sum((po ->> 'outstanding')::numeric) as outstanding
        from jsonb_array_elements(coalesce(p_po_lines, '[]'::jsonb)) po
       where po ->> 'item_unit_id' = v_line ->> 'item_unit_id'
       group by 1, 2
       order by 2, 1
    loop
      exit when v_left <= 0;
      v_key := v_po.po_number || '|' || (v_line ->> 'item_unit_id');
      v_take := least(v_left, greatest(v_po.outstanding - coalesce((v_used ->> v_key)::numeric, 0), 0));
      if v_take > 0 then
        v_result := v_result || jsonb_build_array(jsonb_build_object('line_id', v_line -> 'line_id', 'kind', 'matched',
          'po_number', v_po.po_number, 'po_date', v_po.po_date, 'quantity', v_take));
        v_used := v_used || jsonb_build_object(v_key, coalesce((v_used ->> v_key)::numeric, 0) + v_take);
        v_left := v_left - v_take;
      end if;
    end loop;
    if v_left > 0 then
      v_result := v_result || jsonb_build_array(jsonb_build_object('line_id', v_line -> 'line_id',
        'kind', case
                  when exists (select 1 from jsonb_array_elements(coalesce(p_po_lines, '[]'::jsonb)) po
                                where po ->> 'item_unit_id' = v_line ->> 'item_unit_id') then 'over'
                  when exists (select 1 from jsonb_array_elements(coalesce(p_po_lines, '[]'::jsonb)) po
                                where po ->> 'wip_item_id' = v_line ->> 'wip_item_id') then 'wrong_unit'
                  else 'no_po'
                end,
        'po_number', null, 'po_date', null, 'quantity', v_left));
    end if;
  end loop;
  return v_result;
end;
$$;
comment on function ops.match_cafe_receipt_lines(jsonb, jsonb) is
  'FR-1022 pure matching: fills each line''s exact product detail (FR-1033) across PO lines oldest PO date first, splitting across POs; the remainder is over, wrong_unit or no_po. Approval, release and the worker''s re-match (FR-1026) share it.';
revoke execute on function ops.match_cafe_receipt_lines(jsonb, jsonb) from public, anon, authenticated;
grant execute on function ops.match_cafe_receipt_lines(jsonb, jsonb) to service_role;

-- What a branch's open POs still have per (PO, product detail): the cached outstanding less every
-- queued portion ESB had not posted when the cache was read (pending, failed, or posted after it).
create or replace function ops._cafe_receipt_po_lines(p_org_id uuid, p_branch_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with po as (
    select p.po_number, p.po_date, l.item_unit_id, u.wip_item_id, sum(l.outstanding_quantity) as outstanding
      from ops.cafe_open_pos p
      join ops.cafe_open_po_lines l on l.org_id = p.org_id and l.po_id = p.id
      join ops.item_units u on u.id = l.item_unit_id
     where p.org_id = p_org_id and p.branch_id = p_branch_id
     group by p.po_number, p.po_date, l.item_unit_id, u.wip_item_id
  ), queued as (
    select q.po_number, q.item_unit_id, sum(q.quantity) as quantity
      from ops.cafe_receipt_portions q
      join ops.cafe_receipts r on r.org_id = q.org_id and r.id = q.receipt_id
      join integrations.esb_push e on e.id = q.push_id
     where q.org_id = p_org_id and r.branch_id = p_branch_id and q.state = 'queued'
       and (e.status <> 'posted' or e.posted_at > (select s.as_of from ops.cafe_open_po_branches s
                                                    where s.org_id = p_org_id and s.branch_id = p_branch_id))
     group by q.po_number, q.item_unit_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'po_number', po.po_number, 'po_date', po.po_date, 'item_unit_id', po.item_unit_id,
           'wip_item_id', po.wip_item_id, 'outstanding', po.outstanding - coalesce(queued.quantity, 0))
         order by po.po_date, po.po_number), '[]'::jsonb)
    from po
    left join queued on queued.po_number = po.po_number and queued.item_unit_id = po.item_unit_id
$$;
revoke all on function ops._cafe_receipt_po_lines(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function ops._cafe_receipt_location(p_org_id uuid, p_branch_id uuid, p_receipt_key text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(p_receipt_key, (select l.location_key from ops.cafe_receiving_locations l
                                   where l.org_id = p_org_id and l.branch_id = p_branch_id))
$$;
comment on function ops._cafe_receipt_location(uuid, uuid, text) is
  'The receiving location a receipt posts to: the one copied at Count submit, else the branch''s current one.';
revoke all on function ops._cafe_receipt_location(uuid, uuid, text) from public, anon, authenticated, service_role;

create or replace function ops._cafe_receipt_hold_reason(p_org_id uuid, p_branch_id uuid, p_location_key text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when not coalesce((select s.posting_enabled from ops.cafe_receipt_posting_switches s
                               where s.org_id = p_org_id and s.branch_id = p_branch_id), false) then 'posting_off'
           when p_location_key is null then 'receiving_location_missing'
         end
$$;
revoke all on function ops._cafe_receipt_hold_reason(uuid, uuid, text) from public, anon, authenticated, service_role;

-- FR-1024: one outbox group per (receipt, PO) for the receipt's queued portions not yet enqueued,
-- one member per portion. The member key is the per-environment double-post guard; the group key
-- names the batch, so a later release on the same PO is its own document.
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
revoke all on function ops._enqueue_cafe_receipt_portions(uuid, text) from public, anon, authenticated, service_role;

-- ── Approval-time matching ──────────────────────────────────────────────────────────────────
-- Matches once. Without current PO data it records nothing (NFR-1006: no guessed issue) and the
-- refresh the approval asked for matches it later.
create or replace function ops._match_cafe_receipt(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt ops.cafe_receipts%rowtype;
  v_location text;
  v_hold text;
  v_lines jsonb;
  v_alloc jsonb;
begin
  select * into v_receipt from ops.cafe_receipts r where r.id = p_receipt_id;
  if not found or v_receipt.status <> 'Approved' then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cafe-receipt-match:' || v_receipt.org_id || ':' || v_receipt.branch_id, 0));
  if exists (select 1 from ops.cafe_receipt_matches m where m.receipt_id = v_receipt.id)
     or not ops._cafe_open_po_cache_current(v_receipt.org_id, v_receipt.branch_id) then
    return;
  end if;
  insert into ops.cafe_receipt_matches (org_id, receipt_id, cache_as_of, matched_at)
  select v_receipt.org_id, v_receipt.id, s.as_of, clock_timestamp()
    from ops.cafe_open_po_branches s
   where s.org_id = v_receipt.org_id and s.branch_id = v_receipt.branch_id;

  select jsonb_agg(jsonb_build_object('line_id', l.id, 'item_unit_id', l.item_unit_id, 'wip_item_id', l.wip_item_id,
                                      'quantity', l.received_quantity) order by l.created_at, l.id)
    into v_lines
    from ops.cafe_receipt_lines l
   where l.org_id = v_receipt.org_id and l.receipt_id = v_receipt.id;
  v_alloc := ops.match_cafe_receipt_lines(v_lines, ops._cafe_receipt_po_lines(v_receipt.org_id, v_receipt.branch_id));
  v_location := ops._cafe_receipt_location(v_receipt.org_id, v_receipt.branch_id, v_receipt.receiving_location_key);
  v_hold := ops._cafe_receipt_hold_reason(v_receipt.org_id, v_receipt.branch_id, v_location);

  insert into ops.cafe_receipt_portions (org_id, receipt_id, line_id, item_unit_id, po_number, po_date, quantity, state, hold_reason)
  select v_receipt.org_id, v_receipt.id, l.id, l.item_unit_id, a ->> 'po_number', (a ->> 'po_date')::date,
         (a ->> 'quantity')::numeric, case when v_hold is null then 'queued' else 'held' end, v_hold
    from jsonb_array_elements(v_alloc) a
    join ops.cafe_receipt_lines l on l.id = (a ->> 'line_id')::uuid
   where a ->> 'kind' = 'matched';
  insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity)
  select v_receipt.org_id, v_receipt.id, l.id, l.item_unit_id, a ->> 'kind', (a ->> 'quantity')::numeric
    from jsonb_array_elements(v_alloc) a
    join ops.cafe_receipt_lines l on l.id = (a ->> 'line_id')::uuid
   where a ->> 'kind' <> 'matched';
  if v_hold is null then
    perform ops._enqueue_cafe_receipt_portions(v_receipt.id, v_location);
  end if;
end;
$$;
comment on function ops._match_cafe_receipt(uuid) is
  'Matches an Approved receipt once against current PO data: matched portions are queued (switch on, receiving location known) or held with a reason; unmatched portions become Receipt issues whatever the switch. Internal: called by the approval and cache-refresh triggers and the release.';
revoke all on function ops._match_cafe_receipt(uuid) from public, anon, authenticated, service_role;

create or replace function ops._match_approved_cafe_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops._match_cafe_receipt(new.id);
  return new;
end;
$$;
revoke all on function ops._match_approved_cafe_receipt() from public, anon, authenticated, service_role;
create trigger cafe_receipts_match_on_approval
  after update of status on ops.cafe_receipts
  for each row
  when (new.status = 'Approved' and old.status is distinct from 'Approved')
  execute function ops._match_approved_cafe_receipt();

create or replace function ops._match_waiting_cafe_receipts_at(p_org_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
begin
  for v_receipt_id in
    select r.id from ops.cafe_receipts r
     where r.org_id = p_org_id and r.branch_id = p_branch_id and r.status = 'Approved'
       and not exists (select 1 from ops.cafe_receipt_matches m where m.receipt_id = r.id)
     order by r.arrival_date, r.received_at, r.id
  loop
    perform ops._match_cafe_receipt(v_receipt_id);
  end loop;
end;
$$;
comment on function ops._match_waiting_cafe_receipts_at(uuid, uuid) is
  'Matches a branch''s Approved receipts still waiting for PO data, oldest arrival first.';
revoke all on function ops._match_waiting_cafe_receipts_at(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function ops._match_waiting_cafe_receipts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops._match_waiting_cafe_receipts_at(new.org_id, new.branch_id);
  return new;
end;
$$;
comment on function ops._match_waiting_cafe_receipts() is
  'After the worker stores a branch''s open POs, matches that branch''s receipts waiting for PO data.';
revoke all on function ops._match_waiting_cafe_receipts() from public, anon, authenticated, service_role;
create trigger cafe_open_po_branches_match_waiting
  after update of as_of on ops.cafe_open_po_branches
  for each row
  when (new.as_of is not null)
  execute function ops._match_waiting_cafe_receipts();

-- ── FR-1030 release held receipts ───────────────────────────────────────────────────────────
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

    for v_receipt in
      select r.* from ops.cafe_receipts r
       where r.org_id = v_org_id and r.branch_id = p_branch_id and r.status = 'Approved'
         and exists (select 1 from ops.cafe_receipt_portions q
                      where q.org_id = r.org_id and q.receipt_id = r.id and q.state = 'held')
       order by r.arrival_date, r.received_at, r.id
    loop
      v_location := ops._cafe_receipt_location(v_org_id, p_branch_id, v_receipt.receiving_location_key);
      select jsonb_agg(jsonb_build_object('line_id', l.id, 'item_unit_id', l.item_unit_id, 'wip_item_id', l.wip_item_id,
                                          'quantity', h.quantity) order by l.created_at, l.id)
        into v_lines
        from (select q.line_id, sum(q.quantity) as quantity from ops.cafe_receipt_portions q
               where q.org_id = v_org_id and q.receipt_id = v_receipt.id and q.state = 'held'
               group by q.line_id) h
        join ops.cafe_receipt_lines l on l.id = h.line_id;
      v_alloc := ops.match_cafe_receipt_lines(v_lines, ops._cafe_receipt_po_lines(v_org_id, p_branch_id));
      if v_location is null or not exists (select 1 from jsonb_array_elements(v_alloc) a where a ->> 'kind' = 'matched') then
        update ops.cafe_receipt_portions q
           set hold_reason = case when v_location is null then 'receiving_location_missing' else 'no_longer_fits' end,
               updated_at = clock_timestamp()
         where q.org_id = v_org_id and q.receipt_id = v_receipt.id and q.state = 'held'
           and q.hold_reason is distinct from case when v_location is null then 'receiving_location_missing' else 'no_longer_fits' end;
        continue;
      end if;
      update ops.cafe_receipt_portions q
         set state = 'superseded', hold_reason = null, updated_at = clock_timestamp()
       where q.org_id = v_org_id and q.receipt_id = v_receipt.id and q.state = 'held';
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
  'FR-1030: an ops lead or admin releases a branch''s held Approved receipts once its posting switch is on. Re-matches each receipt''s held quantity against the current cache less what is already enqueued, queues what fits once and keeps the rest held with a reason; a rerun enqueues nothing new. Without current PO data it enqueues nothing, asks for a refresh and says why.';
revoke execute on function ops.release_cafe_receipts(uuid) from public, anon, authenticated;
grant execute on function ops.release_cafe_receipts(uuid) to authenticated;

create or replace function ops.cafe_held_receipts()
returns table (branch_id uuid, branch_name text, held_receipts integer, posting_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, count(*)::int, coalesce(s.posting_enabled, false)
    from ops.cafe_receipts r
    join shared.branches b on b.org_id = r.org_id and b.id = r.branch_id
    left join ops.cafe_receipt_posting_switches s on s.org_id = r.org_id and s.branch_id = r.branch_id
   where r.org_id = shared.current_org_id()
     and shared.current_person_id() is not null
     and (shared.has_access_role('ops_lead') or shared.has_access_role('admin'))
     and r.status = 'Approved'
     and (exists (select 1 from ops.cafe_receipt_portions q where q.org_id = r.org_id and q.receipt_id = r.id and q.state = 'held')
          or not exists (select 1 from ops.cafe_receipt_matches m where m.receipt_id = r.id))
   group by b.id, b.name, s.posting_enabled
   order by b.name
$$;
comment on function ops.cafe_held_receipts() is
  'For an ops lead or admin: per branch, how many Approved receipts are held or wait for PO data, and whether the branch posts receipts. Empty for everyone else.';
revoke execute on function ops.cafe_held_receipts() from public, anon, authenticated;
grant execute on function ops.cafe_held_receipts() to authenticated;

-- ── FR-1042 a receipt's posting state as text, for whoever reads the receipt ────────────────
-- A computed field on ops.cafe_receipts; it re-reads the stored receipt under the receipt's read
-- rule and never returns a quantity.
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
