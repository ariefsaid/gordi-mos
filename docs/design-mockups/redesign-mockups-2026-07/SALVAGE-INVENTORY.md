# SALVAGE-INVENTORY — what each mockup got RIGHT (binding read-first for UI buildout steps)

**Owner rule (2026-07-14, OD-REDESIGN-56):** the mockups are standing reference implementations
with a **presumption of correctness** — anything a mockup answered that is not on the explicit
override list below IS the answer. Builders **port** the reference; re-inventing a surface a mockup
already solved is a review-blocking defect (Experience Contract Rule 11). This file exists because
successive mockup rounds re-did whole surfaces and the right answers got convoluted.

**Precedence when sources disagree:** explicit owner/OD override (list below) → Experience Contract
(`docs/experience-contract.md`) → the mockup that OWNS the surface per this inventory.

Live reference servers (in the `gordi-mos-e7-prototype` working copy,
`docs/design-mockups/redesign-mockups-2026-07/`): e7 shell `python3 serve-e7.py` → :8766/e7-prototype.html ·
convergence flows `python3 convergence-flows/serve-flows.py` → :8134.

## Surface ownership

### e7 shell (`e7-prototype.html` + `e7-views.js` / `e7-records.js` / `e7-data.js` / `e7-prototype.css`) OWNS:

- **Task table / DB-view grammar** — density, columns, grouping, inline grammar. (Owner explicitly
  flagged the convergence table as a wrong re-creation of this.) In the app, the shipped
  `TasksWorkspace`/`TaskSurface` is the code-level canonical; e7 is the visual bar for the redesign skin.
- **⌘K palette as a CENTERED modal popup** — owner explicitly preferred e7's popup over the
  convergence bottom-sheet placement. Port e7's presentation; keep convergence's contents
  (search + Ask Deputy · Share Signal · Create Task, ≤1 contextual).
- **Record pages / renderers** (Task, Signal, Process, Standard, Objective, Follow-up detail
  surfaces), record relations, activity threads.
- **Money surfaces, Inbox (page + quick panel), authorization/persona demonstrations, deputy
  presence, fixtures** (the scenario dataset), and the **visual system**: `--e7-*` tokens, type
  scale, chrome, card/pill/table primitives (all three reviews agreed the visual system is consistent).
  **Token-authority clarifier:** e7's `--e7-*` tokens are the *visual decisions* — app surfaces
  implement those decisions via `DESIGN.md`'s `--ds-*`/`--brand-*`/`--status-*` tokens, whose
  *values* OD-P3-13 already aligned to e7. `--e7-*` names are mockup-internal and must never
  appear in app CSS (there is an active no-leak guard).
- Scenario/journey coverage breadth (the J/Scenario matrix pages).

### convergence flows (`convergence-flows/`) OWNS:

- **The frame** (owner sketch, OD-57): header = logo + breadcrumb · `Search ⌘K` + Inbox + Deputy;
  sidebar = Home / Work ▸ Signals · Tasks · Projects & Processes · Objectives / Events / Money
  [gated, hidden when unauthorized] / Inbox / BU Modules / Admin + profile footer.
- **URL grammar** — canonical route per collection, saved-view + record state in query params,
  Back/refresh/new-tab preservation, redirects, exactly one `aria-current="page"` (parent collapses).
- **FB-style Signal composer** (capture-minimal per OD-42/43; `@` grouped fuzzy with Person/Team/BU
  type badges; Site = location pill; attention FYI tap-to-raise; category post-capture on the card;
  "Create Task" on the POSTED card).
- **Occurrence-as-tasks surfaces** (OD-58): occurrence caption grouping, one-Task-with-checks for
  single-operator checklists, derived roll-up chip, job-function provenance line
  ("PIC: Ayu — via Barista on shift (Café HQ)"), verb+object "Start today's opening".
- **Capture-first phone disclosure** (work before configuration; one "View options" control; bottom
  nav + FAB; ≥44px targets) and the four-region page anatomy with the phone `.ctx-row { top: 0 }` fix.

### `full-redesign-2026-07/` (options a/b/c) — historical IA exploration.

Not wrong, but its open questions were settled by ADR-0025/OD-REDESIGN; consult only for visual
ideas, never for structure.

## The ONLY explicit overrides (owner-said-wrong or audit-confirmed defects — do NOT port these)

From e7:
1. All Work collections sharing one `#/work` URL (Back exited the app) — violates Rule 4.
2. Work parent + child both `aria-current="page"` — violates Rule 5.
3. The 8-collection / 4-heading Work rail — replaced by OD-57's four children.
4. Generic `Create` button fallbacks — Rule 7 verb+object.
5. The long Signal composer form (violated OD-42 capture-minimalism).
6. Mobile Work front-loading three selectors before work — Rule 8.
7. "Process Run" as a user-facing noun / Runs as a browsable entry point — OD-58.
8. Gated "Money•" stub shown to unauthorized viewers on desktop — hide entirely (Rule 9 parity).

From convergence flows:
9. Its re-created task table (use e7's grammar / the app's `TasksWorkspace`).
10. Its bottom-positioned ⌘K palette (use e7's centered modal presentation).
11. `My work · Team work · Library` Work children (superseded by the owner sketch, OD-57; My/Team/
    Overdue live on as saved-view chips inside Tasks).

Anything not on this list that a mockup answers: **the mockup is right — port it.**
