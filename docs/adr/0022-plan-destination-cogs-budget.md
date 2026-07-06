# ADR-0022 — Plan destination: the COGS-budget model (concretizing ADR-0019 D7)

- Status: **Proposed** (grill-proposed 2026-07-06; owner sign-off pending)
- Deciders: Owner (Arief) + Director
- Related:
  - **ADR-0019** — the parent IA north-star: **D2** (the Plan destination owns reference data + the
    workbenches that use it — menu/promo pricing, new-branch budgeting), **D7** (reference data: ESB
    feeds it, MOS owns it — one owning BU, visible freshness, change history; consumers link, never
    copy), **D13** (backup gate before money-truth — certified COGS makes MOS data money-truth existing
    nowhere else; the tested backup/restore posture applies once this surface goes live), and **D14
    step 5** (Plan/reference data sequenced after the AR bridge — "COGS records first, kills the promo
    failure"). The canonical failure named in ADR-0019's Context — *a promo priced against a stale
    COGS copy because Finance forked "new COGS 2026" instead of updating the linked one* — **is the
    failure this ADR exists to kill.**
  - **ADR-0012** — the ESB-outbox pattern (`integrations.esb_push`, `source_module`, staging-first).
    This ADR's **D4** reuses that substrate for the deferred v2 BOM write-back, and inherits its
    **spike-then-build discipline** (D5) from the AR bridge.
  - **ADR-0010** — the **OLTP/OLAP split** (`CONTEXT.md`): MOS is the system of engagement (OLTP); the
    ESB warehouse is the system of analysis (OLAP). `last_hpp` is an OLAP figure that crosses into MOS
    only as a **curated snapshot** in a reporting read-model — never a live warehouse join from OLTP.
  - **ADR-0020** — capability authorization: the `cogs.read` / `cogs.write` capabilities gate who
    captures/edits budgets vs who links/reads them.
  - `CONTEXT.md` — the resolved terms this ADR is built on, **verbatim**: **Budget**, **Ingredient
    cost line**, **Reference data**, **OLTP / OLAP**.
  - `~/Coding/gordi-esb-bak/COGS-REPORT-WORKFLOW.md` — the COGS doctrine this ADR must not violate:
    **BOM = budget (only)**, **GL account-5 = the one actual**, **stock-movement = interim** (only when
    GL isn't posted).
  - `docs/reference/esb-settlement-api-spike.md` — the **precedent for gating an ESB write on a spike**
    (the AR write-back spike returned LIKELY-NOT); this ADR's D4 applies the same discipline to BOM
    write-back.
- Scope note: records the **model decisions** for the Plan destination's COGS-budget surface — what a
  Budget is, what MOS owns vs reads, the MVP boundary, and the deferred v2. **No migration, table,
  route, or component is authorized by this ADR alone**; each consuming slice goes through its own spec
  → plan → build → review loop. The record/table shapes below are **conceptual (shape, not final
  DDL)**, per the ADR-0012 convention.

## Context

### The failure this ADR exists to kill

The canonical MOS failure (named in ADR-0019's Context, lived by Gordi): **a promo priced against a
stale COGS copy** because Finance forked a "new COGS 2026" sheet instead of updating the linked one.
The promo's margin was computed against a number that was already wrong the day it was forked, and
drifted further every week. This is not a calculation bug — it is an **ownership + freshness bug**: the
certified cost existed nowhere authoritative, so every consumer (promo pricing, new-branch budgeting,
menu costing) copied its own private copy and priced against its own decay. ADR-0019 D7 stated the fix
at the reference-data level ("ESB feeds it, MOS owns it; consumers link, never copy"); this ADR
concretizes it for the specific record that pricing/budgeting consume — the **budgeted COGS** — and for
the **act of budgeting itself**.

### Why reference data + budgeting is a whole destination, not a tab

Plan is not "the COGS screen." It is a destination because **three different forward-looking decisions
all consume the same certified number**, and **two of them are creative acts** that need a home:

- **Promo / menu pricing** — "if we sell this at Rp X, what's the margin?" consumes budgeted COGS.
- **New-branch budgeting** — "what does this menu cost to run at a new location?" consumes budgeted
  COGS *and* captures a scenario (a new-branch cost structure over the same BOM).
- **Menu costing / recipe economics** — "which items carry us, which bleed?" consumes budgeted COGS
  per item.

If MOS only *published* a number, these would still be done in sheets — the forked-copy failure
persists. Plan must be where a **Budget is created/captured** as a scenario over the certified cost
basis; that is the anti-stale-copy fix. A Budget is therefore MOS's core **create-verb** in Plan
(`CONTEXT.md`: "the Plan destination's core create-verb").

### The doctrine constraint — MOS's Budget is the *budget*, never the actual

The COGS report workflow (`COGS-REPORT-WORKFLOW.md`) is load-bearing doctrine this ADR must not violate.
It states, with the force of a verified accounting reconciliation:

- **ONE Actual COGS — and it is GL account-5.** GL acct 5 is the stock-movement consumption *reconciled
  to the physical count and posted by source* (POS-Sales + Stock-Opname + Item-Journal waste +
  Purchase-Invoice variance + Memorial-Journal adjustments — these five sum to the acct-5 total to the
  rupiah). There is no "GL actual vs stock-movement actual" — there is **one** actual.
- **BOM = budget only, never relabeled "actual."** The BOM (recipe qty × materials × `last_hpp`) is the
  forward-looking budgeted cost; the report's §4 compares it to the one actual but never presents it as
  a second actual.
- **Stock-movement = interim only when GL isn't posted.** Mid-month, before opname lands, a hand-built
  stock-movement estimate is labelled INTERIM and replaced the moment GL posts.

**The consequence for pricing is decisive, and is the reason budgeting is a live need rather than a
month-end artifact: the GL actual is backwards-looking.** It arrives at month-end — after the physical
count and the adjustment journals reconcile — weeks after the period whose consumption it measures.
**You cannot wait for month-end GL to price next week's promo.** Pricing, new-branch costing, and menu
decisions are *forward* acts; they need a *forward* number. That forward number is the BOM-budget —
which is exactly what MOS's **Budget** is. So MOS's Budget and the COGS report's "actual" are not rivals
and are never confused: **Budget = forward (what it should cost → price against it); Actual = backward
(what it did cost → measure against it, reconcile to the budget).** This ADR treats that distinction as
inviolable; every decision below operates inside it.

## Decisions

### D1 — Plan = budget *creation*, not number-publishing; a Budget is the certified budgeted COGS

Plan's job is not to mirror a number from ESB; it is to **capture** the certified budgeted COGS that
pricing/budgeting consume, and to let those consumers build scenarios over it. Definitions (built on
`CONTEXT.md` verbatim):

- A **Budget** = a menu item's **BOM (recipe: qty × materials)** costed at the **ingredient cost
  lines** (`last_hpp` in MVP, per D2) → the **budgeted COGS**, captured in MOS as **the certified
  number pricing/budgeting consume**. It is the BOM-budget the COGS report already computes
  (`Σ recipe_qty × menu_qty × last_hpp`), now made an **owned, linkable reference record** instead of
  a recomputed-everywhere figure.
- Plan is where budgets are **created/captured**: new-branch costing, promo/menu scenarios. A Budget
  carries a **scenario** dimension (which-menu / new-branch / promo variant), so the same item can
  carry multiple budgets without forking — the certified baseline plus N "what-if" captures.
- **Consumers link, never copy** (ADR-0019 D7). Promo pricing, new-branch budgeting, Home margin KPIs,
  and the deputy agent all read the *same* Budget row; none snapshots it into a private artifact. That
  linkage — not the arithmetic — is what kills the forked-sheet failure.

**Doctrine alignment (explicit):** the Budget is the **budget**, never the actual. MOS never relabels a
Budget as actual COGS; the one actual stays GL acct-5 (measurement, month-end, surfaced via reporting
read-models). Budget and actual **reconcile** (same `last_hpp` basis → the COGS report's §4 variance is
meaningful) but are **never conflated**.

### D2 — Ingredient cost basis = ESB `last_hpp` (MVP); read as budgetary, not recomputed; trend/alert is a deferred layer

The ingredient cost line is MOS-owned **reference data** (`CONTEXT.md`), but its **value in MVP is ESB's
`last_hpp`** — read as the budgetary cost, **not recomputed in MOS**. Concretely:

- **`last_hpp` is already the budgetary basis the COGS report itself uses** (`v_transaction_cogs` =
  `Σ recipe_qty × menu_qty × last_hpp`); MOS adopting the same basis means MOS's Budget and the
  report's budget column **reconcile by construction**.
- **Finance + Procurement own and are responsible** for the numbers (`CONTEXT.md`). MOS holds the
  certified record; Finance/Procurement are accountable for its correctness. MOS does not silently own
  a cost figure it isn't responsible for.
- **Delivery path = the OLTP/OLAP split (ADR-0010).** `last_hpp` is an OLAP figure; it crosses into MOS
  only as a **curated snapshot** in a **reporting read-model** (an ingredient-cost-line read-model
  carrying `as-of`), never a live warehouse join from OLTP. This keeps engagement (OLTP) and analysis
  (OLAP) federated.
- **Deferred later layer (NOT MVP):** the **last-purchase-vs-30/90/180-day trend** and the **Normal
  market variation** alert band (wide for traditional-market/fresh produce, tight for contracted
  goods), whose outside-band moves fire a Follow-up/Inbox alert to Finance + affected managers
  (`CONTEXT.md`). MVP just uses `last_hpp` as-is; the intelligence layer arrives once the certified
  record is real and consumed.

### D3 — MVP boundary = read-and-budget only; no recipe editing

The MVP **reads** ESB's BOM + `last_hpp` and **captures budget scenarios** on top; it does **not edit
recipes**. The ownership split in MVP is therefore:

| Record | MVP owner | Note |
|---|---|---|
| **BOM / recipe** (which materials, what qty) | **ESB** (read-only in MOS) | MOS reads it to cost the Budget; it does not own or mutate it. |
| **Ingredient cost line** (unit cost per ingredient) | **MOS** (Finance/Procurement), value fed by `last_hpp` | The certified reference record; value seeded by ESB. |
| **Budget** (captured budgeted COGS, per scenario) | **MOS** | Plan's create-verb; the certified number consumers link. |

**Why no recipe editing in MVP:** editing a recipe in MOS without writing it back to ESB **forks the
recipe from ESB** — the exact forked-copy failure this ADR exists to kill, just relocated one layer
down (from the cost sheet to the recipe). Read-and-budget delivers the whole certified-number +
scenario value **now**, without creating a second source of truth for the recipe. Recipe mutation stays
in ESB until D4's write-back path exists.

### D4 — Recipe-edit + ESB BOM write-back = one deferred v2, gated on an ESB-BOM-write API spike

If MOS is ever to edit recipes, it **must write the edit back to ESB** — otherwise MOS forks the BOM.
That write-back is **one deferred v2**, gated on a **pre-implementation spike** with the **same
discipline as the AR write-back spike** (ADR-0019 D5 → `docs/reference/esb-settlement-api-spike.md`):

- **Spike question:** does ESB expose a **BOM/recipe write API** (create/update a BOM, its material
  lines, and quantities) that MOS can call idempotently? Inventory `gordi-esb-bak` docs/spikes first;
  the AR spike's finding (292 documented endpoints, **zero** settlement writes; ESB itself mutates AR
  via memorial journals) is a cautionary prior — **ESB's write surface is far narrower than its read
  surface.**
- **Spike verdict gates the v2:** if **LIKELY-NOT** (the likely outcome given the AR precedent), recipe
  editing **stays in ESB** and MOS remains read-and-budget — the core value (certified number +
  scenario capture + margin check) does not need it. If a write API exists and validates, v2 writes
  back via **`integrations.esb_push`** with a new **`source_module`** (e.g. `plan` / `cogs`) per
  ADR-0012, validated **staging-first (`GOO`) before any GKID production write** (ADR-0012 D5).
- **The two are one v2, not two:** recipe-edit-in-MOS and ESB-BOM-write-back are **inseparable**. There
  is no intermediate state where MOS edits recipes but doesn't write back — that state *is* the
  forked-sheet failure.

### D5 — Ecommerce/pricing boundary: MOS is the pre-flight margin check, never the price-setter

MOS computes **margin**; it does not **set price**. The flow:

1. **SKU → certified COGS** — the Budget for the item (the certified budgeted COGS, per D1).
2. **Proposed price → margin** — given a proposed price, MOS computes gross margin / COGS-% and,
   optionally, fires a **floor warning** if margin falls below a configured floor.
3. **The price still lands in ecommerce/POS** — the systems that actually transact own the price. **MOS
   never writes prices to ecommerce.** (`CONTEXT.md` Budget.)

This keeps MOS the **pre-flight** (does this price make sense against certified cost?) without coupling
it to ecommerce internals or creating a two-systems-own-the-price sync problem. The price-setter stays
the commerce system; MOS is the margin discipline applied *before* the price lands.

### D6 — Ownership, change history, and visible freshness (concretizing ADR-0019 D7 for budgets + cost lines)

Every certified record in Plan carries the D7 guarantees, made concrete:

- **One owning BU.** Ingredient cost lines and the certified baseline Budget are owned by **Finance**
  (with **Procurement** co-owning ingredient costs, since Procurement sources them). A scenario Budget
  (a new-branch or promo variant) is owned by its creator's BU but is built **on top of** the
  Finance-owned certified basis — it never replaces it. Cross-BU read/write is governed by
  **capability authorization** (ADR-0020): `cogs.write` for Finance/Procurement capture/edit;
  `cogs.read` for everyone who links (promo pricing, new-branch, Home, deputy).
- **Visible freshness.** Every cost line and Budget carries an **`as-of`** (when the underlying
  `last_hpp`/BOM snapshot was taken) and a **last-updated-by / last-updated-at**, surfaced in the UI so
  a consumer can see *how live* the number is before pricing against it — the direct antidote to "is
  this COGS still good?"
- **Change history.** Every capture/edit is logged (who/what/when) on the **activity-log pattern**
  (ADR-0019 deferred "audit/history uniformity — decided at Plan build"; this *is* Plan build, so the
  **uniform pattern is settled at the consuming spec**, but this ADR commits budgets/cost lines to it).
  A consumer can see every version of a Budget — the drift that was invisible in the forked sheet
  becomes a first-class audit trail.

## Alternatives considered

- **Recompute ingredient costs in MOS from procurement (vs use `last_hpp`).** Rejected. MOS would become
  a costing engine — ingesting GRN/purchase-invoice data and re-deriving FIFO/weighted-average HPP —
  which is **a warehouse's job (OLAP), not OLTP's** (ADR-0010 / `CONTEXT.md` OLTP-OLAP). It would
  **fork the cost from ESB** one layer down (the exact failure we're killing), duplicate a calculation
  ESB already runs and the COGS report already trusts, and silently make MOS the owner of a cost figure
  **Finance** is responsible for. `last_hpp` is already the budgetary basis of record; using it keeps
  ownership with Finance+Procurement and keeps MOS on the engagement side of the split.

- **In-MOS recipe editing day-one (vs read-and-budget).** Rejected (D3). Without ESB BOM write-back,
  day-one recipe edits fork the recipe from ESB — the promo-pricing failure relocated to the recipe
  layer. Read-and-budget ships the certified-number + scenario value now; recipe mutation is gated
  behind D4's spike so it can only ever arrive *with* write-back, never as a silent fork.

- **MOS as price-setter (vs margin-check only).** Rejected (D5). The price must land in the system that
  transacts (ecommerce/POS); MOS writing prices there creates a two-systems-own-the-price sync problem
  and couples MOS to ecommerce internals it has no transaction path into. Margin-check-only keeps MOS
  the pre-flight discipline layer and the price-setter in the commerce system.

- **Using GL-actual COGS for pricing (vs BOM budget).** Rejected — and this is the doctrine point (D1).
  The GL actual is **backwards-looking** (month-end, after opname/adjustments reconcile) and is the
  **one actual**; it arrives weeks too late to price next week's promo. Pricing is a forward act; the
  BOM-budget is the forward number. Using GL actual for pricing would (a) be stale by weeks and (b)
  **conflate budget and actual** — the exact confusion the COGS report doctrine forbids ("BOM = budget
  only; never relabeled actual"). The two reconcile (same `last_hpp` basis) but serve different times:
  **budget for forward decisions, actual for backward measurement.**

- **A live warehouse join from MOS OLTP for `last_hpp` (vs curated snapshot read-model).** Rejected —
  violates the OLTP/OLAP split (ADR-0010). `last_hpp` arrives as a **curated snapshot** with an
  `as-of`, never a live OLAP query from the OLTP path; engagement and analysis stay federated.
  (Recorded as an accepted mechanism, not a live open question.)

## Consequences

**Positive — kills the forked-sheet failure at its root.** The promo that was priced against a stale
private COGS copy now prices against the **one certified, linked, freshness-stamped Budget**. Every
consumer — promo pricing, new-branch budgeting, menu economics, Home margin KPIs, the deputy agent —
reads the same row; none copies it. The drift that was invisible becomes a versioned audit trail (D6).

**Positive — budgeting becomes a real, scenario-capturing surface.** New-branch costing and promo/menu
variants are captured as Budgets *over* the certified basis, not as new forks. The same item carries
its certified baseline plus N "what-if" scenarios without anyone owning a private copy.

**Positive — margin discipline before prices land.** The pre-flight margin check (D5) means no price
reaches ecommerce/POS without having been checked against certified COGS — and MOS never takes on the
coupling/risk of being the price-setter.

**Positive — MOS's Budget and the COGS report reconcile by construction** (D2): same `last_hpp` basis,
so the report's §4 "Budget vs Actual" variance and MOS's margin math are the same number, owned once.

**Positive — the cost record gets real types, RLS, ownership, and freshness** (D6) — replacing the
sheet's unowned, undated, forked model.

**New read-model required — `budgeted-cogs`** (an operational read-model, `CONTEXT.md`): a curated,
named surface per menu item (and per scenario) exposing the budgeted COGS, its `as-of`, owning BU, and
freshness — scoped to the viewer's access (`can()`), readable by the deputy agent. Plus the
**ingredient-cost-line** reporting read-model that carries the `last_hpp` snapshot and its `as-of`.
Both are the curated surfaces the UI and agent read from — never raw tables.

**Money-truth gate applies (ADR-0019 D13).** Certified budgeted COGS is money-truth existing nowhere
else; the **tested backup/restore posture (PITR or scheduled dumps + a performed restore drill) is a
binding gate before this surface goes live**, same as the AR bridge.

**Deferred (recorded, not MVP):**
- **v2 recipe-edit + ESB BOM write-back** — gated on the D4 spike; MVP is read-and-budget.
- **Trend + Normal-market-variation alert layer** (D2) — the cost-intelligence layer; arrives after the
  certified record is real and consumed.
- **Whether the COGS report's budget column reads MOS's certified Budget directly** (vs recomputing in
  the warehouse) — a reporting-plane decision (ADR-0010); out of scope for this slice. Either way they
  reconcile (same basis).

**Negative / accepted — recipe changes still require an ESB round-trip in MVP.** Procurement/Finance
edit the BOM in ESB; MOS re-reads on the next snapshot. This is the current state (not a regression)
and is the price of not forking — accepted until/unless the D4 spike delivers write-back.

**Negative / accepted — `last_hpp` staleness is bounded but not eliminated.** The snapshot's `as-of`
(D6 visible freshness) is the honesty mechanism: a consumer sees the number is "as of Tuesday's pull"
before pricing against it. The deferred trend/alert layer (D2) is what turns staleness from visible
into actionable.

**Negative / accepted — the v2 hinges on an API ESB may not expose.** The AR spike's verdict (292
endpoints, zero settlement writes) is a strong prior that BOM write-back will also be LIKELY-NOT. If
so, recipe editing stays in ESB indefinitely — **acceptable**, because the core value (certified number
+ scenarios + margin check) does not require it. The ADR is designed so that a LIKELY-NOT spike costs
nothing: read-and-budget is the floor, not a fallback.

## Reversibility

- **MVP (read-and-budget) is fully additive and reversible.** It adds reference-data records +
  read-models to MOS OLTP and **writes nothing to ESB** — removing the surface drops the
  tables/read-models with no external effect. No system of record is touched.
- **The certified Budget replacing the forked sheet is a one-way *consolidation*** in the sense that
  once consumers link the MOS record, re-forking to sheets is the named anti-pattern (ADR-0019 D10
  sheet-retirement: time-boxed dual-run → declared cutover → permission flip → tombstone). The MOS
  record is the forward system; the sheet becomes read-only history.
- **The v2 write-back, if it ships, is additive** on the `integrations.esb_push` substrate (ADR-0012):
  a new `source_module` + handler, validated staging-first, gated by a single-proof production push —
  removable by dropping the producer. If the spike returns LIKELY-NOT, v2 simply never starts and MVP
  stands.
- **Capability grants (D6) are admin-editable** (ADR-0020), so who may capture/edit budgets adjusts
  without a migration.

## Open questions (recorded, not resolved here)

1. **BOM-write spike execution** (D4) — the actual inventory of `gordi-esb-bak` for a BOM/recipe write
   endpoint, and the owner action (ask the ESB PIC) if the documented surface is silent. Mirrors the AR
   spike's owner action. *Resolved at the v2 spec, not here.*
2. **Budget scenario model** (D1) — the exact shape of a "scenario" (new-branch location override?
   promo volume assumption? menu-variant BOM overlay?) and whether scenarios snapshot the
   `last_hpp`/BOM at capture time or re-cost live. Lean: snapshot-at-capture with a "re-cost against
   current basis" action, so a frozen scenario is reproducible. *Confirm at the Plan spec.*
3. **Margin floor** (D5) — is the optional floor a per-item, per-category, or org-wide config, and does
   a below-floor proposed price block or merely warn? Lean: warn-only in MVP (the human sets the price);
   blocking is a later policy. *Confirm at the pricing workbench spec.*
4. **COGS-report budget provenance** — whether the warehouse COGS report's §4 budget column is
   eventually fed by (or reads) MOS's certified Budget, or stays a parallel warehouse computation that
   merely reconciles. *A reporting-plane decision (ADR-0010); not blocking this ADR.*
5. **Activity-log pattern uniformity** (D6) — the one uniform change-history pattern ADR-0019 deferred
   to "Plan build." This ADR commits budgets/cost lines to *a* change log; the exact shared pattern
   (table shape, event vocabulary) is settled at the consuming spec so every Plan record uses the same
   one.
