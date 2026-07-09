# ADR-0024 — Roastery B2B sales-order push to ESB (create-and-authorize; ESB keeps the invoice)

- Status: **Accepted** (owner, 2026-07-06, grill-with-docs). Records the **architectural decision**; authorizes no schema, migration,
  route, or component by itself. Roastery is an Activity roll-in — ADR-0019 D14 step **6 of 6** — so
  this builds only when roastery's turn comes; the decision is recorded now so the boundary is known.
- Deciders: Owner (Arief) + Director
- Related:
  - **ADR-0012** (the ESB-outbox pattern — **module-agnostic** `integrations.esb_push`
    (`source_module ∈ {kitchen, roastery, …}`); staging-first write discipline; ESB is the immutable
    system of record MOS reconciles against). This ADR is **additive to that pattern** — a new
    `source_module` value + a new push handler + a new target endpoint, **no schema change**.
  - **ADR-0019** (IA north-star — D1: Roastery = Activity under **B2B Ops**, ESB `branch_code = GRI`;
    D5: **reconciliation-not-write-back** for money settlement — this ADR is its complement for the
    *order-creation* side).
  - **ADR-0023** (roastery module shape; the two-stage stock + WIP-spine roastery extends).
  - **ADR-0010** (OLTP/OLAP split — ESB is the system of record; MOS is engagement).
  - `docs/specs/roastery-module.requirements.md` (§1.4, §3.3 D-R7, §4 — the AR-owned-by-Follow-up boundary).
  - `docs/reference/esb-goo-integration.md` (Core API hosts/auth, the GOO costing-model gotcha, FR-084).

## Context

Roastery sells B2B (cafés, chains). ESB models the sale as a **document chain of distinct documents**:

```
Sales Order (SL…) → Goods Delivery (GD…) → Sales Invoice (SI…) → Sales Payment (SY…)
```

The owner's decision to **pull B2B sales-order entry into the roastery MVP** (grill 2026-07-06) raised a
boundary question: does MOS become an invoicing system, or just an order front-end? Two facts settle it:

1. **SL ≠ SI in ESB, with separate endpoints.** ESB Core exposes **`POST /sales/product-sales` = "Create
   Sales Order"** (documented for staging `core-stg` *and* prod `core`), plus `/authorize`, `/finish`,
   `/reject`. Goods delivery (`/inventory/goods-deliveries`), the sales **invoice**, and payment are
   **separate downstream documents**. So MOS can create the *order* without touching the *invoice*.
2. **The AR tail is already owned elsewhere.** ADR-0019 D5 + `CONTEXT.md` "Follow-up" make **MOS the
   invoice-grain settlement system-of-record via reconciliation** and **ESB the invoice/AR system of
   record** — the ESB write-back spike returned LIKELY-NOT, so MOS does **not** close invoices back in ESB.

The Kitchen module already establishes the authoritative-push posture: a **MOS-side role-gated approval**
(the WIP-spine Review step) is the human checkpoint, after which the `integrations.esb_push` outbox posts
to ESB (`/assembly-actual` / `/simple-transfer`) with `posted_to_esb` / `esb_doc_num` / args-hash de-dupe.

## Decision

**MOS pushes the roastery Sales Order to ESB, create-and-authorize, kitchen-style; ESB issues and owns the
invoice and AR; Follow-up reads ESB invoice status.**

**D1 — What MOS writes: the SL, authorized.** On roastery-approval, the outbox posts `POST /sales/product-
sales` then `POST /sales/product-sales/{num}/authorize`, so the SL lands **Authorized** in ESB, ready for
ESB-side GD → SI → payment. Same authoritative-push posture as the kitchen assembly (MOS approval is the
human checkpoint; the push is trusted). SL body (verified in the ESB Core API docs): `branchID`,
`productSalesDate`, `requiredDate`, `currencyID`, `rate`, `additionalInfo`, `productSalesDetails[]`
(`productDetailID`, `priceListPrice`, `notes`; qty/price/discount optional), optional `customerID` /
`salesRepID` / `customerBranchID`.

**D2 — What MOS does NOT write: the invoice or AR.** ESB stays **invoice-of-record (SI)** and
**AR-of-record**. MOS never issues an SI, never posts a payment, never closes an invoice in ESB. The
**Follow-up** lifecycle only **reads** ESB invoice status (Authorized / Partially Paid / Fully Paid) from
the warehouse sync and reconciles settlement at the grain per ADR-0019 D5 (the complement to this ADR).

**D3 — Mechanism: additive to the ADR-0012 outbox.** A new `source_module='roastery'` push handler + the
`/sales/product-sales` target endpoint. **No schema change** — reuse `integrations.esb_push` and its
`posted_to_esb` / `esb_doc_num` / `posted_at` / args-hash de-dupe. The worker stays kitchen-only until
roastery ships (YAGNI, ADR-0012 D2).

**D4 — Product identity: ESB owns it (`productDetailID`); MOS curates on top.** `productSalesDetails.
productDetailID` is ESB's product identity, so the push depends on resolving a MOS floor item → an ESB
`productDetailID`. MOS holds a **canonical Product master as reference data** (owned/curated by **B2B Ops**;
Finance/Procurement own the cost lines) that **references** the ESB `productDetailID`, carries a clean name
+ strict type axis (Raw/WIP/FG/Packaging/Consumable), and an **alias table** absorbing the GB/RB/Blend name
chaos. **MOS never writes the product master back to ESB** (read-and-curate). A one-time ESB product-master
cleanup (rename/restructure *in ESB*) is a separate remediation track at roll-in; the alias table lets
roastery ship before it.

**D5 — Write-path gate (binding, staging-first).** Before any roastery SL-push build: a **sales-order-create
spike on GOO** — create an SL with **GOO's own sandbox IDs** (FR-084; **never** GKID-real IDs on the shared
multi-tenant sandbox), read it back, confirm the response envelope + authorize path. As with `/assembly-
actual`, GOO's SAE tenant validates **shape**, not GKID data — the real GKID proof is the owner-gated flip.
Fail-closed: an SL push with unset GOO creds dead-letters, never falls back to prod GKID creds.

## Consequences

- **MOS is the order-entry front-end, not a second ledger.** The team enters orders where they do the work;
  ESB keeps issuing invoices and owning AR; no competing invoicing system, no forked AR.
- **One integration seam, many modules.** The ADR-0012 outbox now spans manufacturing (kitchen) *and* sales
  (roastery) with no new persistence — the module-agnostic bet pays off again.
- **The product-master problem becomes load-bearing, not cosmetic.** The SL push cannot resolve without the
  canonical master + alias table (D4); roastery's Reference-data slice is a hard prerequisite of its
  sales-order slice, not an optional cleanup.
- **A write gate, honestly named.** The GOO spike (D5) can only prove shape; GKID sales-order creation is
  first exercised at the owner-gated flip — the same residual risk the kitchen assembly path carries, now
  recorded for sales too.

## Alternatives considered

- **Floor-record only (MOS records the order, never pushes to ESB; SL entered by hand in ESB too).**
  Rejected by the owner — leaves a double-entry gap (MOS order + manual ESB order) exactly where the sheet
  chaos lives; the push endpoint exists, so use it.
- **MOS issues the Sales Invoice (SI) and posts it to ESB.** Rejected — reopens the ESB-write-back spike at
  the *invoice* grain (the LIKELY-NOT path, ADR-0019 D5) and makes MOS a competing ledger. If ever wanted,
  it is a separate v2 behind its own spike.
- **Push SL as draft (unauthorized), human authorizes in ESB.** Rejected by the owner in favour of
  create-and-authorize, matching the kitchen posture where the MOS-side approval is the checkpoint and the
  push is authoritative.
