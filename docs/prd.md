# Gordi MOS — Product Requirements Document

**Status:** v1.0 · written 2026-07-27 · era **E8/E9** (see `docs/requirements-evolution.md`)
**Branch of record:** `v3-redesign` (unmerged, undeployed)

> **What this document is.** A single readable statement of *what Gordi MOS is, who it is for, what is
> in scope, and what "done" means.* It is a **synthesis, not a new authority.** Every requirement here
> is derived from an existing locked source; where this document and a source disagree, **the source
> wins** and this document is the bug.
>
> **Authority order:** `docs/decisions.md` (OD-*) → `docs/adr/` (esp. ADR-0025) → `CONTEXT.md`
> (vocabulary) → `docs/experience-contract.md` + `docs/interaction-contract.md` (experience law) →
> `docs/jtbd.md` (intent oracle) → `docs/specs/*.spec.md` (per-feature FR/AC).
>
> **What this document deliberately does not do:** it does not restate the 188 owner-decision entries, define
> schema, or specify screens field-by-field. Those live in the sources above. §12 is the map.

---

## 1. Problem

Gordi is a ~30-person Indonesian F&B company (café, ecommerce, roastery, B2B) running its management
on **forked spreadsheets, WhatsApp threads, ESB reports, and a dormant Notion Management OS**. The
consequences are structural, not cosmetic:

- **Ownership is invisible.** Who is doing what, and who is watching it, is reconstructed by asking.
- **Operational truth is trapped.** What happened on the floor today lives in a chat thread that
  nobody can query next week.
- **Numbers are untrustworthy.** The same figure has three bases (BOM estimate, interim
  stock-movement, certified GL) and no surface labels which one you are looking at.
- **Nothing follows up.** Approvals, exceptions, and overdue commitments have no queue.

The dormant Notion OS failed for a specific reason worth naming: **it was a data model, not a
workplace.** Staff had to understand the object graph before they could file anything.

### Why now

MOS has **never had production users.** That is a constraint and a gift: there is no legacy data to
preserve, no user habits to protect, and no compatibility burden (OD-REDESIGN-33/34 explicitly
authorize a clean schema baseline). The window for getting the model right closes at first rollout.

---

## 2. Users

**~30 people, all internal.** No external/customer surface. Two fronts must be served *at once* —
serving only one is a design defect (OD-REDESIGN-66):

| Front | Who | Needs | Failure mode if ignored |
|---|---|---|---|
| **Obviousness** | Barista, kitchen worker, roastery operator, ecommerce packer — high-school graduate, zero training, phone-first | First-try success, work before configuration, no system jargon | They keep using WhatsApp; MOS holds no operational truth |
| **Efficiency** | Owner, managers, supervisors, finance/admin — desktop, daily, repetitive | Density, filters, multi-column scanning, fast repeated triage | Managers keep their spreadsheets; MOS becomes a second place to look |

**Mechanism:** role-adaptive disclosure (OD-REDESIGN-61) — the *same* surface defaults to capture-first
for the member and permits density for the manager. "It's clean for the barista" is not a pass if it
destroyed manager throughput, and vice versa.

### Role lenses (design review, not permission presets)

Operator/contributor · Team Supervisor · Cross-Team manager · BU governor · Finance/control specialist ·
Owner/Admin. These are review lenses. **Actual authority is always `can()` + record governance + scope**
— never a hard-coded persona (OD-REDESIGN-55). The **Deputy** is an interaction mode available to any
person within their existing authority, not a separate identity.

### Language

EN chrome, ID content (OD-P0-2). Language selection lives in Personal Profile (OD-REDESIGN-70).
**Bahasa Indonesia copy is intent-first, never literal** — word-for-word translation is a defect
(OD-REDESIGN-91 #35).

---

## 3. Product principles

1. **Make the next action obvious.** Every surface shows what needs attention and puts the action next
   to the record.
2. **The IA is boring on purpose.** Core navigation is organization-owned and stable. Users pin saved
   views; they cannot rename, hide, or reorder destinations (OD-REDESIGN-23).
3. **One record, one canonical page, many views.** Never create parallel UI lanes that imply parallel
   data truths (OD-REDESIGN-7).
4. **Phone-first capture, desktop-first review.**
5. **Gordi language.** Labels match `CONTEXT.md`. Users never see the permission machinery — they see
   "Edit draft", "Send for approval", "Publish".
6. **Honest numbers.** A figure without its basis, grain, and as-of time is a defect, not a rounding
   issue.
7. **Remove fossils.** "Redesign, be brave, nothing sacred… remove when it's needed, make it functional
   still, don't break" (OD-REDESIGN-86, owner verbatim, binding). A mockup drawing something is not
   justification for keeping it if the information already lives elsewhere.

**Anti-references:** Notion fidelity, nested database clutter, glassmorphism, neon/purple gradients,
oversized hero type, card soup, dead-end KPI tiles, gesture-only interactions, AI slop (vague copy,
ornamental motion, decorative metrics, fake-perfect numbers).

---

## 4. The domain model

The full glossary is `CONTEXT.md`. This is the shape a reader needs to understand the feature scope.

### Structure

- **BU (Business Unit)** — the functional/accountability parent. **Team** — the concrete operating
  group under exactly one BU. **Site** — an optional physical branch reference. These are three
  different things; conflating BU and Team was a corrected error (OD-REDESIGN-50).
- **Governance definitions are BU-scoped** (Objective, Project, Process, Standard).
  **Execution records are Team-scoped** (Task, Signal, Process Run, Shift, Check, Exception) and
  derive BU/Site from Team (OD-REDESIGN-53).
- A **Person** joins Teams through effective-dated memberships. **Team membership, org Role, and Access
  role are three separate assignments** (OD-REDESIGN-52).

### First-class objects

| Object | What it is | Ownership |
|---|---|---|
| **Objective** | Direction — what we're trying to achieve | RACI |
| **Project** | Bounded change work | RACI |
| **Process** | The *permanent definition* of recurring work. Never completes. | RACI |
| **Process Run** | One occurrence of a Process. Owns generated work, progress, completion, history, version snapshot. **The term "Process Run" appears nowhere in the UI** — occurrences surface as Tasks with a grouping caption (OD-REDESIGN-58). | derived |
| **Task** | The unit of owned work. **PIC + Supervisor + Team + Status + Due.** No RACI, no priority field. May be ad hoc (no parent) — "Ad hoc" is derived, never a fake parent (OD-REDESIGN-40/62). | PIC + Supervisor |
| **Standard** (SOP is a sanctioned synonym) | The versioned specification work is performed *to*. Typed steps: instruction · confirmation · measured control · required field · required evidence/sign-off. BU-canonical, no RACI. | `standard.publish` scope |
| **Check** → **Exception** → correction Task | A checkable Standard step produces a Check; a failed Check raises an Exception; an Exception raises a correction Task with evidence and audit trail. This chain is the governance value of the product. | per Standard/Process |
| **Signal** | A real-time, attributable, **factual** note. Owning Team + occurred-at + author + content. Attention = FYI / Needs attention / Urgent. **No PIC, no due date, no status, no resolution.** Action becomes a *linked* Task via a many-to-many relation — a Signal is never "promoted" or "converted" (OD-REDESIGN-33/39/43). | author + Team |
| **AR Follow-up** | Invoice-grain settlement lifecycle: counterparty, balance, age, promises/partials, evidence-gated settle. Renders as "AR Follow-up" in UI copy to avoid colliding with follow-up *Tasks* (OD-REDESIGN-91 #3). | relationship owner + Finance |
| **Shift** | Person + station/area + time window. Team-scoped. Drives check assignment and "your shift today". | roster |

### Retired — do not read older docs as current

Weekly Update (mandatory filing) · Daily Log / `ops.log_entries` auto-mirror · Task-level RACI ·
five-destination IA · department modules · Team-as-actor · global "Capture" FAB · Template as a
first-class object · expand-in-place width toggle · top-bar Create button. Each has a replacement and
a citation in `docs/redesign-decision-index.md` § Retired concepts.

---

## 5. Information architecture

**The rail shows *your* work, not the org chart** (OD-REDESIGN-68). A module renders only for a viewer
whose role belongs to that BU. Everyone reaches every authorized route via ⌘K, Home links, or direct
URL — the rail scopes *presentation*, never authorization.

| Destination | Job sentence |
|---|---|
| **Home** | "What needs my attention right now?" |
| **Work** | "Find and do the work I own or my Team owns." |
| **Events** | "See what's happening around our outlets and when." |
| **Money** *(role-gated)* | "Trust the financial figures and act on money exceptions." |
| **Inbox** | "Triage what asked for me and return to its source." |
| **Café** *(module)* | "Run today's café floor work — openings, checks, stock, shifts." |
| **Ecommerce** *(module)* | "Fulfil today's online orders against the right stock." |
| **Roastery** *(module)* | "Record today's roasts, yield, and transfers truthfully." |

Secondary: **Personal Profile**, **Admin Settings**.

**Work's children are the four object collections:** Signals · Tasks · Projects & Processes ·
Objectives. My/Team/Overdue are saved-view chips *inside* Tasks, not siblings (OD-REDESIGN-57).

**Modules are contextual views, not applications.** A Task shown in Café and in Work is *one* Task
rendered through the same contract; Café adds operational context and a filtered starting view
(OD-REDESIGN-76). A workflow earns a Module only when it has specialized records and high-frequency
interactions that the universal Work runtime cannot express. **The rail is a workflow map, never an
org chart** (OD-REDESIGN-15).

> **This top-level IA is PROVISIONAL** (OD-REDESIGN-76, owner "agree for now"). Ratification requires
> the owner driving real Home → Work → Inbox → Café journeys, as a manager and as a floor member, in
> the running app.

---

## 6. Interaction requirements

These are product requirements, not implementation notes: they are what makes the app feel like one
app. Full law: `docs/interaction-contract.md` (I1–I10) and `docs/experience-contract.md` (Rules 1–12).

- **Record opening (I1).** In-list click → shared right-side panel, ~40–45% of workspace, collection
  context preserved. Direct URL / refresh / new tab → the same content as a full canonical page.
  One renderer, two modes. Explicit "Open full page" escalates. Phone → full-screen with ordinary Back.
- **One overlay grammar (I2–I4).** One panel host, one internal Back stack. Never a second drawer over
  a record. Deputy shares the host. Search/launcher are centered temporary surfaces. Blocking
  confirmations use one centered dialog.
- **One inline-edit contract (I5).** Enter/Tab/click-outside commits; **Escape discards the uncommitted
  value and restores the saved one.** First Escape on a dirty field cancels only that field; a second
  Escape is close-intent and triggers the leave guard (OD-REDESIGN-22/83).
- **Create grammar.** No top-bar Create button — desktop uses ⌘K plus page-contextual CTAs; phone uses
  the `+` launcher with a reduced create-set. After create, return to the originating collection with
  the new row highlighted (OD-REDESIGN-91 #11/#16).
- **Composer keys.** Enter = newline, **Shift+Enter = send**, hinted near the Send button. Both
  composers (OD-REDESIGN-91 #10).
- **Feedback.** Inline "Saved" at the locus for edits; a toast only for creates that land elsewhere.
- **Shared collection engine.** Search, filter, sort, group, saved views, URL persistence, j/k
  row-walking, loading/empty/error states belong to the framework, not to each page. Feed, Table,
  Queue, Board, Calendar, Library are *presentations* over it (OD-REDESIGN-79).
- **Page anatomy is declared and checkable** (OD-REDESIGN-90). Every record kind declares its
  JTBD-ordered section order — content first and unclipped, urgency with it, actions grouped as one
  "what to do" register, provenance last and quiet. **A page whose leading section is not its content
  fails.** Spec: `docs/specs/record-page-anatomy.spec.md`.

---

## 7. Jobs to be done

Nine job families: **Orient · Create · Delegate · Triage · Execute · Coordinate · Report reality ·
Control · Administer.** 23 acceptance journeys (J01–J23) and 6 integrated scenario threads (S1–S6) are
specified in `docs/jtbd.md` — the product-intent oracle. A feature spec **selects** the journeys it
serves and converts their outcomes into EARS requirements and Given/When/Then criteria.

Reviewers grade **the outcome, never the current UI shape.**

---

## 8. Feature scope

Status vocabulary: **BUILT** = implemented on `v3-redesign` (unmerged, undeployed, acceptance not
closed — see §10). **COMMITTED** = decided and specified, not built. **DEFERRED** = decided to wait,
with a named trigger. **CUT** = decided against, with a citation.

### 8.1 Foundation

| Feature | Status | Source |
|---|---|---|
| Auth: password + magic link, admin-invite provisioning, orphan-login fails closed | BUILT | OD-P1-8/9/10 |
| RBAC: `can()` capability layer, role defaults, scope (self/Team/BU/org) | BUILT | ADR-0011/0020 |
| RLS on every business table; `org_id` seam; schema separation (`shared`/`mos`/`ops`/`integrations`/`reporting`) | BUILT | ADR-0010, OD-P4-2/3 |
| Shared app shell: rail, top bar, breadcrumb, bottom tabs, 1024 icon rail, mobile nav (opens from the **left**) | BUILT | OD-REDESIGN-84, 91 #37 |
| ⌘K command palette — navigate + search across **Tasks, Signals, AR Follow-ups** | BUILT | OD-REDESIGN-91 #4 |
| Shared RecordViewer (panel + page, one renderer) | BUILT | OD-REDESIGN-74/78 |
| Shared RecordCollection engine (search/filter/sort/group/saved views/URL state) | BUILT (Tasks, Signals) | OD-REDESIGN-79 |
| Bilingual i18n seam (typed catalog) | BUILT | ADR-0021, OD-REDESIGN-70 |
| Effective person × capability admin matrix, preview-as-person, transfer-person, org-structure config | **COMMITTED** | OD-REDESIGN-28/52 |
| Clean domain-ordered migration baseline (replacing the legacy chain) | **COMMITTED** | OD-REDESIGN-34 |
| MCP per-person adapter (seam is baseline work; transport deferred) | DEFERRED | OD-REDESIGN-35 |

### 8.2 Home

| Feature | Status | Source |
|---|---|---|
| Non-removable, role-aware attention brief — blocked/overdue work, failed Checks, Exceptions, sign-off requests, mentioned Signals, financial exceptions | BUILT | OD-REDESIGN-17 |
| Consequence-ranked stream; E7 section rhythm (chromeless sections, not card shells) | BUILT *(ranking ratified "for now")* | OD-REDESIGN-82, 91 #32 |
| Ambient Signal feed below the brief; quiet tail labelled "Recent" | BUILT | OD-REDESIGN-59, 91 #27 |
| Home rows deep-link to the full task page — **the one documented exception** to drawer-first | BUILT | OD-REDESIGN-81 #2 |
| Composable personal / Deputy widget canvas + Home region-order preference | **COMMITTED** *(or explicit ratify-defer)* | OD-REDESIGN-17/18/25/26 |

### 8.3 Work

| Feature | Status | Source |
|---|---|---|
| Tasks: dense DB-view workspace — group-by, filters, search, sort, saved-view chips, virtualization, keyboard layer, mobile grouped cards, inline title edit | BUILT | OD-P3-6, OD-REDESIGN-8 |
| Task record: Team · PIC · Supervisor · Due · status · provenance · checklist · activity · comments with @-mentions · Mark complete · Reassign. **No RACI, no priority, no bulk-select checkboxes** | BUILT | OD-REDESIGN-62/83 |
| Supervisor resolution chain (explicit → generated-definition override → parent A → PIC's BU-matching manager → self); ambiguity requires human choice, never a guess | BUILT | OD-REDESIGN-14/41 |
| Signals: composer, feed, record with revisions + acknowledgements + comments + linked work, archive collection, categories, attention levels | BUILT | OD-REDESIGN-33/39/42/43/45/47 |
| Objectives + Projects & Processes catalogs (inline manage) | BUILT | OD-C-2 |
| Objectives / Projects & Processes **record panels** | **COMMITTED** | backlog convergence-queue ④ |
| **Multi-view database — Board/Kanban, then Timeline** | **COMMITTED (HIGH)** | OD-REDESIGN-2/7/8 |
| **Standard object + quality loop** (typed steps → Check → Exception → correction Task → evidence → audit) | **COMMITTED (HIGH)** — owes a schema ADR | OD-REDESIGN-4/30/31 |
| **Process designer + occurrence record** (guided authoring, cadence, generated-work rules, version diff, per-Team adoption with effective date) | **COMMITTED (HIGH)** — owes a schema ADR | OD-REDESIGN-11/13/54/58 |
| Structured-content editor (typed canvas, `/` menu constrained by Object Contract, JSONB blocks) | **COMMITTED** — owes ADR + security review | OD-REDESIGN-16/77 |
| Cascade ladder view (Objective → Project → Task roll-up) | DEFERRED — ratify-cut or rebuild | parity ledger S7 |
| Shift scheduling / rostering | DEFERRED | OD-REDESIGN-5 |
| Blueprint (user-authored reusable definition) | DEFERRED — **evidence-gated**: only after repeated manual cross-BU copying is observed | OD-REDESIGN-29 |

### 8.4 Modules

| Feature | Status | Source |
|---|---|---|
| **Café** — opening flow, Log / Plan / Review / Stock / Pushes, KPI strip, variance & transfer gates, offline banner, role gates, leave-guard on unsaved quantities | BUILT | OD-K-1..5, OD-REDESIGN-91 #9 |
| Café: members can start the opening run | BUILT | OD-REDESIGN-71 (iii) |
| **Ecommerce** — order → picked → packed → shipped queue against Ecommerce stock | **COMMITTED** (stub today) | OD-P4, ADR-0023 |
| **Roastery** — batch inputs/yield/quality, green-lot traceability, yield costing, internal transfers | **COMMITTED** (stub today) | ADR-0023/0024 |
| Location-scoped stock + internal replenishment (Roastery → HQ retail / Ecommerce) | **COMMITTED** | ADR-0023 |
| ESB outbox integration (transactional, staging-first, **never** double-post to production GKID) | BUILT (kitchen tenant) | ADR-0012, OD-K-3/4, OD-P4-5/6 |
| **Events** destination (time/calendar lens) | **COMMITTED** (stub today) | OD-REDESIGN-57 (iii) |

### 8.5 Money (role-gated)

| Feature | Status | Source |
|---|---|---|
| Summary/Detail dashboard, period toolbar (cut · window · freshness), custom range, revenue + gross-margin KPIs, daily-revenue chart with table fallback, sortable detail | BUILT | OD-DASH-1..6 |
| **Basis labelling** — every figure carries its basis (BOM estimate / interim stock-movement / certified GL), grain, and as-of. Never a bare "COGS". | BUILT | ADR-0022, `CONTEXT.md` |
| Budget (cost scenarios linked to canonical ingredient costs) + Pricing pre-flight — **shipped enabled**; pricing check is **warn-only** in MVP | BUILT | OD-REDESIGN-91 #5, ADR-0022 |
| AR Follow-up queue — chase, promises/partials, **evidence-gated settle**, Finance confirmation, audit history. No settle-without-evidence path. | BUILT | OD-WS/J21 |
| Awaiting-sync control becomes a real snapshot refresh action | **COMMITTED** (small) | OD-REDESIGN-91 #24 |
| Metabase / third-party BI | **CUT** (third refusal) — revisit only on the ADR-0017 D4 guardrail | OD-DASH-1 |

### 8.6 Inbox & Deputy

| Feature | Status | Source |
|---|---|---|
| One canonical Inbox — full page for sustained triage, bell quick-panel for the same collection, shared read/handled state, filter-aware empty copy. Phone always full page. | BUILT | OD-REDESIGN-20, 91 #26 |
| Deputy panel — chat-first hybrid chrome (user turns bubble, Deputy prose bare, **widgets full-width, never in bubbles**), grounded sources, one Stop, record-scoped Ask | BUILT | OD-REDESIGN-91 #1, #40 |
| Deputy coexistence — never covers the open record; side-by-side when the canvas allows, compact above on phone | BUILT *(provisional)* | OD-REDESIGN-80 |
| **Agentic Deputy — the six gaps:** navigate-the-user tool · inline `@` reach into any text surface · compose-to-workspace · in-context reversible writes · per-surface threads · first-class ⌘K action | **COMMITTED (HIGH)** — this is the app's stated identity | OD-REDESIGN-9/24/32 |
| Deputy mark redesign (distinctive identity icon app-wide) | **COMMITTED** — icon proposals owed to the owner | OD-REDESIGN-91 #23 |
| Signal composer image attach | **COMMITTED** — needs Supabase storage + bucket RLS + security pass. Ships without it *deliberately*, not silently. | OD-REDESIGN-69 (i) |

### 8.7 Cut — with citation

Weekly Update filing (write + review panes, My Week page, Home strip) · Daily Log feed/filters/form ·
Home finance KPI row · Task RACI editor · record "Notes" tab · Task bulk-select checkboxes (until a
real bulk action ships) · Task Priority field · persona/impersonation switcher (its real descendant is
the admin preview-as-person) · text-size picker · settings rail stub.

**Explicitly out of product scope:** free-form conversation (stays in WhatsApp — MOS owns communication
*about work items* only) · confidential HR/legal/medical/whistleblowing content (rejected from Signal
capture; needs its own Object Contract with independent RLS, retention, and disclosure — never a boolean
on Signal, OD-REDESIGN-37) · any external/customer-facing surface.

---

## 9. Non-functional requirements

| Area | Requirement |
|---|---|
| **Usability** | A high-school graduate reaches first-try success with **zero training** (Experience Contract Rule 12). Scored as the member/least-technical persona. |
| **Accessibility** | WCAG AA: contrast, focus, keyboard access, labels, reduced motion. ≥44px touch targets where phone use is expected. Exactly one `aria-current="page"`. |
| **Responsive** | Desktop 1280 · intermediate 1024 · phone 390. Desktop mirrors mobile in *meaning*, not density. Panels become full-screen at narrow widths with the same content, Back behavior, focus contract, and canonical URL. |
| **Security** | RLS on every business table. All writes go through one capability-gated, idempotent, optimistic-concurrency-aware domain command layer — **UI, Deputy, and any future agent use the same path**. Deputy acts with the viewer's JWT/RLS, never a service-role shortcut, and cannot reveal inaccessible data through summaries. Security review is a **gating** step before any exposure. |
| **Reversibility** | **Never hard-delete as undo.** Create reverses by Archive/Restore; edits by Revert; status by compensating Undo; comments by Retract plus an audit tombstone. Downstream effects need their own correction event. |
| **Auditability** | Every consequential change audits actor, source/client, command, idempotency key, result, and reversal. |
| **Data honesty** | No figure without basis + grain + as-of. Honest unavailable/error states over plausible placeholders. Certified and interim bases are never confused. |
| **Time** | Asia/Jakarta (WIB), Monday–Sunday weeks. |
| **Quality gates** | ≥80% line coverage on changed code · `typecheck` zero errors · ESLint `--max-warnings=0` · every `AC-###` proved at its lowest sufficient layer (unit / pgTAP / curated e2e). |

---

## 10. Success measures & acceptance

### Product success

People can answer, in a few seconds: *What needs my attention? Who owns this? What happened today?
Which number is trustworthy? What do I do next?* — and the floor stops routing operational truth
through WhatsApp.

### Acceptance gates (binding, not aspirational)

| Gate | Bar |
|---|---|
| **Design score** | Nielsen-style **≥32/40** and structural anti-slop **>8.5/10**, with **no axis below the E7 baseline**, scored on Home + Tasks + Signals — apples-to-apples with the E7 27/40 baseline. |
| **Scored by** | **Luna, live-driving fresh attested renders.** Self-scoring is prohibited (a 34-vs-26 over-credit incident is why). |
| **Layered battery** | Mechanical guards (pre-merge-wired) → census protocol Steps 1–6 with artifacts → Storybook states + axe → interaction-contract conformance → Luna official verdict. **A score without its census artifacts is void.** The standalone 4-lens essay review is retired. |
| **Audit register** | `docs/audits/REGISTER.md` — each touched surface must be LOCKED or explicitly BUMPED. |
| **Review battery** | spec · code-quality always; security if auth/RLS/schema; design if any `*.tsx`/`*.css` — recorded in `docs/reviews/<branch>.md`, `pre-merge-check.sh` exit 0. **Green tests ≠ reviewed.** |
| **Owner walkthrough** | Live 1280 / 1024 / 390, manager **and** floor-member journeys. The owner's viewing is *acceptance*, never defect-hunting — any pixel defect the owner catches is a process bug whose class becomes a guard the same day. |

### Build order (binding, OD-REDESIGN-87)

**(1) Capture** every missing item into a tracked queue → **(2) Grammar** — beat the prior mockups on
UI/UX/IA/IxD, with the mechanical guard suite and Storybook in place → **(3) Score** — pass the gate
above → **(4) Features** — only then does the restoration/feature queue resume.
**Feature work before the score gate is out of order.**

### Current honest state (2026-07-27)

`v3-redesign` is **unmerged, undeployed, and not accepted.** The last independently rendered baseline
scored **26/40 · ~6–6.5/10** (E7 reference: 27/40 · ~7/10) — **below the gate**. Nine audit-register
surfaces are still DUE. The official Luna verdict is deferred ~1 week on provider quota. **Do not read
any BUILT above as "accepted".**

---

## 11. Open questions & owner gates

| # | Item | Type |
|---|---|---|
| 1 | **Phase-3 official Luna verdict** — deferred ~1 week; re-pin at the then-tip | Gate |
| 2 | **People + Inbox migration to the RecordCollection grammar** — owner wants to see the grammar working first | Owner-gated |
| 3 | **Deputy mark** — icon proposals owed as a visual round | Owner decision |
| 4 | **Top-level IA ratification** — provisional until the owner drives real journeys (§5) | Gate |
| 5 | **Home consequence ranking + Signal-on-Home** — ratified *for now*; a Home generation bump re-opens both | Provisional |
| 6 | **Money phone controls** — approved-for-now, explicitly provisional | Provisional |
| 7 | **Schema ADRs owed** — Standard typed steps · Process/occurrence · JSONB content document. Each blocks its epic. | Engineering |
| 8 | **Production deploy, staging reset, irreversible infra** — always owner-gated | Gate |

---

## 12. Where to read what

| Need | Doc |
|---|---|
| How the requirement evolved (read before trusting any older doc) | `docs/requirements-evolution.md` |
| The owner decisions themselves (188 OD-* entries) | `docs/decisions.md` |
| Map of the redesign decisions by theme | `docs/redesign-decision-index.md` |
| *Why* a decision was made — owner prompts verbatim | `docs/reference/provenance/` |
| Architecture | `docs/adr/` (esp. **0025** IA/redesign · 0010 platform · 0011 auth · 0017 agent-native · 0022 COGS/budget · 0023 inventory) |
| Vocabulary — the binding glossary | `CONTEXT.md` |
| Product intent oracle — 9 families, 23 journeys | `docs/jtbd.md` |
| Experience law — 12 blocking rules | `docs/experience-contract.md` |
| Interaction law — I1–I10 conformance table | `docs/interaction-contract.md` |
| Record section order | `docs/specs/record-page-anatomy.spec.md` |
| Design system — tokens, type, spacing, color | `DESIGN.md` |
| Brand voice, principles, anti-references | `PRODUCT.md` |
| Per-feature FR/NFR/AC | `docs/specs/*.spec.md` |
| What's next / in flight | `docs/backlog.md` · `docs/agent-context.md` (canonical state banner) |
| What quality means and who checks it | `docs/quality-model.md` · `docs/audits/REGISTER.md` |
| Charter + per-layer Definition of Done | `docs/product-expectations.md` |
| Feature parity vs. the prior build | `docs/plans/2026-07-23-feature-parity-ledger.md` |

---

*Maintenance: this document restates; it never decides. A new owner decision lands in `docs/decisions.md`
first, then this PRD is updated to match. If they diverge, `docs/decisions.md` is right.*
