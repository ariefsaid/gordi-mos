# Gordi MOS

Vocabulary for Gordi's Management Operating System — the internal app for task ownership,
lightweight RACI, weekly updates, and daily ops visibility. Glossary only (per grill-with-docs
rules): no specs, no implementation notes. Heritage terms trace to the dormant Notion Management
OS constellation (see `docs/decisions.md` OD-P0-9).

## Work

**Task**:
The unit of owned work and the **cascade-bridgeable unit** (layer 6) — always carries R and A people, a
business unit, and a status. Its permanent cascade parent is a **Project/Process** (layer 4); the
link is an additive nullable seam (ADR-0003/0014) so the cascade grows in without reshaping the task. A
Task never routes *through* an Output — Output is an optional side-grouping, not a link in the chain.
_Avoid_: action item, to-do, work item, ticket

**Checklist item** (a.k.a. subtask):
A lightweight step under a task — a label + done flag + order, nothing more. It has NO RACI, status,
business unit, or due of its own, and does NOT bridge into the cascade (only its parent Task does).
Distinct from a Task; "subtask" in conversation means this, not a nested task.
_Avoid_: subtask (as a second full task), sub-item

**Status** (of a task):
One of **Open · In Progress · Blocked · Done**. "Decided not to do" is expressed by archiving, not a
status. ("Blocked" subsumes the old Notion Waiting-* family — see below.)
_Avoid_: state, stage

**Archived** (a task):
Soft-removed via an `archived_at` timestamp — hidden from default lists, still findable by filter,
reversible. Replaces hard deletion entirely; no task row is ever destroyed.
_Avoid_: deleted, closed, cancelled (as a verb for this)

**Business Unit**:
A **team** in Gordi's org chart — Marketing, HR, Finance, Retail Ops, B2B Ops, B2B Sales. Owns
people, objectives, and budgets; every task and person belongs to one. (The earlier operating-area
canon — "Kitchen and Bar", "Cafe Ops – General" — is superseded: those are **Activities** or
**Revenue streams**, not BUs. Seeded rows predate this and need re-mapping.)
_Avoid_: department, division; operating area (that's an **Activity**)

**Activity**:
An **operating workstream within a BU** — kitchen, bar, ecommerce (inside Retail Ops); roasting
(inside B2B Ops). The unit ops surfaces are organized around. A **Module** serves an Activity but
usually covers only a slice of it (today's Kitchen module = plan/log/stock/review, one part of the
kitchen Activity); Modules grow Features toward covering their Activity.
_Avoid_: business unit (that's the owning team), app, module (that's the code)

**Revenue stream**:
A **reporting lens for money** — Cafe Ops (kitchen + bar POS), Ecommerce, B2B. May map 1:1 to an
Activity or span several; owned by the reporting plane, not the org chart.
_Avoid_: activity / BU (when grouping revenue), channel (reserve for the POS/B2B source field)

**Follow-up**:
A work item for chasing an outstanding commitment — a **B2B AR invoice** or a retail **Pending bill**.
A task-family record (counterparty, amount, due) attached to the underlying money record; worked from
a queue in **Work**, with comments/@mentions like any task. **Settlement lifecycle MOS owns:** open (aging)
→ **chased** (contact logged: when + who) → **promised** (promise-to-pay date) → **partial** (payment logged,
MOS tracks the **running balance**) → **settled** (paid, **requires evidence** — transfer/receipt proof).
Every partial/settle captures a **required cash-in date** (when the money actually landed in the bank) +
proof — the field Finance matches to the bank statement (and what a future bank feed would auto-populate).
**MOS owns per-invoice reconciliation** — it *replaces* Finance's per-invoice recon gsheet (dual-run →
cutover, the sheet-retirement playbook), so MOS is the invoice-grain settlement system-of-record; ESB's
**aggregate** AR-reduction journal drops to a **secondary cross-check** (Σ MOS-confirmed per counterparty/
period should tie to ESB's aggregate drop; drift → a Finance exception). The ESB write-back spike returned
LIKELY-NOT, so MOS does **not** close invoices back in ESB — reconciliation replaces write-back. Bank-feed
auto-matching is deferred (manual evidence + cash-in date in MVP). **Chase-vs-confirm split:**
the relationship owner chases + logs promises/partials (**B2B Sales** for AR, **Retail Ops/cafe** for pending
bills); **Finance** confirms *settled* (per-invoice, matching cash-in date + proof to the bank).
_Avoid_: reminder, chase (as nouns), collection (accounting jargon)

**Pending bill**:
A **retail** POS sale left unpaid at transaction time — mainly owners and regulars running a tab.
Distinct from B2B AR (formal invoices). ESB records issuance and aggregate journal reductions only;
invoice/tab-grain settlement truth is owned by MOS (today: sheets — to be ported).
_Avoid_: AR (that's the B2B stream), tab (informal, UI copy ok), debt

**Blocked**:
A task that cannot proceed until something outside the R person's control resolves. Subsumes the
old Notion "Waiting Internal / Waiting External / Waiting Approval" family.
_Avoid_: waiting, on hold, stuck

## Cascade (Strategy-to-Execution Stack)

The six-level spine the MOS grows into — **Strategy → Objective → Outcome → Project/Process → Output →
Task** (vault calls layer 4 "Program/Process"; in-app the term is Project/Process). Each level has its
own owner, timebox, and measure; lower levels *contribute* up, they don't copy down. The first slice
builds three (Objective · Project/Process · Task); the rest are vocabulary that folds in additively
(ADR-0014). Adopted because a 3-level model
collapses the two cuts that make recurring work trackable — aspiration≠measurement (Objective≠Outcome)
and work-system≠artifact (Program/Process≠Output).

**Objective** (layer 2):
A yearly, measurable goal that work rolls up to — the "what we want this year." Carries A/R ownership and
a lane; it is the grouping a person's work is read against. (Strategy, layer 1, folds in above later as
the same self-similar shape, via a nullable parent.)
_Avoid_: goal, mission, OKR (that's the measurement layers)

**Outcome** (layer 3 — vocabulary now, table later):
The KPI/KR target that *proves* an Objective is being met — the number, distinct from the aspiration.
Deferred; folds in between Objective and the Project/Process layer additively.
_Avoid_: metric (the measurement act), KR (one kind), result

**Project / Process** (layer 4 — the work-system that moves a goal):
One entity distinguished by **`type ∈ {project, process}`**; carries A/R ownership, a business unit, a
lane, and a nullable Objective link. It is a Task's permanent cascade parent. **No umbrella term is
locked** (owner 2026-06-23 — "use the Project/Process pair for now"; the earlier "Initiative" is dropped);
refer to the pair, or to the specific type.
_Avoid_: Initiative, workstream, work (umbrella terms — none locked); **work-line** in UI copy
(owner 2026-06-26 — UI term is Project/Process; "work-line" survives only as the physical table name
`mos.work_lines`, ADR-0015). The task-form field and the management surface both read "Project/Process".

**Project** (`type: project`):
Bounded, time-boxed **change** work (Transform/Optimize lane) — scope, an end, milestones. E.g. new-menu
design. (The wiki calls this layer "Program"; in-app the term is Project.)
_Avoid_: program (in-app say Project), initiative

**Process** (`type: process`):
Standing, recurring **run** work (BAU lane) — never "done," produces repeating Outputs. E.g. daily IG
content, daily fulfillment. The home for daily ongoing *assigned* work — NOT the reserved term
**Activity** (a task timestamp), and distinct from the **Daily Log** (the factual record that something
*happened*, owner-less; a Process is owned recurring work). Person-load reads from the Projects/Processes
a person is A/R on, never from Daily Log entries. A Process *uses* SOPs but is not one.
_Avoid_: SWP (the wiki's term — say Process), routine, SOP (that's documentation), activity (reserved)

**Output** (layer 5 — vocabulary now, table later):
A discrete deliverable a Program/Process produces in a week/month — the unit of committed load ("2–5 per
person per week; tasks are infinite, outputs are not"). Deferred; folds in as an optional grouping that
*also* belongs to its Project/Process — never inserted between Task and Project/Process (ADR-0014).
_Avoid_: deliverable, milestone (one kind), artifact

**Lane**:
*Why* a piece of work exists — **Run/BAU** (keep service steady, KPI-measured), **Optimize** (harden /
improve, OKR-measured), **Transform** (new capability, OKR-measured). A classification on Objectives and
Projects/Processes; incidents/fires sit inside Run as a sub-queue.
_Avoid_: category, stream, type (reserve `type` for Program|Process)

## Ownership (RACI)

**Accountable / Responsible per layer**:
The A/R split is not task-only — every cascade layer (Objective · Project/Process · Output · Task) carries an
Accountable and a Responsible owner (the wiki's per-layer ownership model; a cross-functional Outcome gets
a single **DRI**). C/I stay task-level. A person's "load" is read from the layers they are A or R on — so
RACI-on-a-task is one instance of a uniform ownership shape, not the product's headline.
_Avoid_: owner (ambiguous as a field), single-owner-per-layer

**Responsible (R)**:
The one person doing the task. Notion heritage: "Assigned to" / "PIC". Shown as the row avatar in
lists (UI column label "Owner" = the R person).
_Avoid_: PIC, assignee, doer, owner (as a field name)

**Accountable (A)**:
The single person answerable for the task's outcome; may equal R. Notion heritage: "Supervisor".
_Avoid_: supervisor, approver

**Consulted (C)** / **Informed (I)**:
People whose input is sought (C) or who are kept in the loop (I). Multi-person; visible on task
detail only.
_Avoid_: watcher, CC, stakeholder

## Cadence

**Weekly Update**:
A person-keyed recap of one person's week — a free-text summary plus a list of update lines. Keyed by
(person, week). Everyone files one (incl. top-of-chain, who has no reviewer); a manager reads their
reports' (upward-only — author + manager chain, OD-P1-3) and files their own upward. Person-keyed is a
deliberate change from Notion's project-keyed "Project Updates".
_Avoid_: project update, status report, check-in

**Update line**:
One free-text row inside a weekly update — what was worked on — carrying a **progress marker**. It is
NOT linked to a Task (deliberate: a weekly recap is narrative + self-reported progress, not
task-tracking). Distinct from a Task and from a Checklist item.
_Avoid_: task (a line is not a task), entry

**Progress marker**:
The done/achieved cue on an update line — **Done · In progress · Blocked**. Distinct from a task's
**Status** (an update line has no Status; it is self-reported, not the task's real state).
_Avoid_: status (reserve that for tasks)

**Submitted** / **Draft** (a weekly update):
A weekly update is **Draft** (editable) until the author **Submits** it, which locks it read-only (the
stable thing a manager reviews). The author may **Reopen** a submitted update back to Draft, edit, and
re-Submit. Filing after the Friday due / week close is allowed ("filed late") — weeks never hard-lock.
_Avoid_: filed (as the status name — say Submitted), published, locked

**Log entry** (the **Daily Log**):
A record that something *happened* on the floor — past-tense and factual: a typed (production ·
receiving · QC · follow-up · other), business-unit-badged operational happening, manually added now
and mirrored from ops apps (kitchen, future roastery) later. It is NOT work-to-do (that's a Task) —
no owner / RACI / status, just *when it occurred*. The chronological surface is the **Daily Log** (the
`/ops` feed). A log entry may carry **needs attention** and link to a Task (the follow-up seam).
The user-facing surface name is **Daily Log** (owner rename 2026-06-12, was "Ops Log"); the internal
schema/route/module stay `ops` / `/ops` / `opsLog` (OD-DIR-3 — internal seams, not user-facing).
_Avoid_: event (collides with cafe events — cuppings, workshops, bookings), activity, daily update, ticket, "Ops Log" (superseded as a user-facing label)

**Needs attention**:
The amber state on a log entry or strip meaning something waits on the viewer (sign-off,
follow-up). Set explicitly on a log entry; often a follow-up linked to a Blocked task.
_Avoid_: alert, warning, flagged

**Activity**:
A task's last-any-write timestamp (status change, comment, field/RACI edit) shown as an age
("3h", "4d"). Notion heritage: "Last edited time".
_Avoid_: last touched, updated at (in UI copy)

**Week**:
Monday–Sunday in Asia/Jakarta time; the weekly update for a week is due Friday 17:00 WIB.
_Avoid_: sprint, cycle

## People & structure

**Org**:
The tenant container; Gordi is the only row for now. Every business row belongs to exactly one org
— the seam that lets future apps/tenants share the stack.
_Avoid_: company, workspace, tenant (in UI copy)

**Person**:
Anyone in `shared.people` — managers and selected ops users in the first slice. Identity is shared
across MOS and future ops apps.
_Avoid_: user (except in auth contexts), employee, member

**Role**:
A named **org position**; a person may hold several roles at once. Roles form the reporting line via
reports-to between roles. Notion heritage: Roles DB with "Reports to / Subordinate". Distinct from an
**Access role** (what a person may *do* in the app) and from a **RACI role** (R/A/C/I task ownership).
_Avoid_: job title (as a field), position; access role / permission (that's app authorization, below)

**Manager**:
A person any of whose roles has subordinate roles with current holders; sees the team module and
reviews their people's weekly updates. Derived from the role chain, never a flag on the person.
A dual-hat person appears in ALL their managers' teams (union), and any of those managers may
review their one weekly update.
_Avoid_: supervisor, lead (except inside role names like "Kitchen Lead")

**Access role** (a.k.a. Permission):
What a person may *do* in the app — the app-authorization layer, distinct from their org **Role**
(position) and from **RACI** (R/A/C/I task ownership). A person may hold several at once; effective
access is the union. First-slice set is **fixed** (a configurable role↔permission model is the deferred
upgrade path): **admin** (the *system administrator* — user management + system config; the only role
that sees the admin UI), **ops_lead** (review/approve operational logs + elevated surfaces), **finance**
(review financial data/dashboards sourced from the ESB warehouse), **member** (default — own tasks, file
own weekly update, log operational activity if rostered). **manager** is NOT an assigned access role — it
is *derived* from the role chain (see **Manager**); effective access = assigned access role(s) ∪ derived
manager. Granting **admin**/**finance** is admin-only and never self-assignable; the first admin is seeded.
_Avoid_: role (reserve for org position), permission group, RACI role

## Surfaces

**Home**:
The hub surface at `/` every user lands on: a role-aware composition of KPI tiles with drill-downs
plus the **My Week** panel — every tile drills, no dead-end numbers (ADR-0019 D2). What a user's Home
shows follows their **persona/access**, composed as a **stacked union of the roles the person holds** —
one scrollable surface, **widest-scope section first** (a BU-head-who-is-also-a-lead lands on their function
cockpit with the **My Week** lead panel stacked below; a pure lead sees only My Week). **Not a toggle, not a
separate login** — the same person's distinct jobs stack in one Home. _(Later, if the union gets too dense:
separate **workspaces** or a **toggle with layered rails** — deferred v2, don't build until density forces
it.)_ For the **owner-director / function-owner** it is a **financial +
ops cockpit**: revenue · margins · a **money-position strip (AR · AP · unbilled · unearned)** · **ops KPIs**
(the "state of ops" per Activity — specific metric set TBD, owner-decided) · the **cascade progress +
updates** list. Money-position workflow scope: **AR is a worked queue now** (the Follow-up lifecycle);
**AP / unbilled** are visibility + drill-to-read-only with their engagement workflows phased later;
**unearned** stays visibility-only. A **member** sees their My Week + ops content dominant, no finance row.
"Dashboard" is acceptable UI copy for its KPI area.
_Avoid_: My Week (as the name of the surface — that's a panel on it)

**My Week**:
The personal panel on **Home**: R-or-A task table grouped by urgency + weekly-update strip + ops strip
(+ team module for managers). Formerly the home surface itself; now a component of Home.
_Avoid_: home surface, home page (it's a panel, not the destination)

**Inbox**:
The **to-triage** destination: notifications, @mentions, approval requests. Routes the user to the
entity where the conversation lives — conversation never happens *in* the Inbox. Binding rule:
**MOS owns communication about work items** (comments/updates attached to a task, objective, log
entry, follow-up); **free-form conversation stays outside MOS** (WhatsApp). Not a chat surface.
_Avoid_: chat, messages, feed

## App structure

**App**:
There is exactly **one** app — **MOS**. Everything users do lives inside it.
_Avoid_: kitchen app, roastery app, mini-app, "ops apps" (legacy names from the separate-deployment era — now Modules of MOS)

**Module**:
A coarse functional area of MOS — e.g. Tasks, Weekly Updates, Daily Log, Kitchen, (future) Roastery.
What were once standalone "apps" become Modules within the one MOS app. Names the *producer* in
cross-cutting seams: the ESB-outbox `source_module` and a Daily Log entry's `origin` identify the
emitting Module. Distinct from a **Feature** (finer capability *within* a Module) and from a
**Business Unit** (the owning team) and from an **Activity** (the operating workstream a Module serves — a Module usually covers one slice of one Activity).
**WIP-based activities share the ops-module spine:** **Kitchen and Bar are both WIP-producing** (they
pre-produce), so both are served by the **Kitchen Module's** pattern — plan → log → stock → review. The
eventual per-Activity scoping (a "WIP folder" so the kitchen team sees kitchen WIPs and the bar team bar
WIPs) is **deliberately deferred** — you don't disrupt an incumbent team's established UX for model-purity;
change it only as a considered UX decision, not incidentally.
_Avoid_: app / mini-app (for anything inside MOS); feature (that's finer-grained, below)

**Feature**:
A capability *within* a Module — e.g. task filtering, bulk-approve, the review queue. Finer-grained
than a Module.
_Avoid_: module (coarser), app

**Stock location & internal replenishment**:
Inventory is **not global — it is scoped per location/Activity**: the **Roastery** (production output),
**HQ retail** (cafe bean stock), and **Ecommerce** (online-fulfilment stock) each hold their *own* pool of
the same roasted beans. The Roastery is the **internal supplier**: HQ retail and Ecommerce raise
**internal replenishment orders** to the Roastery to refill their stock (a roastery→retail / roastery→
ecommerce transfer, distinct from an external B2B sale). So Operate needs **location-scoped stock** + an
**internal-order/transfer** flow between Activities — not just each Activity's own WIP log. (ESB tracks
stock per company code — GKID vs GRI — so a roastery→HQ transfer is a GRI→GKID movement.)
_Avoid_: warehouse (implementation), "the stock" (say which location), transfer (bare — say internal replenishment)

**Ecommerce fulfilment**:
The light **order → picked → packed → shipped** queue MOS owns for online orders, drawing down the
Ecommerce stock location. The ecommerce *platform* still owns the storefront, pricing, and the order
intake; MOS owns the **hand-fulfilment step** the team currently tracks in a sheet. Visibility of online
sales (revenue/gross margin) is separate and already flows via the reporting read-models.
_Avoid_: order management (too broad — the platform owns intake), shipping (that's one state)

**COGS** (cost of goods sold):
The cost of the goods sold in a period. **Not one number** — there are *bases*, and the basis is the
whole point. Per the finance doctrine (`COGS-REPORT-WORKFLOW.md`), the **one actual COGS** is the
**monthly GL account-5 reconciliation** (certified, after-the-fact). Everything else is an
*estimate*: **BOM COGS** = recipe qty × ingredient `last_hpp` (a *budget*); **stock-movement COGS**
(`sm_total`) = the interim consumption ledger mid-month (not-yet-reconciled). The dashboard always
labels the basis; it never shows a bare "COGS" figure without one. (ADR-0022.)
_Avoid_: "the cost", "cost of sales" (say which basis), bare "COGS" without a basis qualifier

**Gross margin**:
**Revenue − COGS.** Inherits COGS's basis problem: *interim* gross margin (revenue − stock-movement
COGS, POS-only, mid-month, uncertified) is **not** *certified* gross margin (revenue − monthly GL
COGS, all channels, finance-owned). The two can diverge meaningfully; the dashboard never lets them
be confused — the basis is labelled, and certified margin is shown only when the GL read-model lands.
_Avoid_: "margin" (bare — always say *gross* margin and name the basis), "profit" (that's net, after opex)

**Green lot** (roastery Raw stock grain):
The lot-level green-coffee receipt — **origin/variety/process + cost-per-kg + running balance** — modelled
at the **lot** (not product) level, kept **lightweight** for MVP. It is the **cost-and-traceability atom**:
every roasted kg traces back to a green lot (green lot → roast batch → FG SKU), and the lot's `cost_per_kg`
is the input to **yield costing**. Basis = ESB `last_hpp` at receipt.
_Avoid_: green SKU (loses lot trace), "the beans", batch (that's the roast, not the intake)

**Yield costing** (roasted-coffee COGS):
Cost per **roasted** kg = the green lot's cost ÷ the roast batch's **actual yield%** (`yield% = roasted‑out ÷
green‑in`; `shrink% = 1 − yield%`, domain-typical ~20%). **Computed in MOS on the floor (floor truth)** from
ESB `last_hpp` green cost × the batch's real yield — not read from ESB's ledger — then reconciled against ESB
`Manufacturing In/Value` later. This is the roastery COGS input that kitchen has no analog for (kitchen costs
by portion, not by material yield).
_Avoid_: standard cost (that's ESB ledger truth), "the roast cost" (say per-kg, name the yield basis)

## Agent-composed UI & analytics

**Deputy agent**:
The user's agent, running **as that user** — bound to the user's own session, access roles, and org. Its
reach is, by construction, exactly the user's reach: every read/write it issues is subject to the same
authorization the human is. A deputy carrying the user's badge, never a master key. Acts under the user's
*real* identity, never an impersonated one.
_Avoid_: AI, assistant, bot, copilot (as the canonical term); "the system" (it is the user, deputised)

**User view**:
A surface a user **composes for themselves** — to analyse, input, or present things their preferred way —
saved as **data (a row), not code**, and rendered natively inside MOS like any built-in surface. Private to
its owner by default; a manager may **share** one to their team (see **Manager**). Composed via the product
UI or the **deputy agent**, the user's choice. Distinct from a built-in **Surface** (which is code).
_Avoid_: custom dashboard, report, widget, saved query (too narrow — a user view may also *input*)

**Promotion** (of a user view):
The path by which a **user view** is **proposed for the product** — either *flipped* to an org/role-default
(no code, just wider sharing) or *built* into a coded Module by the dev team, using the view's spec as the
requirement. The product's intake of demonstrated demand; not automatic — a maintainer decides.
_Avoid_: publish, release, promote-to-prod (overloaded with deployment)

**Read-model**:
A **curated, named** data surface that UI and the **deputy agent** read from — never raw tables. Each is
scoped to the viewer's own access. Two kinds: an **operational read-model** (derived from MOS's own
transactional data — tasks, kitchen, ops) and a **reporting read-model** (financial figures fed in from the
ESB analytics warehouse on a schedule; gated to **finance**/**admin**). Carries an **as-of** time for any
non-live figure.
_Avoid_: view (overloaded — reserve for **User view**), table, dataset, query

**Certified metric**:
A figure with one **blessed definition** (name, meaning, unit, grain) that everyone composing reads the same
way — the guard against "my sales ≠ your sales." **Financial-statement figures are first-class data; figures
that affect them are second-class** — both demand a certified definition before exposure.
_Avoid_: KPI, measure, number (when an agreed definition is the point)

**Reference data**:
Shared **records** with **one owning BU and many consuming BUs** — COGS per menu item, ingredient
costs, recipes, price lists. Maintained in exactly **one place** in MOS by the owner; every consumer
reads that same record, with **visible freshness** ("as of", who last updated) and change history.
The record analog of a **Certified metric** (which blesses a *figure's definition*; reference data
blesses the *record itself*). Exists to kill the forked-spreadsheet failure: a consumer never copies
reference data into their own artifact — they link it.
_Avoid_: master data (jargon), lookup table (implementation), "the sheet"

**Ingredient cost line** (a kind of Reference data):
The budgetary unit cost of one ingredient that recipe COGS and promo pricing consume. **MVP basis = ESB's
`last_hpp`** (ESB already calculates a last-known cost per ingredient) — read as the budgetary cost, not
recomputed in MOS; **Finance + Procurement own and are responsible** for the numbers; consumers link, never
copy. _Later (not MVP):_ a last-purchase-vs-30/90/180-day trend + a **Normal market variation** band (wide
for traditional-market/fresh produce, tight for contracted goods) whose outside-band moves fire a
Follow-up/Inbox alert to Finance + affected managers. MVP just uses `last_hpp`.
_Avoid_: "the cost sheet", hardcoded price, master price list

**Budget** (the Plan destination's core create-verb):
A MOS-captured **budgeted COGS** = a menu item's **BOM (recipe: qty × materials)** costed at the ingredient
cost lines (`last_hpp`). Plan is where budgets are **created/captured** — new-branch costing, promo/menu
scenarios — as the **certified number pricing prices against** (the anti-stale-copy fix). The actual price
still lands in ecommerce/POS; MOS never writes prices there.
**MVP boundary — read-and-budget only:** MOS **reads** ESB's BOM + `last_hpp` and captures budget scenarios
on top; it does **not edit recipes** in MVP. Recipe editing would fork the recipe from ESB unless it writes
back, so **recipe-edit + ESB BOM write-back are one deferred v2**, gated on an **ESB-BOM-write API spike**
(same discipline as the AR write-back spike). MVP never writes BOMs to ESB.
_Avoid_: forecast (that's a different lens), "the costing sheet", plan (collides with the destination name)

**OLTP / OLAP** (the engagement/analysis split):
**OLTP** = MOS itself — the live system of *engagement* (per-user reads/writes, auth, RLS). **OLAP** = the
ESB analytics warehouse — the system of *analysis* (batch, heavy-read, multi-company history). Kept as
**separate** datastores on principle; only **curated snapshots** cross from OLAP into MOS's reporting
read-model. *Consolidate engagement; federate analysis; never merge the two.* (ADR-0010.)
_Avoid_: "the database" (say which), warehouse-as-app-backend, app-DB-as-warehouse

**Port** (of the agent stack):
The adoption posture for the agent-composed-UI machinery: **copy-adapt** proven code from the sibling
internal project into MOS, after which **MOS owns its copy outright** — no shared package, no runtime
dependency, no automatic sync. Upstream improvements arrive only by deliberate **cherry-pick**, re-reviewed
under MOS's own gates. (ADR-0018.)
_Avoid_: DRY/shared-library (rejected — couples two drifting apps), fork (implies tracking an upstream),
vendor (implies third-party code)

**Grounded answer**:
A deputy-agent reply whose **every data claim traces to a tool result returned in that conversation**. No
data queried → the agent must query, not recall; empty or failed read → the agent says so and stops —
never estimates or fills gaps; any non-live figure carries its **as-of** time. Binding for all deputy
surfaces regardless of the user's access level.
_Avoid_: "accurate answer" (accuracy is the outcome; grounding is the discipline), "no hallucination" (names
the failure, not the rule)
