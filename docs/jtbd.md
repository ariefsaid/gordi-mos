# Jobs-to-Be-Done map — the Lens-D oracle (persona × job, across the five destinations)

**Status:** v0.3 — owner-grilled 2026-07-06. **Supersedes v0.2.** The **oracle** that **Lens D —
Product / Intent** grades every MOS surface against. v0.2 graded the E1 *five-screen manager app*
(My Week · Tasks · Task detail · Weekly update · Daily Log); v0.3 re-scopes the lens to the **E6
whole-company OS** — the **five destinations** (Home · Work · Operate · Plan · Inbox, ADR-0019 D2),
the **six Business Units** (Marketing · HR · Finance · Retail Ops · B2B Ops · B2B Sales), and the
**Activities** MOS is absorbing (kitchen · bar · roasting · ecommerce). The v0.2 *structure* is kept
verbatim — intro (how-to-use + Klement job-story format + grade-against-outcome) → §1 personas +
overarching job → §2 destination × job rows (primary role · job story · above-the-fold
decision-relevant info · the one adjacent next action) → §3 cross-cutting paradigms → §4 the Lens-D 5
questions → §5 calibration anchors. The **surviving E1 rows** (Tasks · Task detail · Weekly update
write/review · Daily Log feed/add) are still valid and retained — they now live inside **Work** and
**Operate** rather than being the whole product.

> **Owner-grilled decisions (2026-07-06)** — the calls below are confirmed by the owner, not inferred;
> they re-cast the 2026-06-15 set for the whole-company scope:
> 1. **Four personas** (was three): **Contributor/floor** · **Lead/manager** · **Function-owner/
>    BU-head** *(new)* · **Owner-director**. Personas (2) and (3) are usually the **same person,
>    distinct jobs** — e.g. the Retail Ops head is also the café lead; the B2B Ops head is also the
>    roastery lead. Do not collapse them: the *lead* job is team+floor, the *BU-head* job is
>    function-level money+strategy.
> 2. **Five destinations replace five screens** (ADR-0019 D2). **Home** is a **role-aware cockpit**
>    (not the My-Week surface — My Week is demoted to a *panel on Home*). A surface is now found by
>    *destination → surface*, not by a flat screen list.
> 3. **The cockpit is money-first for the owner-director and function-owner**: the
>    revenue · margins · **money-position strip (AR · AP · unbilled · unearned)** · ops KPIs · cascade
>    progress. **AR is a worked queue** (the Follow-up lifecycle, D5); AP/unbilled are visibility +
>    drill-to-read-only; unearned is visibility-only. A *member* sees no finance row.
> 4. **The E1 calibration anchors survive (A1/A2/A3)** and **five E6 anchors are added** (A4 dead-end
>    Home number · A5 forked reference cost · A6 settled-without-evidence · A7 stale/non-certified
>    COGS pricing · A8 global-not-location-scoped stock). The regression line grows with the surface.
> 5. **Reference data, budgets, and stock are the new high-leverage correctness seams**: consumers
>    **link, never copy** (D7); stock is **location-scoped per Activity**; the Follow-up **settlement
>    lifecycle** has one verb per state and **settled requires evidence**. These are where E6 will fail
>    if Lens D does not grade them.

This is a **living foundation artifact**: each new feature adds/updates its persona's job stories during
intake (the grill captures the job story *before* spec), and the Director keeps the §2 destination rows
in sync as features ship. **The owner maintains job priorities; the Director syncs rows** as the E6
destinations land per the ADR-0019 D14 sequence (Home → agent → Work spine → AR bridge → Plan → Activity
roll-ins). Owner-refinable — the seed below is grounded in the real BUs and Activities
(`docs/project-brief.md`, `CONTEXT.md` "People & structure" + "Surfaces"), the IA north-star
(`docs/adr/0019-ia-north-star.md`), and the built + specced surfaces (`mos-app/src/pages/`,
`docs/specs/`).

> **How to use this doc (for reviewers, both rounds):** for the surface under review — a **Phase-0
> mockup** (`docs/design-mockups/`, before any code) *or* the **built UI** — first locate its
> **destination** (Home · Work · Operate · Plan · Inbox), then find its row(s) in that §2 subsection.
> Each job story is a test oracle. Walk the **Lens-D 5 questions** (§4) against the *primary* job for
> the *primary persona* on that surface. A surface passes Lens D when the primary persona can, on
> arrival: recognise the job is doable here (information scent), see the decision-relevant facts first
> (priority/placement), and **act in one step** on what they see (actionability) — using the **same
> interaction paradigm** as analogous MOS surfaces (§3). Lens D can be run against a mockup before code
> exists — the job story does not need a running app. Home is graded per **persona/access** — run the
> questions once per persona whose cockpit composes differently (owner-director, BU-head, lead, member).

The job-story format (Klement): **"When _[situation]_, a _[role]_ wants to _[motivation]_, so they can
_[expected outcome]_."** Grade against the **outcome**, never the spec.

---

## 1. Personas (from `CONTEXT.md` "People & structure" + the six BUs) and their overarching job

MOS now serves the **whole company** (~30 people across six BUs), not just managers + a few ops users.
The four Lens-D personas — ground each in the real BUs (Marketing · HR · Finance · Retail Ops · B2B Ops
· B2B Sales) and the Activities they run (kitchen · bar · ecommerce under Retail Ops; roasting under
B2B Ops):

| Persona | Grounded in | The one thing they come to MOS to do |
|---|---|---|
| **Contributor / floor** | barista, kitchen hand, roastery operator, ecommerce packer — a `member` access role rostered to an Activity | *"Record what I just did, see my next step, and get back to work."* Captures production/orders in one short pass from a phone; rarely owns tasks; narrow write surface per their Activity. |
| **Lead / manager** | a lead with direct reports — Kitchen Lead, Bar Lead, Roastery Lead, Ecommerce Lead, Sales Lead — derived from the role chain, never a flag (`CONTEXT.md` "Manager") | *"What needs me and my team this week, is my team filing and hitting the floor plan, and who owns what?"* Triages own R/A tasks, reviews reports' updates (upward-only), approves their Activity's logs, scans ownership/RACI. |
| **Function-owner / BU-head** | the head of a BU — Marketing head, Finance head, Retail Ops head, B2B Ops head, B2B Sales head — the A person on that BU's Objectives | *"How is my function performing — money, ops KPIs, cascade progress — and which of my leads do I direct?"* Reads the function's revenue/margin/cost slice + ops KPIs + cascade roll-up; directs leads to the number that's off. *(Usually the same person as a Lead — a distinct job, not a distinct login.)* |
| **Owner-director** | Arief — top-of-chain, whole-company scope | *"Across ALL functions, what's drifting in money and delivery, who owns it, is everyone filing, and where do I direct attention?"* Whole-company cockpit: money position, per-Activity ops KPIs, cascade progress + updates. Files his own update upward. |

Each as a Klement job story:

- **Contributor / floor** — *When I'm mid-shift on the floor (I just roasted a batch, produced the
  kitchen plan, or an online order needs picking), a contributor wants to capture what I just did in
  one short pass on my phone and see my next assigned step, so the fact is recorded for the team's
  visibility and I'm back to work in under a minute.*
- **Lead / manager** — *When I start my work week, a lead wants to see what's drifting in my own R/A
  tasks, whether my reports filed their weekly updates and are hitting the floor plan, and who owns
  what, so I can intervene where it actually matters before things slip.*
- **Function-owner / BU-head** — *When I check on my function, a BU-head wants to see my function's
  revenue · margin · cost slice, the ops KPIs for the Activities under my BU, and my cascade progress
  against plan in one glance, so I can direct the right lead to the number that's off — without
  re-deriving it from sheets.* (Distinct from the lead job even when held by the same person: this is
  function-level money + strategy, not team-and-floor.)
- **Owner-director** — *When I check the operating picture, the owner-director wants to see the
  whole-company money position (revenue · margins · AR · AP · unbilled · unearned), the ops KPIs per
  Activity, and the objective→task cascade progress + update-filing state in one cockpit, so I can
  direct attention across functions without chasing people one-by-one.* (Money + ops + delivery
  oversight — the cockpit job, not a sign-off/approval job.)

---

## 2. Destination × job rows

Ordered by the MOS mental model: **Home** (land + orient) → **Work** (the owned work + its spine +
the weekly rhythm + the money chase) → **Operate** (the floor, per Activity) → **Plan** (reference
data + the budgets/costing that pricing depends on) → **Inbox** (triage + route). For each surface:
**primary persona(s)**, the **top job** as a job story, the **decision-relevant info that must be above
the fold**, and the **one next action that must be adjacent** to that information (the actionability
test).

### Home — the role-aware cockpit (`/`)

Home composes **per persona/access** (ADR-0019 D2/D3) as a **stacked union of the roles a person holds** —
one scrollable surface, **widest-scope section first** (a BU-head-who-is-also-a-lead lands on their function
cockpit with the My-Week lead panel stacked below; a pure lead sees only My Week; a member sees only "what
needs me"). **Not a toggle, not a separate login** (grill 2026-07-06); separate workspaces / a
toggle-with-layered-rails are a deferred v2 only if the union gets too dense. A reviewer grades Home **once
per persona whose cockpit differs** (grade the *stack* the person actually sees). The binding invariant
across all four: **every tile declares a drill target — no dead-end numbers** (§3.10, anchor A4). The
**contributor** stack is **capture-first** (Activity fast-capture + assigned steps; team plan read-only as
context) — **no rostering in MVP** (shift-scheduling deferred but near-term; leave the "your shift today" seam).

| Surface (route) | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Home — owner-director cockpit** (`/`, owner-director access) | Owner-director | *When I open Home, I want the whole-company money + ops + delivery picture in one cockpit, so I know where to direct attention across all functions.* | The **money strip**: revenue · margins (per revenue stream: Cafe Ops · Ecommerce · B2B). The **money-position strip**: **AR** (aging, as a worked queue — overdue · chased · promised · partial) · **AP** · **unbilled** · **unearned** (each with drill; AR drills to the Work Follow-up queue, AP/unbilled to read-only, unearned visibility-only). The **ops KPIs per Activity** (the "state of ops" — kitchen/bar/roastery/ecommerce; the specific metric set is owner-decided). The **cascade progress + updates** list (Objectives/Projects on/off track, who has/hasn't filed). | Every number → its **drill target**: an AR-overdue figure → the Work Follow-up queue filtered overdue; a margin dip → the Plan budget / Reporting margin read-model; an off-track Objective → the Work cascade view; a missing-filer → their update. **A number is never a dead end** (anchor A4). |
| **Home — function-owner / BU-head cockpit** (`/`, BU-head access) | Function-owner / BU-head | *When I open Home, I want my function's money, ops, and delivery progress in one glance, so I know which of my leads to direct.* | **My BU's slice only** — revenue · margin · cost for my BU; the ops KPIs for the Activities under my BU (e.g. Retail Ops head sees kitchen + bar + ecommerce KPIs; B2B Ops head sees roastery KPIs); my BU's cascade progress (my Objectives/Projects) + my reports' update-filing state. **No other BU's money row** (visibility direction, §3.6). | Each metric → drill into its owning surface: my margin → Plan/Reporting read-model scoped to my BU; my off-track project → Work cascade; my overdue follow-ups (if my BU chases — B2B Sales/Retail) → Work Follow-up queue; my missing-filers → their updates. Drills, no dead ends. |
| **Home — lead / manager panel** (`/`, manager access) | Lead / manager | *When I open Home, I want my My Week panel — what's drifting in my R/A tasks, whether my team filed, and what's happening on my floor — so I act on what needs me.* | The **My Week panel** (a *component of Home*, not the surface): the **dominant urgency-grouped task table** (R-or-A, off-track first: overdue → ≤3d → the rest), each row status · owner (R-avatar + "+N") · due · last-activity age; the one-line **weekly-update strip**; the one-line **ops-today / needs-me amber strip**; the **team module** (each report: filed-status pill + overdue count). Auxiliary strips stay one-line and **below** the table. | A task row → its **detail**; each strip carries its own single next action ("Write update →" / "See what needs attention →"); the ops strip → the Daily Log / the lead's Activity module; a team report → their update (review pane) and their overdue count → their filtered task list. |
| **Home — contributor panel** (`/`, member access) | Contributor / floor | *When I open Home, I want to see what needs me today and capture what I just did, so I do my shift's work and log it fast.* | **"What needs me"**: my assigned checklist steps / today's production plan (kitchen/bar) / my pick-pack queue (ecommerce) / my next roast (roastery); a **fast-capture entry** to my Activity's log/add form. **No finance row, no cross-team dashboards** (a member sees no money, `CONTEXT.md` "Home"). | A step/plan row → the owning record (task detail / Activity log form); the capture entry → my Activity's log/add form. One tap from Home to the floor capture. |

### Work — the owned work, the spine, the money chase, the weekly rhythm

| Surface (route) | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Tasks** (`/tasks` …) | Lead/manager / owner-director / BU-head (any member can read; cross-unit visibility is the product, OD-P1-3) | *When I scan the work, I want to filter by owner / RACI-role / status / BU and spot what's off track, so I can open the one that needs attention.* | The **dense task table** with the off-track signal (overdue / blocked) visible **in the row**, and the **owner / status / RACI / BU** filters present and obvious (OD-DIR-5: RACI is filterable on lists). | Each row → the **canonical task detail** (one home per task, Lens C invariant). Create-task is a clearly-placed primary, not buried (OD-P2-2: any member creates). |
| **Task detail** (`/tasks/:id`) | Whoever is R or A / lead / manager | *When I open a task, I want to know "what's its status, who's R/A, what's blocking, what's the next checklist step" and change it, so I can move it forward without leaving the page.* | **Status + R/A** above the fold (the decision-drivers: is this on track, and is it mine to move). C/I and checklist follow; the activity age frames staleness. | **Change status inline** (no view transition — OD-P2-1); **edit RACI inline** for editors (R/A/manager, OD-P2-3); check off a checklist item in place. Archive (A/manager only) is the one consequential action that *does* confirm (OD-P2-3). |
| **Objective → task cascade** (`/work` cascade view) | Everyone (line-of-sight); owner-director / BU-head / lead read the roll-up | *When I want to see how my work connects to the goal, I want the objective → project/process → task cascade with ownership and progress, so I have line-of-sight from my task up to the objective it serves.* | The **cascade** (Objective · Project/Process · Task — layers 2/4/6 built now; Outcome/Output fold in additively, ADR-0014) with **A/R + status + lane** per node, expandable; the viewer's own R/A slice prominent (their work rolls up). The admin catalog is the **manage mode** of this same view (not a separate admin-only surface). | Drill **down** a node → its children; **up** a node → its Objective; a node → its tasks. Ownership + progress visible per node so the viewer reads contribution without a separate report. |
| **Follow-up queue** (`/work` follow-ups) | **B2B Sales** (chase B2B AR) · **Retail Ops** (chase retail pending bills) · **Finance** (confirm settled) | *When a commitment is outstanding, I want to work it through its settlement lifecycle — chase, log a promise, log a partial, settle with evidence — so the running balance and aging stay true and nothing is ever marked settled without proof.* | The queue of outstanding follow-ups (B2B AR invoices + retail pending bills), each: counterparty · amount · **running balance** · **lifecycle state** (**open → chased → promised → partial → settled**, `CONTEXT.md` "Follow-up") · due/aging · who's chasing. Filtered to the viewer's lane (B2B Sales sees AR; Retail Ops sees pending bills; Finance sees the confirm-settled queue). MOS's settlement is the grain truth; it **reconciles** against ESB's aggregate AR-reduction journals (ESB write-back spike returned LIKELY-NOT, ADR-0019 D5). | Advance the state **inline**, one verb per transition (chase → log contact when+who; promise → set promise date; partial → log payment, balance updates; **settle → attach evidence** — the only state that **requires proof**, §3.9, anchor A6). Each row drills to the underlying invoice/bill **read-only** record. |
| **Weekly update — write pane** (`/work` updates, top) | Everyone files, incl. top-of-chain (OD-P2-14) | *When the week wraps, I want to write a short recap (summary + a few progress-marked lines) and submit it, so my manager has what they need without a meeting.* | The viewer's **own current-week** draft/summary + update-line list with **progress markers** (Done / In progress / Blocked, OD-P2-10), and the **filed/draft state + Friday due** signal. The write pane is **always the current week** even while a manager browses prior weeks below. | **Submit** (locks read-only; Reopen to revise — OD-P2-11) co-located from first paint. Adding an update line is single-action. No FK-to-task picker (deliberate: narrative, not task-tracking — OD-P2-10). |
| **Weekly update — review pane** (`/work` updates, manager-conditional) | Lead / manager / owner-director | *When my reports have filed, I want to read their updates and see who's still missing, so I know my team's week without chasing.* | The team's per-person **filed / draft / not-started** state for the selected week (on-time-vs-late, OD-P2-14), each expanding to the **read-only submitted update**. Independent week navigation from the write pane. **Upward-only** — author + manager chain + top-of-chain (OD-P1-3). | **Read** the update (review is **READ-ONLY in v1** — no ack, no comment — OD-P2-12). The "next action" is *recognition*: the missing-filers must be obvious so the manager can nudge off-screen. (See anchor A2 — the review pane must not invent a write affordance.) |

### Operate — the floor, one module per Activity (ADR-0019 D2)

Each Activity is served by a **Module** on the **ops-module WIP-spine** (plan → log → stock → review,
`CONTEXT.md` "Module"); the module covers usually one slice of its Activity and grows Features toward
covering it. Kitchen + Bar share the Kitchen module's spine (both WIP-producing); Roastery extends it;
Ecommerce is the fulfilment queue; internal replenishment is the cross-location transfer flow.

#### Kitchen / Bar (the WIP-spine module — `CONTEXT.md` "Module")

| Surface | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Kitchen / Bar — Plan** | Lead / manager (plans); contributor executes | *When I set the day's production, I want to plan how much of each WIP item to produce today, so the team has a variance baseline to log against.* | Today's **plan rows** (WIP item · `action_type` · qty portions), one per (date, item, action); upsert semantics; the **variance baseline** (never posts to ESB). | Add/edit a plan line; a plan row → its **log entry point** for the contributor to capture against. |
| **Kitchen / Bar — Log (capture)** | **Contributor / floor** (primary) | *When I just produced a batch, I want to log what I made in one short pass, so the fact is captured (increment — new row, never overwrites) and I'm back to work.* | The **minimal capture form** (WIP item · qty portions · action); Submitted status; the plan row pre-filled when arrived from plan. Mobile-first (phone-card pattern, ADR-0019 D8). | **Save** (single quiet write, Submitted status); edit-own only. Routes to review for the lead. |
| **Kitchen / Bar — Review** | Lead / manager (`ops_lead` approves) | *When my team has logged production, I want to review and approve it, so stock recomputes and the ESB push + Daily Log mirror fire from one audited point.* | Submitted log lines pending review; approve/reject per line or batch; the single **approve RPC** is the multi-write point (lock → role-gate → mint `batch_id` → flip Approved → recompute stock → enqueue ESB push → mirror Daily Log). | **Approve / Reject** (consequential — the one place that posts). Reject → back to draft with a note. |
| **Kitchen / Bar — Stock** | Lead / manager (read for planning) | *When I plan tomorrow, I want to see today's end-of-day stock per WIP item, so I don't over/under-produce.* | **EOD balance per WIP item** (single-stage — kitchen produces one material directly); start-of-day is a read-time compute; **negative balances preserved** (the signal of a log gap). | A stock row → the logs that produced/drew it; → the next plan line. |

#### The floor record — Daily Log (KEPT from v0.2; the cross-Activity chronological feed)

| Surface (route) | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Daily Log — feed** (`/ops`) | Lead/manager / owner-director (read for visibility) — **contributor is NOT a primary reader** (their job is the add/edit screen) | *When I want to know what happened on the floor today, I want a chronological feed badged by Activity/BU and type, with anything needing attention flagged, so I scan it and follow up only where flagged.* | The **reverse-chronological feed**: time (WIB) · **source/Activity badge** · **type** (production / receiving / QC / follow-up / other) · the happening · **needs-attention amber** · any **linked-task ref** (OD-P2-17/18). Org-readable (floor visibility, OD-P1-3). Mirrored entries carry their `origin` module (kitchen today; roastery reserved). | Open the **linked task** where one exists (the follow-up seam); the **Add entry** primary. **A log entry is read, not reviewed** — past-tense fact, no approve/review verb (OD-P2-16; anchor A1). |
| **Daily Log — add / edit** (`/ops` add form) | **Contributor / floor** (primary) | *When something just happened, I want to record it in one short pass on my phone, so it's captured and I'm back on the floor in under a minute.* | The **minimal capture form**: what happened + type + (defaulted) occurred-at + Activity/BU + needs-attention toggle + optional task link. `occurred_at` defaults to now but is **editable** (log a 9am happening at noon — OD-P2-18). No owner / RACI / status. Mobile-first (OD-P0-3). | **Save** as a single quiet write + confirmation. Edit-own only (author or manager-of-author, OD-P2-19); archive is soft + reversible, no hard delete. |

#### Roastery (the WIP-spine module extended — `docs/specs/roastery-module.requirements.md`)

Roastery is an **Activity under B2B Ops** (ADR-0019 D1; ESB `branch_code = GRI`), WIP-producing like
Kitchen, so it reuses the spine — *extended* with roastery-specific divergences (two-stage stock;
yield-capturing roast log). **MVP (owner grill 2026-07-06)** = green+roasted stock + the yield-capturing
roast log **+ blends (multi-level BOM) + repack → packed-FG + B2B sales-order entry** (the SL pushed to ESB
create-and-authorize, ADR-0024; ESB keeps the invoice + AR, Follow-up reads status). **Only QC/cupping is
deferred to v2.** Roasted COGS = MOS floor-truth (green `last_hpp` ÷ yield%); green = lot grain.

| Surface | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Roastery — roast log (capture)** | **Roastery operator** (contributor) primary; roastery lead reviews | *When I finish a roast batch, I want to capture the green-in / roasted-out and the yield% plus the log essentials, so the conversion is recorded and the cost-of-roasted-kg is computable — not a Drive JPG + memory.* | The **roast-batch capture**: green lot/product in · `input_weight` (green kg) · roasted product out · `output_weight` · **yield% + shrink% (calc)** · profile · operator · green moisture/density · start/end temp · first-crack · roast-time · roast-log image link. Increment semantics; Submitted → Approved; `batch_id` mints the batch code. | **Save** (single write, Submitted). The **yield% is the headline number captured** — green-in ÷ roasted-out — visible on the row, not buried. Routes to review. |
| **Roastery — two-stage stock** | Roastery lead / B2B Ops head (read for planning) | *When I plan the next roasts/repacks, I want to see green (Raw) stock and roasted (WIP) stock separately — and scoped to my location — so I don't run out of green or over-roast.* | **Two stages** keyed on (item, stage, **location**): **green lots** (cost-per-kg + running balance + green QC) and **roasted/WIP bulk**; per **location** (Roastery · HQ retail · Ecommerce — `CONTEXT.md` "Stock location"). Shrinkage (~20%) visible as a first-class metric. | A green-lot row → its roast history; a roasted row → the roast that produced it; the **internal replenishment order** action when HQ/Ecommerce roasted stock is low. **Stock is never shown unscoped by location** (§3.8, anchor A8). |
| **Roastery — review** | Roastery lead / B2B Ops (`ops_lead` approves) | *When the operator logged a roast, I want to review and approve it, so both stock stages recompute (green drawn down, roasted produced) and the ESB push + Daily Log mirror fire.* | Submitted roast batches pending review; **yield% + shrink%** visible per row; approve/reject. The approve RPC recomputes **two-stage** stock (the roastery delta over kitchen's single-stage) and enqueues a `source_module='roastery'` push (module-agnostic, ADR-0012). | **Approve** (consequential — recomputes two-stage stock + posts); **Reject** → back to draft with a note. |

#### Ecommerce fulfilment (`CONTEXT.md` "Ecommerce fulfilment")

| Surface | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Ecommerce fulfilment queue** | **Ecommerce packer** (contributor) works the queue; Retail Ops lead manages | *When online orders come in, I want to work them through pick → pack → ship, so each draws down the Ecommerce stock location and the team stops tracking fulfilment in a sheet.* | The **fulfilment queue** (order → picked → packed → shipped), each: order ref · items · qty · state · destination; the **Ecommerce stock-location drawdown** visible. MOS owns the **hand-fulfilment step only** — the platform still owns storefront, pricing, and order intake; online revenue/margin flows separately via the reporting read-models. | Advance the state **inline** (pick → pack → ship), each a single write drawing the Ecommerce stock; an order → its pick list / stock check. |

#### Internal replenishment (`CONTEXT.md` "Stock location & internal replenishment")

| Surface | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Internal replenishment order / transfer** | Retail Ops / Ecommerce lead **raises**; Roastery lead **fulfils** | *When HQ retail or Ecommerce roasted stock is low, I want to raise an internal replenishment order to the Roastery, so my location is refilled by a roastery→retail / roastery→ecommerce transfer — not an external B2B sale.* | The **internal-order/transfer queue**: requesting location · item · qty · state (requested → roasting/allocated → shipped → received); the roastery's fulfilment view. Distinct from an external B2B sale (ESB tracks it as a GRI→GKID movement). | **Raise an order** (one write); a roastery fulfilment row → the roast/stock it draws from; **mark received** → stock lands in the requesting location (location-scoped). |

### Plan — reference data + the budgets/costing that pricing depends on (ADR-0019 D7)

| Surface (route) | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Budget creation** (`/plan` budget) | **Finance + Procurement** own the numbers; BU-head + Marketing consume | *When I cost a menu item / new branch / promo scenario, I want to capture a budgeted COGS from the **linked** BOM (recipe: qty × materials) costed at the ingredient cost lines (`last_hpp`), so there's one certified budget number that pricing prices against — not a forked copy of the cost sheet.* | The **BOM** (read from ESB — **read-and-budget only in MVP**, no recipe edit; recipe-edit + ESB BOM write-back are one deferred v2) × **ingredient cost lines** (**linked**, `last_hpp` basis, with visible freshness "as of" + who last updated + change history) → the captured **budgeted COGS**; **scenario comparison** (new-branch / promo / menu). One owning BU per budget. | **Capture/save a budget scenario** (one write); a budget → the **linked** ingredient cost lines it consumed (**drill, never copy** — §3.7, anchor A5); a budget → the price/margin check it feeds. |
| **Promo / pricing pre-flight margin check** (`/plan` pricing) | Marketing / BU-head (promo owner); **Finance certifies** the COGS | *When I'm about to run a promo or set a price, I want to check the margin against the certified budgeted COGS, so I never price against a stale or forked cost.* | The candidate price/promo × the **linked certified budgeted COGS** → the **projected margin**; a **freshness/certification warning** if the cost line's as-of is old or its definition is uncertified. The actual price still lands in ecommerce/POS — MOS **never writes prices there**. | **Run the check** (read-only); a cost → drill to its **owning reference record** (not a copy); flag for Finance if uncertified (§3.7, anchors A5/A7). |

### Inbox — the to-triage router (ADR-0019 D2/D9; `CONTEXT.md` "Inbox")

| Surface (route) | Primary persona | Top job — job story | Above the fold (decision-relevant) | The one adjacent next action |
|---|---|---|---|---|
| **Inbox — to-triage** (`/inbox`) | Everyone (routes to their work); owner-director / lead see approvals | *When I have notifications, @mentions, or approvals waiting, I want to triage them in one place and jump straight to the entity where the conversation lives, so I clear the queue and act — without Inbox becoming a chat surface.* | The **list** (notifications · @mentions · approval requests · escalations), each carrying its **source entity** + one-line context; unread/untriaged first. PWA push fans out the same rows (D9); WhatsApp deferred until push proves insufficient. | Each row → **the entity where it lives** (task / objective / log entry / follow-up / reference record) — **conversation happens there, not in Inbox** (D4: MOS owns work-item comms only; free-form chat stays in WhatsApp). An approval → the **approve action on the entity**. Inbox is a router, never a chat surface. |

---

## 3. Cross-cutting interaction paradigms (MOS's record verbs + the E6 correctness seams)

Lens D's mental-model-consistency question (§4.5) grades against these. Analogous MOS objects **must**
share one model — divergence is the exact defect class the anchors target. The first six carry over
from E1 (updated for E6); the last four are the new seams E6 surfaces need.

1. **Name** — one noun per concept, per `CONTEXT.md`. A task is a **Task** (never action-item / ticket);
   the owner field reads **Owner** = the R person (never assignee / PIC); the floor record is a **Log
   entry** on the **Daily Log** (never "event" / "Ops Log" — OD-P2-15); a BU is a **Business Unit**
   (never department / "operating area" — that's an **Activity**); a budgeted COGS is a **Budget**
   (never "the costing sheet" / forecast); the unit cost is the **Ingredient cost line** (never
   "the cost sheet" / hardcoded price); an outstanding commitment is a **Follow-up** (never reminder /
   collection); a location-to-location refill is an **internal replenishment order** (never bare
   "transfer").
2. **Create** — one create paradigm per entity: a task via the create-task form (any member, R+A default
   to creator — OD-P2-2); a log entry via the Daily Log add form (any org member — OD-P2-19); a weekly
   update is implicit (one per person per week — OD-P2-13); a **follow-up is created from the underlying
   money record** (B2B AR invoice / retail pending bill), never free-standing; a **budget is created
   from the linked BOM**, never from a pasted cost; an **internal replenishment order is created from
   low stock** at a consuming location.
3. **Open** — one record-open paradigm: **one canonical home per entity** (a task resolves to exactly
   one `/tasks/:id` regardless of arrival point — Lens C invariant); a weekly update opens read-only in
   the review pane; a **follow-up opens to its underlying invoice/bill** (read-only) plus its lifecycle
   actions; a **budget opens to its own scenario** with the linked cost lines; an **order opens to its
   pick list / fulfilment state**.
4. **Change-in-place** — routine lifecycle changes happen **without a view transition**: task status
   and RACI change inline (OD-P2-1/3); a checklist item toggles in place; a **follow-up state advances
   inline** (one verb per transition); a **fulfilment state advances inline** (pick → pack → ship); a
   weekly update adds a line inline. Only **consequential** actions confirm (task archive; kitchen/
   roastery approve-and-post; follow-up settle-with-evidence).
5. **Read vs review** — the load-bearing MOS distinction. A **weekly update** is *reviewed* (a manager
   reads a report's submitted recap — read-only in v1, OD-P2-12). A **kitchen/roastery log line** is
   *reviewed* then *posted* (the approve RPC is the gate before stock + ESB + Daily Log mirror fire).
   A **Daily Log entry** is *read*, never *reviewed* — it is a past-tense floor fact with no
   approve/ack lifecycle (OD-P2-15/16). A **budget** is *read* by consumers, *certified* by Finance.
   Conflating these verbs is the canonical MOS intent trap (anchor A1).
6. **Visibility direction** — weekly updates are **upward-only** (author + manager chain + top-of-chain,
   OD-P1-3); tasks and the Daily Log are **org-readable** (cross-unit visibility is the product).
   **Money is BU-scoped**: a function-owner sees their BU's money slice, never another BU's; Home
   composes per persona/access so a member sees no finance row. A screen that exposes a downward or
   peer-lateral update view — or another BU's money — violates the model (anchor A3).
7. **Link-never-copy (reference data + budgets)** — reference records (COGS, ingredient cost lines,
   recipes, price lists) and **budgets** have **one owning BU** and many consuming BUs; consumers
   **link** the same record, with visible freshness ("as of", who last updated, change history), never
   copy a figure into their own artifact (ADR-0019 D7; `CONTEXT.md` "Reference data"). This exists to
   kill the forked-spreadsheet failure (the canonical "promo priced against a stale COGS copy"). A
   consumer surface that embeds a copied/hardcoded cost instead of linking the record is a defect
   (anchor A5).
8. **Location-scoped stock** — inventory is **never global — it is scoped per location/Activity**: the
   **Roastery** (production output), **HQ retail** (cafe bean stock), and **Ecommerce** (online-
   fulfilment stock) each hold their *own* pool of the same roasted beans (`CONTEXT.md` "Stock
   location"). A stock figure or drawdown shown **without a location** is a defect — always say which
   location; internal replenishment is the roastery→retail / roastery→ecommerce transfer, distinct from
   an external B2B sale (anchor A8).
9. **Settlement lifecycle verbs** — the **Follow-up**'s 5-state lifecycle (**open → chased → promised
   → partial → settled**) has **one verb per transition**: chase (log contact: when + who), promise
   (set promise-to-pay date), partial (log payment; MOS tracks the **running balance**), **settle
   (requires evidence — transfer/receipt proof)**. The **chase-vs-confirm split** holds: the
   relationship owner chases + logs promises/partials (**B2B Sales** for AR, **Retail Ops** for
   pending bills); **Finance confirms settled**. MOS's "settled" is the grain truth; it reconciles
   against ESB's aggregate AR-reduction journals (D5). A settle without evidence is a defect (anchor
   A6).
10. **Drill-not-dead-end (Home)** — every Home tile/number **declares a drill target**; a figure that
    displays with no drill is a dead-end defect (ADR-0019 D2/D3). The cockpit job is to *direct
    attention* — which requires reaching the underlying list/record, so a margin number must reach its
    read-model, an AR-overdue figure its Follow-up queue, an off-track objective its cascade node
    (anchor A4).

---

## 4. The Lens-D 5 questions (the interrogation, per surface × primary job)

1. **Job** — what job did the user come here to do? State it as a job story (use §2). For Home, state
   it per persona whose cockpit composes differently.
2. **Expectation** — does the user *expect* this feature/affordance **here**? Does placement + naming
   match their mental model and management-tool convention, and Gordi's own language (`CONTEXT.md` —
   including the BU/Activity/Revenue-stream distinction, the Budget/Ingredient-cost-line terms, the
   Follow-up lifecycle)? (where-it-lives + what-it's-called.)
3. **Priority / placement** — is information/affordance ordered by **decision-relevance to the job**
   (most-decision-relevant above the fold)? On the owner-director cockpit, is the money strip + money
   position truly first; on the lead's Home, is the drifting-task table truly first with the strips
   quiet and below (OD-P0-7)? On the roast log, is the yield% the headline, not buried?
4. **Actionability** — *"so what / now what?"* — can the user **act** on what they see in one step? Is
   the next action **adjacent** to the insight? (A display that drives no decision fails. **A Home
   number that doesn't drill in is a dead end.** A follow-up state with no inline advance verb fails.)
5. **Mental-model consistency** — do analogous objects share one interaction paradigm (§3) — including
   the **read-vs-review** verb, the **visibility direction**, **link-never-copy** for reference data/
   budgets, **location-scoped** stock, and the **settlement lifecycle** verbs — not just create/open/
   back?

---

## 5. Calibration anchors (must always be caught)

Eight real Gordi-shaped intent traps. Each passes code review + security + Lenses A/B/C (the markup is
clean, the flow is smooth, the IA is one-home-per-entity) but **fails the user's actual job**. A1–A3
are the surviving E1 traps (still live across the five destinations); A4–A8 are the E6-era traps the
new surfaces introduce. These are the regression line for Lens D — if the lens ever stops catching
these, it has drifted.

| # | The trap | Lens-D Q that catches it | Why A/B/C miss it |
|---|---|---|---|
| **A1** | **"Review" verb on a Daily Log entry.** A log entry surfaces a "Review" / "Approve" / "Acknowledge" affordance, treating a past-tense floor fact like work-to-do or like a weekly update awaiting sign-off. (The OD-P2-16 ruling: a log entry is *read, not reviewed* — past-tense, no owner/RACI/status/lifecycle.) *Distinct from a kitchen/roastery log line, which IS reviewed then posted — do not conflate the two.* | **Q5** (mental-model consistency: the read-vs-review verb, §3.5) + **Q2** (the user doesn't expect a review action on a fact). | **(a) Visual** sees a clean, on-brand button. **(b) IxD** finds the click-to-review flow *smooth* — naturalness, not job-fit. **(c) IA** sees one canonical feed. Only the **job** ("record what happened, then get back to work" — not "approve it") exposes the wrong verb. |
| **A2** | **A write affordance on the upward weekly-update review pane.** The manager review pane sprouts a comment box, an "Acknowledge" button, or an edit control on a report's submitted update — when v1 review is explicitly **READ-ONLY** (OD-P2-12), and the report's job is "submit and be done", not "get edited by my manager". | **Q1/Q4** (the screen's job is *read the team's week*; an unasked-for write action is a non-job action) + **Q2** (the report doesn't expect their manager to mutate their submitted recap). | **(a)** the control is styled correctly. **(b)** the comment flow may even feel *natural* in isolation. **(c)** the update still has one canonical home. Only the **job + the OD-P2-12 lifecycle** reveal the affordance does a job nobody on this screen has in v1. **Sunset:** when OD-P2-12 ack/comment ships, a write affordance becomes *intended* — relax/retire A2 then; until then it's a defect. |
| **A3** | **A downward / lateral weekly-update view.** Any Home/Work surface that lets a viewer see a *peer's* or a *subordinate-of-a-different-manager's* weekly update — breaking the **upward-only** visibility model (OD-P1-3: author + manager chain + top-of-chain only). E.g. the team module linking to an update the viewer isn't up-chain of, or a "browse all updates" list. *(E6 extension: the same trap on money — a BU-head's Home exposing another BU's money slice violates §3.6.)* | **Q5** (mental-model consistency: visibility direction, §3.6) + **Q2** (a person does not expect their weekly recap — or another BU's cost — visible sideways). | **(a)** renders fine. **(b)** the click-through is *smooth*. **(c)** it's the same canonical surface. RLS may even still block the *data* (OD-P1-3) — so the screen shows an empty/forbidden state that looks like a *bug*, not an *intent* error. Only the **job + the visibility model** name it. |
| **A4** | **A Home number that's a dead end.** The cockpit shows a margin %, an AR-overdue total, or an ops KPI with **no drill target** — the figure displays but goes nowhere. The owner-director / BU-head job is to *direct attention*, which requires reaching the underlying list/record; a non-drilling number breaks that job (ADR-0019 D2/D3; §3.10). | **Q4** (actionability — a number that doesn't drill is a dead end) + **Q1** (the cockpit job is to direct attention, which needs the drill). | **(a)** the tile renders cleanly and is well-composed. **(b)** the tile composition is *aesthetically* right. **(c)** the IA is a valid hub with five destinations. Only the **job** ("direct attention to the off number") catches that a figure with no drill fails the cockpit. |
| **A5** | **A forked / copied reference cost instead of a linked one.** A Plan budget or a promo/pricing surface **embeds a hardcoded COGS or a copied cost figure** rather than **linking** the Ingredient cost line / Budget record. This is the canonical forked-spreadsheet failure re-imported into MOS ("Finance forked 'new COGS 2026' instead of updating the linked one"; ADR-0019 D7; §3.7). | **Q5** (mental-model consistency: link-never-copy, §3.7) + **Q2** (the user expects the live, owned record, not a stale copy). | **(a)** the number looks fine and renders. **(b)** the costing flow is *smooth*. **(c)** the budget has one canonical home. Only the **job + the certified-record model** catch the fork — the copy is indistinguishable from the link until the source changes and the copy silently doesn't. |
| **A6** | **A "settled" follow-up without evidence.** The settle transition completes with **no transfer/receipt proof attached** — the Follow-up flips to *settled* silently. The settlement lifecycle's binding rule is **settled requires evidence** (§3.9; `CONTEXT.md` "Follow-up"), because MOS's settled is the grain truth that reconciles against ESB's aggregate journals. | **Q5** (mental-model consistency: settlement lifecycle verbs — settled requires evidence, §3.9) + **Q1** (the job's outcome — settlement truth — is violated). | **(a)** the state flip looks clean. **(b)** the click is *smooth*. **(c)** the follow-up has one canonical home. Only the **job + the evidence rule** catch the silent settlement — the screen is a valid follow-up that simply skipped the proof step. |
| **A7** | **Pricing shown against a stale / non-certified COGS.** A margin or price-check surface surfaces a COGS that is either **stale** (old as-of) or **uncertified** (no blessed definition — `CONTEXT.md` "Certified metric"). The promo is about to be priced against a number nobody stands behind. *(Related to A5 but distinct: A5 is fork-vs-link of the record; A7 is the freshness/certification of whatever cost is shown — a correctly-linked record can still be stale or uncertified.)* | **Q2** (expectation — the user expects the certified, fresh number) + **Q5** (link-never-copy + certified-metric consistency, §3.7). | **(a)** a number renders. **(b)** the margin calc flows. **(c)** a valid pricing surface. Only the **job + the certification model** catch the stale-source trap — there's no freshness/certification signal unless the surface carries one (§2 Plan row: a warning if the cost line's as-of is old or uncertified). |
| **A8** | **Global (not location-scoped) stock.** A stock figure, balance, or drawdown shown **without a location/Activity scope** — e.g. "roasted beans: 50 kg" with no Roastery/HQ-retail/Ecommerce split, or an internal transfer that doesn't scope. Stock is **per location** by definition (`CONTEXT.md` "Stock location"; §3.8) — the Roastery, HQ retail, and Ecommerce each hold their own pool. | **Q5** (mental-model consistency: location-scoped stock, §3.8) + **Q2** (the user expects to know *which* location's stock). | **(a)** renders fine. **(b)** the drawdown flow is *smooth*. **(c)** one stock surface. Only the **job** ("which location is low? — should I raise an internal replenishment order?") catches the unscooped number — a global total is actively misleading because it hides the location that's actually out. |

---

*Owner maintains the job priorities; the Director keeps the §2 destination rows in sync as features
ship (per the ADR-0019 D14 sequence) and syncs the design-reviewer agent + `CLAUDE.md` to the four-lens
battery. This is the input every feature's intent check grades against — on both the Phase-0 mockup
round and the built-UI round (`docs/design-workflow.md` §1, §2). The anchor set (§5) grows with the
surface: as each E6 destination lands, expect its era-specific traps to join the regression line.*
