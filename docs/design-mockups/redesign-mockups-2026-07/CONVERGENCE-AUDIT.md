# CONVERGENCE-AUDIT — E7 proposed changes vs the locked decision record

**Status:** Binding classification for the E7 prototype rebuild · written by eng-planner · 2026-07-13.
**Scope:** classifies the 13 proposed changes from the Phase-A brief into the three buckets below and
records the ≤3 owner ratification calls. Changes NO code, spec, or plan — it is the input to the
**`EXPERIENCE-CONTRACT.md`** that governs the rebuild.

## Authority and method

Authority order (per `docs/redesign-decision-index.md`): `docs/decisions.md` § OD-REDESIGN-1…55 →
`docs/adr/0025-ia-modules-in-rail-redesign-direction.md` (D1–D41) → `CONTEXT.md` → older ADRs as amended.
The **index is a pointer, not an authority**; where it and a source disagree, the source wins.

Each item is placed in exactly one bucket:

- **(a) Locked but incorrectly expressed** — the prototype violates an existing OD/D. Fix is execution, not a decision.
- **(b) Reversible prototype convention** — no owner decision. The Experience Contract sets it; flows test it.
- **(c) Genuine amendment** — conflicts with or extends a locked OD/D and needs owner ratification. **Hard cap: 3.**
  Where more seemed to qualify, the least-damaging reading that keeps the item in (a)/(b) is argued explicitly.

> **Verification caveat (read before relying on any citation below).** The index names
> `docs/decisions.md` § OD-REDESIGN-1…55 as authority #1, but **that section is absent from the current
> `docs/decisions.md`** (the file ends at OD-DASH-6 and contains zero `REDESIGN` matches; see §"Deviations
> and verification"). All OD-REDESIGN-# citations below are therefore verified against
> `docs/redesign-decision-index.md` (the thematic map) **and** the binding ADR-0025 D# it points to. This
> does not change any classification; it changes where a reviewer must look to re-check a cite.

## Classifications

### Item 1 — FB-style Signal composer (text-primary; photo/evidence icon; compact pills for location / mention / occurrence time; `@` grouped fuzzy with visible entity types; attention defaults FYI; category optional post-capture; visibility one quiet summary line; task creation AFTER posting)

- **Classification: (a) — locked but incorrectly expressed.**
- **Touches:** OD-REDESIGN-42 · OD-REDESIGN-43 · OD-REDESIGN-39 · OD-REDESIGN-36/37/38/51 · OD-REDESIGN-49 · ADR-0025 D28/D29/D25/D22–D24/D35.
- **Rationale.** The locked capture contract (OD-REDESIGN-42 / D28) is explicit: a Signal requires only
  *factual content + owning Team + occurrence time + author*; category is **optional post-capture
  enrichment**. Attention defaults FYI and is never a status (OD-REDESIGN-43 / D29). A follow-up Task is a
  **separate many-to-many record created after the post** from the Signal (OD-REDESIGN-39 / D25), never a
  promotion. Visibility is a quiet preview (OD-REDESIGN-36/37 / D22/D23). The current shell ships a long
  form that front-loads category/configuration before capture — a direct violation of D28's capture-minimalism.
  The proposed composer is the correct expression of all of the above, so it is execution, not a decision.
- **One sub-point to correct, not ratify.** "`@` opens grouped fuzzy search with visible entity types
  (Person / Team / BU / **Site**)." D37 is explicit: *"No `@Site` exists initially; mention the relevant
  Team(s)."* So **`@Site` must not be a mention fan-out target**. The least-damaging reading (no owner call):
  Site is a **location pill** (the Signal already carries optional Area/Module and a deriving Site per
  `CONTEXT.md` Signal), and the `@` fuzzy lists only **Person / Team / BU**. This is recorded as a contract
  rule; `@BU` stays capability-gated (`signal.mention_bu`, D24).

### Item 2 — Signal feed leaves Work as a primary surface; provisional placement on Home below the attention brief; composer everywhere via the Action Launcher; Work keeps Signals as archive/search only; NO new top-level Updates destination

- **Classification: (c) — genuine amendment (1 of 3).**
- **Touches:** OD-REDESIGN-1 · OD-REDESIGN-8/9 · OD-REDESIGN-17/18 · OD-REDESIGN-33 · ADR-0025 D1/D8/D9/D20.
- **Rationale.** Two locked surfaces move. (i) D9's Work collection switcher **lists Signals as a primary
  Work collection** ("Cadence/queues (Signals, Follow-ups)"); item 2 demotes Work Signals to
  archive/search-only. (ii) D8 fixes Home as exactly **two regions** — a mandatory attention brief plus a
  personal/deputy canvas ("detailed KPIs… stay in Money"); an ambient Signal-feed **region below the brief**
  is a third structural element that D8 does not authorise, and it cannot be silently re-labelled "part of
  the brief" without broadening what the brief is (the brief is an exception/action queue, not an ambient
  stream). The owner has already flagged this placement *"owner-approved to prototype, pending final
  ratification"* — i.e. not finally decided. The "no new Updates destination" half is already locked
  (OD-REDESIGN-1 / D1: the rail is Home · Work · Money · Inbox + Modules) and needs no call.
- **Owner ratification (Q1).** *"Confirm the Signal home: the ambient feed lives on Home as a default
  region below the non-removable attention brief; Work surfaces Signals as archive/search only (no longer a
  primary Work collection); there is no top-level Updates/Feed destination; the composer is reachable
  everywhere only via the Action Launcher (OD-REDESIGN-46 / D32)."*
  **Recommended answer: APPROVE.** It is the least-damaging home for Signals — it avoids a new destination,
  keeps Work focused on owned/governed work, and the feed is the ambient layer the brief's
  "mentioned/actionable Signals" items are elevated from. Approving this also fixes the contract rule that
  scopes Signals out of the Work rail budget.

### Item 3 — Financial Follow-up demoted from navigation noun to a Tasks saved-view + a Money queue entry point (domain object keeps its settlement fields/rules)

- **Classification: (b) — reversible prototype convention.**
- **Touches:** OD-REDESIGN-8 · ADR-0025 D9 · `CONTEXT.md` Follow-up · J21.
- **Rationale.** The Follow-up **domain object is untouched** (settlement lifecycle, cash-in date, proof,
  Finance confirmation all stay — `CONTEXT.md` Follow-up; A9 anchor). D9's only invariant for queues is
  *"Specialized queues may vary columns and actions but never create a second copy of a record"*; its
  collection list is illustrative, not a mandated count. Whether Follow-ups is its own Work collection or a
  Tasks-family saved-view plus a Money drill entry (already allowed by J21: "Work **or Money** drill") is a
  presentation choice that preserves the one-record invariant. Note the brief's "demoted from navigation
  noun" is slightly mis-stated: in the locked rail Follow-up is a **Work collection**, never a rail root
  (the rail is fixed by OD-REDESIGN-1 / D1); this item collapses a Work collection into a saved-view, not a
  rail noun.

### Item 4 — OWNER DIRECTIVE (2026-07-13): Process occurrences surface as Tasks (Process/Project definition holds checklist items + cadence; each item spawns per occurrence as a Task; checklist items bind to job functions; "Process Run" disappears as a user-facing noun; occurrence identity is a grouping caption)

- **Classification: split — mostly (a) + (b); the only (c)-shaped question is DEFERRED per OD-REDESIGN-11 and consumes no ratification slot this sprint.**
- **Touches:** OD-REDESIGN-11/12/13/54 · OD-REDESIGN-41 · ADR-0025 D6/D7/D26/D27/D39/D40/D41.
- **(a) UI-surfacing already compatible.** Showing spawned Tasks grouped under an occurrence caption
  ("Café opening — today", "Monthly close — July") is a **view** over Run-owned Tasks. D6 already has the
  Process Run *own* its generated Tasks, checks/forms/evidence, completion, and history; D9 already renders
  Tasks as the execution collection. PIC = the function's current holder, delegable, is the normal Task
  ownership model (OD-REDESIGN-3). An authorized scoped Role holder adopting a published Process version
  for a Team is OD-REDESIGN-54 / D40–D41. None of this is new domain law — it is the correct surfacing of
  objects that already exist.
- **(b) Prototype convention.** *"Process Run disappears as a user-facing noun"* is a **surfacing**
  decision: the owning occurrence record persists behind the scenes (D6 requires it to own completion /
  history / version snapshot), but the UI calls the grouping a caption on its spawned Tasks rather than a
  "Run" noun. The occurrence caption, the per-occurrence roll-up read-model, and the "delegable Task per
  checklist item" rendering are prototype conventions the contract sets and flows test.
- **(c) Deferred, not counted.** The one genuinely schema-shaped question — *does a thin occurrence record
  survive in the schema to anchor run-level completion, history, and the Process/Standard version snapshot?*
  — is **already deferred by OD-REDESIGN-11** ("Process (definition) vs Process Run (occurrence); schema
  ADR deferred to eng planning"). D6 currently *requires* such a record ("owns that occurrence's… completion
  and history"), so fully deleting it would contradict D6; the mockup-phase decision is therefore
  **minimal**: the occurrence record survives (thin, behind the scenes) to own completion/history/snapshot,
  and the UI simply does not surface "Process Run" as a noun. The detailed schema goes to the deferred
  Process/Run schema ADR, **not** to the owner in this sprint.
- **Where roll-up and evidence/history attach in the owner's model.**
  - **Per-occurrence roll-up** ("this month's close is 80% done") is a **derived read-model** over the
    spawned Tasks that belong to that occurrence (`done / total`, weighted where the contract weights
    items). It is not a stored status and creates no lifecycle.
  - **Evidence / history** attach at **two layers**: (1) **task-level** — each spawned Task owns its
    evidence, activity thread, Checks, and Exceptions under the normal Task contract (D26/D27, `CONTEXT.md`
    Check/Exception); (2) **occurrence-level** — the thin occurrence record owns the Process/Standard
    **version snapshot** (D18/D40: started/materialized Runs retain snapshots), Run-level completion, and
    the roll-up derivation. This is exactly D6's "owns that occurrence's… completion and history," expressed
    with Tasks as the concrete work surface.

### Item 5 — Job-function-based assignment indirection (Task templates name a job function; spawn-time resolution to the holder; ambiguity requires human choice)

- **Classification: (c) — genuine amendment (2 of 3).**
- **Touches:** OD-REDESIGN-3 · OD-REDESIGN-41 · OD-REDESIGN-12 · ADR-0025 D7/D26/D27/D41 · `CONTEXT.md` Role / Team membership.
- **Rationale.** The locked Task ownership model resolves to **persons**: a Task carries one PIC (a Person)
  and one Supervisor, and OD-REDESIGN-41 / D27 resolves the Supervisor through the **PIC's person manager
  chain**. Generated Task *definitions* (D7) "may explicitly override that default" Supervisor, but nothing
  in the locked record makes the **PIC** resolve through a *job-function → current-holder* indirection at
  spawn, nor does it state the turnover semantic the owner now wants ("turnover changes the holder mapping,
  never the Process"). That is a new assignment primitive with a real behavioural consequence (next month's
  spawn auto-resolves to the new holder). It is consistent *in spirit* with OD-REDESIGN-41's never-guess
  rule (ambiguity → human choice) and derivable from existing effective-dated Role/membership data
  (`CONTEXT.md` Role, Team membership), but it extends the locked assignment model, so it is a genuine
  amendment rather than a convention. (It was separated from item 4 precisely because it is the deeper
  mechanism.)
- **Owner ratification (Q2).** *"May generated Task definitions (Process/Project checklists) bind the PIC
  to a job function (org Role + Team scope) that resolves to its current holder at spawn time, with
  ambiguity pausing for a human choice, and with turnover changing only the holder mapping, never the
  Process?"*
  **Recommended answer: APPROVE.** It is turnover-correct, honours OD-REDESIGN-41's never-guess rule, and
  the alternative (person-literal templates) silently breaks on every role change. Supervisor resolution
  (OD-REDESIGN-41 / D27) applies *after* the PIC resolves to a Person at spawn, so the two compose cleanly.

### Item 6 — Work rail children collapse 8 → 3: My work · Team work · Library (Library = definitions: Processes / Standards / Objectives); everything else a saved view

- **Classification: (b) — reversible prototype convention.**
- **Touches:** OD-REDESIGN-8/9/23 · ADR-0025 D9/D3f.
- **Rationale.** D9 describes the Work collection switcher's **grouping**, not a mandated count; its
  invariant is the one-collection/saved-view grammar with no duplicate records. Three top-level collections
  (My work · Team work · Library) with saved views beneath is a re-expression of that grammar, not a
  violation. OD-REDESIGN-23 confines user customization to **saved-view pins** beneath an owning
  destination — and these three live inside Work's own switcher, not the app rail, so core nav stays fixed.
  The current 8-collections-across-4-family-headings overload (confirmed in `e7-views.js`) is a
  presentation smell the contract retires; no locked D mandates eight.

### Item 7 — Canonical route per collection (`#/work/tasks`, `#/work/library` …); saved view + presentation state in URL params; Back/refresh/bookmark/new-tab all preserve location

- **Classification: (a) — locked but incorrectly expressed.**
- **Touches:** OD-REDESIGN-7 · OD-REDESIGN-19 · ADR-0025 D3a/D3d.
- **Rationale.** D3d makes a View a *"URL-synced (shareable)"* bundle, and D3a/OD-REDESIGN-7 give every
  first-class record one canonical URL with new-tab/refresh rendering the full page. The current shell
  gives **every Work collection the same `#/work` href** and keeps the active collection only in
  `state.workCollection` (confirmed: `e7-app.js` line 67 emits `href="#/work"` for all children) — so
  refresh / bookmark / new-tab / Back all lose the collection. That directly violates the URL-sync and
  canonical-location principles. Per-collection routes + query-param view/presentation state is the fix.

### Item 8 — Exactly one `aria-current="page"` answer at any time; parent groups collapse, never co-active

- **Classification: (a) — locked but incorrectly expressed (also a WAI-ARIA invariant).**
- **Touches:** OD-REDESIGN-7 · OD-REDESIGN-19 · ADR-0025 D3a.
- **Rationale.** "One canonical location at a time" is the operational form of D3a / OD-REDESIGN-7's
  single-canonical-record principle, and `aria-current="page"` is how that location is announced. The
  current shell emits `aria-current="page"` on **both** the Work parent and the active Work child
  (confirmed: `e7-app.js` lines 67 and 69 each set it on their respective element when `route==='work'`),
  so Work + Tasks co-announce — a real violation of the one-location principle and an a11y defect. Fix:
  when a child is active, the child carries `aria-current="page"` and the parent collapses to
  `aria-current="location"` (or none); they are never simultaneously `page`.

### Item 9 — One page anatomy shared by every route (header + context row + content region + record drawer)

- **Classification: (b) — reversible prototype convention.**
- **Touches:** OD-REDESIGN-2/16 · ADR-0025 D2/D3a/D7.
- **Rationale.** No locked D mandates a specific region count, but D2's *"structured-canvas grammar on
  every detail surface"* and D3a's single-renderer (`mode="panel" | "page"`) principle imply one anatomy.
  The exact four-region shape (header + context row + content + record drawer) is the contract's choice to
  make that grammar concrete and reviewable; it does not conflict with any D. The contract will score it
  pass/fail per route.

### Item 10 — Verb+object contextual actions everywhere ("Start today's opening", "Share update", "Add follow-up") — no bare `Create`

- **Classification: (a) — locked but incorrectly expressed.**
- **Touches:** OD-REDESIGN-21 · OD-REDESIGN-46 · ADR-0025 D10/D32.
- **Rationale.** D10 is explicit: *"The visible primary action names the current job: Work creates the
  current collection's object, a Process offers Start run, a Standard offers Run check, Café offers Log
  production, Roastery offers Log roast."* D32 keeps the Action Launcher's universal actions stable while
  allowing one contextual action. The current shell falls back to a bare **`Create`** label for several
  collections (confirmed: `e7-views.js` `createTxt` defaults to `'Create'`). Verb+object labels are the
  locked requirement; bare `Create` violates it.

### Item 11 — Capture-first progressive disclosure: mobile shows work before configuration; collection / saved-view / view-as controls collapse behind one control on phone

- **Classification: (b) — reversible prototype convention (operationalises a locked principle).**
- **Touches:** OD-REDESIGN-42 · OD-REDESIGN-46 · ADR-0025 D28/D32 · `PROTOTYPE-BRIEF.md` §8.
- **Rationale.** D28 locks capture-minimalism; D32 + `PROTOTYPE-BRIEF.md` §8 require thumb-reachable
  capture, ≥44px targets, and dense tables collapsing to mobile record lists (not clipped grids). The
  specific rule — *show work before configuration; collapse the three selectors behind one control on
  phone* — is the prototype convention that makes D28/D32 concrete on mobile. The current shell front-loads
  three selectors on mobile Work before showing work, which mildly violates D28's capture-first spirit; the
  contract fixes it without needing a decision.

### Item 12 — 90%-employee-first principle: default interface serves the everyday employee; governance objects appear progressively only to holders of managing roles

- **Classification: (b) — reversible prototype convention (operationalises the locked capability model).**
- **Touches:** OD-REDESIGN-28/34/55 · ADR-0020 (as amended) · ADR-0025 D8/D9/D15/D41.
- **Rationale.** The capability model is already locked: effective access resolves through scoped
  `can()` over Role defaults + sparse overrides (OD-REDESIGN-28 / D15), Team is scope not actor
  (OD-REDESIGN-55 / D41), Money is capability-gated (D1), and a new Work user starts at *My Tasks* (D9).
  "90%-employee-first" is the **UI discipline that correctly applies** that model — governance objects
  (Projects / Processes / Standards / Objectives) appear only to holders of managing roles. It conflicts
  with nothing locked; it is the faithful expression of D15/D41 in the default surfacing. *If* the current
  shell leaks a governance object to a non-holder (e.g. Ayu sees Processes), that specific leak is an (a)
  violation of D15/D41; the contract rule enforces the capability-correct default either way.

### Item 13 — Three-layer reuse rule: domain contracts (typed, distinct) → reusable UI families → job-first destinations; merging of SURFACES aggressive, merging of SCHEMAS conservative

- **Classification: (b) — reversible architecture/prototype convention.**
- **Touches:** OD-REDESIGN-16/29 · ADR-0025 D2/D3a/D3d/D7/D16.
- **Rationale.** This is the implementation discipline that realises the locked object-contract +
  one-renderer decisions: Object Contracts stay typed and distinct (OD-REDESIGN-29 / D16 — *no user
  Blueprint, no freeform data*), one renderer serves panel/page (D3a), and views are renderers over one
  record index (D3d). "Merge surfaces aggressively, merge schemas conservatively" is the engineering rule
  that keeps D16 honest while letting Work/Home/Modules share UI families. No conflict with any D; the
  contract encodes it as the three-layer mapping table (see `EXPERIENCE-CONTRACT.md` Rule 2).

## Summary table

| # | Change | Class | Primary cites | Owner call? |
|---|---|---|---|---|
| 1 | FB-style Signal composer | **(a)** | OD-42/43/39/36/37/38/51/49 · D22-D29/D25 | No (`@Site` → location pill per D37) |
| 2 | Signal feed → Home; Work archive/search only | **(c)** | OD-1/8/9/17/18/33 · D1/D8/D9/D20 | **Q1 — APPROVE** |
| 3 | Follow-up → Tasks saved-view + Money entry | **(b)** | OD-8 · D9 · J21 | No |
| 4 | Process occurrences surface as Tasks; "Run" not a UI noun | **(a)+(b); (c) deferred** | OD-11/12/13/54/41 · D6/D7/D26/D27/D39-D41 | No (schema deferred per OD-11) |
| 5 | Job-function → holder assignment indirection | **(c)** | OD-3/41/12 · D7/D26/D27/D41 | **Q2 — APPROVE** |
| 6 | Work children 8 → 3 (My work · Team work · Library) | **(b)** | OD-8/9/23 · D9/D3f | No |
| 7 | Canonical route per collection + URL state | **(a)** | OD-7/19 · D3a/D3d | No |
| 8 | Exactly one `aria-current="page"` | **(a)** | OD-7/19 · D3a | No |
| 9 | One page anatomy per route | **(b)** | OD-2/16 · D2/D3a/D7 | No |
| 10 | Verb+object actions; no bare `Create` | **(a)** | OD-21/46 · D10/D32 | No |
| 11 | Capture-first mobile disclosure | **(b)** | OD-42/46 · D28/D32 · BRIEF §8 | No |
| 12 | 90%-employee-first progressive governance | **(b)** | OD-28/34/55 · D8/D9/D15/D41 | No |
| 13 | Three-layer reuse (domain→UI family→destination) | **(b)** | OD-16/29 · D2/D3a/D3d/D7/D16 | No |

**Bucket counts:** (a) = 4 items (1, 7, 8, 10) · (b) = 7 items (3, 6, 9, 11, 12, 13, plus the surfacing
half of 4) · (c) = **2 ratification calls** (Q1 on item 2, Q2 on item 5). Item 4's only (c)-shaped question
(the occurrence-record schema) is deferred to the Process/Run schema ADR by OD-REDESIGN-11 and is **not**
counted against the cap of 3. The cap of 3 is respected with one slot in reserve.

## Owner ratification calls (≤3)

- **Q1 (item 2) — Signal home.** Approve the ambient Signal feed on Home below the non-removable brief;
  Work = Signals archive/search only; no Updates destination; composer only via the Action Launcher.
  **Recommend: APPROVE.**
- **Q2 (item 5) — Function-based assignment.** Approve generated Task definitions binding the PIC to a job
  function resolved to its current holder at spawn, ambiguity → human choice, turnover changes the holder
  not the Process. **Recommend: APPROVE.**

Both are owner-teed-up (item 2 is explicitly "pending final ratification"; item 5 is an owner directive).
No third call is raised; if the owner wants to decide the occurrence-record schema now, it belongs in the
deferred Process/Run schema ADR (OD-REDESIGN-11), not in this sprint.

## Deviations and verification

1. **`docs/decisions.md` is missing the OD-REDESIGN-1…55 section.** The index names it as authority #1,
   but the file contains zero `REDESIGN` matches and ends at OD-DASH-6. Every OD-REDESIGN-# citation above
   was therefore verified against `docs/redesign-decision-index.md` (the thematic map) **and** the ADR-0025
   D# it maps to. **Action for the Director:** the locked OD-REDESIGN-1…55 text should be written into
   `docs/decisions.md` (or the index's authority line corrected) before the SDD phase, so future agents
   have a single source of truth. This is a documentation gap, not a decision gap — no classification
   changes because of it.
2. **Every cited OD-REDESIGN-# was checked against the index.** The cited set is OD-1/2/3/7/8/11/12/
   16/17/19/20/21/22/23/28/29/33/36/37/38/39/41/42/43/46/49/51/54/55, each mapped to its ADR-0025 D#
   (D1/D2/D3a/D3c/D3d/D6/D7/D8/D9/D10/D12/D15/D16/D18/D20/D22–D29/D32/D35–D37/D39/D40/D41). All exist in the
   index/ADR and say what is claimed here. (Two earlier mis-cites — OD-REDESIGN-9 and OD-REDESIGN-22/24 —
   were corrected during self-verification: the Work workspace is OD-REDESIGN-8 / D9, and Signal mention
   fan-out is OD-REDESIGN-38/51 / D24; OD-REDESIGN-22 is cited only where it belongs, inline edit / D3c.)
3. **Item 1 `@Site` correction** is recorded as a contract rule (Site = location pill, not a mention
   target) consistent with D37; no owner call.
4. **Item 4 schema question** is deferred per OD-REDESIGN-11; the mockup-phase stance (thin occurrence
   record survives to own completion/history/snapshot; UI does not surface "Process Run" as a noun) keeps
   D6 intact.
5. **Contract falsifiability.** Each rule in `EXPERIENCE-CONTRACT.md` is written so a reviewer can mark it
   pass/fail against a rendered screen at desktop and ≤390px; no rule depends on a vibe.
