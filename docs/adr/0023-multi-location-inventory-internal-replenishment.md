# ADR-0023 — Location-scoped inventory + internal replenishment across Operate Activities

- Status: **Proposed** (2026-07-06; surfaced by the 2026-07-06 grill-with-docs session — owner
  sign-off pending). This ADR records the **architectural decision**; it authorizes no schema,
  migration, route, or component by itself. Each slice goes through its own spec → plan → build →
  review loop, and — per ADR-0019 D14 — Activity roll-ins (Roastery, Ecommerce) are step **6 of 6**,
  after Home, agent port, Work spine, AR/pending-bills bridge, and Plan/reference-data.
- Deciders: Owner (Arief) + Director
- Related:
  - **ADR-0019** (IA north-star — D1 taxonomy: Roastery = Activity under **B2B Ops**; kitchen/bar/
    ecommerce = Activities under **Retail Ops**; D2 **Operate = one module per Activity, shaped by
    that Activity's real workflow**; **D5** the reconciliation-not-write-back precedent for money
    settlement; D7 reference-data; D14 sequencing puts Activity roll-ins last) ·
  - **ADR-0012** (the ESB-outbox pattern — **module-agnostic** `integrations.esb_push`
    (`source_module ∈ {kitchen, roastery, …}`); the staging-first write discipline; the precedent
    that MOS operational data lives in `ops.*` typed + RLS'd while ESB is the immutable system of
    record that MOS reconciles against) ·
  - **ADR-0010** (OLTP/OLAP split — MOS = OLTP system of engagement; the ESB analytics warehouse =
    OLAP; the company-code-keyed ESB stock ledger lives in the warehouse, consumed by reporting
    read-models, **never used as MOS's app backend**) ·
  - **ADR-0011 / ADR-0020** (the `member`-submit / `ops_lead`-approve gate + `can()` authorization
    that any stock-transfer approval flow inherits) ·
  - `CONTEXT.md` — the resolved, verbatim terms this ADR builds on: **Stock location & internal
    replenishment**, **Ecommerce fulfilment**, **Activity**, **Module** (WIP-based activities share
    the ops-module spine), **Business Unit**, **Revenue stream**, **Follow-up** (the AR lifecycle an
    internal transfer is deliberately *not*) ·
  - `docs/specs/roastery-module.requirements.md` — §2.5 (two-stage stock movements), §3.3 (roastery
    divergences from the Kitchen spine), §5 (MVP vs later) — the roastery stock reality this ADR
    generalizes ·
  - `docs/reference/warehouse-online.md` — ESB tracks stock per **company code** (GKID vs GRI); the
    in-flight **GRI `stock_movement` sync** is the prerequisite to any GRI↔GKID reconciliation.
- Scope note: **Records the architectural decision that inventory is location-scoped and that
  replenishment between locations is a first-class internal flow.** No migration, table, route, or
  module is authorized here. The data-model shape (a location dimension on stock; a transfer entity)
  is named at the level needed to make the decision legible; the exact DDL, enums, and RPCs land in
  the consuming spec + plan. The 0022 number in the ADR sequence is unaccounted-for in the tree as of
  this writing; this ADR takes **0023** per the owner's instruction.

## Context

MOS's first WIP module — **Kitchen** — assumed a **single stock pool**: `ops.kitchen_stock` keys the
running balance on `(org, date, wip_item)` with no location axis, because the kitchen has one physical
home and produces one material directly (food portions). That assumption is correct for the kitchen
**Activity** and was the right YAGNI call at the time (ADR-0012 D3; CONTEXT.md "WIP-based activities
share the ops-module spine").

The 2026-07-06 grill revealed that **roasted-coffee inventory is not global, and the kitchen model
cannot express how it actually moves.** The same roasted beans are held in **three distinct pools**,
owned by three different Activities, each with its own role in the supply chain:

1. **The Roastery** (Activity *Roasting*, BU *B2B Ops*, ESB company code **GRI**) — the **production
   output** pool: green (Raw) → roasted (WIP) → packed (FG). This is where beans are *made*
   (`docs/specs/roastery-module.requirements.md` §2.5).
2. **HQ retail** (the cafe bean stock, served by Activities *Kitchen* + *Bar*, BU *Retail Ops*, ESB
   company code **GKID**) — the **consumption** pool: roasted beans the cafe brews from.
3. **Ecommerce** (Activity *Ecommerce*, BU *Retail Ops*, ESB company code **GKID**) — the
   **online-fulfilment** pool: roasted/packed beans waiting to ship against online orders
   (CONTEXT.md "Ecommerce fulfilment").

Crucially, HQ retail and Ecommerce **do not produce** their beans — **they order them from the
Roastery to replenish.** The Roastery is the **internal supplier** to the other two: a roastery→retail
or roastery→ecommerce movement is an **internal replenishment transfer**, not a sale. And in ESB
terms, because ESB keys stock by company code, that transfer is a **GRI→GKID movement** (CONTEXT.md
"Stock location & internal replenishment"; `docs/reference/warehouse-online.md`).

This is an **internal supply chain** the current single-location kitchen-stock model structurally
cannot express — it has no concept of (a) more than one location holding the same item, (b) stock
moving *between* locations as a planned, approved, trackable flow, or (c) a location being an
internal supplier to another. The grill surfaced three concrete failures the status quo produces:

- **"The stock" is ambiguous** — when the cafe asks "do we have beans?" the answer is different for
  "beans at HQ to brew" vs "beans at the roastery to ship us" vs "beans staged for online orders."
  A single balance hides the decision that actually matters (where the beans *are*).
- **Replenishment is invisible** — today the cafe/Ecommerce reordering from the roastery is a phone
  call / chat / sheet with no record, no scheduled-fulfil view, and no stock drawdown tied to it.
- **Ecommerce fulfilment is a sheet** — the order→picked→packed→shipped queue the team hand-tracks
  today draws on a stock pool (the Ecommerce location) that MOS does not model, so MOS cannot be the
  system of engagement for the one fulfilment step the platform does *not* own.

This ADR generalizes the kitchen single-location model into a **location-scoped inventory** with a
first-class **internal replenishment** flow, sized for the first slice (cafe + roastery + ecommerce
beans) and architected so the larger MOS (bar, more locations, more Activities) grows in without a
rewrite — the same "add a dimension, don't reshape" posture as ADR-0014's cascade seam.

## Decisions

### D1 — Stock is location-scoped: keyed by (item × location/Activity × stage), not global

Inventory is keyed by **(item, location, stage)**, where:

- **item** — the product/WIP master (the roastery `Product`/`wip_items`-equivalent with a `type` axis;
  `docs/specs/roastery-module.requirements.md` §2.1).
- **location** — the **Activity-served pool** that physically/logically holds the stock. The closed
  MVP set, drawn verbatim from CONTEXT.md plus the incumbent:

  | MOS stock location | Activity served | Owning BU | ESB company code | Stages held |
  |---|---|---|---|---|
  | **Roastery** | Roasting | B2B Ops | **GRI** | green (Raw) · roasted (WIP) · packed (FG) |
  | **HQ retail** (cafe bean stock) | Kitchen + Bar | Retail Ops | **GKID** | roasted (WIP/FG) |
  | **Ecommerce** (online-fulfilment stock) | Ecommerce | Retail Ops | **GKID** | roasted/finished (FG) |
  | **Kitchen** (food WIP — incumbent) | Kitchen | Retail Ops | **GKID** | single-stage (food portions) |

- **stage** — **nullable**, present only for conversion-chain Activities. Roastery stock carries
  `stage ∈ {green, roasted, packed}` (§2.5 of the roastery requirements — green is consumed by a
  roast that *produces* roasted; roasted is consumed by a repack that *produces* packed FG). HQ retail,
  Ecommerce, and Kitchen carry a single stage (or none) — they hold, they don't convert.

**The defining consequence of this table: ESB sees two company-code pools (GRI, GKID); MOS sees four
locations, three of which collapse into GKID.** MOS owns the **sub-GKID grain** (HQ retail vs
Ecommerce vs Kitchen) that ESB does not have — the same posture, at the stock layer, that
ADR-0019 D5 takes at the settlement layer (MOS owns the grain ESB lacks; D4 below).

**How this composes with the Kitchen spine (additive, not a rewrite).** The Operate WIP-spine
(`wip_items → plans → logs → stock → approve-rpc`; ADR-0012 D3; CONTEXT.md "Module") is **unchanged in
shape** — it gains a **location dimension**. Kitchen's existing `ops.kitchen_stock` `(org, date,
wip_item)` becomes `(org, date, wip_item, location)` with `location = kitchen` backfilled for every
existing row. Roastery lands as a **sibling module on the same spine** scoped by Activity + carrying
its `stage` axis (the roastery requirements §3.2 conclusion, restated here as architecture). No
existing kitchen behavior, route, or approval RPC is reshaped — the location column is additive, and
kitchen remains a single-location module until/unless bar shares it. This mirrors ADR-0014's
cascade-seam discipline: **the dimension grows in, the spine does not bend.**

**Terminology lock (reinforces CONTEXT.md).** We adopt the glossary's terms verbatim and forbid
re-invention in spec and code: say **stock location** (not "warehouse" — that's implementation); say
**which location** (never "the stock"); say **internal replenishment** (never bare "transfer" — a
transfer between MOS locations is an internal replenishment, distinct from an ESB inter-company
movement and from an external sale). The glossary is the authority; this ADR does not re-decide it.

### D2 — Internal replenishment order: a first-class transfer flow (Roastery = internal supplier)

Replenishment between MOS stock locations is a **first-class internal flow** — an **internal
replenishment order** — not a side-effect of a log entry and not modeled as a sale.

- **Anatomy.** A requesting location (HQ retail, Ecommerce) raises an internal order to an internal
  supplier location (the Roastery), carrying one or more lines (item, qty, requested-by, need-by).
  On fulfilment, stock **moves out of the Roastery** (roasted/packed FG decreases) and **into the
  requesting location** (HQ-retail or Ecommerce stock increases). One flow, two stock effects, across
  one location boundary — the roastery→retail / roastery→ecommerce transfer CONTEXT.md names.
- **Lifecycle.** `requested → acknowledged → fulfilled/dispatched → received`. (An optional
  `approved` gate between `requested` and `acknowledged` is a **later** concern — see D5; MVP ships
  the simple path where acknowledgement ≈ acceptance.) The grain is the **internal order**, not the
  ESB movement: an order may partial-ship and partial-receive before it closes, exactly like a real
  supply chain.
- **Ownership (who does what).** The **requesting location's team raises** the order (R on the
  request — Retail Ops for HQ retail, Retail Ops/ecommerce ops for Ecommerce). The **Roastery
  fulfils** it (R on fulfilment — B2B Ops). Receipt is confirmed by the requesting location. This is
  a cross-BU flow by construction (Retail Ops ↔ B2B Ops), which is *why* it must be a tracked entity
  rather than an informal ask — it is the operational hand-off between two Business Units.
- **Deliberately not a B2B sale (the load-bearing distinction).** An internal replenishment has **no
  external customer, no invoice, no accounts-receivable, no payment, no running balance, and no
  settlement evidence.** It therefore **does not** enter the **Follow-up** settlement lifecycle
  (CONTEXT.md "Follow-up"; ADR-0019 D5) — that lifecycle exists for external money owed (B2B AR
  invoices, retail pending bills). Routing an internal transfer through Follow-up would pollute the
  AR queue with zero-dollar internal moves and mis-model the roastery's relationship to its own
  company. The two flows share *nothing* but the verb "move beans"; their data models, queues, and
  ownership are separate. (See Alternatives.)
- **ESB dimension (recorded, deferred).** In ESB terms a roastery→HQ transfer is a **GRI→GKID
  movement**. Whether MOS *writes* that movement back to ESB is a **later** decision gated on its own
  spike (D5, D4) — exactly as AR write-back was gated (ADR-0019 D5, ADR-0012 D5). MVP **owns the
  operational transfer truth in MOS** and **reconciles** against ESB's company-code ledger; it does
  not write inter-company movements to ESB.

### D3 — Ecommerce fulfilment queue: order → picked → packed → shipped, MOS owns the hand-fulfilment step

Online-order fulfilment is a **light queue MOS owns**, drawing down the **Ecommerce stock location**
(D1).

- **The boundary (platform owns intake; MOS owns the hand).** The **ecommerce platform** owns the
  storefront, pricing, and **order intake** — it is the system of record for *what was ordered and at
  what price*. MOS owns the **hand-fulfilment step** the team currently tracks in a sheet: the
  `order → picked → packed → shipped` progression and the **stock drawdown** against the Ecommerce
  location that each step implies (CONTEXT.md "Ecommerce fulfilment"). MOS does **not** become an
  order-management system (too broad — the platform owns intake) and does **not** own shipping (that
  is one terminal state, not the whole flow).
- **Stock coupling.** A fulfilment draws down the **Ecommerce location** (D1) as it progresses — at
  minimum, shipping consumes Ecommerce FG stock. Whether pick/pack also reserve stock is a spec-level
  detail (lean: ship is the authoritative drawdown; pick/pack are status); the architectural point is
  that the Ecommerce location is the pool this flow spends from, and a fulfilled order is a stock
  movement reason on that location.
- **Revenue is separate and already flows.** Online **sales revenue and margin** are **not** part of
  this flow — they already arrive via the **reporting read-models** fed from the ESB warehouse
  (ADR-0010; ADR-0019 D7), and MOS's fulfilment queue is not the source of revenue truth. This keeps
  fulfilment (OLTP, per-order engagement) cleanly separate from sales analytics (OLAP, aggregate) —
  the same OLTP/OLAP discipline the whole stack runs on.
- **Replenishment feed-in.** The Ecommerce location is itself **replenished from the Roastery** via
  D2 — i.e. the ecommerce fulfilment queue spends a pool that D2 refills. D2 and D3 are the two
  halves of the ecommerce beans loop (replenish in, fulfil out); neither makes sense without the
  other, which is why both decisions live in this ADR.

### D4 — Reconciliation vs ESB: MOS owns the operational stock/transfer grain ESB doesn't

The relationship between MOS's location-scoped stock and ESB's company-code ledger is
**reconciliation, not write-back** — the direct stock-layer analogue of ADR-0019 D5's settlement
decision.

- **The grain asymmetry (the whole reason this is a decision).** ESB tracks stock **per company code**
  (GKID vs GRI) as a **movement ledger** with typed reasons (Purchase, Transfer In/Out, Manufacturing
  In/Out, Sale, Opname…; `docs/specs/roastery-module.requirements.md` §1.3, §2.5). MOS tracks stock
  **per location + stage** (D1) — a finer grain **within** a company code. Three MOS locations
  (HQ retail, Ecommerce, Kitchen) collapse into one ESB company code (GKID). MOS therefore owns the
  **sub-GKID operational truth** ("how much is at HQ vs staged for online vs in the kitchen") that
  ESB structurally does not have — precisely the grain the floor needs and the ledger doesn't.
- **The precedent (ADR-0019 D5, restated for stock).** For money settlement, MOS owns
  invoice/tab-grain settlement state, ESB keeps aggregates, and the bridge is **reconciliation**
  (AR write-back returned **LIKELY-NOT**). Stock takes the identical posture at a different layer:
  **MOS is the operational truth at the grain ESB lacks; ESB is the aggregate ledger truth; the
  bridge is reconciliation, not write-back.** This ADR does **not** pre-judge a future ESB write-back
  spike for inter-company transfers — it sets the **default** (reconciliation) and gates any change to
  it on its own spike (D5), mirroring the AR discipline exactly.
- **The GRI `stock_movement` prerequisite (binding dependency).** Any GRI↔GKID reconciliation depends
  on ESB's `stock_movement` ledger being **complete and correct for GRI** — and that sync is
  **in-flight** today (the GRI stock_movement sync fix; `docs/reference/warehouse-online.md`;
  `docs/plans/2026-07-04-home-v1-margin.md`). Until that sync is proven, MOS cannot reliably
  reconcile roastery-side stock or roastery→GKID transfers against ESB. **D4's reconciliation is
  gated on the GRI sync landing first** — a hard ordering dependency this ADR records. (The home-v1
  margin amendment already treats stock-movement figures as **interim / not-yet-reconciled** until
  opname reconciliation; the same caution applies here.)
- **What reconciliation means concretely (shape, not spec).** MOS's per-location balances, summed to
  company code, are **reconciled against** ESB's per-company-code movement ledger on a cadence; drift
  (the sub-GKID split MOS owns vs the GKID aggregate ESB owns) is surfaced as a reconciliation
  difference for ops/finance review — the same "MOS computes the correct number for the first time
  anywhere" value D5 claims for aging. The exact cadence, the opname (physical stocktake) tie-in, and
  the difference-resolution workflow are **spec-level**, not this ADR.

### D5 — MVP vs later (phasing)

Guided by ADR-0019's standing posture (**usability and speed beat model completeness**) and D14
sequencing (Activity roll-ins are last). The MVP is the smallest thing that makes the cafe/roastery
stop running bean replenishment on chat and sheets.

**MVP (v1) — location-scoped stock model + roastery two-stage stock + a simple roastery↔retail
internal order.**

- The **location dimension** on stock (D1) lands — `ops.*` stock gains a `location` (additive;
  kitchen backfilled to `location = kitchen`). This is the single enabling change everything else
  hangs off.
- The **Roastery module MVP** as scoped in `docs/specs/roastery-module.requirements.md` §5: product
  master with type + alias; **green + roasted stock** as two stages on the kitchen stock model
  (keyed `(item, location=roastery, stage)`); a **yield-capturing roast log** (green-in / roasted-out
  / yield% / shrink%); plan→log→stock→review reuse; **manual ESB-as-truth for purchasing + sales**
  (no AR rebuild, no purchasing module — roastery MVP owns the floor, not the ledger).
- A **simple internal replenishment order** between **roastery ↔ HQ retail** (D2): request,
  acknowledge, fulfil (roastery FG out), receive (HQ retail in) — the **happy path without an
  approval gate**, without partial-ship sophistication, and **without ESB write-back**. This is the
  one cross-location flow that proves the model end-to-end on the beans that actually move today.

MVP **explicitly excludes** (to keep it minimal): full multi-step transfer approvals; the Ecommerce
fulfilment queue (D3) and roastery→ecommerce replenishment; packed-FG / repack; blends/SFG
multi-level BOM; QC/cupping; ESB write-back of inter-company transfers; automated reconciliation.

**Later (v2+).**

- **Ecommerce fulfilment queue (D3)** + roastery→ecommerce replenishment (D2 extended) — the second
  cross-location flow, landing when ecommerce's turn in the D14 sequence arrives.
- **Full transfer approvals** — the `approved` gate and partial-ship/partial-receive richness on the
  internal order lifecycle; multi-step approval routing for larger transfers.
- **Reconciliation automation (D4)** — scheduled MOS-vs-ESB company-code reconciliation, opname
  stocktake tie-in, difference-resolution workflow (gated on the GRI `stock_movement` sync).
- **ESB write-back of inter-company transfers** — a `source_module ∈ {roastery, …}` handler posting
  GRI→GKID movements to ESB, **gated on its own spike** (same discipline as AR/BOM write-back in
  ADR-0019 D7 / ADR-0012 D5); MVP defaults to reconciliation-only.
- **Packed FG / repack / blends / QC** — the roastery v2+ items (§5 of the roastery requirements),
  which deepen the roastery location's stage chain rather than the cross-location model.
- **Per-Activity "WIP folder" UX** (CONTEXT.md) — once Bar also arrives, fold kitchen/roastery/bar/ecommerce
  WIP by Activity in the Operate surface; out of scope here.

## Alternatives considered

- **Keep global stock + ignore location** (status quo, generalized). Rejected — it **breaks the
  moment two locations hold the same bean**, which is the actual state of the company today (the
  roastery, the cafe, and the online shelf all hold roasted beans). A single global balance cannot
  answer "where are the beans," cannot express replenishment (there is nowhere to move *from* or
  *to*), and forces the cafe/ecommerce reordering reality back into chat/sheets — the exact failure
  this ADR exists to fix. The grill surfaced this as the deciding case.

- **Model internal transfers as B2B sales** (route roastery→retail through the sales/Follow-up
  lifecycle). Rejected — **wrong on every axis.** An internal transfer has **no external customer, no
  invoice, no accounts-receivable, no payment, and no settlement**; pushing it through Follow-up
  (CONTEXT.md) would flood the AR queue with zero-dollar internal moves, mis-model the roastery's
  relationship to its own company, and couple an operational stock flow to a money-settlement flow
  that has nothing to settle. The two share only the verb "move beans"; their data models, queues,
  ownership, and lifecycle are separate (D2).

- **Let ESB own all inter-company movement** (MOS reads ESB's GRI/GKID ledger as the sole stock
  truth). Rejected — **MOS would lose the floor grain that is the entire point.** ESB's grain is the
  company code; MOS needs the sub-GKID split (HQ retail vs Ecommerce vs Kitchen) and the roastery's
  green/roasted/packed stages, neither of which ESB has. Worse, the **GRI `stock_movement` sync is
  still in flight** — ESB's GRI ledger is **not yet reliable** for reconciliation, let alone as sole
  truth. ADR-0019 D5 already established (for money) that MOS owns the grain ESB lacks and ESB keeps
  the aggregate; stock takes the same posture (D4). Treating ESB as sole truth would also invert the
  OLTP/OLAP discipline (ADR-0010): the warehouse is the system of *analysis*, never MOS's app backend.

- **Per-location stock tables (one table per location).** Rejected — **N copies of one concern**, the
  same anti-pattern ADR-0012 rejected for per-Module push tables. A location **dimension on one stock
  model** (D1) is the normalization; per-location tables would duplicate the spine, the approval RPC,
  and the reconciliation logic for each new location, and would make cross-location flows (D2)
  structurally awkward (a transfer would touch two tables in two schemas).

- **Make the location dimension a full warehouse/location master now** (the roastery prototypes'
  `Location {type ∈ Warehouse/Roastery/Packaging/Retail}`). Rejected for MVP as **over-modeling** —
  the closed four-location set (D1) is enough to express today's reality; a typed location master with
  address/parent/capacity is a later concern when physical sub-locations (e.g. multiple retail sites,
  a separate packaging area) actually appear. YAGNI; the dimension is designed to admit a richer
  master later without reshaping stock.

## Consequences

- **Positive — "where are the beans" becomes answerable, for the first time, in one system.** A
  location-scoped balance per item replaces the ambiguous global "the stock"; the cafe, the online
  shelf, and the roastery each read their own pool. This is the headline operational win.
- **Positive — replenishment becomes a tracked, owned, cross-BU flow** (D2) instead of a chat
  message. The Retail Ops ↔ B2B Ops hand-off gets a record, a lifecycle, and a stock effect — the
  operational visibility MOS exists to provide.
- **Positive — the Kitchen spine is reused, not rebuilt.** The location dimension is additive (D1);
  kitchen keeps its shape, routes, and approval RPC, and the roastery lands as a sibling module. This
  is the cheapest possible generalization that still expresses the reality — consistent with the
  project's "add a dimension, don't reshape" posture (ADR-0014).
- **Positive — the ecommerce fulfilment sheet gets a home** (D3) inside the one MOS app, on a stock
  pool (D1) MOS finally models — retiring the last bean-related sheet per ADR-0019 D10's playbook,
  when ecommerce's turn arrives.
- **Positive — the model is forward-safe.** Bar, more retail sites, and a separate packaging area all
  enter as new locations/stages without a schema rethink; the internal-replenishment flow generalizes
  to any supplier→requester pair, not just roastery→retail.

- **Negative / accepted — a data-model change with a one-time migration.** Stock gains a `location`
  dimension (and the roastery a `stage` axis); a new **internal-replenishment-order** entity (header +
  lines + lifecycle) enters `ops.*`. The migration from single-location kitchen stock is **additive
  and history-preserving** (backfill `location = kitchen` on existing `ops.kitchen_stock`; no row is
  destroyed, no balance recomputed) — the same reversibility posture as ADR-0012 D4. Reversibility
  below.
- **Negative / accepted — a hard dependency on the GRI `stock_movement` sync** (D4). Until that
  in-flight sync lands and is proven, MOS cannot reconcile roastery-side stock or GRI↔GKID transfers
  against ESB. This is an **ordering constraint on the roadmap**, not a blocker on the MVP (the MVP
  owns operational truth in MOS and defers reconciliation to later) — but it gates D4's automation and
  any write-back spike.
- **Negative / accepted — MOS carries operational stock truth that exists nowhere else.** Like
  settlement grain (ADR-0019 D5/D13) and certified COGS (D7), per-location stock balances become
  money-adjacent truth MOS alone holds. The **D13 backup gate posture applies**: before this truth
  goes live, MOS's backup/restore posture must be tested — the same binding gate D13 set for
  settlement, inherited here.
- **Negative / accepted — a cross-BU approval/ownership surface to design.** Because internal
  replenishment is Retail Ops ↔ B2B Ops by construction (D2), the approval/notify surface crosses BU
  boundaries; the consuming spec must define who-sees-what and the `can()` grants (ADR-0020), and the
  Inbox/notify seam (ADR-0019 D9) routes the cross-BU hand-off. This is real design work, not free.

- **Tie-ins (where this lands across MOS).**
  - **Home** — per-location stock and replenishment-in-flight become **ops KPI / "state of ops" tiles**
    on Home (CONTEXT.md "Home" — the per-Activity ops KPI set is owner-decided; stock-by-location and
    open-replenishment counts are natural candidates), each drilling into the owning Operate module.
  - **Operate** — the Roastery module and (later) the Ecommerce fulfilment queue are the **Operate
    entries** (ADR-0019 D2) that own this stock; the location dimension is what lets each Activity's
    module read its own pool.
  - **Plan** — **Reference data** (ADR-0019 D7) owns the **item/product master** and (for roastery)
    the recipe/BOM + `last_hpp` costing this stock is denominated in; stock drawdowns feed COGS only
    via the reporting plane, never by copying reference data into stock rows.
  - **Reporting** — per-location stock and transfer aggregates are **operational read-models**
    (CONTEXT.md); company-code-level reconciliation against ESB is the bridge in D4.
  - **Daily Log** — a fulfilled internal replenishment mirrors into `ops.log_entries` as an
    `origin`-tagged summary row (ADR-0012 D3's mirror seam), so the floor feed shows "X kg moved
    roastery→HQ today."

## Reversibility

- **The location dimension is additive.** Stock gains a nullable `location` (and the roastery a
  `stage`); existing kitchen rows backfill to `location = kitchen` with no balance change. Removing
  the dimension re-collapses to the incumbent single-location model — no data lost, no history
  destroyed. This is the same additive-seam posture as ADR-0014 / ADR-0012 D4.
- **The internal-replenishment-order entity is additive.** A new header/line/lifecycle table set in
  `ops.*`; it does not alter existing stock rows except through its own (reversible) drawdown
  movements. Dropping the entity removes the flow without touching location-scoped stock.
- **The reconciliation-not-write-back default (D4) is the low-risk path.** MVP writes nothing to ESB;
  a future write-back spike is a **deliberate, gated, staging-first** addition (ADR-0012 D5
  discipline), never the default. Repointing is configuration, not a code change.
- **The GRI sync dependency (D4) is external and in flight.** It is not reversible *by this ADR* —
  it is a recorded ordering constraint. If the sync stalls, D4's automation stalls with it; the MVP
  (operational truth in MOS) is unaffected.

## Open questions (recorded, not resolved here)

1. **Location master shape — now or later?** MVP uses a closed four-location set (D1) as an enum/seed;
  a typed `Location` master (address, parent, capacity, type — the roastery prototypes' shape) is
  deferred. Confirm the closed set is enough for v1 and that admitting the master later is
  non-breaking. Lean: closed set now, master when a second retail site or a separate packaging area
  appears.
2. **Stage on non-roastery locations.** HQ retail / Ecommerce / Kitchen carry a single stage (or
  none). Confirm `stage` is **nullable** and that HQ retail / Ecommerce hold **roasted/FG** (not
  green) — i.e. only the roastery location ever holds green. Affects whether green ever appears at a
  GKID location.
3. **Internal-order approval gate in MVP?** D5 proposes the **happy path without an `approved` gate**
  for v1 (request → acknowledge → fulfil → receive). Confirm the cafe/roastery trust model allows
  skipping approval day-one, or whether a light ops_lead gate is needed from the start (ADR-0011 /
  ADR-0020).
4. **Ecommerce stock drawdown grain.** Does the ecommerce fulfilment queue draw down the Ecommerce
  location at **ship** only (lean), or reserve at **pick**/**pack**? Affects whether pick/pack carry
  stock effects or are pure status. Spec-level.
5. **Reconciliation cadence + opname tie-in (D4).** How often does MOS reconcile per-location sums to
  ESB company-code balances, and how does the **opname** (physical stocktake) cycle close the loop?
  Gated on the GRI `stock_movement` sync landing first.
6. **ESB write-back of inter-company transfers — spike or never?** D4 defaults to reconciliation. Is
  there a real demand to *write* GRI→GKID movements to ESB (so ESB's ledger reflects MOS's transfers),
  or does reconciliation suffice forever (as AR did)? Gated on its own spike, AR-style.
7. **Roll-in trigger.** ADR-0019 D14 puts Roastery/Ecommerce last. Does a specific ops pain (a
  bean-stock blind spot, a fulfilment-sheet error) pull the location-scoped-stock slice forward, or
  does the sequencing hold (Home → agent → Work → AR → Plan → Activities)? Owner call.

---

*End of ADR-0023. Status: Proposed — owner sign-off pending. No migration, table, route, or module
is authorized by this ADR; consuming slices follow the per-issue loop (intake → spec → plan → build →
review → accept → ship).*
