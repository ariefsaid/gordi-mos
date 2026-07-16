# Phase B2 brief — reframe the convergence-flows shell to the owner's sketch (2026-07-14)

You are the ui-implementer. The owner reviewed the working three-flow prototype and sketched the
frame he wants. Rework the SHELL of `docs/design-mockups/redesign-mockups-2026-07/convergence-flows/`
to that sketch. The flows themselves (Signal composer, opening occurrence, overdue work) stay —
only the frame (navbar, sidebar, palette, routes) changes.

## READ FIRST

1. `docs/design-mockups/redesign-mockups-2026-07/EXPERIENCE-CONTRACT.md` — BINDING, just amended
   with the owner's frame directives (Rule 1 Events row, Rule 3 new budgets, Rule 6 header anatomy).
2. `docs/design-mockups/redesign-mockups-2026-07/convergence-flows/` — the current working build
   (flows.js / flows.css / fixtures.js / index.html). Modify in place; keep everything that works.
3. `docs/design-mockups/redesign-mockups-2026-07/PHASE-B-BRIEF.md` — original flow specs (F1/F2/F3
   goals unchanged).

## The owner's frame (build exactly this)

**Top navbar** (full width, all breakpoints; logo cell left):
- Left: Gordi logo + current-location breadcrumb ("Home", "Work · Tasks", "Café", …).
- Right: search field (placeholder "Search ⌘K") that opens the command palette · Inbox icon with
  unread count · Deputy icon. NO "+ Actions" button in the header — its actions move into the palette.

**Command palette** (⌘K, clicking the search field, or the phone FAB):
- Search input on top; universal actions beneath: **Ask Deputy · Share Signal · Create Task**
  (+ at most 1 contextual action per Rule 7). This is the one launcher.

**Sidebar** (below the navbar):
- Home
- Work — expanded children: **Signals · Tasks · Projects & Processes · Objectives**
- Events (calendar icon — new destination root, owner-ratified)
- Money (only when `can(p,'money.view')` — keep the current gating)
- Inbox
- BU-grouped Modules unchanged: Retail Ops (Café · Ecommerce), B2B Ops (Roastery)
- Pinned bottom: Admin Settings (gated, as now) + profile row (avatar · name · role, e.g.
  "Ayu — Gordi HQ Supervisor")

**Phone:** bottom nav (Home · Work · Café · Inbox · More) + FAB unchanged; FAB opens the palette.

## Routes (Rule 4 still binding)

- `#/work/signals` — Signal archive/search (the existing Work-archive surface).
- `#/work/tasks` — the Tasks collection. **My / Team / Overdue become saved-view chips** in URL
  params: `#/work/tasks?view=mine|team|overdue`. F3 becomes `#/work/tasks?view=overdue`.
- `#/work/projects` — Projects & Processes definition list (thin stub list is fine).
- `#/work/objectives` — Objectives definition list (thin stub list is fine).
- `#/events` — stub page with its job sentence ("See what's happening around our outlets and when")
  and a labeled "not in this slice" body; must still satisfy Rules 1/5/6.
- Back-compat redirects: `#/work/mine` → `#/work/tasks?view=mine`, `#/work/team` →
  `#/work/tasks?view=team`, `#/work/library` → `#/work/projects` (preserve `record`/`view` params).

## Invariants (do not regress)

- F1 (post Signal from phone Home), F2 (Start today's opening → occurrence-as-Task, roll-up,
  provenance line), F3 (find overdue → drawer → Back/refresh) all still pass end-to-end.
- Exactly one `aria-current="page"` document-wide on every route (Work parent collapses when a child
  is active). Rule 4 URL/Back/refresh semantics everywhere, including the new routes.
- Verb+object actions only; capture-first phone disclosure; ≥44px targets.
- Keep the three Director fixes already in the code: `[data-canonical]` rows guard, Money hidden
  when unauthorized (both form factors), phone `.ctx-row { top: 0 }`.
- Home keeps the attention brief + feed (Q1 pending; do not move it).

## Verify + score

Re-run the browser verification (serve + agent-browser: URLs, Back, refresh, aria-current count,
390px first viewport, console errors) across the NEW routes and the three flows. Refresh the
screenshots in `convergence-flows/shots/` (they predate the ctx-row fix). Append a "## Reframe
2026-07-14" section to `SCORECARD.md`: Rules 1–10 × F1–F3 rescored + a line per new route, honest
"Open defects" if any.

## Do-NOT

- Do not touch any file outside `convergence-flows/` (e7-* stays for comparison).
- Do not redesign the composer, feed, occurrence, or record-drawer internals — frame only.
- Do not add an Updates destination or drop the Modules group.
- Do not commit or push.

End your final message with the sentinel line: REFRAME-DONE
