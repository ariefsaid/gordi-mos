# Record & page anatomy — the V3 composition standard

**Status:** v1 · authored 2026-07-23 for **OD-REDESIGN-90** (page anatomy is a declared, checkable artifact).
**Authority chain:** OD-REDESIGN-90 → `docs/jtbd.md` (job oracle) → `DESIGN.md` (RecordViewer / RecordCollection / Page-families) → `CONTEXT.md`.
**Method (binding — "skills are the method"):** every law below is derived from an installed skill and cites its
section. Skills read: `.claude/skills/impeccable/reference/distill.md` (content-first, strip-to-essence),
`.claude/skills/impeccable/reference/critique.md` (cognitive-load + Nielsen heuristics),
`.claude/skills/taste/SKILL.md` (§7 AI tells, Rule 4/5), and the `ui-ux-pro-max` ux database
(`python3 .claude/skills/ui-ux-pro-max/scripts/search.py --domain ux …`).

> **Why this spec exists.** Every layer of the design battery (mechanical guards, census Steps 1–6,
> Storybook + axe, interaction-contract, Luna) enumerates **elements**; none judged **composition**.
> The owner, on the Signal record: *"what are the JTBD in this page? it doesnt flow intuitively."* The
> fix is a *declared, JTBD-ordered anatomy* per record kind and page kind, plus a mechanical census
> step (**Step 2.5**) that asserts the **rendered section order** matches it.

> **Refinement of record — read this.** `DESIGN.md` → *RecordViewer* currently lists its regions
> *Identity → Ordered metadata and relations → **Content** → Activity → Actions*. OD-REDESIGN-90 moves
> **Content to lead** (directly after identity). This spec is the owner-ratified content-first ordering;
> the `DESIGN.md` region table and the `RecordViewer` render order (`record-viewer.tsx`, which today
> renders `metadata → relations → contentSlots → activity → actions`) are **downstream conformance
> debt** — a build that adopts this spec MUST carry a `RATIFY-BEFORE-MERGE:` line for the RecordViewer
> render-order change. This spec authors the standard; it does not edit those files.

---

## 1. The universal anatomy law

A record page is read **top-to-bottom as a job sequence**: *what is this → is it urgent → what do I do
about it → what is it connected to → where did it come from.* The regions render in that order for every
kind. Each law cites its skill source; a kind's declared anatomy (§2) is this law specialized, never
contradicted.

- **LAW-1 — Content leads, unclipped.** The first body region after identity is *the thing the record
  is* — the Signal's message, the Task's title+description, the Follow-up's outstanding debt — rendered
  in full, never truncated to fit a heading. *Sources:* distill.md "What's the primary user goal? (There
  should be **ONE**)" + "Essential information only"; critique.md Heuristic 2 (Match real world —
  "logical information order matching user expectations", natural reading flow); ui-ux `ux/Heading
  Hierarchy` (one sequential `h1`); taste §7 "NO Oversized H1s — control hierarchy with weight and
  color, not just massive scale" (the title is a label, not the content).

- **LAW-2 — Urgency rides with the content it qualifies.** Status / attention / due / age render
  *adjacent to* the content region, not in a separate downstream facts block the reader must scroll to
  and hold in memory. *Sources:* ui-ux `ux/Error Placement` ("errors should appear **near the problem**",
  don't hoist to a distant block); critique.md "The Memory Bridge" (don't force the reader to carry a
  fact from region 4 to interpret region 1); distill.md "Consolidation — combine related content".

- **LAW-3 — Actions group in ONE register.** Every record-mutating action ("what to do about it") lives
  in a single actions cluster — one primary, secondary beside it, the rest disclosed — never scattered
  across sections. *Sources:* distill.md "Clear hierarchy: **ONE primary action**, few secondary,
  everything else tertiary or hidden"; critique.md Working-Memory Rule (≤4 options at a decision point;
  "1 primary, 1–2 secondary, group the rest").

- **LAW-4 — Relations come after content and actions, as navigation.** Typed relations render as
  navigational pills / compact linked-record lists after the content+action band — never as embedded
  duplicate editors. *Sources:* OD-REDESIGN-7 ("navigational pills or compact linked-record lists, never
  embedded duplicate editors"); distill.md progressive disclosure.

- **LAW-5 — Provenance & audit LAST, quiet, disclosed — not dumped.** Author, timestamps, revision
  history, and audit trail render as the final region, visually muted, with voluminous history behind a
  disclosure entry point. A raw field diff (`old → new`) is **never** dumped inline in the default view.
  *Sources:* distill.md "Progressive disclosure — hide complexity behind clear entry points
  (accordions…)"; critique.md "The Visual Noise Floor" (one primary element, "everything else muted") +
  Heuristic 8 Aesthetic/Minimalist ("every element earns its pixel"); taste Rule 4 (group with
  `border-t` / `divide-y` / negative space — a quiet register, not a boxed card).

- **LAW-6 — Provenance micro-copy never repeats per field.** The whole-record read-only / provenance
  reason is carried **once**; it is never stamped as a caption on more than one field. (The `R4` rule —
  `task-record-adapter.tsx` `editableSpec` — generalized to captions by OD-REDESIGN-90.) *Sources:*
  distill.md "**Remove redundancy: if it's said elsewhere, don't repeat it here**"; critique.md
  Heuristic 8.

- **LAW-7 — Chunk by job; no card-in-card.** Sections are logic-grouped by the reader's job, ≤4 rows per
  chunk, separated by negative space / hairlines — not nested cards. *Sources:* critique.md "Chunking
  (≤4 items per group)"; taste Rule 4 ("generic card containers… use logic-grouping via `border-t`,
  `divide-y`, or purely negative space"); distill.md "never nest cards inside cards".

> *Database-search honesty (skill rule):* the `ux` queries `progressive disclosure` and `activity feed`
> returned **no database match** in `ui-ux-pro-max`; those laws rest on the impeccable skills above, not
> on a fabricated ux row.

---

## 2. Declared anatomies per kind

Each numbered section = **rendered order**. Format: **name · job it serves · content · NEVER**.

### 2.1 Signal record — the negative example, precisely

**Today's defect (the surface the owner flagged).** `RecordViewer` + `wrapSignalRecord`
(`signal-record-adapter.tsx`) render: identity (title = `firstLine(body)` **clipped to 80 chars**) →
**Facts** (6 rows: Reported by · Owning Team · Business Unit · Site · Occurred · Attention) → content
slots (*What happened* = body prose; *Signal* workflow) → activity (revisions + acks) → actions. So the
**message is buried under six facts rows**, its first line is **clipped into the heading**, and the
**revision diff is dumped raw** (`old → new`) — in the activity timeline *and* again in the workflow
disclosure. This violates LAW-1 (content not leading), LAW-1 (clipped title), LAW-5 (raw dump,
duplicated). The E7 mockup (`e7-records.js` `renderSignal`: `Facts` then `What happened`) drew the same
Facts-first order — under CLAUDE.md "mockup fidelity is not a data spec", OD-90 supersedes it.

**Declared Signal anatomy** (job families J12 report-reality / J14 correct):

1. **Message · read what happened · full Signal body, unclipped, leading; the attention pill rides with
   it (LAW-2).** NEVER: clip the body into the identity heading; NEVER place any Facts/metadata block
   before it.
2. **Reach & response · know the audience and take the one factual response · mentions + visibility
   line (who can see / who is notified), the Acknowledge action, the "who's acknowledged" roster, linked
   work + Create-linked-Task.** NEVER: a Status, PIC, Supervisor, due date, resolution, or Approve/Close
   affordance — a Signal is a fact, not work (jtbd A1/A2, OD-REDESIGN-45).
3. **Discussion · discuss without turning fact into work · comment thread.** NEVER: a "resolve"/"close"
   verb on the thread.
4. **Facts (provenance) · verify who/where/when when needed · Reported by · Owning Team · Business Unit
   · Site · Occurred · Category — quiet, near the end.** NEVER: lead with these (the current defect);
   NEVER a per-row "fixed after posting" caption on every field — one note, if any (LAW-6).
5. **History (audit) · see honest revision history · "edited N times" disclosure → human-readable
   summary; acknowledgement timeline.** NEVER: a raw `old → new` diff in the default view; NEVER the
   same revision list rendered in two regions.

*Actions register (LAW-3):* Acknowledge (+ Correct / Retract where authorized) — one place.

### 2.2 Task record — reconciled with content-first

**E7 anatomy** (`e7-records.js` `renderTask`; `task-record-adapter.tsx`): *Ownership → Status & Timing →
Details → Activity.* **Content-first reconciliation:** the **title + description ARE the content**, so
they lead; Status + Due are urgency that **rides with the content** (LAW-2), not a standalone second
section; the remaining Status-&-Timing rows (Project/Process, Objective, Generated-by, Source) are
**relations** and drop to the relations register. E7's intent (calm document, ownership prominent) is
preserved; only the *ordering* obeys LAW-1/LAW-2.

1. **Title + description (content) · understand the commitment · title `h1` unclipped, description prose
   directly beneath; Status pill + Due ride with it.** NEVER: relegate the description to a "Details"
   section below ownership/status (today's third-place slot); NEVER re-list the title as a field.
2. **Ownership · know who owns it · Business Unit · PIC · Supervisor (+ Supervisor source).** NEVER:
   RACI / Consulted / Informed (jtbd A4); NEVER Business Unit relabelled as Team.
3. **Relations · see what it belongs to · Project/Process · Objective · Generated-by · Source ·
   From-Signal / From-Exception — navigational, each rendered ONLY where the datum exists.** NEVER: a
   naked "Ad hoc" / "—" placeholder row (the R5 Classification fossil — `task-record-adapter.tsx`).
4. **Checklist (content slot) · the inherited-ownership steps.** NEVER: an independent status / owner /
   Team / due control per checklist item (OD-REDESIGN-12).
5. **Activity (audit) · what changed · the event log, last, quiet.**

*Actions register:* Mark complete / Reopen (lifecycle-aware) + Archive — one place; the read-only reason
appears once (LAW-6 / R4).

### 2.3 Follow-up record

**E7** (`e7-records.js` `renderFollowup`): *Outstanding → Settlement lifecycle → Promises & payments →
Audit history.* Already close to content-first — the debt IS the content. Job family J21 (collect).

1. **Outstanding (content) · see what's owed and how late · Counterparty · Amount · Balance · Age,
   leading; the overdue-age signal rides with it (LAW-2).** NEVER: bury it beneath owner / finance-
   confirm provenance.
2. **Settlement · advance the collection · lifecycle (chased → promised → partial → settled), the ONE
   next action (Record promise / Record partial / Attempt settlement), the evidence-gate callout,
   validation-error-with-recovery.** NEVER: a Settled state without cash-in date + proof + Finance
   confirmation, and NEVER a settle-without-evidence path (jtbd A9).
3. **Roles · who chases, who confirms · Owner (chase) · Finance confirm.**
4. **Promises & payments · the record of promises/partials with cash-in date + proof.**
5. **Audit history · timestamped events, last, quiet.**

*Actions register:* the single lifecycle next-action (+ add-proof) — one place.

### 2.4 Collection page — already mostly ratified (head → toolbar → results)

The three-region collection anatomy is ratified by **B2 / `DESIGN.md` → Page Archetypes** (Workspace
family), **OD-REDESIGN-8** (one index grammar: filters, sorts, groupings, saved views, inline edit,
inspector), **OD-P3-2** (the real toolbar), **OD-P5-1** (group-by = first-class toolbar toggle, default
flat), and **OD-REDESIGN-10** D3a/D3d (row-click → right panel; Table/Kanban/Timeline are Views). Stated
here so Step 2.5 can assert it uniformly.

1. **Head · know where you are + create · `PageHead variant="content"` — icon + title (`h1`) + record
   count + the ONE primary action ("＋ New").** NEVER: a bespoke page head duplicating the shared
   `PageHead`; NEVER a second `h1`.
2. **Toolbar · query and scope the collection · view switcher (Table / Kanban / Timeline) · filters (BU
   · Person · Mine/RACI/All) · group-by toggle · search.** NEVER: decorative controls for capabilities
   the adapter does not support (`DESIGN.md` → RecordCollection); NEVER a second query grammar owned by
   the adapter.
3. **Results · scan + act, open → panel · the collection adapter (grouped `DataTable` / Feed / Board),
   group headers carry count + overdue subtotal; state-kit sparse states (loading / empty /
   filtered-empty / error) each with ONE next action (taste Rule 5).** NEVER: embedded record editors in
   rows (OD-REDESIGN-7); NEVER a KPI/card-soup band above the results that answers questions the operator
   did not ask before the one they did (design-reviewer "information overload").

---

## 3. Census Step 2.5 — anatomy conformance (mechanically executable)

Step 2.5 sits **inside the census protocol** (battery layer 1, Steps 1–6 — OD-REDESIGN-89), between
Step 2 and Step 3. It runs per changed surface, at desktop **and** phone, on the Storybook story or the
live route. **A score without the recorded order-vectors is void.**

**Procedure (an auditor executes this verbatim):**

1. **Identify the kind** (Signal / Task / Follow-up / … record, or a collection page) and pull its
   **declared order vector** from §2 (e.g. Signal = `[message, reach, discussion, facts, history]`).
2. **Extract the observed order vector** from the rendered DOM, in document order:
   - *Records:* the region markers the shared viewer already emits —
     `[...root.querySelectorAll('[data-viewer-region]')].map(n => n.dataset.viewerRegion)` — plus each
     content-slot's `aria-label`. Normalize to the declared vocabulary (identity is region 0; `metadata`
     rows named "Facts"/"Ownership"/… map by their section `id`/label).
   - *Collections:* `[PageHead, toolbar/tool-rail, collection-body]` by DOM order.
3. **Assert `observed === declared`** (identity excluded from the comparison; it is always region 0).
4. **Evaluate the five FAIL gates.** ANY true = Step 2.5 **FAIL** for the surface:

   | Gate | Fails when | How to check |
   |---|---|---|
   | **F1 — Content not leading** | the first body region after identity is not the kind's content region | observed vector index 0 ≠ declared content region (Signal `Facts` before `message` ⇒ FAIL) |
   | **F2 — Clipped record title** | the identity heading is a truncated / ellipsized projection of the content | `h1.textContent` is a strict prefix of the content region text and ends in `…`/truncation, OR the full content is absent from any content region (Signal title = `body.slice(0,79)+'…'` ⇒ FAIL) |
   | **F3 — Per-field provenance captions** | more than one field in any metadata section carries its own read-only / provenance caption | count fields with a rendered provenance/`readOnlyReason` caption per section > 1 ⇒ FAIL (LAW-6) |
   | **F4 — Raw audit dump** | the activity/history region renders a raw `old → new` field diff inline in the default view, OR the same revision list appears in two regions | history region shows a diff pair without a disclosure gate, or the revision node set appears under two distinct `data-viewer-region`s ⇒ FAIL (LAW-5) |
   | **F5 — Actions in >1 register** | record-mutating action controls appear in more than one region/cluster | mutating buttons resolve to >1 `data-viewer-region` (or >1 DOM action cluster) ⇒ FAIL (LAW-3) |

5. **Record evidence** in `docs/reviews/<branch>.md`: the declared vector, the observed vector (desktop
   + phone), and pass/fail for F1–F5. A missing or unextractable observed vector is a **FAIL** (a surface
   cannot self-attest).

**Pass condition:** `observed === declared` **and** F1–F5 all false, at both breakpoints, with vectors
recorded. Green mechanical guards / Storybook / interaction-contract do **not** substitute for a recorded
Step 2.5 pass.

---

## 4. Requirements (EARS) & acceptance criteria (Given/When/Then)

### Functional requirements

- **FR-ANAT-001** — While rendering any first-class record, the record page shall present the record's
  own content as the first body region after identity.
- **FR-ANAT-002** — The record identity heading shall present the record's canonical name; where that
  name is derived from body prose, the full prose shall render unclipped in the content region and the
  heading shall not be an ellipsized slice of it.
- **FR-ANAT-003** — The record page shall render status / attention / due / age adjacent to the content
  region, not in a separate downstream metadata block.
- **FR-ANAT-004** — The record page shall group every record-mutating action in exactly one actions
  register.
- **FR-ANAT-005** — The record page shall render typed relations as navigational links after the content
  and actions, and shall not render an embedded duplicate editor for a related record.
- **FR-ANAT-006** — The record page shall render provenance and audit history as the last region, quiet,
  with voluminous history behind a disclosure; it shall not render a raw field diff inline in the default
  view.
- **FR-ANAT-007** — The record page shall carry at most one whole-record provenance/read-only note and
  shall not stamp a provenance caption on more than one field.
- **FR-ANAT-008** — The Signal record shall render in the order Message → Reach&response → Discussion →
  Facts → History, and shall not present any Status/PIC/Supervisor/due/resolution/Approve/Close control.
- **FR-ANAT-009** — The Task record shall render in the order Title+Description(with Status+Due) →
  Ownership → Relations → Checklist → Activity.
- **FR-ANAT-010** — The Follow-up record shall render in the order Outstanding → Settlement → Roles →
  Promises&payments → Audit history.
- **FR-ANAT-011** — A collection page shall render in the order Head → Toolbar → Results.
- **FR-ANAT-012** — If a rendered surface's observed section-order vector does not equal its declared
  anatomy, or any Step-2.5 gate F1–F5 is true, then the census shall fail the surface at Step 2.5.

### Acceptance criteria

- **AC-ANAT-001** (unit) — *Given* a non-retracted Signal with six facts and a multi-line body, *When*
  the record renders, *Then* the first body region after identity is the full Signal message and no Facts
  section precedes it.
- **AC-ANAT-002** (unit) — *Given* a Signal whose body exceeds 80 characters, *When* it renders, *Then*
  the content region shows the complete body text and the identity heading is not an ellipsized slice of
  the body.
- **AC-ANAT-003** (unit) — *Given* a read-only record, *When* it renders, *Then* at most one whole-record
  read-only note appears and no metadata section carries more than one field-level provenance caption.
- **AC-ANAT-004** (unit) — *Given* a Signal with revisions, *When* it renders, *Then* no raw `old → new`
  diff appears in the default view, the revision history appears only behind its disclosure as a
  human-readable summary, and the revision list appears in exactly one region.
- **AC-ANAT-005** (unit) — *Given* a Task offering complete/reopen and archive actions, *When* it
  renders, *Then* every mutating action button occupies exactly one actions region.
- **AC-ANAT-006** (unit) — *Given* a Task with a description, *When* it renders, *Then* the description
  renders in the content band directly beneath the title and above the Ownership section.
- **AC-ANAT-007** (unit) — *Given* a Follow-up, *When* it renders, *Then* Counterparty + Amount +
  Balance + Age is the first body region, above the Owner/Finance-confirm roles.
- **AC-ANAT-008** (unit) — *Given* a collection route, *When* it renders, *Then* the DOM order is
  `PageHead` (h1 + count + primary action) → toolbar → results body, with exactly one `h1`.
- **AC-ANAT-009** (census/unit) — *Given* the extracted observed order-vector for a kind, *When* it is
  compared to the declared anatomy vector, *Then* they are equal and each Step-2.5 gate F1–F5 is false;
  otherwise Step 2.5 fails and the surface does not pass the census.
- **AC-ANAT-010** (unit) — *Given* a Signal record, *When* it renders, *Then* no Status, PIC, Supervisor,
  due-date, resolution, or Approve/Close control is present (jtbd A1/A2 guard).

> **Test layer (pyramid):** AC-ANAT-001..008 + 010 are owned by **Unit** (Vitest/RTL) DOM-order and
> presence/absence assertions on the real adapters (`wrapSignalRecord`, `createTaskRecordAdapter`,
> the Follow-up adapter) through `RecordViewer`; the AC-id is tagged in each owning test's title so
> `grep -r AC-ANAT-XXX` finds the proof. **AC-ANAT-009** is additionally the executable body of census
> Step 2.5 (§3), recorded in `docs/reviews/<branch>.md`.
