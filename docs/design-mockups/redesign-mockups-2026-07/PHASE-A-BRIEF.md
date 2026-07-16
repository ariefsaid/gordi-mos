# Phase A brief — E7 convergence sprint: Decision Audit + Experience Contract

You are the eng-planner for the Gordi MOS E7 redesign convergence sprint. You produce TWO documents
and change NOTHING else. This repo (`gordi-mos-e7-prototype`) is the redesign working set.

## Task (one line)

Classify every proposed E7 interaction/UI change against the locked decision record
(OD-REDESIGN-1..55 + ADR-0025), then write a short binding Experience Contract of ~10 falsifiable
rules that will govern the prototype rebuild.

## READ FIRST (exact paths, repo-relative; read them yourself)

1. `docs/decisions.md` — the OD-REDESIGN-1..55 section (LOCKED, owner-approved 2026-07-09/10)
2. `docs/adr/0025-ia-modules-in-rail-redesign-direction.md` — binding D1–D41
3. `docs/redesign-decision-index.md` — the map of what's locked where
4. `CONTEXT.md` — domain glossary (current vocabulary only)
5. `docs/jtbd.md` — the JTBD oracle (esp. J07–J15, J21)
6. `docs/design-mockups/redesign-mockups-2026-07/PROTOTYPE-BRIEF.md` — the existing E7 coverage matrix
7. The current prototype shell (`docs/design-mockups/redesign-mockups-2026-07/e7-prototype.html` +
   `e7-app.js`, `e7-views.js`) — skim only enough to ground the audit; do NOT edit it.

## Background: why this sprint exists

The E7 prototype went through multiple iterations and is "passable, not good" to the owner. A
navigation audit found the root cause: the 55 locked decisions are **domain law** (objects,
authority, lifecycle) but there was never any **experience law** (URL semantics, rail budget, page
anatomy, disclosure rules) — so every build round re-invented the UI grammar. Confirmed defects in
the current shell: all Work collections share one `#/work` URL (Back exits the app); Work and Tasks
both get `aria-current="page"`; the rail is overloaded (4 group headings + 8 collections); entry
points are object-first not job-first; generic `Create` labels; mobile Work front-loads 3 selectors
before showing work; the Signal composer is a long form although OD-REDESIGN-42 locks capture to
content + owning Team + occurrence time + author only.

## Input A — proposed changes to classify (from three independent reviews + owner)

Classify EACH of the following into exactly one of:
- **(a) already locked but incorrectly expressed** — the prototype violates an existing OD/D; cite it
- **(b) reversible prototype convention** — no owner decision needed; the contract sets it, flows test it
- **(c) genuine amendment** — conflicts with or extends a locked OD/D; needs owner ratification.
  HARD CAP: at most 3 items may land in (c). If more seem to qualify, argue the least-damaging
  reading that keeps them in (a)/(b), and say so.

1. FB-style Signal composer: text box primary; photo/evidence icon; compact pills for location /
   mention / occurrence time; `@` opens grouped fuzzy search with visible entity types (Person /
   Team / BU / Site); attention defaults FYI (tap-to-raise); category optional post-capture;
   visibility one quiet summary line; task creation AFTER posting from the post.
2. Signal feed leaves Work as a primary surface. Provisional placement (owner-approved to prototype,
   pending final ratification): a feed region on Home BELOW the required attention brief; composer
   reachable everywhere via the Action Launcher; Work keeps Signals as archive/search only. NO new
   top-level "Updates" destination.
3. Financial Follow-up demoted from navigation noun to: a Tasks saved-view + a Money queue entry
   point. Domain object keeps its settlement fields/rules.
4. OWNER DIRECTIVE (2026-07-13) — Process occurrences surface as Tasks: the Process/Project
   definition (e.g. "Monthly closing") holds its checklist items + cadence (e.g. monthly recurrence).
   Each checklist item spawns per occurrence as a **Task** (e.g. "Stock opname HQ" → Task, PIC = the
   HQ supervisor, delegable). Checklist items bind to **job functions**, not persons; the function
   resolves to its current holder at spawn time; turnover changes the holder mapping, never the
   Process. "Process Run" disappears as a user-facing noun; occurrence identity is a grouping caption
   on the spawned Tasks (e.g. "Café opening — today", "Monthly close — July"). Audit this against
   OD-REDESIGN-11/12/13/54 and OD-REDESIGN-41 (supervisor resolution) + ADR-0025 D26/D27: state
   precisely which parts are (a) UI-surfacing already compatible, (b) prototype convention, and
   (c) genuine domain amendment (e.g. whether a thin occurrence record survives in the schema for
   run-level completion/history/version-snapshot — note OD-11 already defers the schema ADR to eng
   planning, so keep the mockup-phase decision minimal). Also state where per-occurrence roll-up
   ("this month's close is 80% done") and evidence/history attach in the owner's model.
5. Job-function-based assignment indirection (part of #4 but classify separately): Task templates
   name a job function; spawn-time resolution to the holder; ambiguity requires human choice
   (consistent with OD-REDESIGN-41's never-guess rule).
6. Work rail children collapse from 8 collections to 3: **My work · Team work · Library**
   (Library = definitions: Processes / Standards / Objectives); everything else is a saved view.
   Treat as (b) provisional convention unless it conflicts with a locked D.
7. Canonical route per collection (`#/work/tasks`, `#/work/library` …); saved view + presentation
   state in URL params; Back/refresh/bookmark/new-tab all preserve location.
8. Exactly one `aria-current="page"` answer at any time; parent groups collapse, never co-active.
9. One page anatomy shared by every route (header + context row + content region + record drawer).
10. Verb+object contextual actions everywhere ("Start today's opening", "Share update", "Add
    follow-up") — no bare `Create`.
11. Capture-first progressive disclosure: mobile shows work before configuration; collection /
    saved-view / view-as controls collapse behind one control on phone.
12. 90%-employee-first principle: the default interface serves the everyday employee (Home / feed /
    Work / Inbox / their Modules); governance objects (Projects, Processes, Standards, Objectives)
    appear progressively only to holders of managing roles. Audit against OD-REDESIGN-28/34/55 +
    ADR-0020 capability model.
13. Three-layer reuse rule: domain contracts (typed, distinct) → reusable UI families (work item,
    feed post, governed definition, record page, list, composer, activity thread) → job-first
    destinations. Merging of SURFACES is aggressive; merging of SCHEMAS is conservative.

## Output 1 — `docs/design-mockups/redesign-mockups-2026-07/CONVERGENCE-AUDIT.md`

For each numbered item: classification (a/b/c), the exact OD-REDESIGN-# / ADR-0025 D# it touches,
one-paragraph rationale, and — for every (c) — a one-line owner ratification question with your
recommended answer. End with a table summarizing all 13 and the ≤3 owner calls.

## Output 2 — `docs/design-mockups/redesign-mockups-2026-07/EXPERIENCE-CONTRACT.md`

~10 rules, each FALSIFIABLE (a reviewer can mark pass/fail against a rendered screen — no vibes).
Cover at minimum: destination jobs (one job sentence per rail item); the three-layer
domain→UI-family→destination boundary (include the mapping table); rail/surface budget (numeric);
canonical routes + URL state semantics; one-current-location; single page anatomy; verb+object
action grammar; capture-first disclosure order (mobile first); responsive disclosure order; the
extension test ("a new module / calendar / record type ships by adding a collection + view renderer
+ feed posts — if it needs a new rail root or new page anatomy, the contract is being violated").
Header must state: BINDING for the prototype rebuild — every flow review scores each rule pass/fail
as a blocking acceptance check. Where a rule operationalizes a locked OD/D, cite it inline.

## Do-NOT list (scope fences)

- Do NOT edit the prototype, CSS, JS, or any file other than the two outputs.
- Do NOT re-litigate domain decisions — the domain grill is closed. No new questions to the owner
  beyond the ≤3 ratification lines.
- Do NOT propose a top-level Updates/Feed destination.
- Do NOT expand scope to Roastery/Standards/calendar mockups — the extension rule covers them.
- Do NOT commit, push, or open PRs.

## Verify your own work

Re-read both outputs against `docs/redesign-decision-index.md`: every cited OD-REDESIGN-# must exist
and say what you claim. Every contract rule must be checkable pass/fail. List any deviation at the
end of the audit doc.

End your final message with the sentinel line: AUDIT-DONE
