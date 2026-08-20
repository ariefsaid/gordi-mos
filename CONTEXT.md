# Gordi MOS

Vocabulary for Gordi's Management Operating System — the internal app for task ownership,
lightweight RACI, weekly updates, and daily ops visibility. Glossary only (per grill-with-docs
rules): no specs, no implementation notes. Heritage terms trace to the dormant Notion Management
OS constellation (see `docs/decisions.md` OD-P0-9).

## Work

**Task**:
The unit of owned work and the **bottom of the cascade** — always carries R and A people, a business
unit, and a status. Its cascade parent is a **Project/Process**; the link is an additive nullable seam
(ADR-0003/0014). The cascade is **three levels**, so there is nothing below a Task and nothing between it
and its Project/Process (`OD-WAY-32`).
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
usually covers only a slice of it (today's Café module = plan/log/stock/review for the kitchen
Activity only); Modules grow Features toward covering their Activity. **The Café Module serves *two*
Activities — kitchen and bar** (OD-WAY-26); today it ships only the kitchen half.
_Avoid_: business unit (that's the owning team), app, module (that's the code)

**Branch**:
An **inventory-and-accounting context in the ERP** — *not* a physical place, and this distinction is
load-bearing. Gordi has **one physical kitchen**; it produces for several branches, and which branch a
production run belongs to decides whose raw materials are consumed and whose WIP is credited. The ERP
models each branch as self-contained, **including branches whose kitchen work physically happens
elsewhere** — so a WIP movement into such a branch has *no ERP counterpart*, because in its books
nothing moved.

Branch gets **one canonical catalog** in `shared` in the schema rebuild (OD-WAY-39), and every
branch-bearing surface links to it. `reporting` rows keep the ERP's `branch_code` text **exactly as
sent** and carry a *separate, nullable* link beside it — so a branch the ERP adds ingests fine, unlinked,
and is mapped afterwards. Never constrain the reporting fact rows with a hard reference: that turns a new
ERP branch into a failed nightly job.
_Avoid_: location, outlet, store (all imply place — the place is a constant here); "the kitchen" as a
branch synonym. **Site is a different term, not a forbidden synonym — see Site.**

**Site**:
A **physical place, used only as org structure** — a Team sits at one. `shared.sites` is a real, seeded,
RLS-protected table and Signals depend on it; do not delete it (DD-WAY-17). It is **not** the branch
catalog and its seed is not the branch list. Keep the planes apart: a **Site** is where people are, a
**Branch** is whose books a movement lands in.
_Avoid_: using Site to scope a production record — that axis is the **Production stream** below

**Production stream**:
The **(Branch, Activity) pair a production record belongs to** — e.g. `GHQ · kitchen`, `GHQ · bar`,
`RRS · kitchen`. Three Branches × two Activities = **six streams**, of which two are captured today
(OD-WAY-42). This is the axis the Café Module is scoped on (OD-WAY-26): it selects the item list,
the ERP coordinates, and the default a capture surface opens on. **A Team _is_ a stream** — `GHQ ·
kitchen` and `GHQ · bar` are different teams with different leads — so a person's primary team supplies
the default (OD-WAY-49). It is a default, **not an access boundary**: they can switch to help another
branch (OD-WAY-31). Review queues follow the same line, one per stream, with an ops-lead fallback so
no stream stalls unapproved (OD-WAY-48).
A stream is **named by its branch's canonical catalog name** wherever it is named as a stream; the
`Bungur` alias names a transfer **destination** and the derived action label, never a stream.
_Avoid_: location/site (see **Branch**); "action type" (today's `Production` / `Transfer to …` strings
fold destination into action — a storage workaround, not the model; DD-WAY-13)

**Unit** (of a WIP item):
**Master data, not an input.** An item is made in one unit, shown fixed beside the quantity box;
changing it costs a deliberate extra click (OD-WAY-46). The unit is not a MOS label — the ERP
identifies a *product detail*, meaning **product ＋ unit**, and holds the conversions between an item's
units. So an item's allowed units are **enumerable from the ERP, never invented in MOS**, and each one
is a distinct ERP coordinate with its own recipe. This is the answer to *"what stops a wrong unit being
entered"*: in the common case nothing is entered at all.
_Avoid_: a free unit dropdown on the default path; treating unit as a display label

> **Three traps in this area, all of which have already misled a session:**
> 1. **A WIP → finished-goods step is not a MOS event.** The ERP's BOM consumes WIP at point of sale.
>    Do not model it.
> 2. **Raw material is never captured either** — it is derived from the ERP recipe (OD-WAY-45). A
>    capture surface has **no raw-material input at all**. The check on real usage is inventory
>    movement plus stocktake, which is why the **stock comparison screen is load-bearing**, not
>    decoration: it is the only place a real-versus-recipe divergence can surface.
> 3. **The incumbent kitchen app's stock tab reads "Stok HQ", where "HQ" means *the central
>    kitchen*** — which books to a different branch than the one whose ERP code is `GHQ`. Porting that
>    label as-is creates a permanent collision.

**Revenue stream**:
A **reporting lens for money** — Cafe Ops (kitchen + bar POS), Ecommerce, B2B. May map 1:1 to an
Activity or span several; owned by the reporting plane, not the org chart.
_Avoid_: activity / BU (when grouping revenue), channel (reserve for the POS/B2B source field)

**Follow-up** — ⚑ **dark, deferred, and being renamed. Read `OD-WAY-34` before touching it.**
A **finance/accounting** record, **not** a work item and **not** part of Work (owner, 2026-08-04: *"this
is not a work/task/process activity from a task management perspective, this is a finance accounting
activity"*). Scope is the **retail Pending bill stream only** — the B2B AR stream is *not* a problem,
because the ERP is used exactly as intended there. The job is **reconciliation, not chasing**: knowing
which bills are open and which are closed, which today lives only in a hand-kept finance spreadsheet.
Deferred until directly after the MVP; the shipped table stays dark and out of #155's rebuild
(`DD-WAY-16`). The name itself is wrong — "Follow-up" names chasing — and should be replaced with a
reconciliation noun when it is built.

*The description below is the shipped model, retained because the evidence-gated settle survives whatever
the table becomes.* Its chase states, its `b2b_ar` kind and its lane split do **not** survive.
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
invoice/tab-grain settlement truth is owned by MOS (today: sheets — **porting deferred to directly after
the MVP**, `OD-WAY-34`). ⚑ **This is the only AR stream MOS addresses.** The ERP is not malfunctioning: a
sales invoice *is* created and correctly carried as owed, and the deferred-payment method is a deliberate
local extension for owners and regulars. Only the **closure event at invoice grain** is missing, because
settlement happens as a ledger entry.
_Avoid_: AR (that's the B2B stream, which needs no MOS surface), tab (informal, UI copy ok), debt

**Blocked**:
A task that cannot proceed until something outside the R person's control resolves. Subsumes the
old Notion "Waiting Internal / Waiting External / Waiting Approval" family.
_Avoid_: waiting, on hold, stuck

## Cascade (Strategy-to-Execution Stack)

**Three levels: Objective → Project/Process → Task.** Each level has its own owner and timebox; lower
levels *contribute* up, they don't copy down.

**"Cascade" is vocabulary, never a surface.** It names the relation, and it must never appear as a route,
a rail item, or a UI label — the requirement it stands for is **roll-up and drill-down from any level, on
the records themselves**: an Objective shows its Projects/Processes, a Project/Process shows its Objective
and its Tasks. Progress is a **count roll-up** of child status, two hops. There is no measure or target
field, and no separate measurement layer.

*Why three and not six.* The founding model had six — Strategy · Objective · Outcome · Program/Process ·
Output · Task — and ADR-0014 kept the other three as vocabulary-that-folds-in-later. `OD-WAY-32` (owner,
2026-08-04) **drops them**: *"to have 6 level is too much to implement, so we cut it down to 3 for this
MOS app."* `OD-WAY-33` drops the measure layer with them, because a target is a field someone has to keep
current, and that ceremony is what killed both earlier attempts at this system. Adding measures later is
additive and cheap; the argument that a three-level model loses too much is superseded.

**Objective** (the top of the cascade):
A yearly goal that work rolls up to — the "what we want this year." Carries A/R ownership and a lane; it
is the grouping a person's work is read against. Its **progress is derived** — a count roll-up of its
Projects/Processes, which roll up their Tasks — so it carries **no measure, baseline, or target field**
(`OD-WAY-33`). Nothing sits above it: Strategy is dropped, not deferred.
_Avoid_: goal, mission, OKR (that's the measurement layers)

**Outcome** — ⚑ **DROPPED, not deferred** (`OD-WAY-32`/`OD-WAY-33`, 2026-08-04):
Was the KPI/KR target layer between Objective and Project/Process. There is no measurement layer and no
target field. Progress is a count roll-up. Should a measure ever be wanted it is additive nullable columns
on the Objective, not a layer — verified: `mos.objectives` is a bare catalog and nothing materialises
progress.
_Avoid_: using "Outcome" as a cascade level at all; it is no longer part of the vocabulary.

**Project / Process** (the middle of the cascade — the work-system that moves a goal):
One entity distinguished by **`type ∈ {project, process}`**; carries A/R ownership, a business unit, a
lane, and a nullable Objective link. **That Objective link is `mos.work_lines.objective_id`** —
shipped in the squashed baseline (`DD-WAY-15`, closed). It is nullable, because a Project/Process
need not belong to an Objective. **It is the edge, and it wins**: where a Task carries its own
`objective_id` as well, the Objective is resolved through the Task's Project/Process first and the
Task's own field is only the fallback, so a stale Task field cannot pull work out from under the
roll-up. A Task with no Project/Process still reaches its Objective directly.

It is a Task's permanent cascade parent. **No umbrella term is
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

**Output** — ⚑ **DROPPED, not deferred** (`OD-WAY-32`, 2026-08-04):
Was a weekly/monthly deliverable grouping under a Project/Process, carrying the committed-load idea
("2–5 per person per week; tasks are infinite, outputs are not"). Not built and not planned. The load
idea survives as guidance, not as an entity.
_Avoid_: using "Output" as a cascade level at all; it is no longer part of the vocabulary.

**Lane**:
*Why* a piece of work exists — **Run/BAU** (keep service steady, KPI-measured), **Optimize** (harden /
improve, OKR-measured), **Transform** (new capability, OKR-measured). A classification on Objectives and
Projects/Processes; incidents/fires sit inside Run as a sub-queue.
_Avoid_: category, stream, type (reserve `type` for Program|Process)

## Ownership (RACI)

**Accountable / Responsible per layer**:
The A/R split is not task-only — every cascade level (Objective · Project/Process · Task) carries an
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

**Signal**:
A short, past-tense floor fact posted by a person and owned by a **Team** — body + when it occurred +
an **attention level** (**FYI · Needs attention · Urgent**) + optional category, with mentions
(person / team / BU). No owner, RACI, or Status — it is not work-to-do; a Signal can spawn a
follow-up **Task** that carries its context. Retracted, never deleted (a retracted Signal is a
tombstone). Surfaces: the `/work/signals` archive, the Signal record page, and the global composer.
_Avoid_: status (a Signal has none), alert, notification, log entry (that's the Daily Log's unit)

**Weekly Update** — ⚑ **surface fate OPEN, issue #281.** No route on `dev` (`/work/updates`
redirects to the Signals archive); the concept below stands unchanged until the owner decides #281:
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
access is the union. The set is a **fixed vocabulary that grows by migration**, six values today:
**admin** (the *system administrator* — user management + system config; the only role that sees the
admin UI), **ops_lead** (review/approve operational logs + elevated surfaces), **finance** (review
financial data/dashboards sourced from the ESB warehouse), **member** (default — own tasks, file own
weekly update, log operational activity if rostered), **manager** (company-wide revenue + COGS/gross
margin, view-only), **supervisor** (revenue only, within an explicitly granted channel/branch scope).
Granting **admin** / **finance** / **manager** / **supervisor** is admin-only and never
self-assignable; the first admin is seeded.

Two senses of "manager" coexist and must not be conflated: the **stored** `manager` access role above,
and the **derived** reporting-line manager (see **Manager**) which is walked from the role chain and is
never assigned. Effective access = assigned access role(s) ∪ derived manager capability.
_Avoid_: role (reserve for org position), permission group, RACI role

**Jabatan** (UI: **Position**):
The displayed org position a person holds — the same object as **Role**, named in the UI so it is
never confused with **Access role** (UI: *Access level*). Jabatan says what someone *is*; access role
says what they may *do*. Neither is ever labelled "Role" in the UI.
_Avoid_: role (in UI copy), title, access level (that's the authorization axis)

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
updates** list — ⚑ cascade progress is now a **count roll-up read on the Objective record**, not a ladder
screen (`OD-WAY-32`/`OD-WAY-33`). Money-position workflow scope: ⚑ **AR is NOT a worked queue** — it is a
finance reconciliation surface, retail-only, deferred until directly after the MVP (`OD-WAY-34`);
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
pre-produce), so both are served by the **Café Module's** pattern — plan → log → stock → review.
~~The eventual per-Activity scoping is deliberately deferred.~~ **Superseded 2026-08-03 by OD-WAY-26 /
OD-WAY-25:** per-**Production stream** scoping is now **in MVP scope**, because the bar streams are
where the business is actually losing money — they reach the ERP by hand today, and the retyping step
is the failure. The deferral's *reason* still binds, though, and is now the constraint on how it lands:
**you do not disrupt an incumbent team's established UX for model-purity.** The two streams the
incumbent app already serves keep their exact behaviour (OD-K-1 parity is behavioural), while the model
underneath stops folding destination into action type.
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
