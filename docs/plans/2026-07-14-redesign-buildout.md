# Redesign buildout — E7 → mos-app (owner-approved sequence, 2026-07-14)

**Status: ACTIVE master plan.** The mockup phase is CLOSED (owner directive 2026-07-14): all
further iteration happens in `mos-app`. The E7 prototypes are **NOT dismissed** — they are standing
reference implementations with a **presumption of correctness**: whatever a mockup answered and the
owner/contract/ODs did not explicitly override IS the answer; port it, never re-invent it
(OD-REDESIGN-56). What's authoritative in which mockup, and the short list of explicit overrides:
`docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` — **binding read-first for every
UI step.** Any agent picking up a step reads this doc first, then the step's spec.

## Read-first for EVERY agent on this workstream

1. `docs/experience-contract.md` — **BINDING**. Rules 1–12 are blocking pass/fail acceptance checks
   in every review. Rule 11 (component reuse — never re-implement an existing surface) exists
   because mockup iterations kept re-creating components; in the app it is a review-blocking defect.
2. `docs/decisions.md` § OD-REDESIGN-1..55 + § "Buildout decisions (2026-07-14)" — domain law.
3. `docs/adr/0025-ia-modules-in-rail-redesign-direction.md` — binding D1–D41 (as amended by the
   frame directives in decisions.md).
4. `docs/redesign-decision-index.md` — map of what is locked where.
5. **Mockup references (presumed correct — port, don't re-invent):**
   `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` says what is authoritative in
   which mockup and lists the only explicit overrides. Live: e7 shell via `serve-e7.py` :8766 and
   convergence flows via `convergence-flows/serve-flows.py` :8134 (both in the
   `gordi-mos-e7-prototype` working copy). Precedence when sources disagree: explicit owner/OD
   override → Experience Contract → the mockup that owns that surface per the inventory.
6. Reference slice for conventions: the shipped Tasks DB-view — `mos-app/src/pages/TasksLayout.tsx`
   + `mos-app/src/components/tasks/*` + `mos-app/src/lib/db/tasks.ts` (ADR-0007/0008).

Loop discipline unchanged (CLAUDE.md / `docs/director-playbook.md`): one step = one issue = spec →
plan → TDD build → review battery → owner gate where flagged → PR. Coverage ≥80% changed lines,
typecheck/lint zero, RLS on every new table, review ledger + `scripts/pre-merge-check.sh` before merge.

## The sequence (build in this order)

| # | Step | Scope (one line) | Reuse (Rule 11 pointers) | DB/RLS | Drill needed? | Owner gate |
|---|---|---|---|---|---|---|
| 1 | **Styling pass** | Align app tokens/chrome to the redesign look; CSS/`DESIGN.md` only, zero behavior | existing styles + `DESIGN.md`; e7 CSS as reference | no | **No** — spec directly | visual diff sign-off |
| 2 | **Shell + routes** | New sidebar (Home / Work ▸ Signals·Tasks·Projects & Processes·Objectives / Events / Money[gated] / Inbox / BU Modules / Admin+profile footer), top bar (breadcrumb · ⌘K palette · inbox · deputy), URL grammar + redirects from every old route | existing AppShell/nav components; palette per convergence reference | no | **Light** — route-map drill vs existing app routes (1 short session, no domain reopen) | **YES — walkthrough** |
| 3 | **Tasks re-homed** | Shipped Tasks DB-view becomes `/work/tasks`; My/Team/Overdue/Follow-ups = saved-view chips in URL params; drawer + canonical record page per Rules 4/6 | `TasksWorkspace`/`TaskSurface`/drawer — REWIRE, do not rebuild | no | **No** — run spec-miner on the existing DB-view first, then spec the rewiring | no |
| 4 | **Signal v1** | `signals` table + RLS; FB-style composer (OD-42/43: content+Team+time+author; category post-capture; `@` = Person/Team/BU, Site = location pill); feed on Home; archive `/work/signals`; retire Weekly-Update/Daily-Log entry points (data preserved) | composer/feed grammar from convergence reference; existing form/field components | **yes** | **YES — full grill** (schema, RLS, visibility=Team layer, mention fan-out OD-36..51, migration/retirement of weekly updates) | **YES — walkthrough** (also ratifies Q1 finally) |
| 5 | **Home proper** | Attention brief from real queries (overdue, due-today, failed checks, mentions) above the feed; per-user region order (OD-18) | existing task/check queries; feed from step 4 | no | **No** | no |
| 6 | **Occurrence-as-tasks** | The deferred OD-11 schema ADR: Process definitions + cadence → spawn Tasks per occurrence (caption grouping, thin occurrence record owns completion/history/version snapshot); **job-function → current-holder** PIC resolution at spawn, ambiguity→human (OD-41); derived roll-up | Tasks schema + spawner; kitchen module data patterns | **yes** | **YES — full grill** (schema ADR, recurrence engine, function→holder mapping, OD-12 Task-vs-check boundary) | **YES — walkthrough** |
| 7 | **Café retrofit** | "Start today's opening" surface over the existing kitchen module, running on step 6's spawner; occurrence tasks flow into `/work/tasks` | kitchen module screens + step 6 | no | **Light** — map existing kitchen logs/plans onto occurrence model | no |
| 8 | **Projects & Processes + Objectives** | Re-home the merged catalog screens (PR #81) under `/work/projects` + `/work/objectives`; governance visibility per capability (90%-employee-first) | catalog screens — RELABEL/re-home only | no | **No** | no |
| 9 | **Money + Inbox alignment** | Follow-ups = Tasks saved view + Money queue entry (one record, two doors — D9); Inbox unchanged otherwise | existing finance screens + tasks views | no | **No** | no |
| 10 | **Events stub** | `/events` page with job sentence + placeholder; proves the Rule-10 extension path | shell from step 2 | no | **No** | no |
| 11 | **Decommission sweep** | After successors exist (4/5/8): DELETE the now-dead retired-screen code (`updates-page`, `cascade-page`, ops-log, RACI remnants), remove the parked/skipped e2e tests tied to retired destinations, and scan+fix any stale internal links or dead imports. One clean "old app is gone" checkpoint. | n/a (removal only) | no | **No** | **YES — final visual/regression pass** |

**Step 11 note:** runs LAST, only after Signals (4), Home (5), and Catalog (8) have replaced every
retired surface — never before, or users lose a function with no successor. It removes code, adds
none. The ~5 e2e currently `.skip`'d with "successor lands in step N" notes are un-skipped or deleted
here once their successor is live. This is the difference between "old stuff hidden" and "old stuff
actually gone."

## Standing acceptance (every step)

- **Owner visual diff EVERY step (owner-directed 2026-07-14):** each step ends with (a) the app
  running locally for the owner to eyeball, and (b) a before/after screenshot matrix at 1280px and
  390px in the review ledger, with the owning mockup's reference shot (per SALVAGE-INVENTORY)
  beside each "after". No step merges without the matrix. The interactive walkthroughs at steps
  2/4/6 are in addition to, not instead of, this.
- Contract Rules 1–12 scored pass/fail in the review ledger (`docs/reviews/<branch>.md`) — a FAIL
  blocks merge exactly like a failing gate.
- **Design / UX review EVERY step, not just code review (owner-directed 2026-07-15).** Alongside the
  cross-family code review, every UI step gets a **four-lens design review — Visual · IxD · IA ·
  Product/Intent (JTBD)**, run by a **vision-capable reviewer**. **Order of assessment (owner-directed):
  assess the built slice against the RULES IN DOCS FIRST** (Experience Contract Rules 1–12 →
  `docs/jtbd.md` intent → `docs/reference/twenty-ixd-patterns.md`), **THEN against the available
  MOCKUPS.** Mockup comparison is mandatory, not optional.
  - **Scope card is MANDATORY in every review dispatch (owner-directed 2026-07-15 — anti-pedantry).**
    Review as-we-go, but tell the reviewer what this step DELIVERS vs what is DEFERRED, or it holds a
    3-step foundation to the 11-step finished vision and floods the ledger with not-yet-built
    "failures" (observed: the steps 1–3 review flagged Home/Signals/Café-naming, all future steps).
    Each dispatch's brief MUST include: (a) the surfaces IN SCOPE for this step, (b) a "DEFERRED to
    Step N" list (e.g. "Home attention brief = Step 5; Signals = Step 4; Café rename = Step 7 — do NOT
    fail these here, note them as out-of-scope"), (c) any known-accepted deviations. The reviewer
    judges the step's own bar; genuine regressions in in-scope surfaces are still blocking.
  - **Runner + method (owner-directed): give Luna the OBJECTIVES, not step-by-step + fed screenshots.**
    Dispatch `gpt-5.6-luna --thinking max` with the review objectives + the read-first doc list + the
    URLs (app `localhost:5173/mos/`, e7 mockup `:8766`, convergence mockup `:8134`); Luna drives
    **agent-browser / Playwright CLI itself** (both installed; pi has Bash) to open the app AND the
    mockups, screenshot, and judge. It reads its own captures (vision-capable, verified 2026-07-15).
    *Gotcha:* force a clean browser session on the exact URL — agent-browser can latch onto a stale
    cross-project tab (observed: it once showed a PMO Portal page). The Director keeps only the final
    taste sign-off; text-only GLM builders cannot do this lens.
  - **Intent (JTBD, `docs/jtbd.md`):** does the screen serve the real job of its least-technical
    persona, or just expose the data model?
  - **IA / IxD (`docs/reference/twenty-ixd-patterns.md`):** is the navigation, record-open, and
    command grammar consistent with the Twenty "one renderer / one panel / one command surface"
    target adapted for MOS?
  - **Mockup fidelity + CROSS-VERSION REGRESSION (owner-directed — the fork problem):** compare the
    built slice against the mockup that OWNS that surface per `SALVAGE-INVENTORY.md`, **and against
    earlier mockup versions.** Explicitly flag anything that a mockup version got RIGHT (owner-approved
    good) but the build or a later version LOST or changed for the worse — the recurring failure where
    fixing one thing in a new version silently regressed another part that was already good. This is a
    blocking finding, not a nit.
  - **Cross-module UI reusability:** every surface is built from the shared UI families (Rule 2) and
    existing components (Rule 11) so Café, Ecommerce, Roastery, Money, etc. share one grammar — a user
    who learns one module already knows the next. Flag any one-off/divergent component as a defect.
  - **Rule 12 high-school-graduate cold-start walkthrough:** a first-time, untrained, least-technical
    user completes the step's job unaided — starting point obvious, no unexplained noun, obvious next
    action, low step count. Recorded as pass/fail per the Rule-12 criteria, not vibed.
  - **Owner decisions → Option A / Option B (owner-directed).** When the review surfaces a genuine
    design fork the owner should decide (e.g. "mockup vX did it this way, the build does it another —
    which do you want?"), the Director does NOT pick silently: raise it to the owner as **Option A vs
    Option B** (with the tradeoff + a recommendation) to capture the preference, then lock it as a
    convention/OD so it can't regress again.
- The three validated flows are the curated e2e journeys and may not regress:
  F1 post-a-Signal (from step 4), F2 today's-opening (from step 7), F3 find-overdue-work (from step 3).
- Playwright asserts the mechanical rules directly (one `aria-current="page"` document-wide; URL/
  Back/refresh preservation; no bare `Create`; 390px capture-first).
- Drills are **scoped to the step's own questions** — the domain grill is closed; do not reopen
  OD-REDESIGN-1..55.

## Q-status (owner)

- **Q2 (job-function assignment): APPROVED** — owner directive 2026-07-13, lands in step 6.
- **Q1 (Signal feed on Home): provisionally approved** — built and seen in the prototype; final
  ratification at the step-4 walkthrough.
- **Modules stay in the rail** (owner sketch omitted them; Director default kept them; owner may
  override any time before step 2 merges).
