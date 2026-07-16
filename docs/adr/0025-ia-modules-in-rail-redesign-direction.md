# ADR-0025 — Full-redesign IA and interaction direction (supersedes/amends ADR-0019)

- Status: **Accepted** (owner-approved 2026-07-09 — full-redesign grill session)
- Deciders: Owner (Arief) + Director
- Supersedes/amends: **ADR-0019 D1–D3 and its Plan/Operate destination guidance**: D1's `BU = team`
  taxonomy becomes BU ≠ Site ≠ Team (D36/D39/D41); D2's locked-five rail is reversed by D1 here;
  D3's Home cockpit becomes D8's attention brief + personal canvas. ADR-0019 principles such as one
  canonical record, Inbox-as-router, and work-item communication survive where not amended.
- Related: ADR-0014 (cascade: Objective → Project/Process → Task) · ADR-0017 (user-composed UI / agent-native) ·
  ADR-0018 (agent-stack port — the deputy battery) · `CONTEXT.md` (Standard, Shift, PIC/Supervisor Task ownership —
  all added / amended 2026-07-09) · `docs/decisions.md` OD-REDESIGN-1..55 (the decision trail) ·
  `docs/reference/twenty-ixd-patterns.md` (the IxD target) · `docs/reference/pmo-deputy-gaps.md` (the floor
  to exceed) · `docs/design-mockups/redesign-mockups-2026-07/` (the mockups this direction is prototyping).
- Scope: records the **IA direction + redesign approach** for the full-redesign prototype. As with
  ADR-0019, no migration, route, or component is authorized by this ADR alone — each slice goes
  through its own spec → plan → build → review loop. The mockups are a Phase-0 proposal, not shipped code.

## Context

The current MOS app (built to ADR-0019) has never been used. A 2026-07 design teardown found its root
problem: it behaves like "several apps" — a dashboard bolted to a task tool, an ops console tacked on,
kitchen screens spilling into primary nav. The retrofit (W1–W5) patched tokens/layout; it did not cure
the disease. The owner directed a **full redesign** from the job, treating the current app, routes,
DESIGN.md, prior Phase-0 mockups, and ADR-0019 as *evidence, not authority* ("no ADR is sacred").

During the redesign grill (2026-07-09, owner + Director, against `CONTEXT.md` + `docs/adr/` +
`docs/decisions.md`), the owner's settled preferences came into direct conflict with ADR-0019 D2:

- The owner prefers a **flat, legible rail that mixes destinations (Home · Work · Money · Inbox) with
  Activity modules grouped by BU** (Retail Ops → Kitchen / Bar / Ecommerce; B2B Ops → Roastery) —
  because for a 30-person F&B company, a barista's daily home is "Kitchen," not an abstract
  "Operate" destination they then drill into.
- ADR-0019 D2 explicitly forbids this: "activity is a dimension, never a nav root... Nav stays five
  items forever."

This ADR records the reversal and the broader redesign direction so future agents aren't confused by
the gap between the ratified ADR and what the mockups (and eventually the app) do.

## Decisions

### D1 — Modules ARE nav roots, grouped by BU (supersedes ADR-0019 D2's "never a nav root")

The rail is a **two-zone structure**: Destinations (Home · Work · Money [role-gated] · Inbox) then
**Modules grouped by Business Unit** (Retail Ops → Café / Ecommerce; B2B Ops → Roastery). A Module
represents a coherent operational workflow, not every Activity or team. Kitchen and Bar share the
**Café** Module because they share one operating workflow; they remain distinct Areas inside it. The
compact rail label is **Café** and the expanded page title is **Café Operations**.
Modules live in the rail under their owning BU, not hidden one click deep inside an "Operate"
destination. The floor's daily workspace remains one click away.

Rationale: ADR-0019's purity ("five items forever") optimised for IA-tidiness at the cost of
floor-accessibility. For a 15–30-person F&B company where the majority of users are floor staff who
think in operational workflows, burying their workspace behind an abstract destination is the wrong
trade-off. The grouping-by-BU prevents the original failure mode (Kitchen's 5 loose links), while the
workflow-coherence test prevents the opposite failure of creating one mini-app per station or team.

The initial set is deliberately three Modules: Café, Ecommerce, and Roastery.
Finance, HR, Marketing, Procurement, and other support teams use the universal Process/Process Run/
Standard runtime in Work, plus role-specific Home, Money, or People surfaces. A support workflow earns a
future Module only when it has specialized records and high-frequency interactions that Work cannot
express naturally; the rail never mirrors the org chart.

Inbox is one canonical router collection with two presentations: rail/bottom-nav opens the full page
for sustained triage; the top-bar badge opens quick triage in the shared right-panel host. Selecting an
Inbox item pushes its canonical record onto that panel's navigation stack, and Back returns to Inbox.
Read/handled state is shared. On phone, Inbox always opens as a full page rather than an overlay.

ADR-0019 D2's *other* clauses stand: Home is the first destination; Inbox is a router; the cascade is
a view inside Work; Activity remains a dimension on records (a Task carries a BU/Activity), while a
Module may serve one or more related Activities.

### D2 — Redesign direction: one consolidated prototype

The redesign consolidates three earlier mockup paradigms (α flat/issue-centric, β board/database-centric,
γ nested/page-centric) into **one canonical prototype**: α's flat IA rail + γ's Notion-like direct
editing expressed as a **structured canvas** on every detail surface + β's multi-view database
(Table/Kanban/Timeline) on Projects and Tasks-in-Project + the Standards quality-loop + Shifts roster.
Required typed properties stay pinned; optional sections and contract-valid nested objects can be added,
hidden, and reordered; freeform text is allowed only in text regions. The α/β/γ files retire as history;
their good ideas live in the one prototype.

### D3 — Interaction grammar: six binding IxD rules (from the Twenty study)

The owner directed the redesign toward the **neatness and customisability of the Twenty CRM** (`docs/reference/twenty-ixd-patterns.md`).
These six rules are **binding IxD decisions**, not aspirations — the scattered popovers/drawers/modals
of the current mockups converge to this grammar:

**D3a — Default open = one stack-navigated Record Panel; never nested physical drawers.** Every
first-class record has one canonical URL and renderer. A relation pill or record link keeps that real
canonical `href`: normal click opens the record in the right-hand Record Panel; new-tab/direct URL/
refresh renders the full canonical page. A relation selected inside the panel pushes onto the *same*
panel's navigation stack. Panel Back and Browser Back pop one level with scroll/focus restoration;
Close `×` closes the entire stack and restores the underlying source page; "Open full page" escalates
the current record. Clicking a record already in the stack pops to it instead of duplicating it. After
three panel records, a deeper transition escalates to the full page. The same record renderer receives
`mode="panel" | "page"`; no entry point creates a second copy of the record. Quick field edits happen
inline in the list (D3c), not in another drawer.

Relationship sources use navigational pills or compact linked-record lists, never an embedded duplicate
record editor. A Process may list its Tasks/Standards; selecting one opens the canonical record panel.
This follows Fluent's single-overlay/two-to-three-step guidance, React Router's background-location
pattern, and the stack navigation identified in the Twenty study.

**D3b — The command palette stays a popup; Inbox, deputy, and records share one right-panel host.** ⌘K
remains a fast centered popup (Linear/Raycast-style) for navigate/search/act — keyboard-first,
transient, dismisses on action. The right-panel host presents (1) Inbox quick triage, (2) the deputy,
and (3) the stack-navigated record inspector (D3a); it never layers competing drawers. Selecting an
Inbox item pushes its canonical record and Back returns to Inbox. ⌘K *routes into* the panel (e.g.
⌘K → "ask deputy about AR" opens the deputy there).
*Reverses Twenty's unification of ⌘K+panel into one surface — MOS keeps the popup for speed; the panel
is for persistent context (inspect + deputy). Decided by the owner after weighing both options.*

**D3c — One inline-cell edit primitive, one commit contract, everywhere.** A single `RecordInlineCell`
(display mode → edit mode) governs field editing across table, board, and record page. Commit contract:
**Enter → validate/save/close; Tab or Shift+Tab → validate/save/move; click-outside → validate/save;
Escape → discard the current uncommitted value and restore the last saved value.** Validation failure
keeps the field open with an inline error. Multiline Enter creates a line and Cmd/Ctrl+Enter saves.
Autosave exposes pending/saved/error/retry; successful saves support Undo where practical. One
`FieldDisplay`/`FieldInput` pair per type. This deliberately diverges from Twenty's unusual
Escape-persists behavior in favor of the conventional cancel mental model.

**D3d — Tables, boards, timelines are views over the same records.** A `View` = a saved bundle of
{type (table/kanban/timeline), visible fields + order, filters (+ nested AND/OR), sorts, groupings,
layout params, openRecordIn, visibility}. One record index, many renderers. URL-synced (shareable).
*This is β's multi-view, formalized as the Twenty `View` model.*

**D3e — Create = new record + immediate inline title edit.** No per-object create modal. Click `+` → a
new record appears in the current view, its title cell auto-focuses, type → Enter. Context fields
(PIC/Supervisor/parent) inherit from the current view's filter or current record where valid.
*Kills the create-task/capture/create-project modals — one create flow.*

**D3f — Typed contracts drive creation; views and presentation are customizable.** Core objects have
system-wide, code-owned **Object Contracts** with required and optional fields, relationships, validation,
and permitted nested object types. Humans and the deputy create through the same contract and cannot
remove required domain fields or invent arbitrary object shapes. A Process definition may contain
generated Task definitions and linked Standard Steps without turning those nested definitions into a
separate business object. Views (saved filter/sort/layout bundles), the Home/Work widget
composer, and saved-view pins are user-customizable. Core destinations, BU groups, and authorized
Modules are organization-owned: users cannot rename, hide, or reorder them. A user may pin, reorder, or
unpin personal saved views beneath their owning destination/Module; a deputy proposal requires user
acceptance. Phone bottom navigation remains core-only. A full data-model builder (custom objects/fields)
is a future slice. *Twenty's metadata-driven principle, constrained by MOS domain and IA safety.*

### D4 — The deputy is a first-class redesign surface (agent-native from the front)

The deputy is NOT a deferred port feature — it is the **headline interaction paradigm** of the product
("agent-native, user-composed UI" — ADR-0017's title; the owner's stated goal: "create UI to their own
needs... through the deputy agent"). The redesign mockup builds it as a **real mocked surface**
(fixture-data, non-functional backend): the topbar sparkles icon opens a docked right panel showing a
grounded conversation that traces to real data ("what's my AR overdue?" → "Rp 142M, 5 invoices, oldest
38d → drill to Follow-ups"); it can compose a widget and the mockup shows it dropping into Home/Work.
The PMO port (ADR-0018) wires the real backend; the mockup proves the UX.

### D5 — Close the six PMO gaps (PMO is the floor, not the ceiling)

PMO's deputy (ADR-0018 battery) is well-engineered but only a side-panel UX — context-*aware*, not
context-*acting*. The redesign closes six concrete gaps (full analysis: `docs/reference/pmo-deputy-gaps.md`):

- **D5a — Inline `@` reach.** The agent is invocable from inside any text surface (editor, command bar,
  record field), with the current record/selection as the seed — not only by navigating to the panel.
  *(PMO has zero inline reach; the defining "agent-native from the front" gap.)*
- **D5b — The agent can navigate the user.** A deputy-bound `navigate(route, entity?)` action
  (user-confirmed if it leaves the current record) — "the project that's behind" becomes "take me there."
  *(PMO's agent receives context read-only; it cannot move you.)*
- **D5c — Composed UI drops into the workspace, not the panel transcript.** `compose_view` gains an
  "insert/pin into `<main>`" disposition — generative UI lands in the user's workspace, not a panel
  artifact. *(PMO traps composed views in the transcript; promotion is backlog-deferred.)*
- **D5d — The agent is a first-class ⌘K action, not a zero-results fallback.** Always available from ⌘K,
  alongside nav/search — the universal entry routes to nav, search, *or* an in-context agent turn.
  *(PMO's only ⌘K→deputy bridge is a last-resort prefill.)*
- **D5e — Write actions bind to the live in-context entity.** The agent acts *on what you're looking at*
  ("advance *this* task"), consuming the in-context entity/selection seam — not requiring the model to
  re-derive explicit IDs. *(PMO's writes are generic ID-parameterized.)*
- **D5f — Per-surface agent threads.** The agent conversation on a project page is scoped to that project;
  composed artifacts land there. The agent feels woven into each surface, not one global sidecar.
  *(PMO's panel is a single global drawer.)*

### D6 — Glossary changes (already applied to CONTEXT.md inline)

Recorded here for cross-reference (CONTEXT.md is the source of truth):
- **Standard** added and broadened (owner refinement 2026-07-10): a versioned execution specification
  on a Process/Project with typed steps — instruction/reference, confirmation, measured control,
  required form field, and required evidence/sign-off. Checkable steps produce Checks → Exceptions →
  correction Tasks → audit trail; the Process, not the Standard, owns recurrence and generated work.
  **SOP** is a sanctioned synonym (the thing to avoid is calling a *Process* an SOP).
- **Shift** added (roster unit: person + station + window, scoped to a BU area; drives check assignment
  + exception routing + Home "your shift today").
- **PIC + Supervisor** replace Task-level R/A terminology (owner refinement 2026-07-10). RACI is reserved
  for Objectives, Projects, and Processes; Tasks use one PIC who performs/closes the work and one
  Supervisor who monitors/unblocks/verifies it. **SPV** is not the relationship label.
- **Process Run** added (owner refinement 2026-07-10): a time-bounded occurrence of a permanent Process,
  owning that occurrence's generated Tasks, checks/forms/evidence, completion, and history. It is an
  execution object, not another layer in the strategy-to-execution cascade. Its schema contract requires
  a dedicated ADR during the engineering-planning phase.

### D7 — One guided designer over typed object contracts (owner refinement 2026-07-10)

Managers author a Process through one progressive-disclosure designer covering purpose/ownership,
trigger or cadence, generated Task structure, Checklist items, typed Standard Steps, exception rules,
and a preview of the resulting Process Run. The designer stores separate typed domain objects beneath
one coherent experience; it does not collapse Process, Task, Standard, Check, and form data into a
freeform document. The deputy uses the exact same contracts: it may draft from natural language or an
uploaded SOP, but validation, preview, explicit manager confirmation, and versioned publish are required
before the draft can govern live Runs. These contracts are the safety boundary that makes deputy-created
workflows fast without making them structurally arbitrary.

Generated Tasks default Supervisor from the parent Project/Process A. A Process's generated Task
definition may explicitly override that default for a legitimate cross-functional boundary; the designer
must show the inherited source or override visibly, and the resolved value is snapshotted when a Process
Run starts.

The designer and all Project/Process/Task/Standard detail pages use one structured-canvas grammar:
immediate inline editing, autosave with visible pending/saved/error state, pinned required properties,
reorderable optional sections, and a `/` menu limited to nested objects valid under the current contract.
There is no separate view/edit mode and no fully freeform data model.

### D8 — Home is a required attention brief plus an authorized personal canvas (owner refinement 2026-07-10)

Home's system layer answers **"What needs my attention today?"** from role-authorized data: blocked or
overdue work, due Process Runs, failed Checks/Exceptions, mentioned/actionable Signals, sign-off requests, and
financial exceptions. It is not a second Money dashboard: detailed KPIs, trends, and period analysis stay
in Money or the owning Module. Every signal drills into its canonical record.

Alongside that required brief, each user has a personal structured canvas. The user or deputy may add,
remove, and reorder contract-valid widgets, but composition runs under the viewer's existing JWT, RLS,
and capabilities; a widget cannot query data or expose actions the viewer could not reach directly. A
deputy-proposed widget is previewed and explicitly accepted before it persists. The system brief cannot
be removed. Personal Profile stores `Home order ∈ {Attention first, Personal canvas first}`, defaulting
to Attention first for every role. When the personal canvas comes first, the Home header keeps a visible
`Needs attention · N` jump target. Only the user can change the top-level order; the deputy cannot.

### D9 — Work is one record workspace, not another dashboard or a bundle of mini-apps (owner refinement 2026-07-10)

Work uses one collection-and-saved-view grammar. Its collection switcher groups Execution (Tasks,
Process Runs), Work systems (Projects, Processes, Standards), Direction (Objectives), and Cadence/queues
(Signals, Follow-ups). Each collection uses the same index contracts—filters, sorts, groupings,
saved views, inline editing, inspector → full structured-canvas page—with Table/Kanban/Timeline only
where the record type supports them. Work remembers the user's last view; a new user starts at My Tasks.
Specialized queues may vary columns and actions but never create a second copy of a record. Work has no
widget composer; personal/deputy widgets belong on Home.

### D10 — Creation is contextual; no ambiguous Capture action (amended by D32, 2026-07-10)

Universal top-bar `+ Create` and ⌘K expose every typed object the viewer may create. The visible primary
action names the current job: Work creates the current collection's object, a Process offers **Start
run**, a Standard offers **Run check**, Café offers **Log production**, and Roastery offers **Log roast**.
Money and Inbox do not show an unrelated floating action. On phone, a Module may use a thumb-reachable
local sticky action for its one high-frequency job; the universal Action Launcher is governed by D32.
Typed object creation follows
D3e's inline-create contract; operational submissions may use a focused sheet/form because they record
structured readings rather than create arbitrary records. This deliberately rejects one ambiguous
Capture button across every screen.

### D11 — First production deputy slice is front-most with reversible direct writes (amended 2026-07-10)

The first production deputy slice is visible throughout the redesign rather than deferred: top-bar,
⌘K, inline `@`, authorized current-page context, grounded source links, navigation, and per-surface
threads. It may propose Home widgets and Work saved views/pins, and it may create typed Process,
Standard, Project, and Objective drafts for human review. It may directly create/edit Tasks, add Task
comments/activity updates, and change Task status when authorized. It runs as the viewer's JWT and is
constrained by the same RLS/capabilities as the human.

Consequential transitions—publishing/activating definitions, submitting an approval artifact, adopting
a Standard, starting/completing a Run, submitting a Check, or performing financial actions—remain
explicitly human-confirmed. A Task status change is direct unless it triggers one of those transitions.
Every mutation uses the same capability-gated, idempotent, audited domain command as the human UI;
persistent composition proposals still require acceptance.

### D12 — Draft and proposal are distinct lifecycle concepts (owner refinement 2026-07-10)

Persistent **Draft** is reserved for governed definitions: Objectives, Projects, Process definitions,
and Standards.
A deputy may persist those typed drafts, but a human activates, publishes, or submits them. Tasks do not
gain a Draft lifecycle: an authorized deputy creates/edits the real Task directly. Home widgets, Work
saved views, and nav pins remain ephemeral Proposals until accepted. Process Runs, Checks, Exceptions,
and other factual execution records are never drafts or proposals: they exist only when their authorized
operational action actually occurs.

### D13 — Personal composition is JSONB data in ordinary tenant rows, not on the Person row (owner refinement 2026-07-10)

The existing `mos.user_views` substrate remains the foundation for personal Home canvases and Work saved
views. Each composition is a separate RLS-protected tenant row with normalized ownership, organization,
kind/context, name, scope, and lifecycle metadata plus a versioned, schema-validated JSONB `spec`. The
spec stores registry-known primitives, presentation/layout, and authorized query specifications—never
query results, arbitrary SQL, executable JavaScript, or HTML. Queries re-run under the current viewer's
JWT/RLS whenever the composition renders.

`shared.people` remains a directory identity that may exist without a login; it does not accumulate a
personal-UI JSON blob. Stable cross-device scalar settings such as Home region order belong in a small
RLS-protected `mos.user_preferences` row with explicit columns. If a shared view may be pinned differently
by different viewers, that placement belongs in a separate per-person pin row rather than on the shared
view. Device-only ergonomics may remain local when cross-device persistence has no user value. Exact
columns, constraints, JSON schema versions, and migrations remain engineering-plan owned.

### D14 — Publishing requires both scoped capability and record authority (owner refinement 2026-07-10)

Hard-coded `ops_lead`/admin ownership of workflow definitions does not fit a product in which Finance,
HR, Marketing, Procurement, Café, Ecommerce, and Roastery manage their own operations. Authoring and
publishing therefore use two gates: `can()` establishes the person's action and business-unit scope,
while the record's RACI establishes authority over that specific definition. A Process R may create and
edit its Draft; its single A publishes it. A Standard is instead a canonical BU-scoped asset with no
RACI: `standard.publish` within its BU governs publication, while each consuming Process/Project A
governs adoption of a published version. Admin retains a visibly labelled, audit-logged emergency
override rather than silently behaving as the record A.

The UI presents plain workflow actions—Edit draft, Send for approval, Publish—rather than permission
mechanics. The deputy inherits the caller's effective authorization but, under D11's first production
slice, may only author a Draft and cannot publish. Exact capability keys and the individual-override
model are authorization-ADR/spec concerns; this decision fixes the product-level two-gate invariant.

### D15 — Admin shows effective access per person over role defaults and sparse overrides (owner refinement 2026-07-10)

Authorization uses code-owned capabilities. Editable access roles provide the default RBAC grants;
administrators may add sparse, scoped allow/deny overrides for an individual. The admin settings UI
presents the complete effective matrix for a selected person, with every cell labelled Inherited,
Allowed, or Denied and a Reset to role default action. It does not materialize a copied permission set
for every person.

For an action on a resource, applicable grants resolve **explicit deny → explicit allow → union of role
grants → default deny**. Scopes may be self, own BU, selected BUs, or organization-wide where meaningful
for the capability. Protected administration invariants cannot be denied, the last admin cannot be
removed, and all role/grant/override changes are audited. Record-level governance remains an additional
gate; bypassing it requires a separate explicit override capability. This amends ADR-0020 D2–D5 and adds
its D8–D10; ADR-0020 remains the authorization source of truth.

### D16 — Object Contracts are system invariants; user-authored Blueprints are deferred (owner refinement 2026-07-10)

The earlier use of **Template** conflated two different ideas. The current product has code-owned,
system-wide **Object Contracts** for Project, Process, Task, Standard, and later Process Run. A contract
defines required/optional fields and relationships, valid nested object types, validation, and permitted
structured-canvas blocks. It is not a business row and is not editable by an administrator. The Standard
contract, for example, requires a BU, name, version, and Standard Steps but not a governing parent,
measurement, or unit; instructional, documentary, confirmation, and sign-off Standards are valid.

There is no first-class user-defined Template in the current model. Immediate reuse is **Duplicate as
Draft** under the same Object Contract. A future user-authored **Blueprint** is deferred without schema
until multiple independent definitions are repeatedly duplicated and manually synchronized across BUs;
that evidence would justify its own versioning, permissions, adoption, and upgrade semantics. No current
spec or mockup may imply a Blueprint table, lifecycle, catalog, or authoring surface.

### D17 — Standards are canonical BU assets; consuming definitions control adoption (owner refinement 2026-07-10)

A Standard may link to zero or many Processes/Projects and has no RACI. It is published under the
`standard.publish` capability scoped to its owning BU. Publication makes a new immutable published
version available; it does not itself change any consuming Process/Project. Each Process/Project A
controls whether its definition adopts a published Standard version. Links are version-aware so
execution can be reconstructed historically and no edit silently changes active operations. A document
without executable instruction, check, typed input, evidence, or sign-off semantics is Reference
material rather than a Standard.

### D18 — Standard publication and consumer adoption are separate, notified transactions (owner refinement 2026-07-10)

Publishing creates a new immutable Standard version. Every linked consuming Process/Project receives its
own actionable **Upgrade available** item in the canonical Inbox, addressed to that definition's A and R
and deduplicated by consumer + Standard version. The item shows the version diff, affected steps, current
pinned version, and proposed version. Publication itself changes no consumer.

The consuming A adopts by approving a new Process/Project definition revision and choosing an effective
date. Its R is notified of the decision; C may be requested during review and I receives the adopted-change
notice according to the definition's RACI. A newly linked Process/Project defaults visibly to the latest
published Standard version and requires confirmation of that pin. Once adopted, future Runs that have not
yet been materialized and start on/after the effective date use the new version. Started, completed, or
already-materialized Runs keep their immutable snapshots unless an authorized person explicitly replaces
an untouched future Run; the system never rewrites evidence or assigned work silently.

Adoption emits a versioned audit event and notifies people assigned to any materially affected upcoming
work once those assignments exist. Notification delivery uses the existing canonical Inbox; configured
doorbell channels may point to it but do not become the approval surface. Repeated publications or
multiple consuming definitions do not collapse independent A decisions into one organization-wide
approval.

### D19 — Reversal is an audited domain action, never hard deletion (owner refinement 2026-07-10)

Deputy writes use the same domain-command layer as human and future external-agent writes. Reversal is
object-aware: a created record is **Archived** and may be **Restored**; an edited field may **Revert** to
an audited prior value; a status change receives a compensating **Undo** event; and a comment may be
**Retracted** while its audit tombstone remains. Hard deletion is unavailable and is not presented as
undo because it loses provenance and cannot reverse notifications, dependent work, or other downstream
effects.

Commands require the caller's effective `can()` authorization, record-level authority where applicable,
an idempotency key, optimistic-concurrency/version checks, and a durable audit event. Consequential
transitions listed in D11 require explicit confirmation. Notifications are emitted from committed domain
events; a reversal emits its own correction event rather than erasing history.

### D20 — Signals replace both mandatory Weekly Updates and the operations-only Daily Log (owner refinement 2026-07-10)

The redesign removes mandatory Weekly Update filing and supersedes the lightweight Daily Log/
`ops.log_entries` concept with one organization-wide, authorization-scoped **Signal** layer. A Signal is
an attributable real-time factual note with occurrence time, BU/context, category/severity, mentions, and
canonical links. Humans may type/dictate it; the deputy records it under the caller's identity; specialized
Modules may emit linked Signal summaries from their own richer canonical records.

A Signal deliberately has no PIC, Supervisor, due date, or work Status. Mentioning someone creates an
Inbox nudge; an obligation becomes a linked Task; a failed Check remains an Exception. Thus the feed does
not become task-lite. Weekly/team summaries are generated views over real Tasks, Projects, Process Runs,
Signals, and domain events rather than a submitted employee artifact. Because the app has never been used,
the clean data baseline may remove legacy Weekly Update and `ops.log_entries` tables instead of carrying
compatibility storage; destructive environment reset/deploy remains separately gated.

### D21 — Future MCP is a per-user adapter over the same domain boundary (owner refinement 2026-07-10)

MOS will expose a remote MCP server later so each team member can use a compatible preferred agent, but
MCP is only a transport adapter over the same protocol-neutral query/domain-command layer used by the MOS
UI and built-in deputy. It never receives direct table access or `service_role`, never introduces a
parallel permission model, and never accepts a shared employee identity. Each human connects through an
OAuth flow whose resource-bound token maps to `shared.people`; `can()`, record governance, RLS, and row
visibility remain authoritative.

Low-risk reversible Task/Signal commands may execute directly; definition commands create Drafts; a
consequential transition creates a MOS approval request rather than trusting an external client's
confirmation UI. Every call records human actor, MCP client/source agent, command, idempotency key,
result, and reversal chain. Admin controls trusted clients/providers and each person separately connects
and consents. MCP scopes stay coarse enough to understand while `can()` remains fine-grained. The clean
baseline builds the reusable command/audit seam now; the transport is deferred. Eng-planner must write a
dedicated MCP/auth ADR against the current protocol specification before implementation, including OAuth
discovery, resource/audience validation, client trust, token storage, revocation, and no-token-passthrough
tests.

### D22 — Signal visibility flows upward through configurable information layers (owner refinement 2026-07-10)

Each Signal has one owning Team. Its default read audience is that Team, BU-scoped Roles over the Team's
parent BU, plus people whose configured BU Signal visibility layer is higher than the parent BU's layer.
Sibling Teams do not see one another by default. This information hierarchy is deliberately
separate from the organizational `reports_to` tree: Finance and Marketing can be peer BUs while Finance
still has broader default Signal reach. An explicit `@Person`, `@Team`, or `@BU` creates a row-level
audience grant even when the recipient sits in a lower layer. Without same-Team/parent-BU-scope,
sufficient higher layer, explicit grant, or a separate authorized override, RLS denies the row.

The initial cross-BU example is Operations < Marketing/support < Finance/control < Management, but admin
settings owns layer names/order and BU/access-role mappings; individual `can()` overrides remain
effective. Read audience is not notification fan-out: merely being in a higher layer does not create an
Inbox item. Mentions and subscribed actionable events drive notifications. D23 excludes confidential
cases from Signal entirely; D24 governs existing mention fan-out and the Team refinement separately
resolves `@Team` versus `@BU` audience size.

### D23 — Signal is not a confidential-case layer (owner correction 2026-07-10)

There is no Restricted Signal variant. Signals are operational observations intended to follow D22's
predictable upward visibility. Confidential HR, legal, medical, whistleblowing, or similarly sensitive
matters do not enter the Signal table, feed, search, analytics, notification payloads, or generated
summaries. A future confidential case/reporting workflow requires its own Object Contract, authorization,
RLS, retention, disclosure, audit, and escalation design; until then, the product directs the person to
Gordi's approved private channel rather than pretending Signal privacy is sufficient.

The UI/deputy may warn before save when content appears sensitive and ask the person to use that route,
but automated classification is only a safety prompt, never the privacy boundary. MCP and domain-command
tools enforce the same product boundary and must avoid echoing rejected sensitive content into logs.

### D24 — Mentions grant visibility and explicitly fan out notifications (owner refinement 2026-07-10)

`@Person` grants/notifies one person. `@Team` grants that Team and independently notifies every currently
active Team member. `@BU` grants the BU and independently notifies every active person across its child
Teams plus BU-scoped Roles. Recipient people are deduplicated. The composer previews the fan-out count
before commit; deputy/MCP returns the same preview whenever Team/BU mention is added. `@BU` requires the
configurable `signal.mention_bu` capability because it is broader.

Merely having upward-layer read visibility never notifies. Each recipient owns independent read/handled
notification state. A person who joins a mentioned Team/BU later can read under current access but does
not receive retroactive notifications. Team/BU mention is awareness/routing, never work ownership; if
action is required, a linked Task names PIC and Supervisor. Shared Team Inbox or configurable BU triage
roles are deferred until observed notification volume justifies them.

### D25 — Signal remains fact; follow-up Tasks are separate many-to-many linked records (owner refinement 2026-07-10)

A Signal is never promoted, converted, or marked resolved. Its actions include **Create follow-up Task**
and **Link existing Task**. Create pushes the canonical Task composer onto the same Record Panel stack,
pins the source Signal, prefills safe context such as title/description/Team/BU/source link, and still validates
the Task Object Contract. Save creates the Task plus a relation, pops back to Signal, and shows it under
Linked work. There is no embedded duplicate Task editor.

The relation is many-to-many: one Signal may require several cross-team Tasks, and one corrective or
prevention Task may address several related Signals. The Signal may show derived linked-work state such
as `2 Tasks · 1 open`, but owns no status, PIC, Supervisor, due date, or resolution lifecycle. Task
completion/archive never removes its source Signals; repeated Signals remain available for clustering
into Process/Standard improvements or a Project.

### D26 — Project/Process is optional context for ad-hoc Tasks (owner refinement 2026-07-10)

A Task is valid with its required Team, PIC, Supervisor, and Status even when it has no Project/Process
parent. Ad-hoc Tasks—especially follow-up from Signals—must not be blocked by classification or forced
into a fake Miscellaneous Process. A Task created inside a Project/Process inherits that direct link;
every Task generated by a Process Run requires its generating Process/Run relationship. Other Tasks may
be linked later through an audited edit.

An unparented Task is shown with a derived **Ad hoc** classification, not a new lifecycle Status. Work
offers an Ad hoc saved view and reports its volume alongside repeated Signals so managers can recognize
firefighting and improve/create a Process, Standard, or Project. The deputy may suggest classification
but never invent or attach a parent silently. This amends ADR-0014's phrase “direct and permanent” to
describe the topology of an existing link, not a universal parent requirement.

### D27 — Ad-hoc Task Supervisor resolves from the PIC's relevant manager chain (owner refinement 2026-07-10)

Supervisor resolution follows one visible order: creator-selected explicit Supervisor; generated-Task
definition override; parent Project/Process A; PIC's direct manager for the held Role whose BU matches the
Task; finally the PIC when no manager exists. If dual-hat or other org structure leaves multiple manager
paths after BU matching, creation pauses for a human choice rather than guessing. Same-person PIC and
Supervisor is valid.

Every Task surface labels the resolved source (`Explicit`, `Generated definition`, `Parent A`, `PIC's
manager`, or `Self-supervised`) and changes are audited. A Signal `@mention` grants awareness/access only
and never silently assigns PIC or Supervisor. The deputy may use ownership explicitly stated by the user;
otherwise it asks for the missing person before committing the Task.

### D28 — Signal categorization enriches after capture and never blocks it (owner refinement 2026-07-10)

Signal creation requires factual content, owning Team, occurrence time, and author/source. Category is
optional enrichment. A small system-owned top level—Supply/vendor, Equipment/facility, Inventory/
availability, Quality, Customer, People, Process, Other—keeps organization-wide analysis stable; admins
may manage BU-specific subcategories beneath those families. Free-form tags are absent initially.

The deputy may suggest a category and confidence after dictation. A human can accept/correct it; low
confidence remains **Uncategorised** and appears in a saved review view rather than blocking post. Admin
may rename, merge, or archive subcategories while historical Signals preserve their canonical family and
mapping history. Category records the observed domain, never guessed root cause, visibility, urgency, or
work state. Prevention evidence comes from linked work and later Process/Standard/Project changes.

### D29 — Signal uses a three-level attention cue, not a lifecycle (owner refinement 2026-07-10)

Each Signal has **FYI · Needs attention · Urgent**, default FYI. Attention affects feed ordering, visual
treatment, Home inclusion, and configured notification delivery to explicitly mentioned recipients or
subscribers. It never changes upward visibility and creates no owner, status, SLA, due date, resolution,
or automatic Task. Needs attention/Urgent presents Create follow-up Task as a suggestion.

The deputy may set attention from explicit wording; an inferred Urgent requires confirmation before
post. Urgent may use configured PWA/doorbell delivery, but visibility alone never causes fan-out.
Attention changes are audited and do not erase or resolve the factual Signal.

### D30 — Signal creation is intentional; routine domain events are not mirrored (owner refinement 2026-07-10)

A Signal is created only when (1) a human/deputy explicitly posts it, (2) a person deliberately invokes
**Share as Signal** from a canonical record, or (3) a published Process/Standard rule explicitly emits
one for a configured meaningful condition whose audience, category, attention, and source are visible in
the rule preview. Every non-human Signal identifies and links its canonical source and emitting rule.

Routine Task changes/completions, Process Run events, production logs, approvals, inventory movements,
and audit records remain domain events. Failed Checks remain Exceptions. Generated management summaries
query those sources directly rather than depending on duplicated Signal mirrors. Rule emissions require
idempotency/rate/deduplication guards. This removes the previous Daily Log mirror-on-approval pattern and
prevents Signal from becoming a second activity stream.

### D31 — Posted Signals are correctable through revisions and retractable, never silently rewritten (owner refinement 2026-07-10)

The author or authorized deputy may correct body, occurrence time, category, and attention. Each change
creates an immutable revision, visible **Edited** indicator, diff/history, actor, and timestamp. Owning Team
and canonical source are immutable after post because changing them would silently change access and
provenance; a mistake there uses **Retract** with reason followed by a new correct Signal.

Adding a mention creates the normal access grant and notification. Removing one revokes only that
explicit grant where no other visibility rule applies, marks its notification retracted, and warns that
the recipient may already have seen it. Material body/attention corrections emit **Signal updated** to
mentioned recipients; category-only cleanup does not. Rule-emitted body/source is immutable—retract the
emission and repair the rule. Retraction excludes the Signal from default feeds/analytics while retaining
an audit tombstone. Hard deletion is unavailable.

### D32 — One responsive Action Launcher fronts a stable prescribed command registry (owner refinement 2026-07-10)

Phone uses a persistent `+` FAB above core bottom navigation; desktop/tablet uses top-bar `+ Create`.
Both open the same action sheet/registry and never execute an ambiguous default. Stable universal actions
are **Share Signal**, **Ask Deputy / dictate**, **Create Task**, and **More…**. More opens the complete
authorized typed-object create palette.

The launcher may add one clearly contextual action—Process: Start Run; Standard: Run Check; Café: Log
production; Roastery: Log roast—while keeping the universal actions stable rather than algorithmically
reordering them. Every item is capability-filtered and may prefill current BU, Area, record, or selection.
⌘K, keyboard shortcuts, deputy, desktop button, and mobile FAB dispatch the same domain commands. The FAB
is an action affordance, not a navigation destination; bottom navigation remains core-only. This amends
D10/OD-REDESIGN-21 without reviving the rejected global Capture concept.

### D33 — Signal supports comments and optional acknowledgement, not a work lifecycle (owner refinement 2026-07-10)

Each person may explicitly **Acknowledge** a Signal to communicate “I have seen this.” The Signal may
show acknowledged people, but acknowledgement is not ownership, completion, approval, acceptance, or a
promise to act; it never produces Open/Resolved state. Personal Inbox read/handled remains private triage
and is not treated as acknowledgement. A BU mention never requires every member to acknowledge.

Signals use the shared entity-comment grammar for factual clarification and scoped discussion. New
`@Person`/`@BU` mentions in comments use D24 access/notification rules. Comment notifications go to the
Signal author, explicitly mentioned people, and explicit Followers; a BU mention does not subscribe every
member to every future reply. People may Follow/Unfollow. When discussion creates a commitment, UI/deputy
offers Create/Link Task rather than allowing “I'll handle it” to become invisible ownership. Unrelated
free conversation stays outside MOS.

### D34 — Management cadence is a live sourced period view with optional delivery, not a filing artifact (owner refinement 2026-07-10)

Home and Work provide authorized **Today / This week / Last week** views over Tasks, Project progress,
Process Runs, Exceptions, Signals, and important domain events. Every rendered item and deputy-generated
claim links to its canonical source. Managers may ask the deputy for an on-demand grounded summary or
save the view.

Optional Automations may deliver a saved view/grounded summary to Inbox with as-of time and configured
PWA doorbell. Delivery creates no Weekly Brief business object, employee Draft/Submitted lifecycle,
missing-update reminder, or manager review roster. The system never asks people to restate structured
work it already holds; missing operational context is captured in real time as Signal.

### D35 — Signal author and owning Team are independent (amended by D36, 2026-07-10)

The author is the immutable Person who reported the Signal. The owning Team is where the observation
applies and controls the base visibility layer; it need not be the author's home Team/BU. A person
defaults to current/context Team and requires `signal.create_for_team` for another authorized Team.
The author always retains read/correction rights. There is exactly one primary owning Team; other
affected Teams/BUs use mentions, which add access/notifications rather than ownership.

The composer/deputy previews destination, attention, and fan-out before cross-Team post (for example,
`Post to Gordi HQ Operations · FYI · notify 5`). This supports management posting an FYI into a branch
Team without making it management-only.

### D36 — Team is the Signal leaf below BU; Site provides optional branch context (owner refinement 2026-07-10)

The org taxonomy separates **BU** (functional/accountability parent), **Team** (concrete operating group),
and **Site** (physical branch/place). Every Team belongs to one BU and may reference one Site; central
Teams may have none. Roles always belong to a BU and may be Team-scoped; a null Team means BU-wide
responsibility over child Teams. Team membership is an explicit effective-dated assignment separate from
Role; a Team-scoped Role requires a matching active membership.

Signal requires `owning_team_id`; its BU and Site are derived, never independently editable. Default
visibility walks owning Team → parent-BU-scoped Roles → configured higher BU layers. HQ Operations and
Radiant Operations are sibling Retail Ops Teams and do not see one another by default; Retail Ops BU-
scoped Roles see both; configured Marketing/Finance/Management layers may see both. Site remains distinct
from inventory Stock location, though an operational Stock location may reference a Site. Exact `@Team`
versus `@BU` delivery follows D24: Team is the normal branch-level nudge; BU is broader capability-gated fan-out.

### D37 — Team mention is branch-level fan-out; BU mention spans child Teams (owner refinement 2026-07-10)

The mention hierarchy is Person < Team < BU. `@Team` is the normal way to nudge one concrete branch/
operating group; `@BU` deliberately spans every child Team and BU-scoped Role, requires
`signal.mention_bu`, previews/deduplicates recipients, and should not be used for branch-only context.
Owning Team alone controls visibility and creates no notification. No `@Site` exists initially; mention
the relevant Team(s). Existing/future membership changes read access but never retroactively fan out old
notifications.

### D38 — Organization structure and individual assignments are fully operated in Admin Settings (owner refinement 2026-07-10)

Admin Settings is the source of truth for normal org changes. **Organization** manages create/rename/
archive/order of BUs, Sites, Teams, Signal visibility layers, and org Roles/reporting lines. **People &
access** manages each Person's primary/additional effective-dated Team memberships, org Roles, access-role
defaults, and sparse individual capability allow/deny overrides. No routine change requires SQL or a
deployment.

Team membership is stored independently from org Role and Access role. Every active app Person has one
primary Team and may have more; BU participation derives from Teams. A BU-scoped Role grants BU-wide
organizational responsibility, while assigning a Team-scoped Role requires matching Team membership.
Transfers close the old membership and start the new one rather than rewriting history. Referenced org
objects archive instead of hard-delete, and every structure/assignment/access change is audited. Admin
capabilities and last-admin safety follow ADR-0020.

### D39 — BU governs definitions; Team scopes every concrete execution record (owner refinement 2026-07-10)

Objective, Project, Process, and Standard are governed at BU scope. Signal, Task, Process Run, Shift,
Check, and Exception require one owning/executing Team; BU and optional Site derive through that Team and
cannot diverge. A Project may list participating Teams, but each Task still has one executing Team.
Cross-Team delivery uses separate Team Tasks under the shared Project rather than a multi-Team Task.

A BU-level Process may be adopted by multiple Teams. Adoption stores Team-specific cadence and generated-
work assignment defaults; every Run belongs to exactly one adopting Team and its generated Tasks inherit
that Team. Standards remain BU-canonical and adoption pins their published versions through the Process/
Team configuration. A BU with one central Team follows the same model without a special-case schema.

### D40 — Process adoption is independently versioned per Team (actor clarified by D41; owner refinement 2026-07-10)

Process A publishes an immutable BU-level version. Every current Team adoption receives its own
actionable Inbox upgrade item showing changes to steps, linked Standard pins, cadence assumptions,
generated Tasks, and assignment defaults. A person with `process.adopt` for that Team reviews the diff,
confirms Team-local cadence/assignment configuration, and selects an effective date. Process R/A and the
Team's configured operators receive the adoption event.

Publication never changes a Team adoption automatically. Started/materialized Runs retain snapshots;
future unmaterialized Runs starting on/after the effective date use the newly adopted version. A newly
adopting Team visibly starts from the latest published version and must confirm local configuration.
Adoption may pause/resume execution but cannot rewrite the BU Process. Structural change is proposed back
to Process R/A rather than silently forked. No Team RACI is added; authority is scoped capability.

### D41 — Team is scope; a Person acts through scoped Role-derived capabilities (owner correction 2026-07-10)

Teams never possess authority or “configure themselves.” A Person acts on a Team-scoped record through
`can()` inherited from admin-configured Role defaults plus individual overrides. Org Roles may map to
Access role bundles; each grant is scoped to own Team, selected Teams, BU, selected BUs, or org. The
concepts remain normalized: Team membership says where the Person participates; org Role says position/
reporting responsibility; Access role/capability says what actions are allowed.

Illustrative defaults—not hard-coded names—are: Barista/Kitchen roles execute assigned Tasks/Checks and
post/comment/acknowledge Signals in their Team; a branch Supervisor manages that Team's Tasks/Runs/Shifts
and may adopt Process versions when granted; a Bar/Kitchen Manager can hold selected-Team scope across HQ
and Radiant, author Process drafts, compare execution, and adopt for those Teams. Definition publication
still requires Process A plus publish capability. Admin Settings configures mappings/scopes and the Person
matrix shows inherited sources and overrides.

**Director assumption (reversible spec detail):** an authorized Role holder may edit only the Team-
configurable adoption parameters explicitly declared by the published Process (cadence, local references,
assignment bindings, bounded offsets, notification recipients, published optional/conditional branches).
Required structure, Checks, exception rules, Standards, purpose, and RACI require a Process revision.

## Consequences

- **ADR-0019 is substantially amended.** D1's taxonomy, D2's rail, D3's Home, and Plan/Operate
  destination guidance are superseded; surviving principles are listed in this ADR's header.
- The "five items forever" growth-test is relaxed: the rail grows by adding modules under a BU group,
  not by appending destinations. Destinations stay four (Home · Work · Money · Inbox; Operate and Plan
  fold into the module zone / Work respectively).
- Floor staff gain one-tap access to their station; the cost is a slightly longer rail (mitigated by
  BU grouping).
- Higher-level RACI (ADR-0014 #4, deferred to v2) is *directionally* affirmed on Objective,
  Project, and Process. The redesign replaces Task-level R/A language with PIC/Supervisor; legacy
  responsible/accountable storage is implementation history and not a compatibility requirement for
  the owner-authorized clean baseline.

## Considered options (rejected)

- **Keep ADR-0019 D2 strict (Operate destination hides modules).** Rejected: buries the floor's daily
  home one click deep; the owner explicitly prefers modules in the rail.
- **Flat rail (modules as peers to destinations, no BU grouping).** Rejected: recreates the original
  "several apps" failure as the module list grows; BU grouping is the discipline that prevents it.
- **Collapse to 3 destinations (Orient/Work/Inbox).** Rejected: drops Money and the module zone; the
  owner's preference is the *feel* of α's flat rail, not the 3-item count.
