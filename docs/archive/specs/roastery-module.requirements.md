# Roastery Module — Requirements (synthesis)

- **Type:** requirements-gathering + synthesis. **Not** a spec (no EARS requirements, no `AC-###`, no
  acceptance criteria yet). The next step after this is intake → spec (`feature-forge`/`spec-miner`).
- **Status:** draft for owner review. Produced 2026-07-06.
- **Scope:** what a Roastery **Operate module** in MOS would need to do, synthesised from two
  prototypes, a real roast log, a domain research brief, and the owner's own Airtable-ops project
  recap — mapped onto MOS's IA (ADR-0019) and the existing Kitchen WIP-spine.
- **Taxonomy placement (ADR-0019 D1):** Roastery is an **Activity** under the **B2B Ops** Business
  Unit; ESB `branch_code = GRI`. It is a **WIP-producing** Activity (green → roasted → packaged), the
  same family as Kitchen, so it reuses the **ops-module spine** (plan → log → stock → review) —
  *extended* with roastery-specific divergences (§3.3).
- **Sequencing reality (ADR-0019 D14):** Activity roll-ins (bar, roastery, ecommerce) are step **6 of
  6** — *after* Home v1, agent port, Work spine, AR/pending-bills bridge, and Plan/reference-data.
  This doc is **forward-looking requirements**, not a green light to build. Kitchen stays the live
  WIP module; Roastery is captured here so its shape is known when its turn comes.

## 0. How to read this

Every claim is tagged with its source. Two voices are kept strictly separate:

- **Evidence —** what a source actually shows (prototype data model, real log fields, recap text,
  ESB report columns). Cited as `[recap §x]`, `[RoasteryOS schema]`, `[RoastMaster]`,
  `[Eth-Yirgha log]`, `[research]`, `[ESB reports]`, `[MOS]`.
- **Synthesis —** the proposed MOS mapping, extrapolated by the author. Always introduced with
  "Synthesis:" so it is never mistaken for source fact.

Source inventory (what each contributed) is in the **Appendix**.

---

## 1. The roastery ops workflow, stage by stage

Synthesised from the owner's project recap (the primary requirements source) and corroborated by the
two prototypes and the domain research brief.

### 1.1 Purchasing (green coffee + materials)

**Evidence.** Purchasing covers "Vendor orders, receipts, payments, cost analysis, lead times,
supplier performance, pricing, and reconciliation" `[recap §2a]`. All suppliers are **local** and
shipments are **land only** (no FX, no customs, no import duties) `[recap, user clarification]`.

ESB exposes the full purchase lifecycle as a **document chain** `[recap §4, ESB Purchase Flow]`:

```
Purchase Request → Purchase Order (PO…) → Goods Receipt (GR…) → Vendor Invoice (VI…) → Purchase Payment (VS…)
```

Example real rows: `PO202411110001 → GR202411120001 → VI202411110003 → VS202412030002` (Bali Natural
(GB), 300 kg, supplier "PT. Biji Kopi Indonesia Internasional") `[ESB reports]`.

Materials purchased: **green coffee** (raw beans by origin/variety/process), **packaging**
(bags/standing pouches, boxes), **stickers/labels**, **consumables** (e.g. creamer, matcha powder),
and **returned-FG** inbound ("Barang Retur" — finished goods returned by a client) `[recap §4, team
sheets IN]`.

**Decision questions purchasing must answer** `[recap §2a, 20-questions]`: landed cost per kg by
origin; green-bean days-of-cover vs safety stock; supplier OTIF / lead-time drift; committed cash in
open POs (next 45 days); supplier QC/defect rate; PO-vs-invoice price variance.

### 1.2 Manufacturing (roast · blend · repack; yield/loss; QC/cupping)

**Evidence.** Three manufacturing sub-processes, all WIP-transforming `[recap §2a/§3b]`:

1. **Roast batches** — green-in → roasted-out. The owner states the team currently captures, per
   batch `[recap §4c, clarification #1]`: *green-bean intake (kg), roast-bean output (kg), green
   moisture, green density, start temp, first-crack time, end temp, roast-time duration, and the
   roast log as a JPG in Google Drive.* "We will add a roast-colour detector in the near future"
   (i.e. Agtron/colour). "We also do random cupping as QC" — today captured **manually/offline** and
   the owner explicitly wants it captured in-system for visibility.
2. **Blend batches** — mix roasted (and/or WIP) components per a **BOM/recipe** to output a blended
   SKU. A **semi-finished-goods (SFG) component-usage matrix** is tracked today on a sheet
   (components × finished products) `[recap §4, SFG sheet]`.
3. **Repack orders** — convert bulk roasted coffee into consumer-ready packs (bags/weights), also
   covering creamer repackaging `[recap §2a/§3b]`; packaging SKU + sticker SKU consumed per order
   `[recap §4, ORDERS sheet]`.

**Yield & loss** are first-class. ESB Inventory Valuation carries `Manufacturing In` / `Manufacturing
Out` movement columns `[ESB reports]`. The domain standard is ~20% weight loss (shrinkage) green →
roasted `[research §1]`; both prototypes compute `yield% = output/input` and `shrinkage% =
(input−output)/input` `[RoasteryOS roasting-content; RoastMaster production]`.

**QC/cupping.** Beyond in-line roast metrics, the team runs **random cupping** as QC. The richer
prototype models an SCA-style cupping form: overall score, aroma, acidity, body, flavor, finish,
plus moisture, density, defect count, pass rate, defect rate `[RoastMaster quality]`. RoasteryOS keeps
a separate `QualityControlLog` (testType, moisture, density, agtron, cuppingScore, notes, tester)
linked to product + optional roast batch `[RoasteryOS schema]`.

**Decision questions manufacturing must answer** `[recap §2a, 20-questions]`: yield% by profile/roaster
and shrink trend; roast-to-ship lead-time; OEE/capacity vs forecast; batches failing sensory/COA and
root cause; BOM-actual-vs-planned consumption accuracy; traceability completeness (green lot → batch
→ FG SKU) over last 30 days; re-roast/rework rate and cost.

### 1.3 Finished-goods stock

**Evidence.** Two inventory states sit between roast and sale `[research §3; RoasteryOS
inventory-content]`:

- **Bulk roasted (WIP/carryover)** — roasted but not yet packaged; "crucial for planning next-day
  packaging and preventing over-production" `[research §3]`.
- **Packaged FG** — bagged/labeled SKUs (e.g. 200 g, 1000 g, whole-bean/ground), sale-ready
  `[research §3; recap ORDERS sheet "Product Unit Weight"]`.

ESB tracks stock as a **movement ledger** with typed reasons: Purchase, Transfer In/Out, Invoice
Adjustment, Sales Return, **Manufacturing In/Out**, Other, and **Opname** (physical stocktake), each
with Qty + Value, opening and closing balances `[ESB reports, Inventory Valuation]`. The team's own
sheets mirror this: daily **GB&RB stocktake** (green OUT for production, roast IN from production),
end-of-month **STOCK** reconciliation (beginning / In / Out / ending / stocktake / difference)
`[recap §4, GB&RB + STOCK sheets]`.

### 1.4 B2B sales (orders · delivery · invoice · AR)

**Evidence.** ESB exposes the full B2B sales chain `[recap §4, ESB Sales Flow]`:

```
Sales Order (SL…) → Goods Delivery (GD…) → Sales Invoice (SI…) → Sales Payment (SY…)
(+ Sales Return / Goods Delivery Return as reversals)
```

Invoice **status** is one of *Authorized · Partially Paid · Fully Paid*; payment date is captured in
Sales Flow for paid invoices `[recap clarification #3; ESB reports]`. ~1000 sales-invoice lines and
~1200 sales-flow rows in 2024 `[recap §4]`. Customers are B2B (cafés, chains) with some custom blends
(e.g. "Custom Blend Aladin (Rb)", "B2B - BLUES BLEND 1000 gr") `[ESB reports]`.

**Decision questions sales must answer** `[recap §2a, 20-questions]`: gross margin per kg by channel;
SKU velocity + margin ranking; wholesale contract pacing; demand-forecast accuracy; **outstanding AR
>30 days and exposure**; fill-rate <95% and cause; promo ROI; mix goal (single-origin vs blend).

> **Overlap flag (detailed in §4):** the AR tail (invoice → chase → promise → partial → settled) is
> **already designed in MOS** as the **Follow-up** settlement lifecycle (CONTEXT.md). The Roastery
> module must *consume* it, not re-build it.

---

## 2. The entity/data model the prototypes + real logs imply

Synthesised into a target entity shape. Field lists merge the two prototypes' schemas, the recap's
ESB columns, and the real roast-log fields — labelled by source.

### 2.1 Master / reference

| Entity | Key fields | Source |
|---|---|---|
| **Product** | name, **product code (ESB)**, **product type ∈ {Raw/WIP/FG/Packaging/Consumable}**, unit (KG/PACK), std/last cost, active flag, **alias names** (free-text legacy names), ESB category | `[recap §3b Master; RoasteryOS Product; CSV]` |
| **Supplier** | name, code, payment terms, tax ID, address, specialty ("Green Coffee"/"Packaging") | `[recap §3b; RoasteryOS Vendor]` |
| **Customer** | name, code, **segment (Wholesale/Café/Retail/Online)**, tax ID, billing/shipping addr | `[recap §3b; RoasteryOS Customer]` |
| **Location** | name, **type ∈ {Warehouse/Roastery/Packaging/Retail}** | `[RoasteryOS Location]` |
| **Roast profile** | profile code + name, target roast level, (later) the temp/RoR curve template | `[Eth-Yirgha log; recap clarification #1]` |

> **Product-master problem is real and named.** `[recap, user message on product ID inconsistency]` +
> the staging CSV (419 product names): the **same coffee appears as `(GB)` green and `(RB)` roasted**
> (55 GB / 48 RB occurrences), plus ~130 "Blend" variants, branded lines (e.g. "Matrix" ×19),
> packaging ("STANDING POUCH", "STICKER …"), and consumables ("Krimer"/creamer, "Matcha Powder"). ESB
> categories are inconsistent ("Creamer / Powder"; a "Creamer" raw and a "Creamer FG" finished).
> **Synthesis:** MOS needs a single canonical `Product` master with an **alias table** (the recap's
> "Product Alias Lookup") and a strict `type` axis (Raw/WIP/FG/Packaging/Consumable). This is
> roastery-local **Reference data** (ADR-0019 D7) — not a new MOS-wide pattern (Plan reference data
> already exists).

### 2.2 Purchasing & green lots

| Entity | Key fields | Source |
|---|---|---|
| **Purchase Order** | ESB PO no, date, supplier, total, status; lines: product, qty, unit cost | `[ESB Purchase Flow]` |
| **Goods Receipt** | ESB GR no, date, qty received, value | `[ESB Purchase Flow]` |
| **Green lot** (`RawLot`) | **lot number (unique)**, product, supplier, **origin/variety/process/altitude**, purchase date, **cost per kg**, initial weight, **current weight**, **green moisture, green density**, location, active flag | `[RoasteryOS RawLot; research §2; Eth-Yirgha log]` |

The green lot is the cost-and-traceability atom: every roasted kg traces back to a lot, and lot
`cost_per_kg` is the input to conversion costing (§3.3).

### 2.3 Manufacturing

| Entity | Key fields | Source |
|---|---|---|
| **Roast batch** | **batch code**, date, **green product / lot(s) in**, `input_weight` (green kg), **roasted product out**, `output_weight` (kg), **yield% (calc)**, **shrink% (calc)**, machine, operator, profile, **green moisture/density**, **post-roast moisture/density/colour (Agtron)**, roast-time duration, **first-crack time, start/end temp**, development phase (time + %), notes, **roast-log JPG (attachment/URL)**, **QC link(s)**, approved flag | `[RoasteryOS RoastBatch + roast-batches API; Eth-Yirgha log; recap clarification #1]` |
| **Blend recipe (BOM header)** | name, **processType ∈ {ROASTING, BLENDING}**, version, std output qty, active | `[RoasteryOS Recipe]` |
| **Recipe component (BOM line)** | recipe → component product, **percentage**, step order | `[RoasteryOS RecipeComponent]` |
| **Blend batch** | batch code, date, recipe, planned vs actual output, yield%, operator, QC score, approved | `[recap §3b Blend Batches; RoasteryOS (paraphrased)]` |
| **Repack order** | date, finished SKU, qty, **packaging SKU, sticker SKU**, operator, notes | `[recap §3b Repack; recap ORDERS sheet]` |
| **QC / cupping log** | product, (optional) roast batch, test date, **test type** (green_bean_qc / roasted_bean_qc / cupping), moisture, density, **Agtron/colour**, **cupping score** (overall; richer: aroma/acidity/body/flavor/finish), defect count, status (Approved/…), tester | `[RoasteryOS QualityControlLog; RoastMaster quality]` |

### 2.4 Real roast-log field set (Eth-Yirgha)

The actual log a roaster fills per batch `[Eth-Yirgha log, OCR of three pages]` — capture these
fields verbatim in the roast-batch record:

```
Roast batch ID · Stock code · Roasting mode · Profile code · Profile name · Origin · Variety ·
Process · Altitude (m asl) · green Density (g/L) · green Moisture (%) · Batch size (green kg) ·
Roasting time · Roasting date · Roaster name · Development phase (time + %) ·
temperature & Rate-of-Rise curve (charge temp → first crack → drop temp) · roast-log image
```

Synthesis: this is the **production-floor entry form** spec for the roast log. Note the real log
already separates green-side attributes (Density/Moist) from roast-process attributes (curve,
development) — match that grouping in the UI.

### 2.5 Stock movements (two-stage)

| Stage | Stocks tracked | Movement reasons |
|---|---|---|
| **Green (Raw)** | green lots by location | Purchase Receipt · Roast Usage (out) · Transfer · Opname |
| **Roasted (WIP)** | bulk roasted, by SKU/lot | Roast Yield (in) · Blend Usage (out) · Repack Usage (out) · QC/Sample/Waste (out) · Transfer |
| **Packed FG** | packaged SKUs | Repack Yield (in) · Sale (out) · Sales Return (in) · Transfer · Opname |

Sources: `[RoasteryOS InventoryTransaction (reason enum: PURCHASE, ROAST_INPUT, ROAST_OUTPUT,
PACKAGING_INPUT, PACKAGING_OUTPUT, ADJUSTMENT, PHYSICAL_COUNT, SALE, WASTE); recap IN/OUT/SFG/STOCK
sheets; ESB Inventory Valuation movement columns]`.

The team's `OUT` sheet already types every outflow as **Sample / QC / Waste / Sales / Others**
`[recap §4]` — a richer reason taxonomy than kitchen's, and a real costing concern (QC/samples are
real material that must leave stock, not vanish).

### 2.6 B2B sales (orders · delivery · invoice)

| Entity | Key fields | Source |
|---|---|---|
| **Sales order** | ESB SL no, date, customer, lines (product, qty, unit weight, total weight, **packaging used, sticker used**, shipment, roasted?/packed?), total | `[ESB Sales Flow; recap ORDERS sheet]` |
| **Goods delivery** | ESB GD no, date, qty delivered | `[ESB Sales Flow]` |
| **Sales invoice** | ESB SI no, date, due date, customer, total, **status (Authorized/Partially Paid/Fully Paid)**, outstanding amount, days-past-due | `[ESB Sales Invoice Detail; recap clarification #3]` |
| **Sales payment** | ESB SY no, date, amount, applied invoice | `[ESB Sales Flow]` |

---

## 3. Mapping onto MOS's Operate WIP-spine

### 3.1 The Kitchen spine (the pattern Roastery extends)

`[MOS: ops.wip_items + kitchen_plans + kitchen_logs + kitchen_stock + approve_kitchen_log RPC]`

The Kitchen module implements a four-step spine, all keyed on `ops.wip_items`:

1. **Plan** — `kitchen_plans`: one row per `(org, date, wip_item, action_type, qty_porsi)`; the
   **variance baseline**; upsert semantics; never posts to ESB.
2. **Log** — `kitchen_logs`: the **fact table**; one row per submitted line; **increment semantics**
   (new log = new row, never overwrites); `status Submitted → Approved/Rejected`; carries ESB-outbox
   fields (`posted_to_esb`, `esb_doc_num`, `posted_at`) and a minted `batch_id`.
3. **Stock** — `kitchen_stock`: stored **end-of-day balance** per `(org, date, wip_item)`,
   recomputed by the approval RPC; negative balances preserved; start-of-day is a read-time compute.
4. **Review** — `approve_kitchen_log` RPC: the single SECURITY DEFINER, audited, multi-write point
   (lock → role-gate → mint batch_id → flip Approved → recompute stock → enqueue ESB push → mirror to
   Daily Log). ESB write-back is **module-agnostic** (ADR-0012): `integrations.esb_push` with
   `source_module ∈ {kitchen, roastery, …}` — **roastery is additive (a handler + a `source_module`
   value), no schema change** (ADR-0012 D2).

Kitchen's stock is **single-stage** (produce X portions of item Y; running balance of one material).
The `action_type` set is small and kitchen-specific: `Production / Transfer to Bungur / Transfer to
Radiant`.

### 3.2 What maps cleanly onto the spine (Synthesis)

| Kitchen concept | Roastery reuse |
|---|---|
| `wip_items` master (active-flagged, ESB identity) | → Roastery **Product master** extended to `{Raw, WIP, FG, Packaging, Consumable}` (§2.1). The green/roasted/packed product are all `wip_items`-equivalents with a `type`. |
| **Plan** (daily, per item/action, variance baseline) | → Roastery **roast/blend/repack plan** ("we plan X kg of origin Y to roast today"). |
| **Log** (fact, increment, status Submitted→Approved, batch_id, ESB outbox) | → Roastery **manufacturing log** (roast/blend/repack rows), same approval + outbox shape; `batch_id` mints roast/blend codes. |
| **Stock** (EOD projection per item) | → Roastery **stock projection** — but **per item AND stage** (see §3.3). |
| **Review** (single approve RPC → stock + outbox + Daily Log mirror) | → same pattern; a roastery approval RPC recomputes two-stage stock and (later) enqueues a `source_module='roastery'` push. |
| Daily Log mirror (`origin`) | → the existing `ops.log_entries.origin` already reserves `roastery_app` (legacy enum) / canonical `roastery` (ADR-0012). No schema work. |

**Synthesis:** Roastery is **a sibling Module on the same spine**, scoped by a **"WIP folder" / Activity
dimension** so the roastery team sees green+roasted+packed items and the kitchen team sees kitchen
items. CONTEXT.md already names this: *"WIP-based activities share the ops-module spine — plan→log→
stock→review … the eventual per-Activity scoping (a 'WIP folder') is deliberately deferred."* Roastery
is exactly the second instance that justifies building that fold.

### 3.3 Divergences Kitchen does **not** have (the additions to spec)

These are the real roastery-specific requirements. Each is a delta over the kitchen spine.

| # | Divergence | Why it matters | Source |
|---|---|---|---|
| **D-R1** | **Two-stage (+packed) stock** | Roastery stock is a **conversion chain**: green (Raw) → roasted (WIP) → packed (FG). A roast *consumes* green and *produces* roasted in one event. Kitchen has no raw→product conversion — it produces one material directly. | `[research §1; RoasteryOS InventoryTransaction; recap GB&RB]` |
| **D-R2** | **Yield / conversion costing** | Cost per **roasted** kg = green lot `cost_per_kg ÷ yield%`. This is the core COGS input and exists nowhere in kitchen (kitchen costs by portion, not by material yield). Shrinkage (~20%) must be a first-class metric, not an afterthought. | `[research §4; recap clarification #1; RoasteryOS shrinkage calc]` |
| **D-R3** | **Blend BOM / SFG (multi-level)** | A blend batch consumes **multiple** roasted/WIP components per a % recipe and outputs a blended SKU — a **multi-level BOM** (green → roasted → blend → packed). Kitchen's `action_type` is flat; roastery needs a recipe/BOM graph with component consumption + planned-vs-actual usage. | `[recap §3b Blend Recipes; RoasteryOS Recipe/RecipeComponent; recap SFG sheet]` |
| **D-R4** | **QC / cupping records** | A first-class **QC log** (cupping: aroma/acidity/body/flavor/finish/score; moisture; density; Agtron/colour; defects) linked to product + optional roast batch, with pass/fail. Kitchen has no QC. Today this is offline/manual — owner explicitly wants it in-system. | `[recap clarification #1; RoasteryOS QualityControlLog; RoastMaster quality]` |
| **D-R5** | **Richer outflow reasons (QC/Sample/Waste)** | Roastery stock leaves as **Sample / QC / Waste / Sales / Others** (the team's `OUT` sheet). QC/samples are real material costing. Kitchen reasons are movement-only. | `[recap §4 OUT sheet; RoasteryOS reason enum]` |
| **D-R6** | **Roast-profile + roast-log capture** | Per-batch profile (code/name/curve), development phase, and the roast-log **image** (JPG in Drive → attachment/URL). Specialty-coffee traceability data kitchen doesn't produce. | `[Eth-Yirgha log; recap clarification #1]` |
| **D-R7** | **B2B-sales tail (orders → delivery → invoice → AR)** | The full sales document chain + invoice status + AR settlement. Kitchen has **no sales surface** — it produces for internal café consumption. Roastery sells B2B. | `[ESB Sales Flow; recap §1.4]` — **but see §4: AR is owned by Follow-up, not re-spec'd here.** |
| **D-R8** | **Purchasing/green-lot intake** | Green-lot receipt with origin/variety/process, cost-per-kg, green QC (moisture/density), lot-level running balance. Kitchen procures via ingredients, not lots. | `[RoasteryOS RawLot; research §2]` |

---

## 4. Overlaps with already-designed MOS pieces — reference, do NOT re-spec

These concerns are **already designed elsewhere in MOS**. The Roastery module **consumes** them. Any
roastery spec must link to these, not redefine them.

| Roastery need | Already-designed MOS home | Reference |
|---|---|---|
| **B2B AR / invoices / settlement** (chase → promise → partial → settled; running balance; evidence on settle; chase-vs-confirm split: B2B Sales chases, Finance confirms) | the **Follow-up** settlement lifecycle (CONTEXT.md) + Work follow-up queue | `CONTEXT.md` (Follow-up, Pending bill); ADR-0019 D5; ADR-0012 (ESB outbox); `docs/specs/*` (work-spine family) |
| **Roasted-coffee COGS / BOM cost** (cost-per-roasted-kg × recipe qty) | the **Plan/Budget** model — budgeted COGS = BOM × **`last_hpp`** ingredient cost lines; **read-and-budget only** in MVP (recipe-edit + ESB BOM write-back are one deferred v2, gated on an ESB-BOM-write spike) | `CONTEXT.md` (Budget, Ingredient cost line); ADR-0019 D7 |
| **Green cost / purchasing cost lines** | **Ingredient cost line** reference data (`last_hpp` basis); Finance + Procurement own | `CONTEXT.md` (Ingredient cost line); ADR-0019 D7 |
| **Sales / margin KPIs, ESB financial figures** | **Reporting read-models** (reporting-sales-snapshot, reporting-sales-margin) fed from the ESB warehouse; OLAP/OLTP split | `docs/specs/reporting-sales-{snapshot,margin}.spec.md`; ADR-0010 |
| **GRI `stock_movement` sync** | the ESB→warehouse sync (`gordi-esb-bak`); `stock_movement` is ESB's movement ledger consumed by margin/snapshot reporting — **the GRI sync gap is already being fixed** (in-flight) | `docs/plans/2026-07-04-home-v1-margin.md`; ADR-0010; platform-workstream-status |
| **ESB write-back** (if/when roastery posts) | module-agnostic `integrations.esb_push` (`source_module='roastery'`); **worker stays kitchen-only until roastery ships** (YAGNI) | ADR-0012 D2 |
| **Module identity / Daily Log mirroring** | `ops.log_entries.origin` reserves `roastery`; `source_module` reserves `roastery` | ADR-0012; CONTEXT.md (Module) |

**Net:** the Roastery module is responsible for the **manufacturing spine + two-stage stock + yield
costing + blends/SFG + QC + roast-log** (§3.3 D-R1…D-R6, D-R8). It is **not** responsible for re-
inventing AR settlement, COGS/BOM pricing, or financial reporting — those are Plan / Work / Reporting
planes it links into.

---

## 5. MVP vs later

Guided by ADR-0019's posture (**usability and speed beat model completeness**; AGENTS.md) and the
sequencing reality that roastery is the *last* roll-in. The MVP is the smallest thing that makes the
roastery team stop using error-prone sheets for the daily green↔roast reality.

### MVP (v1) — green+roasted stock + yield-capturing roast log, on the Kitchen spine

Synthesis:

- **Product master** with `{Raw, WIP, FG, …}` type + alias (kills the GB/RB/Blend naming chaos).
  Reference data, one owning BU.
- **Green stock** (lots with cost-per-kg + running balance) and **roasted/WIP stock**, as two stages
  on the kitchen stock model — i.e. stock keyed on `(item, stage)`.
- **Roast log** that **captures yield** (green-in / roasted-out / yield% / shrink%) plus the real-log
  essentials (profile, operator, green moisture/density, start/end temp, first-crack, roast time,
  roast-log image link). This is the single highest-value capture (today it's a Drive JPG + memory).
- **Plan → Log → Stock → Review** reuse: daily roast plan, increment-semantics roast log,
  approve-RPC that recomputes both stock stages, Daily Log mirror.
- **Manual ESB-as-truth for purchasing + sales** in MVP: green receipts and B2B sales stay read from
  ESB (no AR re-build, no purchasing module). Roastery MVP owns the **floor**, not the ledger.

MVP **explicitly excludes** (to keep it minimal): blends/SFG multi-level BOM (D-R3), QC/cupping
records (D-R4), repack into packed FG (partial), B2B order/delivery entry (D-R7), ESB write-back.

### Later (v2+)

- **Blends / SFG / multi-level BOM** with component consumption + planned-vs-actual (D-R3).
- **QC / cupping module** (D-R4) — cupping form, pass/fail, defect tracking, Agtron/colour (once the
  detector lands).
- **Repack → packed FG** + packaging/sticker consumption (D-R5 full), expiry/best-by + FIFO.
- **Roast-profile management** (curve templates, development-phase targets) + machine data-bridge
  (D-R6 advanced).
- **B2B sales surfaces** inside Operate (order/delivery) — but **AR settlement stays in Work
  Follow-up** (§4); roastery only mirrors issuance.
- **Forecasting / pipeline** (the recap's sales 20-questions) — reporting plane, not Operate.
- **ESB write-back** for manufacturing postings — adds a `source_module='roastery'` handler (ADR-0012
  D2), gated on its own spike like AR/BOM.
- **Per-Activity "WIP folder"** UX split (CONTEXT.md) — once Bar also arrives, fold kitchen/roastery/
  bar WIP by Activity.

---

## 6. Open questions for the owner

Flagging ambiguities the sources leave — **do not guess; these need an owner decision.**

1. **Product master ownership & source of truth.** The CSV shows ~419 inconsistent names; ESB has no
   reliable product ID. Who owns the canonical Roastery Product master in MOS (B2B Ops? Finance?), and
   does ESB feed it (D7) or does MOS become truth for the *floor* while ESB stays truth for the
   *ledger*? `[recap product-ID clarification]`
2. **Green-lot grain.** Do we model green at the **lot** level (RoasteryOS `RawLot`, full traceability
   + lot-level cost) or collapse to the **product** level (simpler, loses origin/lot traceability)?
   The real log and specialty-coffee practice argue for lots; the sheet chaos argues for simplicity.
   Owner call. `[RoasteryOS RawLot vs kitchen wip_items]`
3. **Costing basis for roasted COGS.** MVP uses ESB `last_hpp` (CONTEXT.md Ingredient cost line). But
   roasted-coffee COGS = **green `last_hpp` ÷ yield%**. Is the yield-adjusted cost computed in MOS
   (floor truth) or read from ESB's `Manufacturing In/Value` (ledger truth)? They can differ.
   `[research §4; ESB Inventory Valuation]`
4. **Labour as COGS?** Recap states labour is currently **SGA, not COGS** `[recap clarification #2]`.
   Confirm MOS never carries roast/pack labour into per-batch cost (keeps COGS = material + yield
   only), matching Plan/Budget's material-only BOM.
5. **QC as MVP or later?** Cupping is offline today and the owner wants it visible — but is it in the
   *first* roastery slice, or a fast-follow? Affects whether the QC entity ships in v1. `[recap
   clarification #1]`
6. **Blend/SFG in v1?** The SFG component-usage matrix is a real team sheet today, but multi-level
   BOM is the biggest model delta. Confirm blends are *later* (proposed in §5) vs needed-day-one.
7. **Sales surface scope.** Does the roastery team *enter* sales orders/deliveries in MOS, or only
   *see* ESB-mirrored ones while working AR via Follow-up? (Proposed: mirror only in v1.) `[ESB Sales
   Flow]`
8. **Repack / packed FG in v1?** Proposed excluded from MVP (bulk-roasted stock first). Confirm the
   café/B2B packing flow can stay on sheets for one more phase.
9. **The "sample roaster" invoice.** `Invoice _ sample roaster.pdf` is a **Tokopedia retail purchase
   invoice for a NUCLEUS sample-roaster machine** — *not* a Gordi B2B coffee-sales invoice. The B2B
   coffee-sales artifact shape is the ESB *Sales Invoice Detail* report (§1.4). Confirm we should
   **ignore the PDF** as a sales-invoice reference (it's an equipment purchase).
10. **Roll-in timing / trigger.** ADR-0019 D14 puts roastery last. Is there a specific ops pain (e.g.
    the sheet-caused COGS error, a yield blind-spot) that should pull roastery forward, or does the
    sequencing hold (Home → agent → Work → AR → Plan → roastery)?

---

## Appendix — source inventory (what each contributed)

| Source | Path | Contribution | Read-only? |
|---|---|---|---|
| Roastery Ops Project Recap | `~/Downloads/Roastery Ops Data Infrastructure – Project Recap.md` | **Primary** — process scope, ESB report columns + doc chains, team sheets (IN/OUT/ORDERS/SFG/GB&RB/STOCK), full Airtable schema (master/operational/production/RAW), 20-questions-per-process, owner clarifications (local suppliers, no FX; labour=SGA; invoice status semantics; product-ID inconsistency; roast-batch fields; offline cupping). | yes |
| RoasteryOS prototype | `~/Coding/Roast-App/RoasteryOS/` (Next.js + Prisma) | Real **data model** (Product/Recipe/RecipeComponent/RawLot/RoastBatch/PackagingBatch/InventoryTransaction/QualityControlLog/Customer/Vendor/Location) + 5 prototyped screens (Dashboard, Roasting w/ yield+QC+trace, Inventory RM/WIP/FG, Products, CRM) + role set (Admin/Roaster/ProductionManager/SalesStaff). | yes |
| RoastMaster prototype | `~/Coding/Roast-App/RoastMaster/` (Vite client + Node server) | Second-screen validation; **mock-data** only (server has only `User.js`). Confirms screen set (Dashboard/Inventory/Production/Quality/CRM/Sales/Reports) + the **SCA cupping attribute set** (aroma/acidity/body/flavor/finish/score/defects) + sales-order/PO/invoice shape. | yes |
| Coffee roastery research | `~/Downloads/coffee_roastery_research.md` | Domain grounding: end-to-end workflow, ~20% shrink standard, green-lot data points, BOM costing, FG/expiry/FIFO, COGS components. | yes |
| Eth-Yirgha roast log | `~/Downloads/Eth Yirgha Roast Log/` (3 PNGs, OCR'd) | The **real per-batch field set** a roaster records (profile/origin/variety/process/altitude/density/moisture/batch-size/time/date/development-phase/curve). | yes |
| Sample roaster invoice | `~/Downloads/Invoice _ sample roaster.pdf` | **Caveat** — a Tokopedia equipment-*purchase* invoice, not a B2B coffee-sales invoice (see Q9). | yes |
| Staging Airtable CSV | `~/Downloads/staging airtable - Unique .csv` (419 rows) | Quantifies the **product-master naming problem** (GB/RB/Blend/packaging/creamer). | yes |
| RIS-Portal Airtable schema | `~/Coding/RIS-Portal/docs/airtable-schema-json.md` | Confirms an existing invoice-lifecycle pattern (VendorInvoice/ClientInvoice/CustomerPO statuses) that rhymes with MOS Follow-up — corroborating the AR-is-already-designed stance. | yes |
| MOS ADR-0019 | `docs/adr/0019-ia-north-star.md` | IA north-star: 5 destinations; **D1 taxonomy** (BU/Activity/Revenue stream; Roastery=Activity under B2B Ops); **D2 Operate = one module per Activity, shaped by real workflow**; D5 Follow-up; D7 reference data; D14 sequencing. | n/a |
| MOS CONTEXT.md | `CONTEXT.md` | Glossary: Activity/Module, **WIP-spine** (plan→log→stock→review), **WIP folder deferral**, **Follow-up** settlement lifecycle, **Budget/BOM/`last_hpp`**, **Ingredient cost line**, **Reference data**, **Log entry/Daily Log**. | n/a |
| MOS Kitchen module | `supabase/migrations/20260620…*kitchen*` + `mos-app/src/pages/kitchen-*` | The **reference WIP-spine pattern** Roastery extends (wip_items/kitchen_plans/kitchen_logs/kitchen_stock/approve_kitchen_log). | n/a |
| MOS ADR-0012 | `docs/adr/0012-esb-outbox-integrations-schema.md` | ESB outbox is **module-agnostic** (`source_module`; `esb_push`); roastery additive; `log_entries.origin` reserves `roastery`. | n/a |

---

*End of requirements synthesis. Next step per the operating model: owner review of §6 open questions,
then intake (grill-with-docs) → spec (`feature-forge`) when roastery's sequencing turn arrives
(ADR-0019 D14).*
