-- #1427 — the worker-owned open-PO cache per branch (FR-1031..1033), the floor's identity-only read
-- of it (FR-1057, DD-CAFE-MVP-6) and the post-lock difference labels (FR-1012). Only the ESB worker
-- writes the cache; no browser session reads ESB or writes these tables.
--
-- DOWN (manual, reversible):
--   drop trigger cafe_receipts_request_open_po_refresh on ops.cafe_receipts;
--   drop function ops._request_cafe_open_po_refresh();
--   drop function ops.cafe_receipt_po_differences(uuid[]);
--   drop function ops.cafe_open_po_identities(uuid);
--   drop function ops.cafe_open_po_refresh_targets(uuid, text[], boolean);
--   drop function ops.mark_cafe_open_pos_stale(uuid, uuid, text);
--   drop function ops.replace_cafe_open_pos(uuid, uuid, timestamptz, integer, jsonb);
--   drop table ops.cafe_open_po_lines;
--   drop table ops.cafe_open_pos;
--   drop table ops.cafe_open_po_branches;
--   drop function ops._cafe_open_po_cache_current(uuid, uuid);
--   drop function ops.can_read_cafe_open_pos(uuid);
--   drop function ops.is_cafe_member_at_branch(uuid);

-- ── Who is a floor member of a branch (DD-CAFE-MVP-6) ───────────────────────────────────────
-- shared.is_cafe_affiliated() stays existence-only (it gates writes, and the stream is never a
-- write wall). The identity read is the one place a branch scopes what the floor sees.
create or replace function ops.is_cafe_member_at_branch(p_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from shared.team_memberships m
    join shared.teams t on t.id = m.team_id
    where m.org_id = shared.current_org_id()
      and m.person_id = shared.current_person_id()
      and t.org_id = m.org_id
      and t.branch_id = p_branch_id
      and t.activity is not null
      and t.archived_at is null
      and m.effective_from <= current_date
      and (m.effective_to is null or m.effective_to >= current_date)
  )
$$;
comment on function ops.is_cafe_member_at_branch(uuid) is
  'True iff the caller holds a current membership in a production-stream Team of p_branch_id (the shared.is_cafe_affiliated predicate, at one branch). Used only by the open-PO identity read. Explicitly person/org-scoped so it stays correct inside definer functions.';
grant execute on function ops.is_cafe_member_at_branch(uuid) to authenticated;

-- ── Who reads cached PO rows with quantities ────────────────────────────────────────────────
create or replace function ops.can_read_cafe_open_pos(p_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from shared.teams t
     where t.org_id = shared.current_org_id()
       and t.branch_id = p_branch_id
       and t.activity is not null
       and t.archived_at is null
       and ops.can_review_stream(t.branch_id, t.activity)
  )
$$;
comment on function ops.can_read_cafe_open_pos(uuid) is
  'Who reads a branch''s cached open POs with quantities: a reviewer of any stream at that branch, and ops lead and admin through ops.can_review_stream. Procurement joins here with its capability (#1431). Floor members get ops.cafe_open_po_identities instead (DD-CAFE-MVP-6).';
grant execute on function ops.can_read_cafe_open_pos(uuid) to authenticated;

-- ── The cache ───────────────────────────────────────────────────────────────────────────────
create table ops.cafe_open_po_branches (
  org_id               uuid not null references shared.orgs(id) on delete cascade,
  branch_id            uuid not null,
  as_of                timestamptz,
  max_age_minutes      integer not null default 360 check (max_age_minutes between 5 and 10080),
  is_stale             boolean not null default false,
  last_attempt_at      timestamptz,
  last_error           text check (last_error is null or char_length(last_error) <= 2000),
  refresh_requested_at timestamptz,
  updated_at           timestamptz not null default now(),
  primary key (org_id, branch_id),
  constraint cafe_open_po_branches_branch_fk foreign key (org_id, branch_id)
    references shared.branches (org_id, id) on delete cascade
);
comment on table ops.cafe_open_po_branches is
  'One row per branch whose open-PO cache exists or was asked for. as_of is when the last successful ESB read started; is_stale marks a failed read since then; a cache is current only when as_of is set, not stale and younger than max_age_minutes. refresh_requested_at asks the worker for an on-demand refresh.';

create table ops.cafe_open_pos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  branch_id      uuid not null,
  po_number      text not null check (btrim(po_number) <> '' and char_length(po_number) <= 64),
  supplier_name  text check (supplier_name is null or char_length(supplier_name) <= 200),
  po_date        date not null,
  esb_created_at timestamptz,
  esb_status     text not null check (esb_status in ('Authorized', 'Receiving')),
  constraint cafe_open_pos_org_id_id_uk unique (org_id, id),
  constraint cafe_open_pos_branch_number_uk unique (org_id, branch_id, po_number),
  constraint cafe_open_pos_branch_fk foreign key (org_id, branch_id)
    references ops.cafe_open_po_branches (org_id, branch_id) on delete cascade
);
comment on table ops.cafe_open_pos is
  'A branch''s open ESB purchase orders (status Authorized or Receiving) as of the branch cache''s as_of. Replaced whole per branch by the worker. esb_created_at is null until the sandbox proof shows ESB returns it.';

create table ops.cafe_open_po_lines (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null,
  po_id                uuid not null,
  item_unit_id         uuid references ops.item_units(id) on delete set null,
  item_name            text not null check (btrim(item_name) <> '' and char_length(item_name) <= 200),
  unit_name            text check (unit_name is null or char_length(unit_name) <= 64),
  outstanding_quantity numeric(14,4) not null check (outstanding_quantity >= 0),
  constraint cafe_open_po_lines_po_fk foreign key (org_id, po_id)
    references ops.cafe_open_pos (org_id, id) on delete cascade
);
comment on table ops.cafe_open_po_lines is
  'Outstanding quantity per open-PO line. item_unit_id is the MOS product detail the worker resolved from the ESB line through the id map; null when MOS lists no such product detail, so the line never matches a receipt line (FR-1033 exact product-detail equality).';
create index cafe_open_po_lines_po_idx on ops.cafe_open_po_lines (org_id, po_id);
create index cafe_open_po_lines_item_unit_idx on ops.cafe_open_po_lines (org_id, item_unit_id);

alter table ops.cafe_open_po_branches enable row level security;
alter table ops.cafe_open_po_branches force row level security;
alter table ops.cafe_open_pos enable row level security;
alter table ops.cafe_open_pos force row level security;
alter table ops.cafe_open_po_lines enable row level security;
alter table ops.cafe_open_po_lines force row level security;
revoke all on ops.cafe_open_po_branches, ops.cafe_open_pos, ops.cafe_open_po_lines
  from public, anon, authenticated, service_role;
grant select on ops.cafe_open_po_branches, ops.cafe_open_pos, ops.cafe_open_po_lines to authenticated;
grant select on ops.cafe_open_po_branches, ops.cafe_open_pos, ops.cafe_open_po_lines to service_role;

create policy cafe_open_po_branches_select_reader on ops.cafe_open_po_branches
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and ops.can_read_cafe_open_pos(branch_id));
comment on policy cafe_open_po_branches_select_reader on ops.cafe_open_po_branches is
  'Reviewers of the branch (ops.can_read_cafe_open_pos) read its cache state, including the as-of time.';
create policy cafe_open_pos_select_reader on ops.cafe_open_pos
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and ops.can_read_cafe_open_pos(branch_id));
comment on policy cafe_open_pos_select_reader on ops.cafe_open_pos is
  'Reviewers of the branch read its cached POs; a floor member reads none and uses the identity read.';
create policy cafe_open_po_lines_select_with_po on ops.cafe_open_po_lines
  for select to authenticated
  using (
    org_id = (select shared.current_org_id())
    and exists (select 1 from ops.cafe_open_pos p where p.org_id = cafe_open_po_lines.org_id and p.id = cafe_open_po_lines.po_id)
  );
comment on policy cafe_open_po_lines_select_with_po on ops.cafe_open_po_lines is
  'A cached line with its outstanding quantity is readable exactly when its PO is readable.';

-- A cache is current when it was read successfully, not marked stale since and is younger than its
-- configured age. Internal: the definer functions below call it; no session executes it directly.
create or replace function ops._cafe_open_po_cache_current(p_org_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select s.as_of is not null
       and not s.is_stale
       and s.as_of >= clock_timestamp() - make_interval(mins => s.max_age_minutes)
      from ops.cafe_open_po_branches s
     where s.org_id = p_org_id and s.branch_id = p_branch_id), false)
$$;
revoke all on function ops._cafe_open_po_cache_current(uuid, uuid) from public, anon, authenticated;

-- ── The worker's writers (service_role only) ────────────────────────────────────────────────
create or replace function ops.replace_cafe_open_pos(
  p_org_id uuid,
  p_branch_id uuid,
  p_as_of timestamptz,
  p_max_age_minutes integer,
  p_pos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po jsonb;
  v_line jsonb;
  v_po_id uuid;
  v_unit uuid;
  v_lines integer := 0;
begin
  if not exists (select 1 from shared.branches b where b.org_id = p_org_id and b.id = p_branch_id) then
    raise exception 'CAFE_OPEN_PO_BRANCH_NOT_FOUND' using errcode = '22023';
  end if;
  if p_as_of is null or p_as_of > clock_timestamp() + interval '5 minutes' then
    raise exception 'CAFE_OPEN_PO_AS_OF_INVALID' using errcode = '22023';
  end if;
  if p_pos is null or jsonb_typeof(p_pos) <> 'array' then
    raise exception 'CAFE_OPEN_PO_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  insert into ops.cafe_open_po_branches (org_id, branch_id)
  values (p_org_id, p_branch_id)
  on conflict (org_id, branch_id) do nothing;
  perform 1 from ops.cafe_open_po_branches s
   where s.org_id = p_org_id and s.branch_id = p_branch_id
   for update;
  delete from ops.cafe_open_pos p where p.org_id = p_org_id and p.branch_id = p_branch_id;

  for v_po in select value from jsonb_array_elements(p_pos) loop
    insert into ops.cafe_open_pos (org_id, branch_id, po_number, supplier_name, po_date, esb_created_at, esb_status)
    values (p_org_id, p_branch_id, v_po ->> 'po_number', nullif(btrim(v_po ->> 'supplier_name'), ''),
            (v_po ->> 'po_date')::date, (v_po ->> 'esb_created_at')::timestamptz, v_po ->> 'esb_status')
    returning id into v_po_id;
    for v_line in select value from jsonb_array_elements(coalesce(v_po -> 'lines', '[]'::jsonb)) loop
      v_unit := nullif(v_line ->> 'item_unit_id', '')::uuid;
      if v_unit is not null
         and not exists (select 1 from ops.item_units u where u.id = v_unit and u.org_id = p_org_id) then
        raise exception 'CAFE_OPEN_PO_PRODUCT_DETAIL_UNKNOWN' using errcode = '22023';
      end if;
      insert into ops.cafe_open_po_lines (org_id, po_id, item_unit_id, item_name, unit_name, outstanding_quantity)
      values (p_org_id, v_po_id, v_unit, v_line ->> 'item_name', nullif(btrim(v_line ->> 'unit_name'), ''),
              (v_line ->> 'outstanding_quantity')::numeric);
      v_lines := v_lines + 1;
    end loop;
  end loop;

  update ops.cafe_open_po_branches s
     set as_of = p_as_of,
         max_age_minutes = coalesce(p_max_age_minutes, s.max_age_minutes),
         is_stale = false,
         last_attempt_at = clock_timestamp(),
         last_error = null,
         refresh_requested_at = case when s.refresh_requested_at <= p_as_of then null else s.refresh_requested_at end,
         updated_at = clock_timestamp()
   where s.org_id = p_org_id and s.branch_id = p_branch_id;
  return jsonb_build_object('branch_id', p_branch_id, 'purchase_orders', jsonb_array_length(p_pos), 'lines', v_lines);
end;
$$;
comment on function ops.replace_cafe_open_pos(uuid, uuid, timestamptz, integer, jsonb) is
  'Worker only: atomically replaces one branch''s cached open POs and lines with what ESB returned, stamps the as-of time and configured age, clears the stale mark and any refresh request made before the read began. A line''s product detail must belong to the organisation.';
revoke execute on function ops.replace_cafe_open_pos(uuid, uuid, timestamptz, integer, jsonb) from public, anon, authenticated;
grant execute on function ops.replace_cafe_open_pos(uuid, uuid, timestamptz, integer, jsonb) to service_role;

create or replace function ops.mark_cafe_open_pos_stale(p_org_id uuid, p_branch_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from shared.branches b where b.org_id = p_org_id and b.id = p_branch_id) then
    raise exception 'CAFE_OPEN_PO_BRANCH_NOT_FOUND' using errcode = '22023';
  end if;
  insert into ops.cafe_open_po_branches (org_id, branch_id, is_stale, last_attempt_at, last_error, updated_at)
  values (p_org_id, p_branch_id, true, clock_timestamp(), left(p_error, 2000), clock_timestamp())
  on conflict (org_id, branch_id) do update
    set is_stale = true,
        last_attempt_at = excluded.last_attempt_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at;
end;
$$;
comment on function ops.mark_cafe_open_pos_stale(uuid, uuid, text) is
  'Worker only: a failed ESB read keeps the branch''s previous cache and marks it stale with the error, so the receiver sees "difference not yet known".';
revoke execute on function ops.mark_cafe_open_pos_stale(uuid, uuid, text) from public, anon, authenticated;
grant execute on function ops.mark_cafe_open_pos_stale(uuid, uuid, text) to service_role;

-- Which branches the worker refreshes: the id map's branch codes in one organisation, all of them
-- on the schedule or only those with an unanswered refresh request.
create or replace function ops.cafe_open_po_refresh_targets(p_org_id uuid, p_codes text[], p_requested_only boolean)
returns table (branch_id uuid, branch_code text, refresh_requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.code, s.refresh_requested_at
    from shared.branches b
    left join ops.cafe_open_po_branches s on s.org_id = b.org_id and s.branch_id = b.id
   where b.org_id = p_org_id
     and b.archived_at is null
     and b.code = any (p_codes)
     and (not coalesce(p_requested_only, false) or s.refresh_requested_at is not null)
   order by b.code
$$;
comment on function ops.cafe_open_po_refresh_targets(uuid, text[], boolean) is
  'Worker only: resolves the id map''s MOS branch codes to the organisation''s live branches, optionally only those whose cache has an unanswered refresh request.';
revoke execute on function ops.cafe_open_po_refresh_targets(uuid, text[], boolean) from public, anon, authenticated;
grant execute on function ops.cafe_open_po_refresh_targets(uuid, text[], boolean) to service_role;

-- ── The floor's identity-only read (FR-1057, DD-CAFE-MVP-6) ─────────────────────────────────
create or replace function ops.cafe_open_po_identities(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_result jsonb;
begin
  if v_org_id is null or shared.current_person_id() is null
     or not (ops.can_read_cafe_open_pos(p_branch_id) or ops.is_cafe_member_at_branch(p_branch_id)) then
    raise exception 'CAFE_OPEN_PO_FORBIDDEN' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'as_of', (select s.as_of from ops.cafe_open_po_branches s
                      where s.org_id = v_org_id and s.branch_id = p_branch_id),
           'is_current', ops._cafe_open_po_cache_current(v_org_id, p_branch_id),
           'purchase_orders', coalesce(jsonb_agg(jsonb_build_object(
             'po_number', p.po_number,
             'supplier_name', p.supplier_name,
             'po_date', p.po_date,
             'esb_created_at', p.esb_created_at,
             'items', (select coalesce(jsonb_agg(jsonb_build_object(
                                'item_unit_id', i.item_unit_id, 'item_name', i.item_name, 'unit_name', i.unit_name)
                              order by i.item_name, i.unit_name), '[]'::jsonb)
                         from (select distinct l.item_unit_id, l.item_name, l.unit_name
                                 from ops.cafe_open_po_lines l
                                where l.org_id = v_org_id and l.po_id = p.id) i)
           ) order by p.po_date, p.po_number), '[]'::jsonb))
    into v_result
    from ops.cafe_open_pos p
   where p.org_id = v_org_id and p.branch_id = p_branch_id;
  return v_result;
end;
$$;
comment on function ops.cafe_open_po_identities(uuid) is
  'The open POs of one branch by identity only: number, supplier, PO date, ESB creation date and expected items with their unit, plus the cache as-of time and whether it is current. Never a quantity or price. Callable by a floor member with a current stream membership at that branch and by the branch''s cache readers; refused otherwise (DD-CAFE-MVP-6).';
revoke execute on function ops.cafe_open_po_identities(uuid) from public, anon;
grant execute on function ops.cafe_open_po_identities(uuid) to authenticated;

-- ── The post-lock difference (FR-1012) ──────────────────────────────────────────────────────
-- Labels only: a received quantity compared with the summed outstanding of the branch's open-PO
-- lines of the same product detail (FR-1033). The outstanding figure itself never leaves here.
create or replace function ops.cafe_receipt_po_differences(p_receipt_ids uuid[])
returns table (
  receipt_id uuid,
  line_id uuid,
  item_unit_id uuid,
  outcome text,
  cache_as_of timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := shared.current_org_id();
  v_person_id uuid := shared.current_person_id();
begin
  if v_org_id is null or v_person_id is null then
    raise exception 'CAFE_RECEIPT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_receipt_ids is null or cardinality(p_receipt_ids) > 200 then
    raise exception 'CAFE_RECEIPT_DIFFERENCE_LIMIT: ask for at most 200 receipts' using errcode = '22023';
  end if;
  return query
  with receipts as (
    select r.id, r.branch_id,
           ops._cafe_open_po_cache_current(r.org_id, r.branch_id) as is_current,
           (select s.as_of from ops.cafe_open_po_branches s
             where s.org_id = r.org_id and s.branch_id = r.branch_id) as as_of
      from ops.cafe_receipts r
     where r.org_id = v_org_id
       and r.id = any (p_receipt_ids)
       and (r.received_by = v_person_id or ops.can_review_stream(r.branch_id, r.activity))
  ),
  outstanding as (
    select rl.id as line_id,
           (select sum(pl.outstanding_quantity)
              from ops.cafe_open_po_lines pl
              join ops.cafe_open_pos p on p.org_id = pl.org_id and p.id = pl.po_id
             where p.org_id = v_org_id and p.branch_id = rc.branch_id
               and pl.item_unit_id = rl.item_unit_id) as total
      from receipts rc
      join ops.cafe_receipt_lines rl on rl.org_id = v_org_id and rl.receipt_id = rc.id
  )
  select rl.receipt_id, rl.id, rl.item_unit_id,
         case
           when not rc.is_current then 'unknown'
           when o.total is null then 'no_open_po'
           when rl.received_quantity > o.total then 'over'
           when rl.received_quantity < o.total then 'short'
           else 'matches'
         end,
         rc.as_of
    from receipts rc
    join ops.cafe_receipt_lines rl on rl.org_id = v_org_id and rl.receipt_id = rc.id
    join outstanding o on o.line_id = rl.id
   order by rl.receipt_id, rl.created_at, rl.id;
end;
$$;
comment on function ops.cafe_receipt_po_differences(uuid[]) is
  'Per receipt line: over, short, matches or no_open_po against the summed outstanding of the branch''s cached open-PO lines with the same product detail, or unknown when the cache is empty, stale or older than its configured age; plus the cache as-of time. Only receipts the caller reads (receiver or stream reviewer); never returns an outstanding quantity.';
revoke execute on function ops.cafe_receipt_po_differences(uuid[]) from public, anon;
grant execute on function ops.cafe_receipt_po_differences(uuid[]) to authenticated;

-- ── On-demand refresh at approval (FR-1032) ─────────────────────────────────────────────────
create or replace function ops._request_cafe_open_po_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ops.cafe_open_po_branches (org_id, branch_id, refresh_requested_at)
  values (new.org_id, new.branch_id, clock_timestamp())
  on conflict (org_id, branch_id) do update
    set refresh_requested_at = coalesce(ops.cafe_open_po_branches.refresh_requested_at, excluded.refresh_requested_at),
        updated_at = clock_timestamp();
  return new;
end;
$$;
comment on function ops._request_cafe_open_po_refresh() is
  'When a receipt becomes Approved, asks the worker to refresh that branch''s open-PO cache; an earlier unanswered request is kept.';
revoke execute on function ops._request_cafe_open_po_refresh() from public, anon, authenticated;
create trigger cafe_receipts_request_open_po_refresh
  after update of status on ops.cafe_receipts
  for each row
  when (new.status = 'Approved' and old.status is distinct from 'Approved')
  execute function ops._request_cafe_open_po_refresh();
