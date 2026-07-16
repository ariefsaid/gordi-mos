# Jobs-to-Be-Done map — E7 app-wide product oracle

**Status:** v0.4 — E7 redesign baseline, written 2026-07-10 from the owner-approved
OD-REDESIGN-1..55 decisions. Pending owner review of this written form before prototype implementation.

**Authority:** `docs/redesign-decision-index.md` → `docs/decisions.md` OD-REDESIGN-1..55 → ADR-0025
→ `CONTEXT.md`. This document interprets those decisions as user outcomes; it does not create new domain
rules, permissions, lifecycle states, or schema.

## 1. What this oracle governs

This is the product-intent oracle for the whole app, not only the Phase-0 prototype. It has three uses:

1. **Prototype:** every journey below must be findable and understandable with realistic simulated data.
2. **SDD/BDD:** a feature spec selects the journeys it serves and converts their outcomes into EARS
   requirements and Given/When/Then acceptance criteria.
3. **TDD/acceptance:** every criterion is proved at the lowest sufficient layer. The six integrated
   scenario threads in §5 may become curated cross-stack E2E journeys; they do not imply one E2E test per
   acceptance journey.

The Klement form remains the standard: **When _[situation]_, a _[role in scope]_ wants to
_[motivation]_, so they can _[outcome]_.** Reviewers grade the outcome, never the current UI shape.

## 2. Role lenses, not permission presets

These are representative job lenses for design review. They are not hard-coded personas, Access roles,
or permission bundles. A Person acts only through effective `can()` capabilities and record governance;
Team, BU, and org describe scope.

| Job lens | Representative context | Primary concern |
|---|---|---|
| **Operator / contributor** | Barista, kitchen worker, roastery operator, ecommerce packer, finance analyst, HR or marketing contributor | Execute assigned work and report operational truth quickly |
| **Team Supervisor** | Branch supervisor or team lead acting for one Team | Keep one Team unblocked, compliant, and on time |
| **Cross-Team manager** | Bar/Kitchen manager or functional manager scoped to selected Teams | Coordinate comparable execution without flattening Team boundaries |
| **BU governor** | Process A/R, Project A/R, Standard publisher, BU head | Govern definitions, adoption, objectives, and accountability |
| **Finance/control specialist** | Finance or authorized management scope | Verify certified figures, budgets, settlements, and evidence |
| **Owner/Admin** | Organization-wide management or authorized administrator | Direct company attention and configure structure/access safely |

The **Deputy** is an interaction mode available to any Person within their existing authority, not a
separate persona or master identity.

## 3. The nine app-wide job families

1. **Orient** — understand what needs attention now.
2. **Create** — start the right prescribed action without learning the object model.
3. **Delegate** — ask the Deputy to find, explain, compose, or act within the Person's authority.
4. **Triage** — process Inbox items and return to their canonical records.
5. **Execute** — perform Tasks and Process Runs with Checks, forms, evidence, and Exceptions.
6. **Coordinate** — supervise, assign, govern, publish, and adopt across the permitted scope.
7. **Report reality** — share, discuss, correct, and respond to Signals without turning facts into work.
8. **Control** — use trustworthy operational and financial records to make decisions.
9. **Administer** — configure organization and access without routine developer intervention.

## 4. Initial app-wide acceptance journeys

### Home and attention

| ID | Job story and outcome | Scope and canonical start | Required arrival facts and adjacent action |
|---|---|---|---|
| **J01** | When starting a shift, an operator wants to see today's Shift, Process Run, Checks, and assigned Tasks so they can begin the right work without searching. | Person in one Team · **Home** | Current Shift/Area, next required action, due/blocked work, and exceptions; open the canonical Run/Task/Check in one step. |
| **J02** | When checking one Team, a Supervisor wants to see exceptions, blocked/late work, approvals, and Signals needing attention so they can intervene before service slips. | Scoped Role holder for one Team · **Home** | Attention ordered by consequence and time, with PIC/Supervisor and source; open, assign, unblock, review, or acknowledge at the source record. |
| **J03** | When directing selected Teams, a cross-Team manager, BU governor, or owner wants a scoped operating picture so they can direct the right Person without exposing unrelated records. | Selected Teams, BU, or org · **Home** | Comparable Team health, governed work, financial/operational exceptions, freshness, and canonical drills; no sibling or BU leakage beyond effective access. |

### Creation, Deputy, and Inbox

| ID | Job story and outcome | Scope and canonical start | Required arrival facts and adjacent action |
|---|---|---|---|
| **J04** | When something must be recorded or created, a Person wants one predictable launcher so they can choose Share Signal, Ask Deputy/dictate, Create Task, More, or the single contextual action. | Effective capability · phone FAB or desktop/tablet `+ Create` | Capability-filtered commands, safe context prefill, no ambiguous default, and the same registry across form factors. |
| **J05** | When a Person wants help, they want the Deputy to find/explain records, navigate, write authorized Tasks/Signals, compose a view, or save a governed Draft so they can move faster without granting extra authority. | Same Person and scope · topbar, command palette, `@`, context, or source record | Grounded sources and proposed effect; direct low-risk writes, confirmation for consequential transitions, Draft for governed definitions, and an audited reversal path. |
| **J06** | When notified or mentioned, a Person wants to triage one Inbox and reach the source record so they can act in context and return to the queue. | Authorized Inbox collection · full page or quick panel | Unread/handled state, reason, source, actor, time, and required next action; selecting pushes the canonical record onto the shared panel stack, Back returns to Inbox. |

### Work and governance

| ID | Job story and outcome | Scope and canonical start | Required arrival facts and adjacent action |
|---|---|---|---|
| **J07** | When unplanned work appears, an authorized Person wants to create an ad-hoc Task with Team, PIC, Supervisor, and Status so the commitment is owned without inventing a parent Process or Project. | One executing Team · **Work** or Action Launcher | Required ownership, visible Supervisor source, optional parent/source links, and immediate canonical Task access. |
| **J08** | When governing change or recurring work, an Objective/Project/Process A or R wants to set RACI and see contributing work so accountability is explicit without leaking RACI onto Tasks. | BU-governed record · **Work** | Objective/Project/Process context, one A, one R, optional C/I, participating Teams, progress and linked Tasks/Runs; edit/publish only when capability and record authority both pass. |
| **J09** | When operational recurrence must be defined or upgraded, an authorized Role holder wants to design, draft, publish, and adopt a Process for a Team so future Runs use an approved definition and bounded local configuration. | BU definition plus one Team adoption · **Work** | Typed contract sections, RACI, linked Standards, generated-work rules, version diff, allowed local parameters, effective date, and explicit adoption; no Team-as-actor or silent upgrade. |
| **J10** | When a scheduled occurrence starts, an operator or Supervisor wants to execute a Process Run so every independent responsibility, lightweight step, form value, Check, evidence item, and Exception has the correct boundary and history. | One executing Team · Home, Work, or Module | Definition/version snapshot, Run progress, Tasks, Checklist items, typed inputs, evidence, pass/fail Checks, Exceptions, and corrective Tasks; completion makes every incomplete/failed requirement and permitted exception explicit. |
| **J11** | When a Standard changes, its publisher and each consuming Process/Project A want to review and adopt the new version so future execution improves without rewriting active Runs. | BU Standard and consuming definitions · **Work** | Immutable version, human-readable diff, affected consumers, Inbox notifications, adoption/effective date per consumer, and snapshots retained for existing/materialized Runs. |

### Signals and management cadence

| ID | Job story and outcome | Scope and canonical start | Required arrival facts and adjacent action |
|---|---|---|---|
| **J12** | When something relevant happens, a Person wants to share a factual Signal for the affected Team so the right audience knows without creating fake ownership or lifecycle. | Owning Team plus layered visibility · Launcher, Home, Work, or Module source | Occurred-at, author, owning Team, attention, optional category/source, mention preview, comments, and optional Acknowledge; no PIC, Supervisor, due date, Status, or resolution. |
| **J13** | When a Signal requires action across Teams, an authorized Person wants to mention the relevant audience and create/link one or more Tasks so commitments are owned while the Signal remains factual. | Cross-Team capability and explicit mentions · Signal record | Visibility/notification preview, linked-work deduplication, one Team per Task, canonical Task composer, and many-to-many links; never promote or convert the Signal. |
| **J14** | When a posted Signal is wrong, its author or authorized deputy wants to correct or retract it so readers see an honest history rather than a silent rewrite. | Signal correction rights · Signal record | Visible immutable revisions for correctable fields; owning Team/source immutable; wrong provenance requires retract + repost; retraction reason and tombstone, no hard delete. |
| **J15** | When reviewing a period, a manager wants Today/This week/Last week views sourced from real work and Signals so they understand progress and disruption without chasing mandatory filings. | Authorized Work/Home scope · period view | As-of time, Tasks, Projects, Runs, Exceptions, Signals, and domain events with canonical links; no Draft/Submitted/missing-update lifecycle. |

### Operational Modules

| ID | Job story and outcome | Scope and canonical start | Required arrival facts and adjacent action |
|---|---|---|---|
| **J16** | When operating Café, an operator or Supervisor in a branch Team wants one workspace for Kitchen/Bar Areas, Shifts, opening/closing or stock-opname Runs, Checks, stock, and Exceptions so floor work is fast without separate mini-apps. | Café Module for one Team/Site · **Café** | Area and Team context, shift assignments, required work, location-scoped stock, Standards/Checks and exception response; cross-Team records remain linked, not merged. |
| **J17** | When fulfilling ecommerce orders, an operator or Supervisor wants to see order→picked→packed→shipped work and replenishment needs so orders leave on time against the correct stock location. | Ecommerce Team · **Ecommerce** | Queue, SLA risk, PIC/Supervisor Tasks, Ecommerce stock, internal replenishment, Signals/Exceptions, and source-order link; act on the next fulfilment state. |
| **J18** | When roasting coffee, an operator or Supervisor wants to record batch inputs/yield/quality, location stock, and internal transfers so traceability and replenishment remain trustworthy. | Roastery Team/Site · **Roastery** | Green lot, batch, actual yield/shrink, required Checks/evidence, Roastery stock, destination transfer, and exception response; no global stock total. |

### Money and financial control

| ID | Job story and outcome | Scope and canonical start | Required arrival facts and adjacent action |
|---|---|---|---|
| **J19** | When a financial or operational figure is off, an authorized viewer wants to see its basis, freshness, and contributing records so they can direct action rather than stare at a dead-end KPI. | Capability-gated Team/BU/org scope · **Money** or Home drill | Certified definition, grain, as-of/source, interim versus certified basis, comparison, and canonical drill target; honest unavailable/error states. |
| **J20** | When costing a menu/promo/branch scenario, an authorized Person wants to create or use a Budget linked to canonical ingredient costs so pricing never relies on a stale copied sheet. | Finance/Procurement/authorized consumer · **Money**, opened contextually elsewhere | Linked BOM and cost lines, freshness/owner, scenario assumptions, evidence and affected work; consumers link the same Budget record rather than embed values. |
| **J21** | When collecting an outstanding amount, the relationship owner and Finance want to chase, record promises/partials, and settle with evidence so MOS holds trustworthy invoice/tab-grain settlement truth. | Scoped Follow-up queue · **Work** or Money drill | Counterparty, amount/balance, age, lifecycle, owner, cash-in date, proof, and audit history; Finance confirmation required for settlement, with no settle-without-evidence path. |

### Organization and access administration

| ID | Job story and outcome | Scope and canonical start | Required arrival facts and adjacent action |
|---|---|---|---|
| **J22** | When Gordi's structure changes, an authorized admin wants to configure BUs, Sites, Teams, Roles, reporting lines, and effective-dated memberships so execution scope and history stay correct without SQL. | Organization administration · **Admin Settings** | Primary/additional Team membership, Role scope, reporting line, effective dates, derived BU, archive safeguards, impact preview, and audit history. |
| **J23** | When access needs adjustment, an authorized admin wants to configure Access-role defaults and sparse individual Allow/Deny overrides so exceptions are explicit without copying a full matrix per Person. | People & access administration · **Admin Settings** | Effective Inherited/Allowed/Denied state, source, scope, reset-to-default, protected capabilities, last-admin safety, before/after preview, and audit history. |

## 5. Six integrated scenario threads

These are narrative compositions for the prototype and likely curated E2E journeys. They do not reduce
the 23-journey product baseline.

| Scenario | Narrative spine | Journeys exercised |
|---|---|---|
| **S1 — Café opening and stock opname** | An HQ operator starts from Home, enters today's Café Run, completes Checks/evidence, sees a failed Check become an Exception/corrective Task, and the Supervisor intervenes. | J01, J02, J04, J06, J10, J12, J16 |
| **S2 — Finance monthly close** | Maya uses scoped capability to adopt the monthly-close Process for the Finance Team, executes reconciliation Tasks/forms/evidence, reviews certified figures/Budget links, handles an Exception, and settles a Follow-up with proof. | J02, J05, J06, J09, J10, J11, J15, J19, J20, J21 |
| **S3 — Vendor-delay Signal** | Management reports a vendor delay for Radiant Operations, previews cross-Team mentions, creates separate Tasks, acknowledges/corrects the Signal, and later sees it in a period view. | J03, J04, J06, J12, J13, J14, J15 |
| **S4 — Standard upgrade** | A Standard publisher releases a new version; consuming Process A/R review diffs, adopt with effective dates, and existing Runs retain their snapshots. | J03, J05, J06, J09, J11 |
| **S5 — Cross-Team delivery** | A selected-Team manager compares HQ/Radiant and Ecommerce/Roastery execution, creates ad-hoc and governed work, and coordinates replenishment without cross-Team Tasks or global stock. | J02, J03, J07, J08, J13, J15, J17, J18 |
| **S6 — Organization and access administration** | An admin transfers a Person between Teams, assigns scoped Roles, adjusts an Access-role default and individual Deny, and verifies effective access through the Deputy. | J03, J05, J22, J23 |

## 6. Cross-cutting pass conditions

Every relevant journey must satisfy these conditions:

- **Authority:** a Person acts through effective capability plus record governance; Team is scope, never
  the autonomous actor. Hidden commands and denied deep links resolve honestly.
- **Canonicality:** every first-class record has one URL/renderer. Record links open the shared panel
  stack by default; Back returns one level; no nested physical drawers or embedded duplicate editors.
- **Ownership:** Tasks use PIC + Supervisor; Objective/Project/Process use RACI; generated ownership shows
  its source and ambiguous Supervisor resolution asks rather than guesses.
- **Truth:** Signals remain facts; Exceptions remain failed-check outcomes; Tasks hold commitments;
  certified/reference records link rather than copy.
- **Reversal:** archive/restore, field revert, compensating undo, Signal retraction, and comment tombstones
  replace hard deletion.
- **Responsive access:** phone supports fast execution/capture with ≥44px targets; desktop supports dense
  review; the information hierarchy and command meanings remain the same.
- **States:** loading, empty, error/retry, validation, pending/saved, permission-denied, archived/retracted,
  and stale/unavailable data states are explicit where they affect the journey.
- **Language:** use `CONTEXT.md`; no Weekly Update, Daily Log, Task RACI, Capture, Operate, Plan,
  Dashboard-as-destination, Team-as-actor, or user Template vocabulary.

## 7. Lens-D questions

For each journey and Role/scope:

1. **Job:** what outcome did the Person come to accomplish?
2. **Expectation:** is the action where they conventionally expect it, named in Gordi language?
3. **Priority:** are the decision-relevant facts visible before secondary composition or analysis?
4. **Actionability:** can they take the next authorized action adjacent to the evidence?
5. **Mental-model consistency:** do fact, work, governance, visibility, and canonical-record boundaries
   behave the same across entry points?

## 8. E7 calibration anchors — defects Lens D must catch

| Anchor | Deliberate defect |
|---|---|
| **A1** | A Signal receives workflow Status, PIC/Supervisor, due date, resolution, or an Approve/Close action. |
| **A2** | Acknowledge is treated as commitment, or a Signal is promoted/converted into a Task rather than linked. |
| **A3** | A sibling Team reads a Signal without layered reach or an explicit Person/Team/BU mention. |
| **A4** | A Task displays RACI or a governed Objective/Project/Process displays only PIC/Supervisor. |
| **A5** | Copy says a Team publishes/adopts/configures instead of showing the scoped Person and capability. |
| **A6** | A relation opens a nested drawer or a second record editor instead of the canonical panel/page renderer. |
| **A7** | Publishing a Process or Standard silently changes Team adoption, consuming definitions, or active Runs. |
| **A8** | A Budget/reference value is copied into another record instead of linked to the canonical source. |
| **A9** | A Follow-up reaches Settled without cash-in date, proof, and required Finance confirmation. |
| **A10** | A metric lacks certified definition, basis, freshness, honest unavailable state, or a canonical drill. |
| **A11** | Stock is shown globally without Team/Site/stock-location context. |
| **A12** | Routine events automatically flood Signals without a deliberate share or published anomaly rule. |
| **A13** | Sensitive HR/legal/medical/whistleblowing content is offered a Restricted Signal mode. |
| **A14** | Deputy gains broader access, bypasses confirmation, or cannot explain/reverse its write. |

## 9. Evolution rule

This is the initial app-wide baseline, not a ceiling. Each signed feature spec may refine a journey or
add one when it introduces a genuinely new user outcome. It must not rewrite a journey merely to match
the current implementation. Strategic priority or business semantics return to the owner; reversible
screen composition and test-layer allocation remain Director/engineering decisions.
