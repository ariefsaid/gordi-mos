-- Follow-up settlement bridge v1 (ADR-0019 D5/D13/D14 step 4; CONTEXT.md Follow-up/Pending bill;
-- decisions.md AR1/AR2/AR3). MOS becomes the per-invoice settlement system-of-record, replacing
-- Finance's per-invoice recon gsheet. Two streams: B2B AR (ESB invoices; lane b2b_sales) and retail
-- pending bills (owner/regular tabs; lane retail_ops). 5-state lifecycle owned server-side.
-- No ESB write-back (ADR-0012; spike returned LIKELY-NOT) — reconciliation replaces it.
--
-- Model: mos.follow_ups (one row per outstanding commitment) + mos.follow_up_events (the audited
-- lifecycle ledger). One SECURITY DEFINER RPC (mos.transition_follow_up) is the single gated write
-- point for every transition (mirrors ops.approve_kitchen_log: lock → cross-org guard → gate →
-- validate → write event → recompute balance → set state). RLS default-deny; lane visibility via
-- mos.can_work_lane(lane) (BU-code membership — the ADR-0020 own-BU mechanism, specialized).

-- ─── shared.business_units lane code (ADR-0020 own-BU seam) ───────────────────
alter table shared.business_units add column if not exists code text;
create unique index if not exists business_units_org_code_unique
  on shared.business_units (org_id, code)
  where code is not null;

comment on column shared.business_units.code is
  'Optional stable machine code for capability/lane matching (for example b2b_sales, retail_ops).';

-- ─── mos.follow_ups ────────────────────────────────────────────────────────────
create table mos.follow_ups (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references shared.orgs(id) on delete cascade,
  counterparty       text not null check (btrim(counterparty) <> ''),
  kind               text not null check (kind in ('b2b_ar','retail_pending')),
  lane               text not null check (lane in ('b2b_sales','retail_ops')),
  source_invoice_ref text,
  original_amount    numeric(14,2) not null check (original_amount > 0),
  running_balance    numeric(14,2) not null check (running_balance >= 0),
  state              text not null check (state in ('open','chased','promised','partial','settled','confirmed'))
                       default 'open',
  promise_date       date,
  issued_date        date,
  due_date           date,
  assigned_to        uuid references shared.people(id) on delete set null,
  notes              text,
  created_by         uuid references shared.people(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- kind↔lane pairing (b2b_ar↔b2b_sales; retail_pending↔retail_ops).
  constraint follow_ups_kind_lane_pair check (
    (kind = 'b2b_ar'         and lane = 'b2b_sales') or
    (kind = 'retail_pending' and lane = 'retail_ops')
  ),
  -- balance can never exceed the original (no negative payments) — invariant, also RPC-enforced.
  constraint follow_ups_balance_within_original check (running_balance <= original_amount)
);

comment on table mos.follow_ups is
  'One outstanding commitment — a B2B AR invoice (lane b2b_sales) or a retail pending bill (lane retail_ops). MOS owns the invoice/tab-grain settlement state (ADR-0019 D5; CONTEXT.md Follow-up).';
comment on column mos.follow_ups.running_balance is
  'original_amount − Σ(partial+settle event amounts). Maintained by mos.transition_follow_up; never negative, never exceeds original_amount.';
comment on column mos.follow_ups.source_invoice_ref is
  'ESB invoice no (b2b_ar) / tab id (retail_pending). Read-only drill target. NULL allowed for retail tabs with no ref.';

-- No duplicate AR imports (one open commitment per source ref per org).
create unique index follow_ups_source_ref_unique
  on mos.follow_ups (org_id, source_invoice_ref)
  where source_invoice_ref is not null;

create index follow_ups_org_lane_state_idx on mos.follow_ups (org_id, lane, state);
create index follow_ups_org_state_idx      on mos.follow_ups (org_id, state);
create index follow_ups_org_counterparty_idx on mos.follow_ups (org_id, counterparty);

-- ─── mos.follow_up_events (the audited lifecycle ledger) ───────────────────────
create table mos.follow_up_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references shared.orgs(id) on delete cascade,
  follow_up_id   uuid not null references mos.follow_ups(id) on delete cascade,
  transition     text not null check (transition in ('chase','promise','partial','settle','confirm')),
  from_state     text not null check (from_state in ('open','chased','promised','partial','settled','confirmed')),
  to_state       text not null check (to_state   in ('open','chased','promised','partial','settled','confirmed')),
  amount         numeric(14,2),
  cash_in_date   date,
  evidence       text,
  promise_date   date,
  note           text,
  actor_person_id uuid references shared.people(id) on delete set null,
  created_at     timestamptz not null default now(),
  -- defense in depth (the RPC enforces first): partial/settle MUST carry amount + cash_in_date + evidence.
  constraint follow_up_events_payment_fields check (
    transition not in ('partial','settle')
    or (amount is not null and amount > 0 and cash_in_date is not null and btrim(coalesce(evidence,'')) <> '')
  )
);

comment on table mos.follow_up_events is
  'The audited settlement lifecycle ledger. One row per transition; partial/settle carry the required cash_in_date + evidence + amount (the bank-statement match key + proof).';

create index follow_up_events_fu_idx   on mos.follow_up_events (org_id, follow_up_id, created_at);
create index follow_up_events_org_idx  on mos.follow_up_events (org_id, created_at);

-- ─── Capability seed (ADR-0020 D4): followup.confirm → finance + admin ─────────
insert into shared.role_capabilities (role, capability, scope) values
  ('finance', 'followup.confirm', 'org'),
  ('admin',   'followup.confirm', 'org')
on conflict (role, capability) do nothing;

-- ─── mos.can_work_lane(p_lane): the chase-lane gate (ADR-0020 own-BU, specialized) ──
-- True iff the session may ADVANCE (chase) a follow-up in p_lane. admin = superset; otherwise the
-- current person must hold a role in a live (non-archived) business_units row whose code = p_lane
-- (b2b_sales / retail_ops), under the current org. SECURITY INVOKER STABLE; reads only the JWT
-- claims + the directory. 'finance' is NOT a chase lane (Finance confirms, does not chase).
create or replace function mos.can_work_lane(p_lane text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.has_access_role('admin')
     or (
       p_lane in ('b2b_sales','retail_ops')
       and exists (
         select 1
         from shared.person_roles pr
         join shared.roles r           on r.id = pr.role_id
         join shared.business_units bu on bu.id = r.business_unit_id
         where pr.person_id = shared.current_person_id()
           and pr.org_id    = shared.current_org_id()
           and r.org_id     = shared.current_org_id()
           and bu.org_id    = shared.current_org_id()
           and bu.code      = p_lane
       )
     )
$$;
comment on function mos.can_work_lane(text) is
  'True iff the session may advance a follow-up in p_lane (admin, or a held role in the matching team BU). ADR-0020 own-BU mechanism; RLS authority. Not a grant for the finance lane (Finance confirms).';

-- ─── mos.transition_follow_up — the single SECURITY DEFINER transition RPC ─────
-- p_options keys: promise_date (promise), amount + cash_in_date + evidence (partial/settle), note (any).
-- settle.amount defaults to the remaining balance (the final payment zeroes it); if provided it MUST
-- equal the balance. confirm is followup.confirm-gated (finance/admin) only.
create or replace function mos.transition_follow_up(p_follow_up_id uuid, p_transition text, p_options jsonb)
returns mos.follow_ups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fu        mos.follow_ups;
  v_lane      text;
  v_state     text;
  v_balance   numeric(14,2);
  v_amt       numeric(14,2);
  v_cash      date;
  v_evid      text;
  v_promise   date;
  v_to_state  text;
  v_note      text;
begin
  -- (1) load + lock the row.
  select * into v_fu from mos.follow_ups where id = p_follow_up_id for update;
  if v_fu.id is null then
    raise exception 'follow-up not found' using errcode = 'P0002';
  end if;

  -- (2) cross-org guard (DEFINER bypasses RLS; enforce org ownership before any gate or write).
  if v_fu.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot transition a follow-up outside your org' using errcode = '42501';
  end if;

  v_lane    := v_fu.lane;
  v_state   := v_fu.state;
  v_balance := v_fu.running_balance;
  v_note    := nullif(p_options ->> 'note', '');

  -- (3) authorization + (4) state-machine + required-field validation, per verb (one verb per transition).
  case p_transition
    when 'chase' then
      if not mos.can_work_lane(v_lane) then
        raise exception 'not authorized to advance lane %', v_lane using errcode = '42501';
      end if;
      if v_state not in ('open','chased','promised') then
        raise exception 'cannot chase from state %', v_state using errcode = 'P0003';
      end if;
      v_to_state := 'chased';

    when 'promise' then
      if not mos.can_work_lane(v_lane) then
        raise exception 'not authorized to advance lane %', v_lane using errcode = '42501';
      end if;
      if v_state not in ('open','chased','promised') then
        raise exception 'cannot promise from state %', v_state using errcode = 'P0003';
      end if;
      begin
        v_promise := nullif(p_options ->> 'promise_date', '')::date;
      exception when others then
        raise exception 'promise_date is required (invalid)' using errcode = 'P0003';
      end;
      if v_promise is null then
        raise exception 'promise_date is required' using errcode = 'P0003';
      end if;
      v_to_state := 'promised';

    when 'partial' then
      if not mos.can_work_lane(v_lane) then
        raise exception 'not authorized to advance lane %', v_lane using errcode = '42501';
      end if;
      if v_state not in ('open','chased','promised','partial') then
        raise exception 'cannot record a partial from state %', v_state using errcode = 'P0003';
      end if;
      begin
        v_amt := nullif(p_options ->> 'amount', '')::numeric;
      exception when others then
        raise exception 'partial requires a numeric amount > 0' using errcode = 'P0003';
      end;
      begin
        v_cash := nullif(p_options ->> 'cash_in_date', '')::date;
      exception when others then
        raise exception 'partial requires a valid cash_in_date' using errcode = 'P0003';
      end;
      v_evid := nullif(p_options ->> 'evidence', '');
      if v_amt is null or v_amt <= 0 then
        raise exception 'partial requires amount > 0' using errcode = 'P0003';
      end if;
      if v_cash is null then
        raise exception 'partial requires cash_in_date' using errcode = 'P0003';
      end if;
      if v_evid is null or btrim(v_evid) = '' then
        raise exception 'partial requires evidence' using errcode = 'P0003';
      end if;
      if v_amt > v_balance then
        raise exception 'partial amount % exceeds running balance %', v_amt, v_balance using errcode = 'P0003';
      end if;
      v_balance := v_balance - v_amt;
      v_to_state := 'partial';

    when 'settle' then
      if not mos.can_work_lane(v_lane) then
        raise exception 'not authorized to advance lane %', v_lane using errcode = '42501';
      end if;
      if v_state not in ('open','chased','promised','partial') then
        raise exception 'cannot settle from state %', v_state using errcode = 'P0003';
      end if;
      if v_balance <= 0 then
        raise exception 'nothing to settle (balance already 0)' using errcode = 'P0003';
      end if;
      begin
        v_amt := nullif(p_options ->> 'amount', '')::numeric;
      exception when others then
        raise exception 'settle requires a numeric amount' using errcode = 'P0003';
      end;
      -- amount defaults to the remaining balance (final payment zeroes it); if provided it MUST equal balance.
      if v_amt is null then
        v_amt := v_balance;
      elsif v_amt <> v_balance then
        raise exception 'settle amount % must equal running balance %', v_amt, v_balance using errcode = 'P0003';
      end if;
      begin
        v_cash := nullif(p_options ->> 'cash_in_date', '')::date;
      exception when others then
        raise exception 'settle requires a valid cash_in_date' using errcode = 'P0003';
      end;
      v_evid := nullif(p_options ->> 'evidence', '');
      if v_cash is null then
        raise exception 'settle requires cash_in_date' using errcode = 'P0003';
      end if;
      if v_evid is null or btrim(v_evid) = '' then
        raise exception 'settle requires evidence' using errcode = 'P0003';
      end if;
      v_balance := 0;
      v_to_state := 'settled';

    when 'confirm' then
      if not shared.can('followup.confirm') then
        raise exception 'confirm requires the followup.confirm capability (finance/admin)' using errcode = '42501';
      end if;
      if v_state <> 'settled' then
        raise exception 'can only confirm a settled follow-up (current: %)', v_state using errcode = 'P0003';
      end if;
      v_to_state := 'confirmed';

    else
      raise exception 'unknown transition %', p_transition using errcode = 'P0003';
  end case;

  -- (5) write the audited event row.
  insert into mos.follow_up_events
    (org_id, follow_up_id, transition, from_state, to_state, amount, cash_in_date, evidence, promise_date, note, actor_person_id)
  values
    (v_fu.org_id, v_fu.id, p_transition, v_state, v_to_state,
     case when p_transition in ('partial','settle') then v_amt      else null end,
     case when p_transition in ('partial','settle') then v_cash     else null end,
     case when p_transition in ('partial','settle') then v_evid     else null end,
     case when p_transition = 'promise'             then v_promise  else null end,
     v_note,
     shared.current_person_id());

  -- (6) recompute balance + set state (promise_date set only on the promise verb).
  update mos.follow_ups
     set state          = v_to_state,
         running_balance = v_balance,
         promise_date    = case when p_transition = 'promise' then v_promise else v_fu.promise_date end,
         updated_at      = now()
   where id = v_fu.id;

  -- (7) return the updated row.
  select * into v_fu from mos.follow_ups where id = p_follow_up_id;
  return v_fu;
end;
$$;
comment on function mos.transition_follow_up(uuid, text, jsonb) is
  'Atomic settlement transition (FR-505..513): the single gated write point. lock → cross-org guard → lane/capability gate → state-machine + required-field validation → write event → recompute balance → set state. SECURITY DEFINER.';

revoke execute on function mos.transition_follow_up(uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function mos.transition_follow_up(uuid, text, jsonb) to   authenticated;

-- ─── RLS: read-only for authenticated (admin OR finance OR can_work_lane); writes via RPC only ──
grant select on mos.follow_ups, mos.follow_up_events to authenticated;
grant select, insert, update, delete on mos.follow_ups, mos.follow_up_events to service_role;

alter table mos.follow_ups        enable row level security;
alter table mos.follow_ups        force  row level security;
alter table mos.follow_up_events  enable row level security;
alter table mos.follow_up_events  force  row level security;

create policy follow_ups_select on mos.follow_ups
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      shared.has_access_role('admin')
      or shared.has_access_role('finance')
      or mos.can_work_lane(lane)
    )
  );
-- NO insert/update/delete policy for authenticated → only service_role (RLS-bypassing) writes;
-- transitions go through the SECURITY DEFINER RPC. (FR-514 / AC-516.)

create policy follow_up_events_select on mos.follow_up_events
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and exists (select 1 from mos.follow_ups fu where fu.id = mos.follow_up_events.follow_up_id)
  );

-- ─── Reconciliation surfaces (D5: MOS-side truth + a real exception surface) ────
-- mos.follow_up_recon_summary: Σ payment events (partial+settle) per (counterparty, cash-in month) —
-- the MOS-side cash-landed truth that ties to ESB's aggregate AR-reduction. security_invoker so the
-- underlying follow_ups/events RLS scopes per the caller (chaser sees own lane; finance sees all).
create or replace view mos.follow_up_recon_summary as
select
  fu.org_id,
  fu.counterparty,
  to_char(ev.cash_in_date, 'YYYY-MM') as period,
  sum(ev.amount)                       as mos_amount,
  count(*)                             as payment_events
from mos.follow_up_events ev
join mos.follow_ups fu on fu.id = ev.follow_up_id
where ev.transition in ('partial','settle')
group by fu.org_id, fu.counterparty, to_char(ev.cash_in_date, 'YYYY-MM');

comment on view mos.follow_up_recon_summary is
  'MOS-side settlement truth (ADR-0019 D5): Σ partial+settle amounts per counterparty / cash-in month. The per-invoice recon grain that replaces the gsheet.';

-- reporting.esb_ar_reduction: the FUTURE ESB aggregate AR-reduction feed (structured stub). Empty
-- until the warehouse snapshot job (OD-P4-2) is wired; the table is the documented landing zone so
-- the drift view is real, not faked. finance/admin RLS; service_role write (the snapshot job).
create table reporting.esb_ar_reduction (
  org_id              uuid not null references shared.orgs(id) on delete cascade,
  counterparty        text not null check (btrim(counterparty) <> ''),
  period              text not null check (btrim(period) <> ''),
  esb_reduction_amount numeric(14,2) not null,
  snapshot_as_of      timestamptz not null,
  loaded_at           timestamptz not null default now(),
  primary key (org_id, counterparty, period)
);

comment on table reporting.esb_ar_reduction is
  'Curated ESB aggregate AR-reduction journal (the secondary cross-check, ADR-0019 D5). Snapshot-fed like reporting.sales_daily_revenue; empty until the warehouse feed is wired. finance/admin RLS.';

create index esb_ar_reduction_org_period_idx on reporting.esb_ar_reduction (org_id, period);

grant select on reporting.esb_ar_reduction to authenticated;
grant select, insert, update, delete on reporting.esb_ar_reduction to service_role;

alter table reporting.esb_ar_reduction enable row level security;
alter table reporting.esb_ar_reduction force  row level security;

create policy esb_ar_reduction_select_finance_admin
  on reporting.esb_ar_reduction
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (shared.has_access_role('finance') or shared.has_access_role('admin'))
  );

-- mos.follow_up_recon_drift: FULL OUTER JOIN of MOS cash-landed vs ESB aggregate, surfacing the
-- drift (the Finance exception queue). With esb_ar_reduction empty, every MOS counterparty/period
-- shows as an unmatched exception — honest and real (these settlements are not yet reflected in the
-- ESB aggregate). Becomes the true drift check the moment the feed lands.
create or replace view mos.follow_up_recon_drift as
select
  coalesce(s.org_id, e.org_id)                 as org_id,
  coalesce(s.counterparty, e.counterparty)     as counterparty,
  coalesce(s.period, e.period)                 as period,
  coalesce(s.mos_amount, 0)                    as mos_amount,
  coalesce(e.esb_reduction_amount, 0)          as esb_amount,
  coalesce(s.mos_amount, 0) - coalesce(e.esb_reduction_amount, 0) as drift,
  (coalesce(s.mos_amount, 0) <> coalesce(e.esb_reduction_amount, 0)) as is_drift
from mos.follow_up_recon_summary s
full outer join reporting.esb_ar_reduction e
  on e.org_id = s.org_id and e.counterparty = s.counterparty and e.period = s.period;

comment on view mos.follow_up_recon_drift is
  'Reconciliation drift (ADR-0019 D5 / FR-513): MOS cash-landed vs ESB aggregate AR-reduction per counterparty/period. Non-zero drift or unmatched sides = a Finance exception.';

-- security_invoker so the underlying RLS (follow_ups for the MOS side; esb_ar_reduction finance/admin
-- for the ESB side) scopes per the caller — chasers see only their lane; finance sees the full recon.
alter view mos.follow_up_recon_summary set (security_invoker = true);
alter view mos.follow_up_recon_drift   set (security_invoker = true);

grant select on mos.follow_up_recon_summary, mos.follow_up_recon_drift to authenticated;

-- ─── DOWN ──────────────────────────────────────────────────────────────────────
-- revoke select on mos.follow_up_recon_summary, mos.follow_up_recon_drift from authenticated;
-- drop view if exists mos.follow_up_recon_drift cascade;
-- drop view if exists mos.follow_up_recon_summary cascade;
-- drop policy if exists esb_ar_reduction_select_finance_admin on reporting.esb_ar_reduction;
-- alter table reporting.esb_ar_reduction disable row level security;
-- drop table if exists reporting.esb_ar_reduction cascade;
-- drop policy if exists follow_up_events_select on mos.follow_up_events;
-- drop policy if exists follow_ups_select on mos.follow_ups;
-- alter table mos.follow_up_events no force row level security;
-- alter table mos.follow_up_events disable row level security;
-- alter table mos.follow_ups no force row level security;
-- alter table mos.follow_ups disable row level security;
-- revoke execute on function mos.transition_follow_up(uuid, text, jsonb) from authenticated;
-- drop function if exists mos.transition_follow_up(uuid, text, jsonb);
-- drop function if exists mos.can_work_lane(text);
-- delete from shared.role_capabilities where capability = 'followup.confirm';
-- drop table if exists mos.follow_up_events cascade;
-- drop table if exists mos.follow_ups cascade;
-- drop index if exists shared.business_units_org_code_unique;
-- alter table shared.business_units drop column if exists code;
