# Cascade — IA + IxD objective (the literacy bar as the governing design objective)

- Status: Phase-0 anchor (2026-06-24) — awaiting owner mockup pick
- Spec: `docs/specs/cascade-foundation.spec.md` **NFR-206** (the operability bar) · ADR-0014
- Vocabulary: `CONTEXT.md` § Cascade / § Ownership — **"Project / Process", "Work-line", "Objective"**
- Mockups this anchors: `mock-simple-D1-tasks-grouped.html` · `mock-simple-D2-person-card.html` · `mock-simple-D3-standalone.html`

---

## The governing objective (NFR-206, restated for design)

> **Every cascade surface must be operable, with no training, by a high-school-graduate workforce.**

This is a **first-class IA + IxD objective**, not a quality nicety. It outranks model completeness and
feature density (CLAUDE.md: *"usability and speed beat model completeness"*). Concretely, every cascade
screen must pass all five:

1. **One plain question per screen.** The screen answers exactly one thing, stateable in a sentence a
   non-specialist would say out loud. Cascade's question: *"Is this person tied up in daily/ongoing work,
   or in projects — and where?"*
2. **One obvious primary control.** A single, unmistakable thing to act on (here: pick a person, or group
   the list). No competing calls to action.
3. **Everyday words only.** Use the `CONTEXT.md` in-app vocabulary: **Project**, **Process / daily**,
   **Work-line**, **Objective**, **Owner**. Banned from the UI: *Initiative, SWP, lane, Run / Optimize /
   Transform, RACI taxonomy, attribution, topology.* Lane is **omitted from the UI entirely** (owner
   2026-06-24) — it may persist invisibly in data.
4. **No nested menus or modes** to reach the core job. The answer is on the surface, not behind a drawer,
   a tab-within-a-tab, or a mode switch.
5. **Reading load ≤ a short paragraph.** If a screen needs explaining, it is a **defect** — Lens-D /
   design-review treats "needs a tooltip to understand" as a failure, not a polish item.

**The simplified model behind all of this:** the core is the **Task table + two added fields —
`objective` and `work_line`**. `work_line` carries a name + a type (**project | process**). `objective`
is a plain grouping label. Two tiny lookup tables feed canonical dropdowns; nothing richer. The only
must-have distinction in the UI is **project vs process** — *"is this person's work project-based or
daily/ongoing?"*

---

## What the literacy bar means for **IA** (information architecture)

- **Flattest possible nav.** Attribution should appear *where the work already lives*, not in a new
  destination the workforce must learn to find. Prefer adding to the Tasks surface (D1) over minting a new
  top-level route (D3). Every new nav item is a new thing to teach.
- **Attribution is read, not navigated.** The "where does this person's effort go" answer is a *view* of
  existing task data (group + count), not a separate sub-application with its own object model. The
  cascade is a lens on Tasks, not a parallel module.
- **One level of grouping, max.** Work-lines group tasks; the project/process split groups work-lines.
  That is the entire hierarchy a user sees — two visible tiers, no deeper. (Objective is a flat label, not
  a third grouping level in the first slice.)
- **No new vocabulary in the IA.** Nav labels, column headers, and section titles are all `CONTEXT.md`
  everyday words. The rail says "Tasks" / "Workload", never "Initiatives" / "Cascade spine".

## What the literacy bar means for **IxD** (interaction design)

- **Zero-training flows.** A user lands, reads one sentence, and has the answer. No onboarding, no
  empty-state that requires reading docs. The empty state itself is a plain sentence ("Sari isn't tied to
  any project or daily job yet — her work shows on her task list.").
- **One action per screen.** The single control is *pick a person* (D2/D3) or *group the list* (D1).
  Filters beyond that one control are progressive, not required to get the answer.
- **Project vs process is a TEXT label, never color-only** (WCAG 1.4.1 + the literacy bar — a colour-blind
  or untrained user must read the word). A small dot may accompany the word as redundant reinforcement,
  never as the sole signal.
- **The answer is pre-computed into a sentence.** Don't make the user do the arithmetic. "Maya's work:
  2 projects and 1 daily job" is the design deliverable; the table/panels are the evidence behind it.
- **Read-only by default.** The workload view answers a question; it doesn't ask the user to manage
  anything. Editing work-lines happens on the Task (set a work-line on a task) — one obvious place.

---

## How each mockup encodes the bar

| | D1 — no new screen | D2 — summary card | D3 — standalone surface |
|---|---|---|---|
| **One question** | "What is each task part of — project or daily?" (on Tasks) | "Is this person on daily or project work?" | same, on its own route |
| **One control** | Group by = Work-line | Person picker | Person picker |
| **New nav** | **none** | none (embeds in a Person page) or a tiny route | **one new top-level route** |
| **Reading load** | a grouped list + 1 caption line | 1 sentence + 2 short lists | 1 question + 1 sentence + 2 panels |
| **Project/process** | text tag on each group header | text section headings | text panel headers |
| **Teaches a new concept?** | no — it's the Tasks list they know | minimal — a read-only card | yes — "there is a Workload place" |

All three: lane omitted, no RACI battery, no jargon, AA contrast, dense table ≥768px → cards <768px,
`--ds-*` tokens only, one blue as the sole action colour.

---

## Recommendation (lean lazy — does this even need a new screen?)

**Recommend D1 (no new screen), with D2's plain sentence borrowed as a caption.**

Reasoning against the literacy bar:
- **D1 adds zero nav and zero new concepts.** The workforce already lives in Tasks. "Group by Work-line"
  + "filter to a person" answers the workload question inside the one tool they know — the laziest
  solution that actually works (YAGNI on a whole new surface).
- **It also delivers the attribution itself**, not just a report of it: the same two columns (`objective`,
  `work_line`) that the model needs are simply made visible. One build serves both data-capture and the
  read.
- **D2/D3 are reports built on top of D1's data.** They add a surface to maintain, a route to teach, and a
  second place the same numbers can drift. Per the simplified model, that's premature.
- **D2's one win is the plain sentence** ("Maya's work: 2 projects and 1 daily job"). Fold that single
  line into D1 as a caption above the grouped list — you get D2's literacy clarity without D2's surface.

**If the owner wants a person-first lookup** (manager scanning *people*, not tasks), **D2-as-embeddable-card**
is the better second step than D3 — it can sit on a future Person/Team page with no new top-level route,
and reuses D1's underlying query. **D3 (a standalone route) is the least lazy** and should only win if the
owner specifically wants an addressable Workload URL and admin "look up anyone" as a first-slice job.

**Pragmatic path:** ship D1 now (columns + group-by + the borrowed sentence). If person-first demand
appears, add D2 as a card component reusing the same data layer. Defer D3 unless a standalone URL is asked
for.

---

## Token note / DESIGN.md gaps

- **No new tokens needed.** With lane omitted, the old `--lane-run/opt/tra-*` gap from the A/B mockups is
  gone. Project/Process reuse existing kit tag tokens: **Project** = `--ds-tag-background-blue` /
  `--ds-tag-text-blue` + `--ds-color-blue` dot; **Process (daily/ongoing)** = `--ds-tag-background-gray` /
  `--ds-tag-text-gray` + `--ds-font-color-tertiary` dot. Status, action, brand all unchanged.
- **One watch-item (not a gap):** `--ds-tag-background-blue` equals `--ds-accent-tertiary` (the status
  "in progress" pill tint) — same fill. The Project tag is disambiguated from status by **always
  carrying the word "Project" + a dot and sitting in a categorical (non-status) column**, so WCAG 1.4.1
  holds via text, not colour. Implementer should keep the word present at all sizes; do not let the
  Project tag degrade to a dot-only chip.

## Open questions for the owner

1. **Pick the shape:** D1 (recommended), D2, or D3 — the pick becomes the per-issue design-plan anchor.
2. **D1 default:** Tasks grouped-by-Work-line by default, or flat with group-by as opt-in? (Lean opt-in.)
3. **Objective column:** always shown on Tasks, or only when grouped/relevant? (Width cost on a wide table.)
4. **Tag wording:** "Process · daily" vs just "Process" vs "Daily / ongoing" — which reads cleanest at the
   literacy bar? (Mockups use "Daily / ongoing" for the human-facing label, "Process" as the data word.)
5. **Where a person-first view lives** *if* D2/D3 is chosen — Person/Team page section (D2) vs new route (D3).
