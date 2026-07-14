# E7 Canonical Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one standalone, production-fidelity E7 HTML/CSS/JS prototype that demonstrates all J01–J23 journeys through S1–S6 while preserving the latest prototype's Warmer Quiet Control Surface styling.

**Architecture:** Add a new canonical candidate at `e7-prototype.html` and leave every earlier prototype untouched as history. The candidate uses focused ES-module files: fixtures/coverage, destination views, canonical record renderers, and shell/interaction state. It is static and in-memory, but one router, one record renderer, one panel stack, one capability registry, and one responsive interaction grammar must make it behave like one app.

**Tech Stack:** Semantic HTML5 · CSS custom properties · vanilla ES modules · existing `icons.js` SVG registry · Node 22 static verifier · `python3 -m http.server` · `agent-browser` for rendered journey verification.

## Global Constraints

- Read `docs/jtbd.md`, `PROTOTYPE-BRIEF.md`, ADR-0025, `CONTEXT.md`, `PRODUCT.md`, and `DESIGN.md` before edits.
- Preserve the latest prototype's **Warmer Quiet Control Surface**: its warm neutral palette, larger type scale, restrained density, borders/shadows, and calm blue interaction color. This is an IA/IxD redesign, not a visual repaint.
- Do not modify or delete existing HTML/CSS/JS prototype files. New E7 files are additive until owner approval.
- Static fixtures only: no backend, auth, RLS, migrations, network data, new dependency, reset, deploy, push, PR, merge, or commit.
- All J01–J23 must appear in `data-journey`; S1–S6 in `data-scenario`; A1–A14 defects must be absent.
- A Person acts through shown capabilities and record governance; Team is scope, never the actor.
- Task = Team + PIC + Supervisor + Status. RACI exists only on Objective/Project/Process.
- Signal is factual: no PIC, Supervisor, due date, workflow Status, resolution, confidential mode, or conversion/promotion.
- One URL/renderer per record; one stack-navigated panel; never nested physical drawers.
- Process/Run and Standard publication/adoption remain separate and versioned; existing Runs retain snapshots.
- Phone `+` FAB and desktop/tablet `+ Create` use one prescribed Action Launcher registry.
- Phone target width: 390px and below; all actionable phone targets are at least 44px.
- Budget appears canonically in Money and links elsewhere; Admin Settings is a gated utility. Both remain visibly labeled Director assumptions in the prototype notes.
- Owner reviews the rendered artifact before README promotion, SDD, commit, or implementation.

## File Responsibility Map

| File | Responsibility |
|---|---|
| `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.html` | One semantic shell, accessible landmarks, root hosts, noscript/notes, stylesheet/module entrypoints |
| `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css` | Warmer identity tokens, shell, primitives, destination layouts, panel/modal, responsive regimes, explicit states |
| `docs/design-mockups/redesign-mockups-2026-07/e7-data.js` | Immutable people/capabilities, records, S1–S6 fixtures, J01–J23/A1–A14 traceability metadata |
| `docs/design-mockups/redesign-mockups-2026-07/e7-records.js` | One canonical renderer registry for Task/Signal/Objective/Project/Process/Run/Standard/Exception/Budget/Follow-up and panel/page modes |
| `docs/design-mockups/redesign-mockups-2026-07/e7-views.js` | Home, Work, Money, Inbox, Café, Ecommerce, Roastery, Admin destination renderers |
| `docs/design-mockups/redesign-mockups-2026-07/e7-app.js` | Hash router, effective-person switch, capability filtering, Action Launcher, command popup, panel stack, inline editing, fixture mutations, state demos |
| `docs/design-mockups/redesign-mockups-2026-07/verify-e7-prototype.mjs` | Dependency-free static coverage/contract verifier for files, IDs, forbidden terms/patterns, and source structure |
| `docs/design-mockups/redesign-mockups-2026-07/shots/e7/` | Owner-facing desktop/phone screenshots created during final verification |
| `docs/design-mockups/redesign-mockups-2026-07/README.md` | After verification only: point to E7 candidate and retain prior files as history; never claim owner approval |

---

### Task 1: Establish the additive E7 shell and visual baseline

**Coverage:** J04 foundation · all scenarios · responsive shell · visual continuity.

**Files:**
- Create: `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.html`
- Create: `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css`

**Interfaces:**
- Consumes: `DESIGN.md`, `base.css`, latest `prototype.html`, `icons.js`.
- Produces: `#e7-app`, `#e7-main`, `#e7-panel-host`, `#e7-modal-host`, `[data-nav]`, `[data-person-switch]`, `[data-action-launcher]` hosts used by all later tasks.

- [ ] **Step 1: Write the semantic HTML shell**

Create the page with exactly one header, desktop rail, main landmark, mobile navigation, shared panel host, modal host, live region, and module entrypoint:

```html
<div id="e7-app" class="e7-app" data-view="home">
  <header class="e7-topbar">
    <a class="e7-brand" href="#/home" aria-label="Gordi MOS Home">Gordi MOS</a>
    <div id="e7-context-label" aria-live="polite"></div>
    <button data-command-trigger aria-label="Search and commands">⌘K</button>
    <button data-deputy-trigger>Ask Deputy</button>
    <button data-action-launcher>+ Create</button>
    <button data-person-switch aria-haspopup="menu">Ayu · HQ Operations</button>
  </header>
  <aside class="e7-rail" aria-label="Primary navigation">
    <nav id="e7-primary-nav"></nav>
    <div id="e7-module-nav"></div>
    <nav id="e7-utility-nav" aria-label="Utilities"></nav>
  </aside>
  <main id="e7-main" tabindex="-1"></main>
  <nav class="e7-mobile-nav" aria-label="Mobile navigation">
    <a href="#/home" data-nav="home">Home</a>
    <a href="#/work" data-nav="work">Work</a>
    <a href="#/inbox" data-nav="inbox">Inbox</a>
    <button data-mobile-menu aria-haspopup="menu">More</button>
  </nav>
  <button class="e7-fab" data-action-launcher aria-label="Create">+</button>
</div>
<aside id="e7-panel-host" aria-live="polite"></aside>
<div id="e7-modal-host"></div>
<div id="e7-live" class="sr-only" aria-live="polite"></div>
<script src="icons.js"></script>
<script type="module" src="e7-app.js"></script>
```

- [ ] **Step 2: Reproduce the latest Warmer styling as named E7 tokens**

Use the actual latest-prototype token values, not newly invented colors. At minimum define and use:

```css
:root {
  --e7-bg: hsl(40 30% 99%);
  --e7-surface: hsl(40 30% 99%);
  --e7-surface-subtle: hsl(38 22% 97%);
  --e7-text: hsl(30 8% 12%);
  --e7-text-muted: hsl(30 6% 35%);
  --e7-border: hsl(38 18% 90%);
  --e7-brand: hsl(210 40% 24%);
  --e7-action: hsl(225 75% 55%);
}
```

Typography, spacing, radii, shadows, and density must be traced to `DESIGN.md`/latest prototype; no gradient hero, glass, purple accent, floating card soup, or decorative KPI.

- [ ] **Step 3: Add the three responsive regimes**

Desktop ≥1100px shows rail + contextual panel; tablet 768–1099px uses overlay panel; phone ≤767px hides rail, uses bottom navigation, full-page record stack, and visible 56px FAB. Add `@media (max-width: 390px)` checks for no horizontal overflow and ≥44px targets.

- [ ] **Step 4: Serve and visually smoke-test the empty shell**

Run from the prototype directory:

```bash
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/e7-prototype.html`. Expected: Warmer styling visibly matches the latest prototype; Home shell renders at desktop and 390px with no content overlap.

---

### Task 2: Define fixtures, capabilities, routes, and traceability

**Coverage:** J01–J23 metadata · S1–S6 · A1–A14 · role/scope variants.

**Files:**
- Create: `docs/design-mockups/redesign-mockups-2026-07/e7-data.js`
- Create: `docs/design-mockups/redesign-mockups-2026-07/verify-e7-prototype.mjs`

**Interfaces:**
- Consumes: Task 1 hosts.
- Produces: `people`, `records`, `scenarios`, `journeys`, `routes`, `can(person, capability, scope)`, and verifier constants imported by later modules.

- [ ] **Step 1: Encode representative people and effective capabilities**

Export Ayu, Budi, Rina, Dimas, Maya, and Arief with explicit Team/BU/org scopes. Implement a pure fixture helper:

```js
export function can(person, capability, scope) {
  const deny = person.denies?.some(rule => matches(rule, capability, scope));
  if (deny) return false;
  return person.allows?.some(rule => matches(rule, capability, scope))
    || person.roleGrants.some(rule => matches(rule, capability, scope));
}
```

The UI may explain this fixture result, but must not pretend it is production authorization.

- [ ] **Step 2: Encode one connected record graph**

Fixtures must share IDs across scenarios: HQ/Radiant Café Runs, Monthly Close Process/Run, Espresso Standard v2/v3, vendor-delay Signal, linked Team Tasks, Ecommerce orders/stock, Roastery batch/transfer, certified metric, Budget, Follow-up, BUs/Sites/Teams/Roles/access overrides. Every Task fixture contains `teamId`, `picId`, `supervisorId`, `status`; governed records carry RACI.

- [ ] **Step 3: Encode exact route and coverage registries**

```js
export const journeys = Array.from({ length: 23 }, (_, i) => `J${String(i + 1).padStart(2, '0')}`);
export const scenarios = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
export const anchors = Array.from({ length: 14 }, (_, i) => `A${i + 1}`);
export const routes = ['home','work','money','inbox','cafe','ecommerce','roastery','admin'];
```

- [ ] **Step 4: Write the dependency-free verifier first and confirm it fails**

The verifier reads all E7 source files and fails until later tasks add every `data-journey`, `data-scenario`, route renderer, record renderer, state demo, and responsive marker. It also rejects intended UI strings matching retired destinations/objects and rejects Signal fixtures with work fields.

Run:

```bash
node verify-e7-prototype.mjs
```

Expected now: non-zero with named missing coverage such as `missing J01` and `missing route home`.

---

### Task 3: Build the canonical record renderer and panel/page navigation

**Coverage:** J06–J14, J19–J21 · A4–A7 · canonicality contract.

**Files:**
- Create: `docs/design-mockups/redesign-mockups-2026-07/e7-records.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-app.js` (create module entry and router)
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css`

**Interfaces:**
- Consumes: `records`, `can`, Task 1 hosts.
- Produces: `renderRecord(id, { mode })`, `openRecord(id)`, `openRecordPage(id)`, `panelBack()`, `closePanel()`, one `state.panelStack`.

- [ ] **Step 1: Implement one renderer registry**

```js
const recordRenderers = {
  task: renderTask,
  signal: renderSignal,
  objective: renderObjective,
  project: renderProject,
  process: renderProcess,
  run: renderRun,
  standard: renderStandard,
  exception: renderException,
  budget: renderBudget,
  followup: renderFollowup,
};
export function renderRecord(id, { mode = 'panel' } = {}) {
  const record = records[id];
  if (!record) return `<section role="alert">Record not found</section>`;
  const renderer = recordRenderers[record.type];
  if (!renderer) return `<section role="alert">Unsupported record type</section>`;
  return `<article class="e7-record e7-record--${mode}" data-record-id="${id}">
    ${renderer(record, { mode })}
  </article>`;
}
```

Mode may change layout density, never fields, actions, or identity.

- [ ] **Step 2: Implement the single navigation stack**

Normal record links call `openRecord`; modifier/new-tab uses their real `href`. If an ID already exists in the stack, pop to it. Level four escalates to `#/record/<id>`. Browser Back and panel Back restore the prior source/record; Close clears the full stack.

- [ ] **Step 3: Implement record-specific semantic invariants**

Task shows PIC/Supervisor, never RACI. Objective/Project show RACI (one A, R, optional C/I), participating Teams, progress, and linked work — never PIC/Supervisor on the governed record itself. Signal shows author/owning Team/attention/mentions/comments/acknowledgement and linked work, never work lifecycle. Process/Standard show version, diff/adoption state and the acting Person. Run shows snapshots. Budget links cost sources. Follow-up cannot settle without cash date/proof/Finance confirmation.

- [ ] **Step 4: Verify navigation with agent-browser**

Start with `agent-browser skills get core --full`, then open the page, click Process → Task → Standard relations, assert only one panel host exists, Back returns Task then Process, Close restores the source, and a fourth push opens the full page.

---

### Task 4: Build Home, Action Launcher, Deputy, and Inbox

**Coverage:** J01–J06 · S1/S2/S3/S6 · A3/A5/A14.

**Files:**
- Create: `docs/design-mockups/redesign-mockups-2026-07/e7-views.js` (Home/Inbox first)
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-app.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css`

**Interfaces:**
- Consumes: `renderRecord`, people/capabilities/routes.
- Produces: `renderHome(person)`, `renderInbox(person)`, `openLauncher(context)`, `openDeputy(context)`, `openCommandPalette()`.

- [ ] **Step 1: Render role-aware Home variants**

Use one Home renderer with authorized sections. Attention is non-removable and ordered by consequence/time. Personal canvas is structurally distinct and can appear above/below via fixture preference; when first, header still shows `Needs attention · N`. Every row/metric drills canonically.

- [ ] **Step 2: Implement one responsive Action Launcher registry**

Desktop and phone triggers call the same function. Stable commands are ordered Share Signal, Ask Deputy/dictate, Create Task, More, then at most one context action. Filter with `can`; Ayu sees no Money/Admin commands.

- [ ] **Step 3: Implement the Deputy fixture conversation and writes**

Provide grounded examples for finding overdue work, navigating, direct Task/Signal creation, Home view proposal, governed Process/Standard Draft, consequential confirmation, and Undo/archive/retract. Display actor, sources, proposed effect, and reversal. Deputy never expands access.

Demonstrate all six PMO gap closures (ADR-0025 D5): (1) inline `@` deputy reach inside at least one text surface; (2) deputy navigates the user to a record; (3) a composed widget drops into Home as an accepted Proposal, not into the panel transcript; (4) deputy is a first-class command-palette action, not a fallback; (5) a write bound to the live in-context record; (6) a per-surface thread scoped to the current record/view, distinct from the global thread.

- [ ] **Step 4: Implement canonical Inbox page/quick panel**

Both read one item list/read state. Desktop quick panel pushes source records; Back returns to Inbox. Phone navigation opens Inbox full-page. Include unread, handled, empty, and permission-filtered fixtures.

---

### Task 5: Build Work, Process/Run, Standard adoption, Signals, and period views

**Coverage:** J07–J15 · S1–S5 · A1–A8/A12/A13.

**Files:**
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-views.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-records.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-app.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css`

**Interfaces:**
- Consumes: canonical record/panel APIs.
- Produces: Work collections/saved views, typed Process designer, Run executor, Standard diff/adoption, Signal composer/correction/linking, live period view.

- [ ] **Step 1: Render one Work collection workspace**

Collections: Tasks, Runs, Projects, Processes, Standards, Objectives, Signals, Follow-ups, Period views. Use one toolbar/view grammar with saved filters/sorts/fields. No widgets, separate Cascade, Plan, Reference, or Weekly Updates.

- [ ] **Step 2: Implement conventional inline editing**

Enter/Tab/click-outside save; Escape restores; multiline Cmd/Ctrl+Enter saves; invalid values remain open; pending/saved/error/retry and Undo are visible. Use one `[data-inline-cell]` primitive across table and record modes.

- [ ] **Step 3: Implement Process design/publish/adoption**

Typed sections show contract-required fields and generated-work boundaries. A named Person publishes with capability + Process A authority. Adoption diff exposes only cadence, local references, assignment bindings, bounded offsets, recipients, and published optional branches; existing Runs show old snapshots.

The Process designer (and at least one Project or Standard detail) renders as a typed structured canvas (OD-REDESIGN-16): pinned required properties that cannot be removed, a `/` insert menu offering only contract-valid objects (generated Task definition, Checklist item, measured Check, input field, evidence requirement, sign-off), and visible autosave pending/saved/validation-error states — no separate view/edit mode.

- [ ] **Step 4: Implement Run execution and Standard upgrade**

Run displays Task versus Checklist/form/Check/evidence boundaries, exception/corrective link, and explicit incomplete/failed requirements. Standard v3 publication creates consumer Inbox items; HQ/Radiant adopt on different effective dates; started v2 Run stays v2.

- [ ] **Step 5: Implement Signal share/respond/correct flows**

Mention preview separates visibility from notification. Comments and Acknowledge do not create commitment. `Create follow-up Task` uses canonical Task composer and many-to-many link. Correction creates revision; wrong provenance requires retract + repost. Sensitive categories show outside-channel guidance, never Restricted Signal.

- [ ] **Step 6: Implement Today/This week/Last week live views**

Show as-of time and sourced Tasks/Projects/Runs/Exceptions/Signals/events, all linked. No filing, missing-submission, Draft, or Submitted concepts.

---

### Task 6: Build Café, Ecommerce, and Roastery Modules

**Coverage:** J16–J18 · S1/S5 · A11/A12.

**Files:**
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-views.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-app.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css`

**Interfaces:**
- Consumes: records/panel/inline/action APIs.
- Produces: `renderCafe`, `renderEcommerce`, `renderRoastery` using shared primitives and Team/Site context.

- [ ] **Step 1: Build Café execution workspace**

One branch Team context, Kitchen/Bar Areas, Shift, opening/stock-opname Run, Checks/evidence, stock location, exception/Task. HQ/Radiant switch changes scope; it never merges Team records.

- [ ] **Step 2: Build Ecommerce execution workspace**

Order→picked→packed→shipped queue, SLA risk, PIC/Supervisor Task, Ecommerce stock and internal replenishment link. Use same record/panel grammar.

- [ ] **Step 3: Build Roastery execution workspace**

Green lot, roast batch, actual yield/shrink, quality Checks/evidence, Roastery stock and destination transfer. Every stock figure names location and Team/Site context.

---

### Task 7: Build Money, Budget, and Follow-up control flows

**Coverage:** J19–J21 · S2 · A8–A11.

**Files:**
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-views.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-records.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-app.js`

**Interfaces:**
- Consumes: capability filtering and canonical record APIs.
- Produces: certified metric drill, Money error/stale states, linked Budget, evidence-gated Follow-up settlement.

- [ ] **Step 1: Render Money as a control surface, not a second Home**

Show revenue, interim/certified gross margin, AR/AP/cash position with basis/freshness/source and canonical drill targets. Ayu cannot see the nav item; denied direct route reveals no figures.

- [ ] **Step 2: Render canonical Budget record**

Linked BOM/ingredient cost records show owner, freshness and scenario assumptions. Contextual Project/Task links open this same record; never copy its value into another editor.

- [ ] **Step 3: Implement Follow-up lifecycle proof**

Chased → Promised → Partial → Settled. Settled requires cash-in date, proof, and Maya/Finance confirmation. Show validation if missing and audit/reversal after success.

- [ ] **Step 4: Demonstrate source failure honestly**

Fixture toggle shows `Source temporarily unavailable`, last valid as-of result, Retry, and no fabricated zero/progress.

---

### Task 8: Build Organization and People & access administration

**Coverage:** J22–J23 · S6 · A5/A14.

**Files:**
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-views.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-app.js`
- Modify: `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css`

**Interfaces:**
- Consumes: people/capability fixtures.
- Produces: organization tree/editor, membership transfer preview, effective-access matrix and persona verification.

- [ ] **Step 1: Build Organization section**

BU/Site/Team/Role/reporting-line views with archive-not-delete, effective dates, one primary Team plus additional memberships, derived BU, and impact/audit preview.

- [ ] **Step 2: Build People & access section**

Matrix cells show Inherited/Allowed/Denied, source and scope. Demonstrate role-default change, individual Deny, Reset, protected capability, last-admin safety, and before/after audit.

- [ ] **Step 3: Verify by switching Person**

After fixture changes, switch to the target Person: nav/data/launcher/Deputy reflect effective access consistently. Admin actions remain performed by Arief, never by “the Team.”

---

### Task 9: Complete states, accessibility, responsive behavior, and journey wiring

**Coverage:** all J/S/A · nine state examples · desktop/tablet/phone.

**Files:**
- Modify: all E7 files.
- Test: `verify-e7-prototype.mjs`.

**Interfaces:**
- Consumes: every prior renderer/action.
- Produces: fully wired prototype and green static verifier.

- [ ] **Step 1: Add explicit state gallery controls**

Wire loading, empty, error/retry, permission denied, validation, pending/saved/retry, archived/retracted, stale/interim, and version mismatch to real surfaces—not detached decorative cards.

- [ ] **Step 2: Add exact journey/scenario markers**

Each primary journey affordance carries `data-journey="Jxx"`; scenario switch/steps carry `data-scenario="Sx"`. A hidden developer coverage dialog may list mappings, but user UI must remain natural.

- [ ] **Step 3: Complete keyboard and accessibility behavior**

Visible focus, Escape semantics, focus trap/return for popup/panel, `aria-expanded`, labeled forms, semantic headings/landmarks, no color-only status, reduced motion, and logical Tab order.

- [ ] **Step 4: Run static verification to green**

```bash
node verify-e7-prototype.mjs
```

Expected: `PASS: J01-J23 · S1-S6 · A1-A14 contracts · 9 states · 3 responsive regimes`.

- [ ] **Step 5: Run source hygiene checks**

```bash
git diff --check
rg -n "Weekly Update|Daily Log|Task RACI|Restricted Signal|Team (publishes|adopts|configures)" e7-*.{html,js,css}
```

Expected: diff check clean; no intended-UI matches (historical/prohibition comments may be explicitly allowlisted by verifier).

---

### Task 10: Render-walk all scenarios and prepare the owner artifact

**Coverage:** final J01–J23/S1–S6/A1–A14 gate and visual-taste review.

**Files:**
- Create: `docs/design-mockups/redesign-mockups-2026-07/shots/e7/desktop-home.png`
- Create: `docs/design-mockups/redesign-mockups-2026-07/shots/e7/desktop-work.png`
- Create: `docs/design-mockups/redesign-mockups-2026-07/shots/e7/desktop-signal.png`
- Create: `docs/design-mockups/redesign-mockups-2026-07/shots/e7/desktop-admin.png`
- Create: `docs/design-mockups/redesign-mockups-2026-07/shots/e7/phone-home.png`
- Create: `docs/design-mockups/redesign-mockups-2026-07/shots/e7/phone-run.png`
- Create: `docs/design-mockups/redesign-mockups-2026-07/shots/e7/phone-launcher.png`
- Modify after verification: `docs/design-mockups/redesign-mockups-2026-07/README.md`

**Interfaces:**
- Consumes: green Task 9 artifact.
- Produces: owner-review screenshots, verified README pointer, final coverage report; no approval claim.

- [ ] **Step 1: Load agent-browser instructions and serve**

```bash
agent-browser skills get core --full
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/e7-prototype.html`.

- [ ] **Step 2: Walk S1–S6 with DOM assertions**

For each scenario: switch required Person; assert route/scope label; follow every step; assert source record and Back behavior; assert expected mutation/reversal; assert no console errors. Record a concise pass matrix J01–J23 → scenario/step.

- [ ] **Step 3: Verify responsive and keyboard regimes**

At desktop, tablet, and 390px: assert no horizontal overflow; all required controls visible/reachable; phone Inbox/records full-page; FAB visible; ≥44px targets; keyboard launcher/palette/panel/inline edit contracts work.

- [ ] **Step 4: Capture the seven owner screenshots**

Save exact files above after placing each surface in a meaningful populated state. Screenshots must show the preserved latest-prototype styling, not state-gallery/debug chrome.

- [ ] **Step 5: Run Director four-lens review**

Review rendered artifact for Visual/token fidelity and AI slop; IxD naturalness; IA/canonical navigation; Product/Intent against `docs/jtbd.md`, including A1–A14. Fix all Critical/Important findings and repeat affected checks.

- [ ] **Step 6: Update README without claiming approval**

Point reviewers to `e7-prototype.html`, the brief, JTBD, serve command, and screenshot set. Mark it **candidate awaiting owner Phase-0 approval**; preserve all earlier files as history.

- [ ] **Step 7: Final verification and stop at owner gate**

Run `node verify-e7-prototype.mjs`, `git diff --check`, link/path checks, and the S1–S6 pass matrix. Do not commit, push, PR, merge, deploy, create SDD, or mark approved. Present the prototype and screenshots to the owner for redline/approval.

## Final Traceability

| Coverage | Owning tasks |
|---|---|
| J01–J06 | Tasks 1–4, 9–10 |
| J07–J15 | Tasks 3, 5, 9–10 |
| J16–J18 | Tasks 6, 9–10 |
| J19–J21 | Tasks 3, 7, 9–10 |
| J22–J23 | Tasks 4, 8, 9–10 |
| S1–S6 | Tasks 2, 4–8, 9–10 |
| A1–A14 | Tasks 2–9; final Lens-D check Task 10 |
| Nine required states | Tasks 4–9 |
| Desktop/tablet/phone | Tasks 1, 9, 10 |
| Latest-prototype visual continuity | Tasks 1 and 10 |

The next phase is owner review of the rendered candidate. SDD/BDD/TDD planning begins only after that
Phase-0 gate.
