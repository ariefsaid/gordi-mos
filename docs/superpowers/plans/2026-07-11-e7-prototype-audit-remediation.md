# E7 Prototype Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Do not commit, push, merge, or deploy.

**Goal:** Turn E7 into a decision-complete, walkable Phase-0 prototype whose Work workspace and all required journeys conform to ADR-0025, OD-REDESIGN-1..55, JTBD v0.4, DESIGN.md, and the owner-approved audit direction.

**Architecture:** Keep the existing dependency-free static HTML/CSS/ES-module prototype and its single canonical record registry. Strengthen the verifier first, then repair shared interaction primitives, Work, execution Modules, record navigation, forms, responsive behavior, and user-facing copy without adding a new route or data model.

**Tech Stack:** Static HTML, CSS, JavaScript ES modules, dependency-free Node verifier, Playwright CLI browser verification.

## Global Constraints

- Preserve Home · Work · Money · Inbox and the Café/Ecommerce/Roastery Module rail.
- Preserve canonical record identity, the single panel stack, Task PIC + Supervisor, Signal/Task separation, dynamic `can()` access, and location-scoped stock.
- Do not restore Weekly Update, Daily Log, Task RACI, Work widgets, Run/Optimize/Transform lanes, or separate Kitchen/Bar Modules.
- All visible UI copy must be understandable without ADR, database, auth, or developer vocabulary.
- Phone controls used for actions or navigation must expose at least a 44px hit target.
- Every apparent control must work in the prototype or render as non-interactive explanatory text.
- No production code change may precede a failing verifier assertion for that behavior.

---

### Task 1: Strengthen the prototype contract verifier

**Files:**
- Modify: `docs/design-mockups/redesign-mockups-2026-07/verify-e7-prototype.mjs`

**Produces:** Source-contract checks for functional controls, Work grammar, source-aware navigation, plain-language UI, touch targets, and required execution actions.

- [ ] Add failing checks for separate collection/saved-view/presentation controls, functional Inbox/period/Profile controls, inline create, free-form Deputy input, source-aware record return, Module execution handlers, 44px mobile targets, `data-label` mobile table cells, and forbidden developer/test copy in user surfaces.
- [ ] Run `node docs/design-mockups/redesign-mockups-2026-07/verify-e7-prototype.mjs` and confirm the new assertions fail for the audited defects.

### Task 2: Restore the locked Work workspace grammar

**Files:**
- Modify: `e7-views.js`, `e7-app.js`, `e7-prototype.css`, `e7-data.js`

**Produces:** Grouped collection picker, functional saved views, presentation switcher, filter/sort/group controls, object-specific columns, inline creation, URL-compatible state, and a readable phone list.

- [ ] Make the Task default `My tasks`; separate collection, saved subset, and Table/Board/Timeline presentation dimensions.
- [ ] Move Today/This week/Last week to temporal saved views rather than the record-type switcher.
- [ ] Restore status grouping, Supervisor, parent/source context, counts, relative urgency, and object-specific table schemas.
- [ ] Implement D3e creation as a new record/row followed by immediate inline title editing.
- [ ] Make every Work toolbar control keyboard-operable and visibly selected.

### Task 3: Make shared creation, Inbox, Profile, and Deputy interactions real

**Files:**
- Modify: `e7-app.js`, `e7-views.js`, `e7-prototype.css`

**Produces:** Functional Inbox filters/read state, period filters, persisted in-memory Profile settings, editable Signal mentions, correct Task fields, and a free-form Deputy composer.

- [ ] Replace inert chips with semantic controls and wire their state.
- [ ] Associate every form label with its control and expose inline validation text.
- [ ] Let authorized users select Task PIC/Status and Signal occurred-at/category/mentions; save the chosen values.
- [ ] Add a real Deputy input supporting typed prompts while retaining example prompts as optional shortcuts.
- [ ] Add accessible live-region toasts without colored side stripes.

### Task 4: Complete Module and record execution journeys

**Files:**
- Modify: `e7-views.js`, `e7-records.js`, `e7-app.js`, `e7-data.js`

**Produces:** Walkable Café Run, Ecommerce fulfilment, Roastery batch, Check/evidence/Exception, and Follow-up flows.

- [ ] Prevent duplicate Café Runs and replace Start with Continue when a Run is active.
- [ ] Let an operator complete/check Run steps, enter form values, attach evidence, and observe an Exception/corrective Task outcome.
- [ ] Implement Ecommerce next-state actions and risk-first ordering.
- [ ] Implement a minimal roast-batch form with yield/quality/evidence results.
- [ ] Preserve the existing evidence-gated Follow-up settlement behavior.

### Task 5: Repair record navigation, structured canvas, and plain-language presentation

**Files:**
- Modify: `e7-records.js`, `e7-app.js`, `e7-prototype.css`

**Produces:** Source-aware Back behavior, readable narrow panels, consistent canvas blocks, and user-facing copy free of test scaffolding.

- [ ] Carry source route/collection into full-page record links and restore that source on Back.
- [ ] Remove visible A/J/D identifiers, fixture/JWT/RLS/capability explanations, “simulate” actions, and contract-teaching copy.
- [ ] Replace emoji and side stripes with the existing icon/status system.
- [ ] Make panel property layouts one-column when width cannot support two columns.

### Task 6: Responsive and accessibility hardening

**Files:**
- Modify: `e7-prototype.css`, `e7-views.js`, `e7-records.js`, `e7-app.js`

**Produces:** 44px phone targets, readable 16px inputs, adequate contrast, labeled mobile rows, keyboard rows/tabs, named dialogs, focus-safe overlays, and non-overlapping fixed navigation.

- [ ] Add mobile labels to every reflowed table cell.
- [ ] Use semantic buttons/links for rows and controls, with `aria-selected`, `aria-current`, or `aria-pressed` as appropriate.
- [ ] Verify modal/panel focus entry, trap, escape, background exclusion, and focus return.

### Task 7: Full verification and visual review

**Files:**
- Modify only if verification reveals a defect.

- [ ] Run the full static verifier and require exit 0.
- [ ] Walk every route as Ayu and Arief at 1440×900, 900×900, and 390×844.
- [ ] Complete Work Task creation, saved-view change, Board switch, Inbox triage, Signal-to-Task, Café Run, Ecommerce transition, roast logging, Money drill, Profile preference, Admin preview, nested panel, full-page Back, and Deputy free-form input.
- [ ] Capture final screenshots and compare against DESIGN.md and the prior Work strengths.
- [ ] Run `git diff --check` and report remaining limitations honestly.
