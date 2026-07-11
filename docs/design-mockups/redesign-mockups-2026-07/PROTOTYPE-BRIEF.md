# E7 canonical prototype brief

**Status:** Draft for owner review · 2026-07-10. This brief governs the next HTML prototype update; it
does not authorize application code, schema changes, data resets, or deployment.

**Read first:** `../../redesign-decision-index.md` · `../../jtbd.md` ·
`../../adr/0025-ia-modules-in-rail-redesign-direction.md` · `../../../CONTEXT.md` ·
`../../../DESIGN.md` · `README.md`.

## 1. Outcome and gate

Produce **one coherent, production-fidelity interactive prototype** that lets the owner validate the E7
IA, interaction grammar, role/scope behavior, and core workflows on desktop and phone. It replaces the
current α/β/γ and per-page working files as the Phase-0 authority only after explicit owner approval.

Approval requires:

- all 23 `docs/jtbd.md` journeys represented in the coverage matrix;
- all six integrated scenario threads walkable without dead ends;
- no E7 calibration-anchor defect;
- realistic Gordi records and honest loading/empty/error/denied/stale states;
- rendered four-lens review at desktop and ≤390px phone widths;
- owner approval recorded in `docs/decisions.md`.

## 2. Product structure to prototype

### Persistent shell

- **Primary destinations:** Home · Work · Money (capability-gated) · Inbox.
- **Modules grouped by owning BU:** Retail Ops → Café, Ecommerce; B2B Ops → Roastery.
- **Utilities:** Admin Settings and Personal Profile are capability-gated utility entries, not another
  department-shaped destination zone.
- **Desktop/tablet creation:** topbar `+ Create`.
- **Phone creation:** persistent `+` FAB.
- **Shared command registry:** Share Signal · Ask Deputy/dictate · Create Task · More · at most one
  contextual action.
- **Shared right-panel host:** Inbox quick triage, Deputy, and one stack-navigated record inspector.
- **Command palette:** centered transient popup for search/navigate/act; routes persistent work into the
  shared panel.

### Canonical surfaces

- **Home:** non-removable role-aware attention brief plus personal/deputy structured canvas. The two
  regions may swap order; attention remains visible through the header count.
- **Work:** one collection/saved-view workspace for Tasks, Process Runs, Projects, Processes, Standards,
  Objectives, Signals, Follow-ups, and derived period views. No widget composer or separate Cascade.
- **Money:** certified figures, budgets, revenue/margin analysis, and financial drills; Follow-up work
  may be entered here but opens the same canonical records used by Work.
- **Inbox:** one collection with full-page and quick-panel presentations sharing state.
- **Café/Ecommerce/Roastery:** specialized high-frequency execution workspaces using the same record,
  ownership, panel, and state grammar as Work.
- **Admin Settings:** Organization and People & access sections.

## 3. Role/scope variants

The prototype may switch representative people, but UI reach must be derived from the shown Role,
capability, and scope rather than a magical persona flag.

| Representative | Shown scope | What the prototype must demonstrate |
|---|---|---|
| **Ayu — Café operator, HQ Operations** | Own Team | Shift/Run/Checks/Tasks/Signals; no Money/Admin |
| **Budi — Branch Supervisor, HQ Operations** | One Team | Manage Team execution, exceptions, Signals, adoption only if granted |
| **Rina — Café manager / Retail Ops head** | Selected HQ + Radiant Teams and Retail Ops governance | Cross-Team comparison, Process adoption, definition drafts, RACI, scoped Money |
| **Dimas — B2B Ops head** | B2B Ops + Roastery Team | Roastery execution, governed definitions, cross-functional handoffs |
| **Maya — Finance controller** | Finance BU plus permitted financial scopes | Monthly close, certified Money, Budget, settlement confirmation |
| **Arief — owner/admin** | Org | Company attention, all authorized drills, organization/access administration |

Names are realistic prototype fixtures, not approved production seed truth.

## 4. Six integrated scenario threads

### S1 — Café opening and stock opname

Start as Ayu on phone Home. Open the HQ Café opening Run, complete an instruction, form field, measured
Check, and photo evidence. A failed chiller Check creates an Exception and linked corrective Task with
visible PIC/Supervisor source. Switch to Budi on desktop Home, open the same canonical records through the
panel stack, assign/unblock work, then return to attention.

**Proves:** J01, J02, J04, J06, J10, J12, J16.

### S2 — Finance monthly close

Start as Maya from Home/Inbox. Use her scoped capability to review and adopt the Monthly Close Process
for the Finance Team, enter the July Run,
complete bank reconciliation and stock-opname-report Tasks, inspect forms/evidence, handle one Exception,
drill a certified margin figure, open a linked Budget, and settle an overdue Follow-up with cash-in date,
proof, and Finance confirmation.

**Proves:** J02, J05, J06, J09, J10, J11, J15, J19, J20, J21.

### S3 — Vendor-delay Signal

Start as Arief or Rina using the Action Launcher. Share an Urgent Signal owned by Radiant Operations,
preview `@Radiant Operations`, `@Procurement`, and selected people, then create separate Team Tasks for
menu communication, replacement supply, and customer response. Show comment, acknowledgement, revision,
and retract/repost behavior. Later surface it in the live period view.

**Proves:** J03, J04, J06, J12, J13, J14, J15.

### S4 — Standard upgrade

Publish Espresso Preparation v3 with a readable diff. Show actionable Inbox items for linked Process
A/R. As Café Opening Process A, Rina approves a definition revision adopting v3 with an effective date
(OD-REDESIGN-31 — Standard adoption belongs to the consuming definition, not to Teams); HQ and Radiant
then adopt the revised Process version on Monday and Wednesday respectively, each through an authorized
scoped Role holder and bounded local configuration (OD-REDESIGN-54). An already-started Run visibly
retains v2.

**Proves:** J03, J05, J06, J09, J11.

### S5 — Cross-Team delivery

Rina compares HQ/Radiant execution; Dimas compares Roastery supply; Ecommerce shows pick-pack SLA and
replenishment. Create an ad-hoc Task and a governed Project, demonstrate Project RACI versus Task
PIC/Supervisor, then follow linked Team Tasks and location-scoped stock across Ecommerce and Roastery.

**Proves:** J02, J03, J07, J08, J13, J15, J17, J18.

### S6 — Organization and access administration

Arief transfers a Person from HQ Operations to Radiant Operations with effective dates, assigns an org
Role and scoped Access role, changes a role default, adds an individual Deny, previews effective access,
resets it to inherited, and verifies the result by switching to that Person and asking the Deputy.

**Proves:** J03, J05, J22, J23.

## 5. Journey coverage matrix

| Journeys | Primary prototype surfaces | Scenario |
|---|---|---|
| J01–J03 | Role-aware Home variants and canonical drills | S1, S3, S5, S6 |
| J04 | Responsive Action Launcher | S1, S3 |
| J05 | Deputy panel, command palette, `@`, record context | S2, S4, S6 |
| J06 | Inbox page + quick panel + record stack | S1–S4 |
| J07–J08 | Work Tasks/Objectives/Projects/Processes | S5 |
| J09–J11 | Process designer, adoption, Run, Standard diff | S1, S2, S4 |
| J12–J15 | Signal record/composer, Task links, revisions, period view | S1, S3, S5 |
| J16 | Café Module | S1 |
| J17 | Ecommerce Module | S5 |
| J18 | Roastery Module | S5 |
| J19–J21 | Money, Budget, Follow-up record | S2 |
| J22–J23 | Admin Organization and People & access | S6 |

## 6. Interaction contracts to demonstrate

### Record navigation

- Normal relation click opens the canonical record in the shared panel; real link supports new tab.
- Related-record click inside the panel pushes onto the same stack.
- Back/browser Back pops one record with focus/scroll restoration; Close exits the full stack.
- Clicking a record already in the stack pops to it; fourth/deeper transition opens full page.
- Page and panel use one renderer with mode differences, never duplicate editors.

### Inline editing

- Enter saves/closes; Tab/Shift+Tab saves/moves; click-outside saves; Escape discards.
- Multiline Enter adds a line; Cmd/Ctrl+Enter saves.
- Invalid input remains open with an inline error.
- Pending, saved, error/retry, and practical Undo are visible.

### Creation and Deputy

- Action Launcher and command palette show only authorized commands.
- Context may prefill Team/source but never silently commits an ambiguous action.
- Deputy direct writes use the same visible records and reversal controls as human writes.
- Objective/Project/Process/Standard become Drafts; Task/Signal writes are real; consequential
  transitions preview effect and require confirmation.

### Signals

- Owning Team is required and independent of author; cross-Team ownership needs capability.
- Default visibility and explicit mentions are separately explained.
- Mention fan-out shows recipients before posting; owning Team alone does not notify.
- Attention is FYI/Needs attention/Urgent, never workflow status.
- Task creation uses the canonical Task composer and retains a many-to-many link.

### Definitions and execution

- Process/Standard versions and adoption are visibly separate transactions.
- An authorized Person acts for a Team; copy never says the Team itself decided or published.
- Local adoption exposes only contract-declared parameters.
- Existing/materialized Runs show their snapshot version.
- Task versus Checklist/form/Check/evidence boundaries remain legible.

## 7. Required state demonstrations

| State | Required example |
|---|---|
| **Loading** | Work collection or record panel skeleton preserving layout |
| **Empty** | Inbox/Signal saved view with a useful next action, not a blank card |
| **Error + retry** | Money source temporarily unavailable with last valid as-of state |
| **Permission denied** | Direct Money/Admin deep link for Ayu; explain boundary without leaking data |
| **Validation** | Inline field error and Process/Signal required-field error |
| **Pending/saved/retry** | Inline edit and Deputy write |
| **Archived/retracted** | Restorable Task and retracted Signal tombstone |
| **Stale/interim** | Financial metric with basis/freshness and canonical source |
| **Version mismatch** | Existing Run on old Process/Standard snapshot after publication |

## 8. Responsive requirements

- Validate at desktop review width, compact tablet, and ≤390px phone.
- Phone uses bottom navigation for the most relevant destinations, with remaining destinations and
  Modules reachable through a conventional menu; no desktop rail squeezed into mobile.
- Phone records occupy the full viewport; Inbox opens full-page; panel-stack semantics become page-stack
  semantics without changing URLs or Back behavior.
- High-frequency Module execution and Action Launcher remain thumb reachable; tap targets ≥44px.
- Dense desktop tables collapse into deliberate mobile record lists, not horizontally clipped grids.

## 9. Director assumptions for owner redline

These are reversible prototype choices, not new owner decisions:

- **Budget** is canonically presented in Money and opened contextually as a linked record elsewhere.
- **Admin Settings** is a gated utility entry near Profile/organization controls, not a fifth primary
  destination.
- Representative people, Teams, Sites, figures, and dates are fixtures; exact production seed truth is
  deferred to the clean-baseline spec.
- One prototype may use a single HTML shell with in-memory fixture state; file/component structure is not
  an app architecture commitment.

## 10. Explicit non-goals

- Production schema, RLS, authentication, persistence, scheduling, or MCP transport.
- Exhaustive CRUD for every object or every Role × scope combination.
- User-authored Blueprints, confidential Signals, hard delete, separate department Modules, or retired
  Weekly Update/Daily Log/Task-RACI behavior.
- Treating prototype fixtures as approved organization seed data.

## 11. Prototype review checklist

- [ ] All J01–J23 journeys are represented and traceable to S1–S6.
- [ ] Every primary/utility destination has a clear job and no duplicate Home/Dashboard/Plan/Operate area.
- [ ] Role/scope switch changes visible data and commands consistently.
- [ ] All record entry points preserve canonical URL/renderer and panel-stack behavior.
- [ ] Action Launcher, Inbox, Deputy, Signals, Process/Run, Standards/adoption, Money, and Admin are walkable.
- [ ] All fourteen `docs/jtbd.md` calibration anchors are absent.
- [ ] Required states and responsive regimes are rendered and reviewed.
- [ ] `DESIGN.md` token discipline, WCAG AA, ≥44px phone targets, and anti-slop review pass.
- [ ] Owner approves or redlines the rendered prototype before SDD begins.
