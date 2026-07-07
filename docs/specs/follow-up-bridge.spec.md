# Spec — Follow-up settlement bridge v1 (AR / pending-bill reconciliation)

- Feature: the Work Follow-up queue + Home AR-aging tile that make MOS the per-invoice
  settlement system-of-record, **replacing** Finance's per-invoice reconciliation gsheet.
- Status: ready for implementation (owner-confirmed AR1/AR2/AR3, `docs/decisions.md`
  "Continued IA/product grill — session 2" → "AR bridge / Follow-up reconciliation").
- Authority: `docs/decisions.md` (AR1/AR2/AR3 + OD-IA-1) · `docs/adr/0019-ia-north-star.md`
  D5/D13/D14 step 4 · `docs/adr/0012-esb-outbox-integrations-schema.md` (ESB = SoR; no
  write-back) · `docs/adr/0020-capability-authorization.md` (`shared.can()`) ·
  `CONTEXT.md` **Follow-up** / **Pending bill** · `docs/jtbd.md` §2 (Follow-up queue + Home
  money-position strip) · the kitchen `approve_kitchen_log` RPC pattern
  (`supabase/migrations/20260620000009…`, SECURITY DEFINER lock→gate→write).
- Non-goal: ESB write-back (spike returned LIKELY-NOT), bank-feed auto-matching, file-upload
  evidence (v1 = text/URL), the roastery/internal-replenishment queue (ADR-0023, separate),
  notifications/escalations, an admin UI for managing follow-ups (rows arrive by import/mirror).

## 1. Overview

Two money streams are chased today from forked gsheets: **B2B AR** (formal ESB invoices) and
**retail pending bills** (owner/regular tabs; ESB never closes them at invoice grain, only
aggregate journal reductions). MOS becomes the **invoice/tab-grain settlement system-of-record**:
it mirrors issuance in, owns the full settlement lifecycle (chase → promise → partial → settle →
confirm), and reconciles per-invoice against ESB's aggregate AR-reduction journal as a secondary
cross-check (drift → a Finance exception). **No ESB write-back** — reconciliation replaces it.

The 5-state lifecycle (CONTEXT.md *Follow-up*): `open → chased → promised → partial → settled →
confirmed`. Every `partial`/`settle` event carries a **required cash-in date** (the money-landed
date — the bank-statement match key) + **evidence** (a transfer/receipt reference; text/URL in v1).
`confirm` is Finance's per-invoice bank/ESB reconciliation sign-off.

Chase-vs-confirm split: the relationship owner **chases** + logs promises/partials/settle-with-
evidence (**B2B Sales** for AR via lane `b2b_sales`; **Retail Ops** for pending bills via lane
`retail_ops`); **Finance** confirms *settled* (capability-gated). Lane membership is derived from
the org chart (a held role in the matching team BU) — the ADR-0020 own-BU mechanism, specialized.

**Ships dark** behind feature flag `SHOW_FOLLOWUPS` (default `false`); the go-live is gated on the
owner's backup/restore drill (ADR-0019 D13).

## 2. Data model

### `mos.follow_ups` — one row per outstanding commitment

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()`. |
| `org_id` | uuid not null fk→`shared.orgs` | tenant seam (OD-P1-1). |
| `counterparty` | text not null | customer/debtor name (B2B account or tab holder). |
| `kind` | text not null check in (`b2b_ar`,`retail_pending`) | the money-record type. |
| `lane` | text not null check in (`b2b_sales`,`retail_ops`) | the chasing team. Paired to `kind` (CHECK). |
| `source_invoice_ref` | text nullable | ESB invoice no (b2b_ar) / tab id (retail_pending). Read-only drill target. |
| `original_amount` | numeric(14,2) not null check > 0 | the amount opened against. |
| `running_balance` | numeric(14,2) not null check >= 0 | `original_amount` − Σ(partial+settle event amounts). Maintained by the RPC. |
| `state` | text not null check in (`open`,`chased`,`promised`,`partial`,`settled`,`confirmed`) default `open` | lifecycle state. |
| `promise_date` | date nullable | the promise-to-pay date (set on `promise`). |
| `issued_date` | date nullable | invoice/tab date — the aging origin. |
| `due_date` | date nullable | payment due date — drives overdue/aging. |
| `assigned_to` | uuid nullable fk→`shared.people` | who's chasing (optional, display only). |
| `notes` | text | free text. |
| `created_by` | uuid nullable fk→`shared.people` | audit (server-stamped from JWT). |
| `created_at` / `updated_at` | timestamptz | audit. |

CHECK: `(kind='b2b_ar' AND lane='b2b_sales') OR (kind='retail_pending' AND lane='retail_ops')`.
Partial unique index `(org_id, source_invoice_ref) WHERE source_invoice_ref IS NOT NULL` (no dup
AR imports). Indexes on `(org_id, lane, state)`, `(org_id, state)`.

### `mos.follow_up_events` — the audited lifecycle ledger

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid not null fk | tenant seam. |
| `follow_up_id` | uuid not null fk→`mos.follow_ups` on delete cascade | |
| `transition` | text not null check in (`chase`,`promise`,`partial`,`settle`,`confirm`) | the verb (one verb per transition). |
| `from_state` / `to_state` | text not null | the transition endpoints. |
| `amount` | numeric(14,2) nullable | partial/settle only (the payment). |
| `cash_in_date` | date nullable | partial/settle only — **required** (CHECK). |
| `evidence` | text nullable | partial/settle only — **required** (CHECK). |
| `promise_date` | date nullable | promise only. |
| `note` | text | free text. |
| `actor_person_id` | uuid nullable fk→`shared.people` | who made the transition (server-stamped). |
| `created_at` | timestamptz default now() | when. |

CHECK: `transition IN ('partial','settle')` ⇒ `cash_in_date IS NOT NULL AND evidence IS NOT NULL
AND amount IS NOT NULL AND amount > 0` (defense in depth — the RPC enforces first). Index on
`(org_id, follow_up_id, created_at)`.

### Reconciliation surfaces (D5 — MOS-side + exception; ESB cross-check structured-but-stubbed)

- **`mos.follow_up_recon_summary`** (VIEW): per `(counterparty, period = to_char(cash_in_date
  ...))` → Σ `confirmed`-event amounts + counts + Σ settled-but-unconfirmed backlog. Computed from
  `mos.follow_ups`/`mos.follow_up_events`. **Real** — the MOS-side recon truth.
- **`reporting.esb_ar_reduction`** (TABLE — the future ESB aggregate feed): per
  `(org_id, counterparty, period, esb_reduction_amount, snapshot_as_of)`, finance/admin RLS,
  service_role write. Empty until the warehouse snapshot job is wired (OD-P4-2 cadence). This is
  the **structured stub** the brief permits.
- **`mos.follow_up_recon_drift`** (VIEW): FULL OUTER JOIN of MOS-confirmed totals vs
  `reporting.esb_ar_reduction` per `(counterparty, period)`; surfaces rows where they diverge OR
  MOS has a confirmation with no ESB-aggregate row yet (an honest, real exception — the
  confirmation exists in MOS before the aggregate journal reflects it). Becomes the true drift
  check the moment the feed is populated.

## 3. Requirements

### Functional

- FR-500: When the migration is applied, the system shall create `mos.follow_ups` and
  `mos.follow_up_events` with RLS enabled and forced, `org_id = shared.current_org_id()` tenancy,
  and the CHECK/partial-unique/index constraints above.
- FR-501: When the migration is applied, the system shall seed capability
  `followup.confirm` → roles `finance` + `admin` in `shared.role_capabilities` (ADR-0020).
- FR-502: When the migration is applied, the system shall create `mos.can_work_lane(p_lane text)`
  (STABLE, SECURITY INVOKER) returning true iff the session may ADVANCE a follow-up in `p_lane`:
  true for `admin`; else true iff the current person holds a role in a `shared.business_units`
  row with the matching `code` (`b2b_sales` / `retail_ops`) under the current org. `finance` lane
  is never chase-able (Finance confirms, not chases).
- FR-503: When a viewer reads `mos.follow_ups`, RLS shall return a row iff the org matches AND the
  viewer is `admin`, OR holds the `finance` access role, OR `can_work_lane(row.lane)`.
- FR-504: When a viewer reads `mos.follow_up_events`, RLS shall return a row iff its parent
  follow-up is visible to the viewer under FR-503 (subquery on `mos.follow_ups`).
- FR-505: The system shall provide `mos.transition_follow_up(p_follow_up_id uuid, p_transition
  text, p_options jsonb)` as a single SECURITY DEFINER RPC: lock row → cross-org guard →
  transition authorization → state-machine validity → required-field validation → write event →
  recompute balance / set state → return the updated row. One verb per `p_transition`.
- FR-506: When `p_transition = 'chase'`, the RPC shall move state from `{open, chased, promised}`
  → `chased`; authorized for `can_work_lane(lane)`.
- FR-507: When `p_transition = 'promise'`, the RPC shall require `options.promise_date` and move
  `{open, chased, promised}` → `promised`; authorized for `can_work_lane(lane)`.
- FR-508: When `p_transition = 'partial'`, the RPC shall require `options.amount > 0`,
  `options.cash_in_date`, and `options.evidence`, require `amount <= running_balance`, reduce
  `running_balance` by `amount`, and move `{open, chased, promised, partial}` → `partial`;
  authorized for `can_work_lane(lane)`.
- FR-509: When `p_transition = 'settle'`, the RPC shall require `options.cash_in_date` and
  `options.evidence`, require `options.amount = running_balance` (the final payment zeroes the
  balance), set `running_balance = 0` and `state = settled`, and move from
  `{open, chased, promised, partial}`; authorized for `can_work_lane(lane)`. **A settle without
  evidence or cash_in_date shall be rejected.**
- FR-510: When `p_transition = 'confirm'`, the RPC shall move `settled → confirmed` and be
  authorized **only** for holders of the `followup.confirm` capability (finance + admin); anyone
  else is rejected.
- FR-511: When any transition is requested from a disallowed `from_state`, the RPC shall raise
  `P0003` (state-machine violation).
- FR-512: When a chaser in lane A calls `transition_follow_up` on a lane-B follow-up, the RPC
  shall reject (42501) — lane isolation is enforced server-side, not just in the UI.
- FR-513: The system shall create `mos.follow_up_recon_summary`, `reporting.esb_ar_reduction`
  (finance/admin RLS), and `mos.follow_up_recon_drift` as defined in §2.
- FR-514: When a user inserts/updates/deletes `mos.follow_ups` or `mos.follow_up_events` directly
  (outside the RPC), RLS shall deny the write — the RPC is the only write path for transitions
  (insert of new follow_ups is service_role/seed only in v1).
- FR-515: The Work destination shall expose a Follow-up queue at `/work/follow-ups` (i18n nav link)
  showing the viewer's lane(s); each row shows counterparty · original amount · running balance ·
  state · due/aging · assignee, with inline one-verb-per-transition advance and a settle/confirm
  form, and a read-only drill to the underlying invoice/bill.
- FR-516: The settle form shall require both an evidence field and a cash-in date before the
  settle action is enabled; partial likewise requires amount + cash-in date + evidence.
- FR-517: The Home money-position tile shall render an AR-aging summary (overdue · chased ·
  promised · partial) for finance / admin / chase-lane holders, drilling to `/work/follow-ups`
  filtered overdue; members with no finance and no chase lane shall see no tile.
- FR-518: Every surface in this slice shall be hidden behind feature flag `SHOW_FOLLOWUPS`
  (default `false`): the nav link, the route (redirects when off), and the Home tile.

### Non-functional

- NFR-500: RLS shall be enabled AND forced on every new table; default-deny. The RPCs are
  `SECURITY DEFINER` + capability/lane-gated + cross-org-guarded; the test seed grants are
  postgres/service_role only.
- NFR-501: Money math shall be exact: `running_balance = original_amount − Σ(partial+settle
  event amounts)`, never negative, and correct under out-of-order / repeated transitions. A
  runnable SQL check proves it on the seeded fixtures.
- NFR-502: No ESB write-back anywhere; ESB invoice status is read-only reference data.
- NFR-503: No `service_role` in the browser for business data; caller-JWT only. The RPCs run as
  the authenticated caller with capability/lane gates.
- NFR-504: Migrations shall be reversible (real DOWN).
- NFR-505: Coverage ≥80% on changed code; `npm run typecheck` (0) and `npm run lint` (--max-
  warnings=0) (0) block merge.
- NFR-506: No secrets in code; de-reference firewall (no external brand/AGPL refs).

## 4. Acceptance criteria

- AC-500 (pgTAP): Given a migrated database, when schema tests run, then `mos.follow_ups` and
  `mos.follow_up_events` exist with RLS enabled/forced and the CHECK/partial-unique constraints hold.
- AC-501 (pgTAP): Given a b2b_sales chaser, when they SELECT `mos.follow_ups`, then only same-org
  `lane='b2b_sales'` rows are visible (retail_ops rows hidden).
- AC-502 (pgTAP): Given a retail_ops chaser, when they SELECT `mos.follow_ups`, then only
  same-org `lane='retail_ops'` rows are visible (b2b_sales rows hidden).
- AC-503 (pgTAP): Given a finance user with no chase-lane role, when they SELECT
  `mos.follow_ups`, then all same-org rows are visible (the recon authority).
- AC-504 (pgTAP): Given a plain member with no chase lane and no finance role, when they SELECT
  `mos.follow_ups`, then zero rows are visible.
- AC-505 (pgTAP): Given a chaser in org-B, when they SELECT `mos.follow_ups`, then zero org-A
  rows are visible (cross-org isolation).
- AC-506 (pgTAP): Given a b2b_sales chaser, when they call `transition_follow_up` on a
  retail_ops follow-up, then it raises 42501 (lane isolation enforced in the RPC).
- AC-507 (pgTAP): Given a chaser, when they call `transition_follow_up(id,'chase')` on an open
  same-lane follow-up, then state becomes `chased` and a `chase` event is written.
- AC-508 (pgTAP): Given a chaser, when they call `transition_follow_up(id,'promise', {promise_date:
  D})` without a promise_date, then it raises (promise_date required).
- AC-509 (pgTAP): Given a chaser with a balance 1_000_000, when they call
  `transition_follow_up(id,'partial', {amount:300000, cash_in_date:D, evidence:'TRF-1'})`, then
  running_balance becomes 700_000 and state becomes `partial`.
- AC-510 (pgTAP): Given a chaser, when they call `transition_follow_up(id,'settle')` WITHOUT
  evidence or cash_in_date, then it raises (both required).
- AC-511 (pgTAP): Given a chaser with running_balance 700_000, when they call
  `transition_follow_up(id,'settle', {amount:700000, cash_in_date:D, evidence:'TRF-2'})`, then
  running_balance becomes 0 and state becomes `settled`.
- AC-512 (pgTAP): Given a chaser calling settle with an amount not equal to the running_balance,
  then it raises (settle must zero the balance).
- AC-513 (pgTAP): Given a settled follow-up, when a non-finance chaser calls
  `transition_follow_up(id,'confirm')`, then it raises 42501 (confirm is Finance-only).
- AC-514 (pgTAP): Given a settled follow-up, when a finance user calls
  `transition_follow_up(id,'confirm')`, then state becomes `confirmed`.
- AC-515 (pgTAP): Given a cross-org chaser, when they call `transition_follow_up` on an org-A
  follow-up, then it raises 42501 (DEFINER does not bypass org ownership).
- AC-516 (pgTAP): Given a direct INSERT/UPDATE/DELETE attempt on `mos.follow_ups` by an
  authenticated non-admin, then it is denied (no write policy).
- AC-517 (pgTAP): Given the seeded fixtures, when the money-invariant SQL check runs, then for
  every follow_up `running_balance = original_amount − Σ(partial+settle event amounts)` and no
  running_balance is negative.
- AC-518 (pgTAP): Given a finance user, when they SELECT `mos.follow_up_recon_drift`, then it
  returns the MOS-vs-ESB drift rows (every MOS-confirmed total with no ESB aggregate = an
  exception), proving the structure is real.
- AC-519 (pgTAP): Given `reporting.esb_ar_reduction`, when a non-finance member reads it, then
  zero rows are visible (finance/admin RLS).
- AC-520 (unit): Given the Follow-up queue renders, when a chaser views it, then each row shows
  counterparty · original amount · running balance · state, and the advance buttons match the
  valid transitions for that state.
- AC-521 (unit): Given the settle form, when cash_in_date or evidence is empty, then the settle
  button is disabled; when both are filled (and amount = balance), then it is enabled.
- AC-522 (unit): Given a member with no finance role and no chase lane, when Home renders, then
  the AR-aging tile is absent.
- AC-523 (unit): Given the Home AR-aging tile for a finance viewer, when it renders, then it
  shows overdue · chased · promised · partial summaries and drills to `/work/follow-ups`.
- AC-524 (e2e): Given a b2b_ar follow-up seeded open, when a chaser chases → promises → partials
  → settles-with-evidence, then it reaches `settled`; when finance confirms it, then it reaches
  `confirmed` (the real chase→confirm journey across PostgREST + RLS + the RPC).

## 5. Open follow-up

- The warehouse→`reporting.esb_ar_reduction` snapshot job (OD-P4-2 cadence) is deferred — the
  table is the structured landing zone; populate it when the AR-reduction journal feed is wired.
- Bank-feed auto-matching of `cash_in_date` is deferred (manual entry in MVP).
- A follow-up import/mirror job (ESB invoice → `mos.follow_ups` rows) is deferred; v1 rows arrive
  by seed/service-role. The RPC owns transitions only.
