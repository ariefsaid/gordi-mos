-- #1432 — an Approved café purchase request reaches the ESB outbox (FR-1054/1055), the database
-- side of the worker's purchase-request posting:
--   * a per-branch request-posting switch, default off, written only by an admin RPC;
--   * when a request is approved on a branch whose switch is on, one outbox group per request
--     with one member per line, deduplicated per request (group) and line (member) and target
--     environment; with the switch off nothing is enqueued and the request stays approved, not
--     posted;
--   * each member's payload carries the branch code (the id map's key), the request and required
--     dates and the MOS key the ESB request carries in its additional information;
--   * a read of where an Approved request's posting stands, for its requester and reviewers.
-- The outbox, its claim and transition guard, the posting stage and the sample-org guard are the
-- existing ones; this migration only admits the purchase-request family into them.
--
-- DOWN: supabase/rollbacks/20261019004100_ops_cafe_purchase_request_posting.sql.

-- ── Outbox: the purchase-request family ─────────────────────────────────────────────────────
alter table integrations.esb_push drop constraint esb_push_source_module_check;
alter table integrations.esb_push add constraint esb_push_source_module_check
  check (source_module in ('kitchen', 'roastery', 'cafe_receipt', 'cafe_purchase_request'));
alter table integrations.esb_push drop constraint esb_push_endpoint_check;
alter table integrations.esb_push add constraint esb_push_endpoint_check
  check (endpoint in ('assembly-actual', 'simple-transfer', 'noop', 'goods-receipt', 'purchase-request'));
alter table integrations.esb_push_groups drop constraint esb_push_groups_source_module_check;
alter table integrations.esb_push_groups add constraint esb_push_groups_source_module_check
  check (source_module in ('kitchen', 'cafe_receipt', 'cafe_purchase_request'));
comment on column integrations.esb_push_groups.posting_stage is
  'Goods-receipt and purchase-request groups only. create_sent: a create may have reached ESB with its answer lost, so the worker looks the MOS key up before any create. awaiting_authorization: the worker created a number and ESB has not authorized it. operator_confirmed: procurement found and recorded the ESB number; the worker adopts it without another ERP call. Null: no ESB action is pending; with status posted, esb_doc_num is authorized.';

-- ── The branch request-posting switch: no row or false means off ────────────────────────────
create table ops.cafe_purchase_request_posting_switches (
  org_id          uuid not null references shared.orgs(id) on delete cascade,
  branch_id       uuid not null,
  posting_enabled boolean not null default false,
  updated_by      uuid references shared.people(id),
  updated_at      timestamptz not null default now(),
  primary key (org_id, branch_id),
  constraint cafe_purchase_request_posting_switches_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade
);
comment on table ops.cafe_purchase_request_posting_switches is
  'Fail-closed request-posting switch per branch (FR-1055): a missing row or false means an approved purchase request is never enqueued and stays approved, not posted. Written only by the admin RPC.';

alter table ops.cafe_purchase_request_posting_switches enable row level security;
alter table ops.cafe_purchase_request_posting_switches force row level security;
revoke all on ops.cafe_purchase_request_posting_switches from public, anon, authenticated, service_role;
grant select on ops.cafe_purchase_request_posting_switches to authenticated, service_role;
create policy cafe_purchase_request_posting_switches_select_org on ops.cafe_purchase_request_posting_switches
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.is_org_member()));
comment on policy cafe_purchase_request_posting_switches_select_org on ops.cafe_purchase_request_posting_switches is
  'Org members may read whether a branch posts purchase requests; writes are only through the admin RPC.';

create or replace function ops.set_cafe_purchase_request_posting_enabled(p_branch_id uuid, p_enabled boolean)
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
    raise exception 'CAFE_PURCHASE_REQUEST_POSTING_ADMIN_ONLY' using errcode = '42501';
  end if;
  if p_enabled is null
     or not exists (select 1 from shared.branches b where b.org_id = v_org_id and b.id = p_branch_id) then
    raise exception 'CAFE_PURCHASE_REQUEST_POSTING_BRANCH_INVALID' using errcode = '22023';
  end if;
  insert into ops.cafe_purchase_request_posting_switches (org_id, branch_id, posting_enabled, updated_by, updated_at)
  values (v_org_id, p_branch_id, p_enabled, v_person_id, clock_timestamp())
  on conflict (org_id, branch_id) do update
    set posting_enabled = excluded.posting_enabled,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  return jsonb_build_object('branch_id', p_branch_id, 'posting_enabled', p_enabled);
end;
$$;
comment on function ops.set_cafe_purchase_request_posting_enabled(uuid, boolean) is
  'Admin-only writer for a branch''s request-posting switch (FR-1055). Turning it on enqueues nothing by itself: only requests approved while it is on are enqueued, at approval.';
revoke execute on function ops.set_cafe_purchase_request_posting_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function ops.set_cafe_purchase_request_posting_enabled(uuid, boolean) to authenticated;

-- ── FR-1054 the enqueue, at approval, only while the branch's switch is on ──────────────────
create or replace function ops._enqueue_cafe_purchase_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request ops.cafe_purchase_requests%rowtype;
  v_env text := integrations.current_esb_target_env();
  v_branch_code text;
  v_group uuid;
begin
  select * into v_request from ops.cafe_purchase_requests r where r.id = p_request_id;
  if not found or v_request.status <> 'Approved' then
    return;
  end if;
  if not coalesce((select s.posting_enabled from ops.cafe_purchase_request_posting_switches s
                     where s.org_id = v_request.org_id and s.branch_id = v_request.branch_id), false) then
    return;
  end if;
  select b.code into v_branch_code
    from shared.branches b where b.org_id = v_request.org_id and b.id = v_request.branch_id;
  insert into integrations.esb_push_groups (org_id, source_module, target_env, dedup_key)
  values (v_request.org_id, 'cafe_purchase_request', v_env,
          'cafe-purchase-request|' || v_request.id || '|' || v_env)
  returning id into v_group;
  insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key, push_group_id)
  select v_request.org_id, 'cafe_purchase_request', l.id::text, 'purchase-request',
         jsonb_build_object('request_id', v_request.id, 'line_id', l.id,
                            'branch_code', v_branch_code,
                            'request_date', ((v_request.reviewed_at at time zone 'Asia/Jakarta')::date)::text,
                            'required_date', v_request.required_by::text,
                            'mos_key', ops.cafe_receipt_mos_key(v_request.id, v_group),
                            'item_unit_id', l.item_unit_id, 'quantity', l.quantity),
         v_env, 'cafe-purchase-request-line|' || l.id || '|' || v_env, v_group
    from ops.cafe_purchase_request_lines l
   where l.org_id = v_request.org_id and l.request_id = v_request.id
   order by l.created_at, l.id;
end;
$$;
comment on function ops._enqueue_cafe_purchase_request(uuid) is
  'FR-1054/1055: enqueues one Approved purchase request as one outbox group (one member per line) when its branch''s request-posting switch is on, and nothing otherwise. The group key (per request) and member keys (per line) end with the target environment; a second enqueue of the same request is refused by them. Internal to the approval trigger.';
revoke execute on function ops._enqueue_cafe_purchase_request(uuid) from public, anon, authenticated, service_role;

create or replace function ops._enqueue_approved_cafe_purchase_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ops._enqueue_cafe_purchase_request(new.id);
  return new;
end;
$$;
revoke execute on function ops._enqueue_approved_cafe_purchase_request() from public, anon, authenticated, service_role;
create trigger cafe_purchase_requests_enqueue_on_approval
  after update of status on ops.cafe_purchase_requests
  for each row
  when (old.status = 'Submitted' and new.status = 'Approved')
  execute function ops._enqueue_approved_cafe_purchase_request();

comment on function ops.review_cafe_purchase_request(uuid, text, integer, text) is
  'The only purchase-request decision. Requires ops.can_review_stream on the request''s stream, Submitted status and the current version; refuses approval by the requester with no ops-lead or admin exemption; a reject needs a note. Takes no request facts; an approval is enqueued for ESB by the approval trigger only while the branch''s request-posting switch is on.';
comment on table ops.cafe_purchase_requests is
  'One Café purchase request raised on a stream: Submitted at send, then Approved or Rejected by a stream reviewer; nobody approves their own. Approved and Rejected requests are frozen. An Approved request is enqueued for ESB only while its branch''s request-posting switch is on; otherwise it stays approved, not posted.';

-- ── Where an Approved request's posting stands ──────────────────────────────────────────────
create or replace function ops.cafe_purchase_request_posting(p_request ops.cafe_purchase_requests)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request ops.cafe_purchase_requests%rowtype;
  v_group integrations.esb_push_groups%rowtype;
begin
  select * into v_request from ops.cafe_purchase_requests r
   where r.id = p_request.id and r.org_id = shared.current_org_id()
     and (r.requested_by = shared.current_person_id() or ops.can_review_stream(r.branch_id, r.activity));
  if not found or v_request.status <> 'Approved' then
    return null;
  end if;
  select * into v_group from integrations.esb_push_groups g
   where g.org_id = v_request.org_id and g.source_module = 'cafe_purchase_request'
     and g.dedup_key like 'cafe-purchase-request|' || v_request.id::text || '|%'
   order by g.created_at desc
   limit 1;
  if not found then
    return jsonb_build_object('state', 'not_posted');
  end if;
  return jsonb_build_object(
    'state', case when v_group.status = 'posted' then 'posted'
                  when v_group.status in ('failed', 'dead_letter') then 'failed'
                  else 'queued' end,
    'esb_number', case when v_group.status = 'posted' then v_group.esb_doc_num end);
end;
$$;
comment on function ops.cafe_purchase_request_posting(ops.cafe_purchase_requests) is
  'An Approved purchase request''s posting state: not_posted (never enqueued), queued, posted with the ESB request number, or failed; null for any other status or a request the caller cannot read.';
revoke execute on function ops.cafe_purchase_request_posting(ops.cafe_purchase_requests) from public, anon;
grant execute on function ops.cafe_purchase_request_posting(ops.cafe_purchase_requests) to authenticated;
