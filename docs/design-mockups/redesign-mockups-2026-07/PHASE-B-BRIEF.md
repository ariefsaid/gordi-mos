# Phase B brief — E7 convergence sprint: three thin flows against the Experience Contract

You are the implementer for the E7 redesign convergence sprint. You build a NEW, minimal, thin
prototype shell implementing exactly THREE task flows, strictly to the binding Experience Contract.
This is the grammar-proof build: if these three flows feel obvious, the grammar scales to the full
coverage matrix later. This repo (`gordi-mos-e7-prototype`) is the working set.

## READ FIRST (repo-relative; read them yourself)

1. `docs/design-mockups/redesign-mockups-2026-07/EXPERIENCE-CONTRACT.md` — BINDING. All 10 rules are
   blocking pass/fail acceptance checks on your output.
2. `docs/design-mockups/redesign-mockups-2026-07/CONVERGENCE-AUDIT.md` — the classifications behind
   the contract (esp. items 1, 4, 5 and the `@Site` → location-pill correction).
3. `docs/decisions.md` § OD-REDESIGN-1..55 (now present) + `docs/adr/0025-ia-modules-in-rail-redesign-direction.md` — domain law; do not violate.
4. `DESIGN.md` — design tokens (identity authority; never re-invent).
5. `docs/design-mockups/redesign-mockups-2026-07/e7-data.js` — REUSE these fixtures (people, teams,
   tasks, signals). Import or copy; do not invent a parallel fixture universe.
6. `docs/design-mockups/redesign-mockups-2026-07/e7-prototype.css` — reuse tokens/classes where they
   fit the contract; write new CSS only where the contract demands different structure.
7. `docs/jtbd.md` — personas: Ayu (barista, member, Café/Kitchen team), Rina (ops lead).

## Output — new directory, NOTHING else modified

`docs/design-mockups/redesign-mockups-2026-07/convergence-flows/`
- `index.html` — the thin shell (desktop + ≤390px responsive, one file or a few small ones)
- `flows.css`, `flows.js` (+ optionally `fixtures.js` re-exporting from ../e7-data.js)
- `SCORECARD.md` — your self-scored contract compliance (see Acceptance)

Do NOT modify any `e7-*` file, the CSS, PROTOTYPE-BRIEF, audit, or contract.

## The three flows (build ONLY these — thin but REAL)

**F1 — Ayu posts a Signal from phone Home.**
Phone-first (≤390px). Home = attention brief on top (non-removable) + Signal feed region below
(pending owner ratification Q1 — build it as specified). Composer opens from the Action Launcher and
from a feed-top affordance. FB-post grammar per audit item 1: text box primary; photo/evidence icon;
compact pills for location + occurrence time; typing `@` opens grouped fuzzy results with visible
type badges — **Person / Team / BU only** (Site is a location pill, never a mention target — D37);
attention defaults FYI as a tap-to-raise pill; category absent at capture (post-capture enrichment on
the posted card); visibility = one quiet summary line; "Create Task" appears on the POSTED card,
never in the composer. Initial composer fields are exactly: content + owning Team (prefilled from
Ayu's team) + occurrence time (default now) + author (implicit).

**F2 — Ayu starts and completes today's Café opening.**
Occurrences surface as TASKS (owner directive, audit item 4): from Café module (or Home attention),
Ayu sees "Café opening — today" as an occurrence caption grouping its work. Single-operator checklist
= ONE Task with checks inside (OD-REDESIGN-12 boundary), not 12 task rows. Primary action verb+object:
"Start today's opening". Checking items updates a visible per-occurrence roll-up (e.g. "7/9 done" —
derived, not a stored status). The word "Process Run" appears NOWHERE in the UI. The Task record
shows an assignment provenance line demonstrating job-function binding (audit item 5 / Q2):
"PIC: Ayu — via Barista on shift (Café HQ)".

**F3 — Rina finds and acts on overdue Team work (desktop).**
Desktop. Work has exactly 3 switcher children: My work · Team work · Library (Rule 3). Rina opens
Work → Team work → saved view "Overdue" — state in URL (`#/work/team?view=overdue`). She opens a
record (shared drawer, Rule 6), acts on it (reassign or complete), Back pops one level, refresh
preserves everything. She never needs the words "Process Run", "collection", or any taxonomy term —
entry points are job-labeled. Follow-ups appear only as a saved view under Tasks family + a Money
queue link, not a nav noun (item 3).

## Hard requirements (from the contract — these ARE the acceptance bar)

- Real hash routing per Rule 4: `#/home`, `#/work/mine`, `#/work/team?view=overdue`, `#/work/library`,
  `#/cafe`, record URLs. Back / refresh / new-tab / bookmark all preserve location. Back never exits
  to a blank page while inside the app.
- Exactly ONE `aria-current="page"` in the DOM on every route (Rule 5) — parent collapses when child
  active.
- One four-region page anatomy on every route (Rule 6).
- No bare `Create`/`Add`/`New` anywhere (Rule 7).
- Phone: work before configuration; view controls behind one affordance; ≥44px targets (Rule 8).
- Rail budget per Rule 3 (4 destinations + BU-grouped Modules; flat Work switcher, 3 children).
- Only surfaces needed by the three flows exist. Other rail entries may render as labeled stubs
  ("not in this slice") but must still satisfy Rules 1/3/5.

## Verify your own work (before declaring done)

Serve the directory (e.g. `python3 -m http.server` or the sibling `serve-e7.py` pattern) and drive it
with the `agent-browser` CLI: for each flow, assert (1) the URL after each step, (2) browser Back
behavior at every depth, (3) refresh restores state, (4) `document.querySelectorAll('[aria-current="page"]').length === 1`
on every route, (5) at 390px the first viewport of each collection shows work items, (6) zero console
errors. Screenshot each flow endpoint (desktop + phone) into `convergence-flows/shots/`.

Then write `SCORECARD.md`: for each contract Rule 1–10 × each flow F1–F3, PASS/FAIL with one line of
evidence (URL, DOM query result, or screenshot filename). Any FAIL you cannot fix, list under
"Open defects" — do not hide it and do not weaken the check.

## Do-NOT list

- Do NOT edit any existing file outside `convergence-flows/` (the e7 shell stays as-is for comparison).
- Do NOT add an Updates/Feed rail destination, new rail roots, or Work children beyond the 3.
- Do NOT show "Process Run" as a UI noun; do NOT spawn one task row per checklist line in F2.
- Do NOT re-litigate domain decisions or the contract; a contract conflict you cannot resolve goes in
  SCORECARD "Open defects", not into a silent workaround.
- Do NOT commit, push, or open PRs.

End your final message with the sentinel line: FLOWS-DONE
