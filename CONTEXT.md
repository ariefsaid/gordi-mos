# Gordi MOS

Vocabulary for Gordi's Management Operating System — the internal app for task ownership,
operational definitions/execution, real-time Signals, and management visibility. Glossary only (per grill-with-docs
rules): no specs, no implementation notes. Heritage terms trace to the dormant Notion Management
OS constellation (see `docs/decisions.md` OD-P0-9).

## Work

**Task**:
The unit of owned work and the **cascade-bridgeable unit** (layer 6) — always carries one PIC, one
Supervisor, one executing Team, and a status; BU and optional Site derive from Team. A Task may optionally
link directly to one **Project/Process**
(layer 4); ad-hoc Tasks are valid and never require a fake catch-all parent. When linked, a Task never
routes *through* an Output. A generated Process Run step is a Task only when it
needs independent ownership, due date, status, blocker lifecycle, dependency, or reporting identity.
_Avoid_: action item, to-do, work item, ticket

**Checklist item** (a.k.a. subtask):
A lightweight step under a task — a label + done flag + order, nothing more. It has no independent
PIC, Supervisor, status, business unit, or due date, and does not bridge into the cascade. It inherits
the parent Task's ownership and lifecycle; "subtask" in conversation means this, not a nested Task.
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
A functional/accountability parent in Gordi's org chart — Marketing, HR, Finance, Retail Ops, B2B Ops,
B2B Sales. Owns objectives, budgets, cross-Team policy, and BU-scoped Roles; concrete operating groups
are **Teams** beneath it. (The earlier operating-area
canon — "Kitchen and Bar", "Cafe Ops – General" — is superseded: those are **Activities** or
**Revenue streams**, not BUs. Seeded rows predate this and need re-mapping.)
_Avoid_: Team, Site, operating area (that's an **Activity**)

**Site**:
A physical Gordi branch/place such as Gordi HQ, Radiant, or Roastery. A Site may host several Teams and
may be referenced by operational/inventory models, but it is not itself a Team or Stock location.
_Avoid_: Team, BU, Stock location, branch (as the schema/domain term)

**Team**:
The concrete group that operates together. Every Team belongs to exactly one BU and may reference one
Site; central/cross-site Teams may have no Site. Examples: Gordi HQ Operations and Radiant Operations
under Retail Ops; Central Marketing under Marketing; Roastery Team under B2B Ops. People join Teams
through explicit effective-dated Team memberships. A Role with no Team is BU-scoped and may govern all
child Teams; a Team-scoped Role requires membership in that Team.
_Avoid_: Business Unit, Site, Activity, Module

**Team membership**:
An effective-dated Person ↔ Team assignment, independent of org Role and app Access role. Every active
app Person has one primary Team for default context and may hold additional memberships. BU participation
derives from Teams; a BU-scoped Role expresses BU-wide authority. Transfers end the old membership and
start a new one, preserving history.
_Avoid_: Person.team_id, Person.business_unit_id, job title, permission grant

**Activity**:
An **operating workstream within a BU** — kitchen, bar, ecommerce (inside Retail Ops); roasting
(inside B2B Ops). Classifies where operational work belongs; one or more related Activities may be
served by the same Module when they share one operating workflow.
_Avoid_: business unit (that's the functional parent), Team (that's the concrete group), module

**Module**:
A dedicated workspace for one **coherent operational workflow** with its own recurring records,
actions, cadence, and operating context. A Module may span related Activities when the work is genuinely
shared (**Café** spans Kitchen and Bar), or serve one Activity (Ecommerce, Roastery); a team does not
earn a Module merely because it exists on the org chart. Café's expanded page title is **Café Operations**.
_Avoid_: department, business unit, activity, screen, app

**Area**:
A meaningful operating subdivision inside a Module — Kitchen and Bar are Areas inside the **Café**
Module. Areas scope records and Standards without becoming separate workspaces.
_Avoid_: module, business unit, department

**Station**:
The specific role or work point a person covers during a Shift, such as Espresso, Kitchen Prep, or
Pick-pack. A Station belongs to an Area and is narrower than an Activity or Module.
_Avoid_: area, module, job title

**Revenue stream**:
A **reporting lens for money** — Cafe Ops (kitchen + bar POS), Ecommerce, B2B. May map 1:1 to an
Activity or span several; owned by the reporting plane, not the org chart.
_Avoid_: activity / BU (when grouping revenue), channel (reserve for the POS/B2B source field)

**Follow-up** *(UI name: **AR Follow-up** — OD-REDESIGN-91.3 disambiguation; a "follow-up Task" from a Signal is just a Task)*:
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

**Outcome** (layer 3 — deferred):
The KPI/KR target that *proves* an Objective is being met — the number, distinct from the aspiration.
Deferred; folds in between Objective and the Project/Process layer additively.
_Avoid_: metric (the measurement act), KR (one kind), result

**Project / Process** (layer 4 — the work-system that moves a goal):
Two sibling kinds of governed work; each carries A/R ownership, a Business Unit, a lane, and an optional
Objective link. Either may be a Task's direct cascade parent. **No umbrella term is
locked** (owner 2026-06-23 — "use the Project/Process pair for now"; the earlier "Initiative" is dropped);
refer to the pair, or to the specific type.
_Avoid_: Initiative, workstream, work (umbrella terms — none locked), work-line

**Project**:
Bounded, time-boxed **change** work (Transform/Optimize lane) — scope, an end, milestones. E.g. new-menu
design. (The wiki calls this layer "Program"; in-app the term is Project.)
_Avoid_: program (in-app say Project), initiative

**Process**:
Standing, recurring **run** work (BAU lane) — never "done," produces repeating Process Runs. E.g. daily IG
content, daily fulfillment. The home for daily ongoing *assigned* work — distinct from **Activity**
(the operating workstream) and from **Signals** (factual observations that something
*happened*, without work ownership; a Process is owned recurring work). Person-load reads from the
Projects/Processes a person is A/R on, never from Signals. A Process *uses* **Standards** (the checkable specs that
define doing it correctly) but is not one — a Process is the owned recurring work; a Standard is the spec.
_Avoid_: SWP (the wiki's term — say Process), routine, activity (reserved). _Do not_ call a Process an
"SOP" — the spec object is a Standard; the Process *uses* Standards. (The earlier blanket Avoid on "SOP"
is relaxed 2026-07-09: "SOP" is a sanctioned synonym for Standard; the thing to avoid is conflating a
Process with its Standard.)

**Process Run**:
A time-bounded occurrence of a standing Process, such as **July 2026 Monthly Close** or **Retail Stock
Opname · 31 July**. It owns that occurrence's Tasks, required checks/forms/evidence, progress, completion,
and history for one adopting Team while the Process remains the permanent BU-governed recurring-work
definition. It snapshots the
Process RACI and resolves generated Task ownership when the Run starts.
_Avoid_: Project, Process, recurring Task; cycle (informal only)

**Object Contract**:
The system-wide, code-owned schema for one MOS object type. It declares required fields/relationships,
optional fields, valid nested object types, validation, and which structured-canvas blocks humans or the
deputy may create. For example, every Standard requires a BU, name, version, and at least one Standard
Step, while a governing parent, measured-control step, and measurement unit are optional because
many Standards are instructional, documentary, or approval-based. An Object Contract is not a user row
and cannot be edited in admin settings.
_Avoid_: Template (ambiguous), preset, custom schema, freeform data model

**Blueprint** (deferred hypothesis, not a current object):
A possible future user-authored, versioned preset inside an **Object Contract**, justified only if
multiple independent Process or Standard definitions are repeatedly duplicated and manually synchronized
across BUs. Current reuse is **Duplicate as Draft**; Blueprint is not a current domain object.
_Avoid_: Template, current domain object, Object Contract

**Standard** (quality-loop object; sanctioned synonym: **SOP**):
A canonical, versioned, BU-scoped execution specification that defines how work is performed correctly
and what proof is required. It may link to zero or many Processes/Projects. A Standard governs execution
quality; a linked Process owns recurrence and generated work. Publication uses scoped
`standard.publish`; each consuming Process/Project A separately decides whether and which published
version its definition adopts through a version diff and effective date. Publishing a new version creates
an actionable Inbox upgrade item for the A and R of every linked consuming definition; it never changes
their active definition by itself. A Standard has no RACI. It is distinct from a Certified metric and from
Reference material, which has no executable instruction/check/input/evidence/sign-off contract.
_Avoid_: procedure, runbook, checklist, quality document; Process (that's the recurring work)

**Standard Step**:
One typed requirement inside a Standard: **instruction/reference · confirmation · measured control ·
required form field · required evidence/sign-off**. Checkable steps generate Checks during a Process Run;
instructions provide guidance but do not become work records by themselves.
_Avoid_: Task, Checklist item, form (the whole), Standard (the containing specification)

**Check**:
A captured evaluation of a checkable Standard Step during a Process Run or Task. It records the submitted
value/evidence and the resulting pass/fail outcome against the step's rule.
_Avoid_: Checklist item, Task, inspection (one kind of Check)

**Exception**:
An out-of-standard outcome raised by a failed Check that requires evidence and corrective work. It opens
a correction Task and remains linked to the Check, Standard, and Process Run until resolved.
_Avoid_: error, alert, failed Task

**Shift** (roster unit — owner 2026-07-09):
A roster assignment of **person + station/area + time window**, scoped to one Team. The Café roster
spans its Kitchen + Bar Areas within each branch Team; HQ and Radiant remain separate Team scopes.
Roastery carries its own roster. A Shift drives three things: (1) **check assignment** — a person's station's **Standards** generate
their checks for the shift; (2) **exception context** — records who was on the station and supervising
window when a Check failed, while correction-Task ownership follows the Process's generation rules; and
(3) the floor's Home "your shift today" + "your checks today." It is assignment context, distinct from
a Process (recurring work) and a Task (owned work).
_Avoid_: schedule (say Shift or roster), timesheet (that's hours-worked, not assignment)

**Output** (layer 5 — deferred):
A discrete deliverable a Program/Process produces in a week/month — the unit of committed load ("2–5 per
person per week; tasks are infinite, outputs are not"). Deferred; folds in as an optional grouping that
*also* belongs to its Project/Process — never inserted as a mandatory bridge between Task and
Project/Process (ADR-0014 as amended by ADR-0025 D26).
_Avoid_: deliverable, milestone (one kind), artifact

**Lane**:
*Why* a piece of work exists — **Run/BAU** (keep service steady, KPI-measured), **Optimize** (harden /
improve, OKR-measured), **Transform** (new capability, OKR-measured). A classification on Objectives and
Projects/Processes; incidents/fires sit inside Run as a sub-queue.
_Avoid_: category, stream, type (reserve `type` for Program|Process)

## Ownership

**RACI**:
The governance ownership model used only on **Objectives, Projects, and Processes**: one Accountable,
one Responsible, and optional multi-person Consulted/Informed relationships. Tasks deliberately use the
simpler operational PIC/Supervisor model instead.
_Avoid_: Task RACI, owner (ambiguous as a field)

**Responsible (R)** / **Accountable (A)**:
On an Objective, Project, or Process, R leads the work and A is the single person answerable for its
outcome; they may be the same person. These terms are not used for Task ownership.
_Avoid_: PIC or Supervisor (those are Task relationships), approver

**Consulted (C)** / **Informed (I)**:
People whose input is sought (C) or who are kept informed (I) on an Objective, Project, or Process.
They are multi-person stakeholder relationships and never Task ownership fields.
_Avoid_: watcher, CC, Task stakeholder

**PIC** (Person in charge):
The single person expected to perform and close a Task. Dense surfaces use **PIC**; creation and detail
surfaces expand it to **Person in charge (PIC)** with helper text for unfamiliar users.
_Avoid_: Owner, Responsible, assignee, doer

**Supervisor** (of a Task):
The single person who monitors, unblocks, and verifies a Task; may be the same person as its PIC and need
not hold the organizational job title Supervisor. Resolution order is explicit selection → generated-
Task override → parent Project/Process A → PIC's direct manager in the role matching the Task BU → PIC
when no manager exists; multiple manager paths require a human choice. The UI always shows the source.
Always spell out **Supervisor**, reserving **SPV** for a person's formal job title.
_Avoid_: SPV, Accountable, checker, approver

## Cadence

**Signal**:
A real-time, attributable factual note that something relevant happened or was observed anywhere in
Gordi: a menu stockout caused by a vendor delay, an AC breakdown, a customer pattern, or a cross-team
handoff. A person may type/dictate it or their deputy may record it under their identity; a person may
deliberately share a Module record as a linked Signal, and only a published anomaly rule may emit one
automatically. It carries occurred-at, author,
owning Team, optional Area/Module, category/attention, mentions, and canonical links. Its author is who
reported it; owning Team is where it applies and may differ from the author's home Team/BU. It has no PIC, Supervisor,
due date, or work Status. An `@mention` nudges through Inbox; required action becomes a linked **Task**;
a failed Standard Check remains an **Exception**. Signals support later clustering/root-cause analysis
that may lead to a Task, Project, Process change, or Standard revision. Default read reach is upward:
the owning Team, parent-BU scope, then configured higher BU **Signal visibility layers**. Sibling Teams
do not see one another by default; lower layers read only when an explicit person/Team/BU mention grants
access. Visibility layers are information policy, not the org chart.
A Signal must be suitable for that operational sharing model; confidential HR, legal, medical,
whistleblowing, or similarly sensitive matters use a separate protected channel/workflow, never a
"Restricted Signal." Signals are intentional: a human/deputy posts one, a person deliberately shares a
canonical record as one, or a published rule emits one for a configured meaningful condition. Routine
domain/audit events are not copied into Signal.
_Avoid_: Weekly Update, Daily Log, Log entry, Task, Exception, system activity event, confidential case

**Signal category**:
Non-blocking classification of what was observed. Stable system families provide cross-team comparison
(Supply/vendor · Equipment/facility · Inventory/availability · Quality · Customer · People · Process ·
Other); admins may manage BU-specific subcategories beneath them. The deputy may suggest one with
confidence, but low-confidence capture remains **Uncategorised** and humans may correct it. Category is
not root cause, visibility, urgency, Status, or a free-form tag.
_Avoid_: tag, root cause, task type, severity

**Signal attention**:
One of **FYI · Needs attention · Urgent**. A lightweight cue for ordering, visual treatment, Home, and
delivery to explicitly mentioned recipients/subscribers; it is not Status, ownership, an SLA, or a
visibility tier. FYI is default. Higher attention suggests—but never automatically creates—a follow-up
Task. Deputy inference of Urgent requires confirmation unless the user's wording is explicit.
_Avoid_: status, severity workflow, priority (reserve for owned work), needs-attention boolean

**Signal mention**:
An explicit `@Person`, `@Team`, or `@BU` that grants Signal read access and creates Inbox notification(s):
one person; every current Team member; or every current person across a BU's child Teams plus BU-scoped
Roles. Recipients are deduplicated and previewed before Team/BU fan-out. Owning Team/upward visibility
without a mention never notifies. Future members gain access but no retroactive notification. A mention
communicates awareness, not work ownership; required action belongs in a linked Task. BU fan-out requires
the configurable `signal.mention_bu` capability.
_Avoid_: assignee, PIC, watcher, team task

**Signal author vs owning Team**:
Author is the immutable Person who reported the Signal. Owning Team is the concrete operational group
affected, independent of the author's home Team/BU. Cross-Team creation requires scoped capability; the
author keeps read/correction rights. Owning Team determines default layered visibility, while mentions
determine explicit access/notifications. Exactly one primary Team is selected; other affected Teams/BUs
are mentioned. BU and optional Site derive from the owning Team.
_Avoid_: infer ownership from author, multiple primary owners, mention as owner

**Signal–Task link**:
A many-to-many source/response relationship. A Signal remains the factual record; **Create follow-up
Task** creates a separate Task under its Object Contract and links it, while **Link existing Task** avoids
duplicates. One Signal may need several cross-team Tasks and one prevention/repair Task may address many
related Signals. Signal displays derived linked-work counts but never gains work Status or becomes
“resolved.”
_Avoid_: promote/convert Signal, embedded Task, Signal status, deleting the source after follow-up

**Team execution scope**:
Concrete execution records—Signal, Task, Process Run, Shift, Check, Exception—belong to one Team and
derive BU/Site. Governance definitions—Objective, Project, Process, Standard—belong to a BU. Projects may
name participating Teams; their Tasks name the executing Team. An authorized scoped Role holder adopts a
BU Process for a Team with local cadence/assignment defaults; each Run belongs to one adopting Team.
Cross-Team work uses separate Tasks
under a shared Project rather than a multi-Team Task.
_Avoid_: BU-only execution row, multi-Team Task/Run, independently duplicated BU/Site fields

**Process adoption** (for a Team):
A version-pinned Team execution configuration for a published BU Process. A Person with scoped
`process.adopt` capability acts for that Team to review the Process/Standard/task/cadence diff, confirm
only the published contract's Team-configurable parameters, and choose an effective date.
Existing/materialized Runs retain snapshots; future unmaterialized Runs use the adopted version.
Adoption may pause/resume but cannot rewrite the BU Process or invent Team RACI.
_Avoid_: Process copy, silent upgrade, Team Process fork, Team RACI

**Signal correction**:
A posted Signal may be corrected but never silently rewritten. Author/deputy edits to body, occurrence
time, category, or attention create visible immutable revisions; owning Team and canonical source are fixed
after post. Wrong provenance requires Retract + repost. Retraction records a reason, leaves an audit
tombstone, and removes the Signal from default feeds/analytics. Mention changes update grants and notify
appropriately; recipients may already have seen removed content. No hard deletion.
_Avoid_: edit in place without history, delete, change source/BU, resolve

**Signal acknowledgement**:
An explicit per-person “I have seen this” reaction, displayed on the Signal. It is separate from private
Inbox read/handled state and is not ownership, completion, approval, or a promise to act. Discussion uses
Signal comments; commitment becomes a linked Task. Team/BU mention never requires every member to acknowledge.
_Avoid_: status, resolved, accepted, assigned, read receipt

**Signal visibility layer**:
An admin-configured ordered information-access level used only for default Signal read reach. A viewer in
the owning Team, a BU-scoped Role over its parent BU, or a configured higher BU layer may read. Sibling
Teams do not inherit access from one another. A lower-layer viewer may read only when explicitly
`@mentioned` as a person, Team, or BU. Example cross-BU order: Operations < Marketing/support < Finance/
control < Management.
This is separate from a Role's `reports_to` hierarchy and remains subject to `can()` individual overrides.
_Avoid_: management level, org-chart level, security role, notification audience

**Weekly Update** / **Daily Log** (superseded):
Legacy pre-redesign objects/surfaces. Mandatory retrospective Weekly Update filing is removed; weekly
management summaries are generated from Tasks, Projects, Process Runs, Signals, and domain events. The
operations-only Daily Log is replaced by the shared Signal model. Historical artifacts remain evidence only.
_Avoid_: implementing either in the redesign, separate parallel factual feed

**Last activity** (of a Task):
The age of the Task's most recent meaningful change, such as a status change, comment, or field edit.
Use this term so **Activity** remains reserved for the operating workstream.
_Avoid_: Activity, last touched, updated at

**Week**:
Monday–Sunday in Asia/Jakarta time; used as a reporting/digest window, not a filing deadline.
_Avoid_: sprint, cycle

**Management period view**:
A live, sourced Today / This week / Last week presentation over authorized Tasks, Projects, Process Runs,
Exceptions, Signals, and domain events. It is not an employee-authored artifact. Deputy summaries link
every claim to canonical records; optional Automation delivery carries an as-of time but creates no
Draft/Submitted/missing-update lifecycle.
_Avoid_: Weekly Update, Weekly Brief object, filing, status report

## People & structure

**Org**:
The company-level container for people, structure, records, and policy. Gordi is the only Org today.
_Avoid_: company, workspace, tenant (in UI copy)

**Person**:
An individual recognized by the Org who may be assigned Teams, Roles, Access roles, and MOS work.
_Avoid_: user (except in auth contexts), employee, member

**Role**:
A named **org position**; a person may hold several roles at once. Roles form the reporting line via
reports-to between roles. Notion heritage: Roles DB with "Reports to / Subordinate". Distinct from an
**Access role** (what a person may *do* in the app) and from a **RACI role**. A Role belongs to one BU and
may be scoped to one Team; no Team means BU-wide responsibility across its child Teams.
_Avoid_: job title (as a field), position; access role / permission (that's app authorization, below)

**Manager**:
A person any of whose roles has subordinate roles with current holders; sees the team module and
reviews authorized team work and Signals. Derived from the role chain, never a flag on the person.
A dual-hat person appears in all relevant managers' team scopes (union).
_Avoid_: supervisor, lead (except inside role names like "Kitchen Lead")

**Access role**:
An admin-editable named bundle of default **Capabilities**, distinct from an org **Role** (position) and
from record **RACI**. A person may hold several; their role grants combine. Default role bundles may
evolve while protected capabilities remain system-owned.
An org Role may map to Access role defaults at its configured Team/selected-Team/BU/org scope; individual
exceptions overlay without mutating or copying either role.
_Avoid_: Role (without “access”), permission (for the bundle), RACI role

**Capability** (app authorization):
A fixed, code-owned action key describing what someone may do, evaluated by `can()` with a meaningful
scope such as self, own Team, selected Teams, own BU, selected BUs, or org. Effective access for an
action/resource resolves an
applicable individual **Deny**, then individual **Allow**, then the union of access-role grants, then
default deny. Admin settings displays this as Inherited / Allowed / Denied with Reset to role default.
Capabilities remain separate from record governance: permission to publish Processes does not make a
person the A of every Process; bypass requires a distinct audited override capability.
_Avoid_: org Role, RACI, copied per-person role

## Surfaces

**Action Launcher**:
The single prescribed command entry: phone `+` FAB and desktop/tablet top-bar `+ Create`, backed by the
same capability-filtered registry as ⌘K and the deputy. It opens stable Share Signal, Ask Deputy/dictate,
Create Task, More, plus at most one current-context action; it never executes an ambiguous default and is
not a navigation destination.
_Avoid_: Capture, speed dial (as UI copy), global create default, configurable nav item

**Home**:
Every person's landing surface. Its non-removable, role-aware **attention brief**
answers “What needs my attention today?” from currently authorized work, Process Runs, Checks,
Exceptions, approvals, mentioned/actionable Signals, and financial exceptions; every signal links to its canonical
record. Alongside it, the person or deputy may compose an authorized personal structured canvas.
Personal Profile controls only the two regions' order (Attention first by default, or Personal canvas
first); when attention is below, the header retains `Needs attention · N`. Detailed dashboards and
period analysis stay in Money or the owning Module.
_Avoid_: Dashboard (for the whole surface), My Week (as the surface name), role cockpit

**My Week**:
A legacy name for the former personal Home panel. Its useful signals are absorbed into Home's attention
brief and the Work collections; do not create a separate My Week surface or fixed panel in the redesign.
_Avoid_: current surface name, home page, mandatory panel

**Inbox**:
The **to-triage** destination: notifications, @mentions, approval requests. Routes the user to the
entity where the conversation lives — conversation never happens *in* the Inbox. Binding rule:
**MOS owns communication about work items** (comments/updates attached to a Task, Objective, Signal,
or Follow-up); **free-form conversation stays outside MOS** (WhatsApp). Not a chat surface.
_Avoid_: chat, messages, feed

## App structure

**App**:
There is exactly **one** app — **MOS**. Everything users do lives inside it.
_Avoid_: kitchen app, roastery app, mini-app, "ops apps" (legacy names from the separate-deployment era — now Modules of MOS)

**Module** (app structure):
See **Module** under Work. The initial Modules are Café, Ecommerce, and Roastery; Café serves the
Kitchen and Bar Areas without turning either Area or Team into a separate Module.
_Avoid_: app, mini-app, department module, Kitchen Module

**Feature**:
A capability *within* a Module — e.g. task filtering, bulk-approve, the review queue. Finer-grained
than a Module.
_Avoid_: module (coarser), app

**Stock location & internal replenishment**:
Inventory is **not global — it is scoped per location/Activity**: the **Roastery** (production output),
**HQ retail** (cafe bean stock), and **Ecommerce** (online-fulfilment stock) each hold their *own* pool of
the same roasted beans. The Roastery is the **internal supplier**: HQ retail and Ecommerce raise
**internal replenishment orders** to the Roastery to refill their stock (a roastery→retail / roastery→
ecommerce transfer, distinct from an external B2B sale). So the Café/Roastery/Ecommerce Modules need
**location-scoped stock** + an **internal-order/transfer** flow between Activities — not just each
Activity's own WIP log. (ESB tracks
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

**External agent** (via MCP):
A compatible agent chosen and connected by a Person through the future remote MOS MCP transport. It acts
as that Person with the same capabilities and record governance as the built-in deputy. Client trust
permits connection but never expands the Person's authority; consequential actions become approval requests.
_Avoid_: integration user, service account, deputy (reserved for the built-in agent), direct DB client

**User view**:
A versioned surface a person composes for themselves to analyse, input, or present authorized records in
their preferred arrangement. It is private by default and may be shared when authorized. A person or
their deputy composes it from registered primitives; it never contains executable code or copied result
data and is distinct from a built-in product Surface.
_Avoid_: custom dashboard, report, widget, saved query (too narrow — a user view may also *input*)

**Deputy Proposal**:
An ephemeral, reviewable suggestion from the deputy for an object or UI composition that does not have a
real draft lifecycle. A Proposal may prefill a typed Create form or preview a Home widget, Work saved
view, or pin, but **is not yet the business record** and makes no persistent UI change until the user
confirms it. Used for widgets, saved views, pins, and confirmation-required consequential actions—not for
Tasks, which an authorized deputy writes directly, or governed definitions, which use Draft.
_Avoid_: draft (reserved for publishable/submittable objects), pending record, AI action

**Draft** (a governed definition):
A persistent, editable pre-activation/pre-publish state for **Objectives, Projects, Process definitions,
and Standards**. A Draft may be human- or deputy-authored, but a human activates or publishes it. Tasks are
direct records, never Drafts. Process Runs, Checks, Exceptions, and factual execution records are never
Drafts.
_Avoid_: using draft for every newly proposed object; proposal (when no row should exist yet)

**Promotion** (of a user view):
The path by which a **user view** is **proposed for the product** — either *flipped* to an org/role-default
(no code, just wider sharing) or *built* into a coded Module by the dev team, using the view's spec as the
requirement. The product's intake of demonstrated demand; not automatic — a maintainer decides.
_Avoid_: publish, release, promote-to-prod (overloaded with deployment)

**Read-model**:
A **curated, named** data surface that UI and the **deputy agent** read from. Each is scoped to the
viewer's effective access. Two kinds: an **operational read-model** derived from MOS work and execution
records, and a **reporting read-model** fed from the financial analytics source and capability-gated.
Carries an **as-of** time for any non-live figure.
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

**Budget**:
A MOS-captured **budgeted COGS** = a menu item's **BOM (recipe: qty × materials)** costed at the ingredient
cost lines (`last_hpp`). Budgets are **created/captured** — new-branch costing, promo/menu scenarios — as
the **certified number pricing prices against** (the anti-stale-copy fix). The actual price still lands in
ecommerce/POS; MOS never writes prices there. Consumers link to the same Budget record rather than
embedding or copying it.
**MVP boundary — read-and-budget only:** MOS **reads** ESB's BOM + `last_hpp` and captures budget scenarios
on top; it does **not edit recipes** in MVP. Recipe editing would fork the recipe from ESB unless it writes
back, so **recipe editing + ESB BOM write-back are one deferred capability**, gated on validated
integration support. MVP never writes BOMs to ESB.
_Avoid_: forecast (that's a different lens), "the costing sheet", "the Plan destination" (retired IA term), copied budget

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
