# v4 inheritance ledger — what carries over from v3, what doesn't, and where the owner's decisions disagree

**Status:** round 1, opened 2026-07-27. Living document for the v4 (impeccable-framework) redesign.

## Authority model for v4 (owner-directed 2026-07-27)

> *"docs might drift, but docs that matters are the decisions over time"*

1. **Code is the truth** about what exists. When a doc and the code disagree about what shipped, the
   code wins and the doc is drift.
2. **Decisions-over-time are the truth** about intent — `docs/decisions.md` (`OD-*`), the ADRs, and
   the owner's verbatim directives.
3. **Everything else is evidence, not authority** — plans, review ledgers, audit registers,
   contracts, status files. Do not re-derive intent from them.

This inverts v3's working habit, where a large doc apparatus became its own authority and drifted
from both the code and the owner.

## The core v3/v4 split

**CORRECTED 2026-07-27 (owner).** An earlier draft of this file said v3's execution was discarded.
That was wrong, and the owner corrected it after seeing four invented visual worlds:

> *"none of the above. none of them are professional looking. try to capture from v3."*

The correct reading of *"dev = redesign"* is: **`dev` is the thing being replaced. v3 is the
professional baseline to capture.** Both v3's decision corpus (91 `OD-REDESIGN-*` + ADR-0025 D1–D41)
**and** its built visual world are inherited.

This changes which impeccable branch v4 is on. v3 is an **established world**, so the framework says
*inherit it and document that identity* — not invent a replacement. The `new-work` / concept-roll
path (which produced the four rejected comps: Buku Besar, Warung Board, Risograph, Canon) was the
wrong branch and is abandoned.

Last official v3 verdict: **30/40 · BAR NOT MET** (`v3-redesign` @ a152705, 2026-07-24). The gap to
close is composition and completeness, **not** visual language.

### Observed on the running v3 build (2026-07-27, `v3-redesign` @ a152705)

What is genuinely good and must be preserved: the two-zone rail with grouped destinations; the
attention-first Home brief (Signals / Overdue / Failed checks, each with owner avatar, team, and a
status pill); the Tasks table with saved-view chips, Table/Card toggle, and overdue rendered in red;
consistent status-pill and avatar grammar throughout.

What is visibly weak — a concrete candidate for the 30/40 gap: on **Café · Log**, four large KPI
cards (548 / 0 / 0% / 21) consume roughly the top half of the first viewport before a single dish row
appears, and each dish row is tall. The contributor persona's job is *"capture in one short pass and
be back to work in under a minute"* — that composition makes them scroll past management summary to
reach the one control they came for. The visual language is right; the composition serves the wrong
persona first.

## What v3 actually shipped (from code, not docs)

Source of truth: `mos-app/src/shell/destinations.tsx` on `v3-redesign`.

| Zone | Entries |
|---|---|
| **Workspace** | Home · Work · Events · Money `[anyOf: finance, admin]` · Inbox |
| **Work children** (flat, always-expanded, 4) | Signals · Tasks · Projects & Processes `[cap: workline.manage]` · Objectives `[cap: objective.manage]` |
| **Modules** (grouped by BU, role-scoped via `workMatch`) | Retail Ops → Café, Ecommerce · B2B Ops → Roastery |
| **Utility** | Admin `[anyOf: admin]` · Personal Profile |

Notable: `Plan` and `Operate` do not exist as destinations. Kitchen and Bar are unified as **Café**.

## The owner's three v4 IA points, checked against code

| Owner statement (2026-07-27) | Code verdict | Disposition for v4 |
|---|---|---|
| *"should be no plan"* | ✅ **Already true.** No Plan destination exists in v3. Plan folded into Work; Operate folded into the module zone (ADR-0025 D1). | Inherit as-is. Confirms the decision, no change needed. |
| *"should add signal"* | ✅ **Already shipped.** `/work/signals` is Work child #1, and `Events` is a workspace root. Signal replaced Weekly Updates + Daily Log (OD-REDESIGN-33/44). | Inherit as-is. See INC-2 on the naming. |
| *"v3 is missing objective"* | ⚠️ **Right in effect, wrong in mechanism.** `/work/objectives` exists as Work child #4 — but see INC-1. | **Fix in v4.** This is a real defect. |

## Inconsistencies found — round 1

### INC-1 — Objectives are invisible to the persona whose job requires them `[SEVERITY: high]`

`mos-app/src/lib/capabilities.ts` grants `objective.manage` to **`admin` only**:

```
admin:     objective.manage, workline.manage, followup.confirm, signal.*, process.*
ops_lead:  workline.manage, signal.*, process.start          ← no objective.manage
finance:   followup.confirm, signal.mention_bu, signal.retract
member:    process.start
```

`destinations.tsx` renders the Objectives rail child only for a holder of `objective.manage`.

**The conflict:** `docs/jtbd.md` v0.3 (owner-ratified) defines the **Function-owner / BU-head** as
*"the A person on that BU's Objectives"*, whose job is to see *"my cascade progress against plan"*.
That persona holds `ops_lead`, not `admin`. The capability map therefore denies the strategic spine
to the one persona defined by it. The Lead/manager persona is excluded for the same reason.

Two owner decisions are in genuine tension here — the JTBD persona definition and the ADR-0020 v1
capability seed — and nothing on record reconciles them.

**RESOLVED — owner, 2026-07-27 (`OD-V4-1`):**

- **Objectives are visible to everyone.** No capability gate on read.
- **Writeable at lead level** (not admin-only).
- **Historical changes are captured** — an Objective carries an audit trail of its changes over time.
- **The cascade is not a separate route.** It is expressed as bidirectional relations on the records
  themselves: an **Objective** shows the Projects and Processes under it; a **Project/Process** shows
  both the Objective it belongs to *and* the Tasks under it.
- **Presentation is a design decision**, delegated to the impeccable pass: *"the views and how it's
  presented is subject to taste and impeccable and how best to display that without confusing the
  viewer."*

This retires the `/work/cascade` route concept from v3 and makes relation-navigation a first-class
design problem for v4.

### INC-2 — "Events" (nav root) vs "Signals" (Work child) vs "Signal" (the object) `[SEVERITY: medium]`

Three names for one concept family ship simultaneously: `Events` as a workspace root, `Signals` as a
Work child, and `Signal` as the record type. The owner's 2026-07-27 word was *"add signal"* — he
named the object, not the root. `CONTEXT.md` is the binding glossary and one noun should win.

**~~RESOLVED — owner, 2026-07-27 (`OD-V4-2`): Signals everywhere.~~ REVERTED 2026-07-28 — the
ratification rested on a false premise supplied by the Director (see X-11).**

The Director reported an audit line — *"Signals (Work child) directly above Events (root) — two names,
one concept"* — as fact and put it to the owner as *"one noun wins"*. That is **adjacency, not
synonymy**: `events-page.tsx` is a 38-line stub spec'd as `docs/specs/events-stub.spec.md` whose copy
reads *"Outlet events — cuppings, workshops, bookings"*. An outlet calendar is a different domain from
a **Signal** (an intentional post carrying attention level, mentions and location). The rename briefly
put "Signals" over calendar copy, duplicating Work's child.

**Reverted (owner-directed, i18n strings only):** root back to **Events / Acara**, Work child back to
plain **Signals / Sinyal**, `job.events` back to the outlet sentence in both catalogues and in
`job-sentences.ts`. The `/events` route, the `Signal` record type and all internal ids were never
touched, so nothing structural unwound. **The real INC-2 defect — two adjacent rail entries reading
identically — does not exist in this state**; it only appeared *because of* the rename.

*Lesson recorded in `prove-the-check-can-fail`: a finding from an audit is a hypothesis. One `Read`
of the page it describes would have caught this before it reached the owner as a decision premise.*

### INC-3 — `redesign-decision-index.md` has drifted from the code `[SEVERITY: low — doc only]`

It states the rail is *"Home · Work · Money [gated] · Inbox"* — four destinations, **omitting
Events**. The code ships five. Straight documentation drift; the code wins. Recorded as a live
example of why the authority model above was adopted.

### INC-4 — the quicksand is on record as an owner complaint, twice `[SEVERITY: process]`

Verbatim, from `docs/reference/provenance/owner-directives-index.md`:

- P-03: *"when we did a new version… the other part that is already good… get changed"*
- P-04: *"i dont want to look exactly like e7 … features and looks were missed along the way …
  moving quicksand"* (2026-07-19)

v3 responded to this with **more apparatus** — a composite oracle, a salvage inventory, a
convergence audit, a 39-row directive index. The complaint recurred anyway, which is evidence the
apparatus was not the fix. v4's answer is structural instead: **commit to one visual world up front
and change the system (tokens/primitives), not screens** — so a fix cannot land on one surface and
regress another.

## Still to mine (round 2)

- `docs/decisions.md` `OD-REDESIGN-1…91` — full read for internal contradictions.
- `docs/reference/provenance/{01,02,03}-*.md` — ~550KB of verbatim owner transcripts. Contains the
  original wording behind most ODs; the highest-value source for "what did he actually say".
- `PARTIAL` and `CONFLICT-needs-owner` rows in the directives index — v3 shipped 9 partial and left
  at least 2 owner A/B calls open. Each is an inherited open question for v4.

## Owner calls — status

| # | Call | Status |
|---|---|---|
| OD-V4-1 | Objectives visibility / cascade-as-relations | **RESOLVED** 2026-07-27 (see INC-1) |
| OD-V4-2 | Signals is the single noun | **RESOLVED** 2026-07-27 (see INC-2) |
| OD-V4-3 | IA carryover | **RESOLVED** — inherit v3's IA wholesale minus the above; owner reserves the right to revisit specific items later, without re-opening the whole IA |
| OD-V4-7 | Home may use a tile layout — the one-column density rule is era-bound | **RESOLVED** 2026-07-28 (below) |
| OD-V4-8 | Display type above 24px | **DEFERRED** 2026-07-28 (below) |
| OD-V4-9 | Home layout is a per-person preference, not one imposed shape | **RESOLVED** 2026-07-28 (below) |

## `OD-V4-9` — Home layout is a per-person preference (owner, 2026-07-28)

**The problem.** Home has to serve four personas whose relationship to volume is opposite. A
contributor mid-shift wants one short answer; an owner-director scanning six Business Units wants
everything at once. One imposed layout makes Home wrong for somebody by construction, and the
owner's brief — *"how best to structure this in a way that even there's lots to do, its still seems
manageable"* — has no single answer that is true for both.

**Decision.** Home's arrangement becomes a **per-user setting in Personal profile**. Three options,
the **same information in all three** — only the shape changes. This is explicitly **not** scoped to
the owner: every user picks their own, and the setting is theirs, not an admin assignment.

| Option | Shape | Suits |
|---|---|---|
| **Focused** *(default)* | One section at a time, chosen from tabs, counts pinned to the tabs so nothing hides | Anyone with a lot on who wants to work through it. Default because it is the only option where volume **cannot** overwhelm |
| **Overview** | Every area at once as tiles, sized by consequence | Whole-company scanning where a click is the cost, not the volume |
| **List** | One continuous list grouped by kind | The most familiar and the most complete; nothing behind a click |

**Binding details.**

- **The Signals feed is in all three, always** (owner: *"C is always with feed"*). Signals are the
  only feed-shaped record on Home — chronological messages from many named people — so they leave the
  work stack in every option rather than being a property of one of them.
- **User-facing names are Focused / Overview / List.** The A–J letters are working shorthand from the
  mockup rounds and must never reach the product.
- **The picker is a wireframe-thumbnail chooser**, the standing convention for a page-structure
  choice: the diagram carries the shape so the label does not have to describe it. Mockup:
  `docs/design-mockups/home-priority-2026-07-28/index.html` → *Profile picker*.
- **Default for a new account is Focused.** A new user has no basis to choose, and the least
  overwhelming option is the safest default.

**Rejected: a fourth "Table in tiles" option.** Its whole value was density, and density is the
property that broke twice under test — it overflowed at every width above 620px, and the same
label-left interior failed again when tried inside the feed layout, because that rhythm needs full
width. Three options is also the practical ceiling for a preference nobody will study.

**Binding: three options, ONE component set.** The options are *arrangements of the same primitives*,
never three implementations of a page. The shared set is `layout` (work + feed), `bento` + `tile`
(+ a `dense` modifier), the row grammar, the feed, and the region tabs. A layout option may override
only what genuinely differs, and must say why at the override.

This is the reusability bar the owner has restated throughout, and it is not cosmetic: the mockup
had already drifted into `.bento` declared 3×, `.tile` 3×, `.layout` 4× and the weight spans 12×,
one copy per view. That is how three *options* quietly become three *surfaces* — they diverge on the
next change, and a fix applied to one silently misses the others. **Responsive breakpoints act on the
primitives**, so no option can drift from the others' behaviour independently. If a proposed option
cannot be expressed as an arrangement of the shared set, that is the signal it is a different
surface and does not belong in this setting.

**Owed before build:** the stored preference needs a home on the person record and a sane fallback
when the value is missing or unknown. Not specced here.

## `OD-V4-7` — Home's one-column rule is amended for tiles (owner, 2026-07-28)

**What was in the way.** `DESIGN.md` § *MOS density mode* (owner-ratified 2026-06-10, `OD-P0-7`)
binds Home to a **single content column ~1080px, no side asides, no second card column**, with
**one dominant module** and **≤2 auxiliary strips**. The bento direction the owner requested by name
(round-2 mockup, direction F) breaks all four clauses. This was found by reading DESIGN.md while
answering an unrelated type question, *not* by the design gate — the gate would have caught it only
at merge.

**Why the rule no longer fits.** It was calibrated in **era E1** over two Phase-0 redline rounds
(IA-1..5 "too dense" → IA-6/7 "too sparse" → IA-8 adopted, `OD-P0-6`), when Home was a digest for a
~15-person first slice. The app is now **E6**: the operating system for ~30 people across six
Business Units, with modules in the rail, and the owner's own 2026-07-28 brief is that a single
column *becomes* the problem at volume — *"currently its just a wall of text… especially when we
have multiple signals from different people, tasks from different projects / process as well as
trying to followup the team members."*

**Decision.** Home may use a **tile/bento composition**. Every other surface keeps the single-column
rule. The density mode's *intent* — calm, one dominant thing, no card-soup — is preserved by
carrying these constraints into the amendment:

- Tiles are **sized by consequence**, never a uniform grid. One lead tile dominates.
- Every tile carries **real rows**, never an icon + heading + stat. (`craft-floor` names same-size
  icon/heading/text cards as the lazy page scaffold; that ban stands.)
- **No nested cards.** A tile is one level deep.
- Phone degrades to stacked sections — the tile grid is a desktop/tablet affordance.

**Still true and not reopened:** the One Blue Rule, Tinted-Status, Single-Border, Soft-Elevation,
the 44px phone tap-target floor, and the 1180px content measure.

**Owed:** `DESIGN.md` § MOS density mode carries the amendment inline (done with this decision).
A tile layout must not ship to Home until direction F is actually picked — this decision unblocks it,
it does not order it.

## `OD-V4-8` — display type above 24px is DEFERRED (owner, 2026-07-28)

`DESIGN.md`'s display scale stops at **24px** (`page-title`) and owns no step above it, so a
page-level verdict line cannot outweigh the page title. Surfaced by direction D (`bolder`), whose
own reference forbids inventing a primitive to get around it.

**Decision: do not mint a step now.** Only direction D and G's progress line would use it; F and E
never render a verdict. Revisit **only if D is picked**, in which case one step at **30px** is the
candidate (24 → 30 is a 1.25 ratio, the conventional minimum contrast between adjacent steps).

**Consequence to hold in mind when judging:** D reads deliberately under-powered in the round-2
mockup, because it is amplified through weight, the red status token, position and space rather than
size. That is the constraint showing, not the direction failing.

**Not a defect, checked:** the detector's `flat-type-hierarchy` finding merges two *role* scales —
display (24/20/18, Plus Jakarta 600) and body (15/14/12/11, DM Sans) — into one ramp. `body-lg: 15px`
sitting 1.07 from `body: 14px` is **`OD-REDESIGN-91 B4`**, minted deliberately 2026-07-24. Not
reopened.

## v4 design rules — Director decisions (not owner-ratified)

Craft decisions taken under the owner's 2026-07-27 delegation (*"do a director stance… you are the
better expert in this redesign"*). The **rules** live in `DESIGN.md`; the reasoning lives here, so
DESIGN.md states what to do and this file records why. Promote any of these to an `OD-` if the owner
ratifies them.

**DD-1 — Metric summary rule replaces the KPI tile row on capture surfaces.** The four-tile band on
Café · Log consumed the top half of the first viewport, so zero dish rows were visible; the floor
persona had to scroll past a management summary to reach the control they came for. impeccable's
craft floor independently refuses both devices in play — "same-size cards as the page structure" and
"the hero-metric template: big number, small label, supporting stats, accent". Tiles stay correct
where the job is *reading* figures. Does not conflict with OD-P3-11, which governs how a tile looks,
not where one must appear. *Result: 0 → 9 rows above the fold on desktop.*

**DD-2 — No restated values.** `plan N` under each stepper duplicated the Plan column (desktop) and
the Plan field (phone card). Cost ~40px per desktop row and ~180px per phone card.
*Result: desktop rows ~90px → ~40px.*

**DD-3 — Row status as text where status is universal.** At shift start every planned dish is
legitimately "Under −N" (OQ-2), so the column rendered as a wall of filled red pills — colour that
marks everything marks nothing, and it out-shouted the steppers. The `kitchenStatus` semantic is
**unchanged**; only the fill was dropped. Pills remain correct where status is sparse or
exceptional. *Open question for the owner: OQ-2 itself — whether "Under −N" should render at all
before a dish is touched.*

**DD-4 — Compact capture row via a new `DataTable.renderCard` seam.** The generic `<dl>` card is
right for *reading* a record and wrong for *running a 21-dish list* (~200px/row, ~1 dish visible,
~4,000px of scrolling). The seam is additive — other DataTable consumers are untouched, and the log
keeps grouping/collapse/empty/loading rather than bypassing the primitive.
*Result: phone cards ~250px → ~100px.*

### Owner domain corrections — 2026-07-27 (these overturned Director decisions above)

Surfaced by the `critique` run. **The incumbent that real staff use daily is
`~/Coding/gordi-kitchen-app`** (Flask + Jinja, live at `ops.gordi.id/kitchen`). MOS's Café Log had
regressed several things that app had already got right. Read `app/templates/kitchen.html` before
redesigning any capture surface.

**DD-5 — Production is TYPED, not incremented.** Owner: *"the production is not logged
incrementally. it should be typed in the amount being produced. mostly are 10-20+. incremental is
just too tedious."* The `−`/`+` stepper meant ~20 taps per dish across ~21 dishes. Replaced with a
single right-aligned numeric field (`inputmode=decimal`, `enterkeyhint=next`), blank at rest with the
plan echoed as a greyed **placeholder anchor** — the incumbent's exact pattern. This supersedes the
stepper that DD-4's compact row was built around.

**DD-6 — Feedback is per-menu on divergence, not from the total.** Owner: *"if its not according to
plan, they need to have immediate feedback from the app. but not necessarily from the total, since
they're inputting it on a per menu basis."* So: the row status renders **only once a quantity is
typed** (at rest nothing has diverged, so a red "Under −25" on all 21 rows was noise wearing
feedback's clothes), and the aggregate band's derived metrics are gone.

**DD-7 — The band states the plan only.** `useKitchenKpis(lines)` derived "Made so far", "%
complete", "−N vs plan" and "−N portions short" from quantities **typed into the form**, so the band
reported typed-not-logged and, one second after a successful submit, reset to "Made so far 0 / −548
vs plan" while the provenance note re-rendered "No entries logged yet today". Removed rather than
restyled, per PRODUCT.md principle 4. The `DataProvenanceNote` gated on the same unsaved state went
with it. **Sourcing the day's real logged total remains an open slice** — the incumbent already has
it per dish as a "sudah N" badge, which is the model to port.

**DD-8 — The variance note reveals on BLUR, not per keystroke.** The incumbent's source carries the
comment *"the note-required UX from `input` to `blur` per Arief's feedback"* — MOS had regressed to
the nagging version, so typing "18" flagged at "1" and shoved a required textarea into the row
mid-entry. The variance *reading* still updates live; the mandatory-prose interruption waits.

**DD-9 — Compaction (owner-directed).** Date + planned total on one line in separate columns
(replacing a stacked date chip plus a standalone band). Row category dropped — the toolbar already
filters by category and the list is grouped. The row meta line now renders only when it has something
to say, so a normal row is one line.

**Measured result, phone 375×812:** chrome before the first dish 437.8px → **336px**; card height
200 → 90 → **66px**; dishes fully visible 2 → **4**; total scroll 3,862 → **3,237px**.

### DD-10 — Home: a displayed-slice count reported as the real total (fixed 2026-07-27)

`attentionCountN` on Home summed `signalsBand.items`, which is `.slice(0, 6)` for display. A viewer
with 9 attention Signals was therefore told **6**. It now counts the true total and renders only once
all four contributing reads have resolved — a partial sum is a confident wrong number, the same
defect class as DD-7. **Generalised rule: never derive a headline count from a list that has already
been truncated for display.** Worth grepping for elsewhere; `.slice(` feeding a count is the tell.

### DD-11 — Home: the `seg` control grammar was inverted (fixed 2026-07-27)

Home's order control used a bordered `card` track with a `secondary` active pill; the app's shared
`seg` grammar (`.cut-toggle`) is a `secondary` track with a white active pill. Two visual dialects
for one control. Now on the shared grammar. Found by running `operate.md`, which asks the question
directly: *"if the save button looks different in two places, one is wrong."*

### Still open on this surface

- **`FR-022` blocking-note policy.** A note is still *required* to submit whenever qty ≠ plan. The
  owner's framing — production is planned, and *"can be checked who inputs by the planner"* — points
  at review-based accountability rather than mandatory prose on a fast capture field. Needs an owner
  or spec decision; not changed unilaterally.
- **Sticky submit.** `.kl-footer` is `position: static`; committing still means scrolling ~3,200px,
  and the largest thumb-reachable control near the bottom is the global `+` FAB, not Submit.
- **Sourcing the day's real logged total** (DD-7) — port the incumbent's per-dish "sudah N".
- **9 unit tests red** by design, pending the surface settling (owner-approved).

## Mobile shell decisions — 2026-07-27 (`OD-V4-5`)

Owner asked whether to replace the bottom tab bar with a top nav bar, and where the `+` belongs,
directing: *"use the 3 skills to find best way to do this"* and *"follow best practise and
convention."* Answered from the sources, not from taste:

- **impeccable `adapt.md`, Mobile:** *"Bottom navigation instead of top/side navigation"*;
  *"Thumbs-first design (controls within thumb reach)."*
- **`adapt.md` NEVER list:** *"Use different information architecture across contexts"* and
  *"Hide core functionality on mobile — if it matters, make it work."*
- **`ui-ux-pro-max` `data/app-interface.csv` row 10:** *"Bottom tab bar should have at most 5 primary
  items… move extras to More."* Row 7: ≥8dp between adjacent touch targets. Row 6: ≥44×44.

**Decisions:**

1. **Bottom tab bar stays; no top nav bar.** A top bar puts navigation ~762px from the thumb pivot
   (measured) — a two-hand control for a standing floor worker. Tabs are destinations only.
2. **The `+` stays bottom-right, NOT centre.** Centre-`+` is conventional where *creating* is the
   product's recurring primary action (social/content apps) and it works by spending a navigation
   slot on a verb. Here the recurring action is a **screen-level** Submit; the global `+` opens
   secondary actions. Material 3 also reserves the navigation bar for 3–5 destinations, and an action
   inside `<nav>` is announced as navigation by screen readers.
3. **The `+` yields on capture surfaces** (`/cafe/log|plan|stock|review`) so the surface's own commit
   action owns the thumb zone — one clearly-primary action per screen (HIG + M3). It is unchanged
   everywhere else. **This narrows OD-REDESIGN-46/D32's global reach and is an amendment the owner
   authorised via "follow best practise and convention"; reversible on request.**
4. **The real defect was IA divergence, not the bar.** Desktop renders the two-zone rail; the phone
   substituted flat tabs plus a near-empty overflow drawer, leaving Work's four children — including
   Objectives, which `OD-V4-1` just made visible to everyone — unreachable on phone except by typing
   into search. The More drawer becomes the same two-zone rail, derived from the same registry.
5. **Header hamburger deleted.** Absent from the owner's OD-REDESIGN-57(i) frame sketch, opens the
   identical drawer as More, and the owner reported *"i dont see the hamburger"* — it renders as an
   unlabelled ☰ abutting the logo, reading as brand furniture. Its 44px goes to the current-location
   label that OD-57(i) asks for and the phone has never had.
6. **Drawer keeps sliding from the LEFT.** OD-REDESIGN-91 #37's reason — *"matches the ☰ position +
   rail side"* — survives on the rail-side half after the ☰ is removed.
7. **Header bell: desktop only.** OD-57(i) puts Inbox in the header; on phone the Inbox tab already
   serves it, so the header bell was a duplicate door beside its own tab.
8. **Indonesian label for Inbox stays "Inbox"** (owner-directed) — not "Kotak Masuk", which measured
   62px in a 61px tab slot. This removes the bilingual overflow without touching the `+`.

## v4 acceptance gate (owner-set, 2026-07-27) — `OD-V4-4`

> *"dont write the tests yet until all pages and components are done according to the impeccable
> workflows. and you achieved >30 nielsen score. dont judge it on per page basis."*

1. **No test authoring or repair until the design work is finished.** Every page and component goes
   through the impeccable workflows first. Tests written against a moving surface get written twice.
   The 9 currently-red unit tests **stay red on purpose** until the gate below is met.
2. **The Nielsen score is APP-WIDE, not per surface.** Target: **>30**. A single surface scoring well
   is not the gate; the score is taken across the app so a good page cannot mask a bad one.
   (Baseline for reference: Café · Log scored **24/40** on 2026-07-27 *after* the first v4 pass.)
3. **Consistency is judged across pages, not within one.** Division of labour, so the two toolchains
   are not duplicated:
   - **impeccable** owns per-surface craft, and owns writing the shared contract — `document` and
     `extract` put a pattern into `DESIGN.md` + `.impeccable/design.json` so later surfaces inherit
     it instead of reinventing it. The design hook then enforces that contract on every UI edit.
   - **This repo's own machinery** owns cross-page conformance: `docs/audits/REGISTER.md` (+
     `surfaces.json`), the census protocol's computed-style parity step,
     `docs/interaction-contract.md`, and `src/consistency.regression.test.tsx`.
   - Known limitation: `critique` resolves *one stable target* and has no page-to-page comparator.
     That is what the census/parity step is for — do not ask impeccable to do it.

**Consequence for sequencing:** finish the design pass across shell + all four pilot surfaces, run
critique per surface, then take an app-wide score, and only then write tests. Do not stop at one
surface and declare it done.

### DD-12 — Four competing global `.sr-only` definitions (found 2026-07-27, NOT yet fixed)

`TaskSurface.css`, `TasksWorkspace.css`, `kitchen-plan-page.css` and `kitchen-review-page.css` each
define a **global, unscoped `.sr-only`**. Whichever stylesheet loads last wins the cascade, so
Tailwind's `focus:not-sr-only` variant silently fails — which would have broken the new skip link.
The shell agent worked around it with React state rather than shipping something fragile, and
reported it. **Fix: one `.sr-only` in the global layer, delete the four component copies.** Queued —
several of those files are being edited by the app-wide workflow. A component stylesheet defining a
global utility class is the general defect; worth grepping for others.

### DD-13 — Shell rebuild landed (2026-07-27)

Hamburger deleted; the breadcrumb renders unconditionally in the space it freed, inside the fixed
header row, so the phone has a location signal that survives scrolling (OD-REDESIGN-57(i)).
`aria-current="page"` ownership moved off the `More` button to the breadcrumb leaf per
`interaction-contract.md` I7 — **measured exactly 1 per route across 8 route × persona combos.** The
More drawer now reads `DESTINATIONS`/`MODULES`/`UTILITY` directly instead of a second hand-maintained
list, so Work's four children (incl. Objectives) are reachable on phone. Tabs are a `<ul>/<li>`;
`More` carries `aria-haspopup="dialog"` + `aria-expanded`; labels 10px → `--font-size-label` (12px,
Material 3's minimum). The `+` yields on `/cafe/log|plan|stock|review` and the bar reclaims the
gutter (Director's tabs 79px → 98px). Gutter widened 68px → **76px**: 68px left only 4px clearance to
the launcher, under the ≥8px adjacent-target floor (`ui-ux-pro-max` app-interface row 7).

### DD-14 — Work · Tasks: the phone card carried 7 fields where the desktop row carries 3 (fixed 2026-07-27)

`mobile-grouped-cards.tsx` rendered PIC · Supervisor · Project/Process · Objective · Due · Source ·
Activity as seven `<dt>/<dd>` pairs — 230.5px per card, ~2 visible on a phone — while the desktop row
had already been reduced to three decision columns (PIC · Supervisor · Due, OD-REDESIGN-61..64). Two
different information models for one collection. Now three fields, matching desktop: **card 230.5px →
145px, visible rows 2 → 3.** Also removed a literal `—` that rendered on every task lacking a Project
or Objective — the third instance of the same defect (see DD-3 and the "no plan" caption): *a mark
that appears on every row conveys nothing and out-shouts what does.*

Note: `src/pages/tasks-page.tsx` does not exist — it was deleted earlier. The live surface is
`tasks-layout.tsx` → `components/tasks/tasks-workspace.tsx` → `mobile-grouped-cards.tsx`.

### DD-15 — The dominant phone cost is SHARED chrome, not content (in progress)

Measured chrome above the first row of real content at 375×812: **Café · Log ~403px · Work · Tasks
312.7px · Home 235px.** On an 812px screen with a 56px header and 60px tab bar, ~400px of chrome
leaves almost nothing for the task. Three independent surface agents each found this and each
correctly refused to reach into it, because it belongs to `page-head` / `page-family-frame` and the
shared toolbars — no single surface owns it. **Being fixed as a cross-surface pass.**

Binding constraint on that fix: the **job sentence stays** (experience-contract Rule 1 /
OD-REDESIGN-57 — every rail item answers exactly one job, on the surface it opens). Its *layout* is
the cost, not its existence: it wraps to 2–3 full-width lines on phone. Home already proved the
remedy — fold quiet metadata into one shared `meta-line` row.

### DD-16 — `--accent` is aliased to the primary blue, contradicting DESIGN.md's own rule (found, NOT fixed)

`src/styles/tokens/aliases.css` sets `--accent: var(--ds-color-blue)`. DESIGN.md is explicit that in
this kit the shadcn-role `--accent` is the **quiet neutral hover wash, NOT the action blue** — the
One-Blue Rule keeps the blue under ~10% of any screen. Aliasing the hover-wash role to the action
colour is a systemic divergence, and it is the **root cause** of the Inbox selected-filter tab
measuring **2.98:1** (near-black text on a solid blue fill) rather than a one-off styling bug.

Fixed symptomatically for now (the selected tab's foreground is overridden to
`--primary-foreground`, 5.21:1) with a specificity-boosted rule in `index.css` — **that override is
debt**, because the real fix belongs in `inbox.css` and, underneath it, in the alias. Left alone
because re-pointing `--accent` changes hover washes app-wide and needs its own verified pass.

### DD-17 — Contrast fixed at the token layer (2026-07-27)

The systemic AA failures were **not** in the `--status-*-text` tokens (already correct) but in the
`Tag` component's `--ds-tag-text-*` family. Re-aliased to the existing AA-darkened tokens, same hue
families, no new colour: **Terkirim 4.36 → 14.32:1**, **Gagal 4.27 → 10.49:1** (this pair repeated in
70 of 77 flagged nodes on Pushes alone), **Inbox selected tab 2.98 → 5.21:1**. Dark theme already
passed and was untouched. Also landed: `document.documentElement.lang` now tracks the locale (screen
readers were pronouncing Indonesian with English phonemes app-wide), and **OD-V4-5 #8 finally
shipped** — the Indonesian Inbox label is "Inbox", measured 32px in a 61px slot at 320px. That
decision had been recorded on 2026-07-27 but never dispatched; a bilingual audit caught it still
overflowing at 74px. *Lesson: a recorded decision is not a shipped one — the ledger needs a
landed-yes/no column, not just a disposition.*

## GATE RESULT — **PASSED at round 4: 31.6/40 (79.1%)**, clearing `OD-V4-4`'s >30 bar by +1.6

**24.9 → 24.8 → 28.8 → 31.6.** Full history, per-heuristic movement and caveats:
`docs/reviews/v4-nielsen-gate.md`.

**Read this before treating it as shippable.** The score grades an **uncommitted local diff** on
`v4/redesign` that has never run `scripts/pre-merge-check.sh` or a review battery — *green gates ≠
reviewed*. It is also a **thin pass**: Café · Log (29) and Objectives (29) remain individually under
30. And the verdict agent's own delta table was wrong — it compared five surfaces to the app-wide
mean instead of their real R3 scores, reporting **Inbox as +2.2 when it had dropped 3** (34 → 31);
corrected by hand.

**What carried it:** H10 Help 2.0 → **3.5** (weakest heuristic to joint-strongest, from one shared
`HelpTip` primitive reaching all eight surfaces) and H4 Consistency 2.375 → **3.375** (shared-component
discipline — `extract` doing its job). **H7 flexibility and H9 error recovery are now the weakest
pair**, and moved least across three rounds of being flagged.

**The durable lesson, unchanged across all four rounds:** layout and aesthetic work moved nothing;
every gain traced to closing a broken interaction. The Director twice concluded the ceiling had been
reached — after R2 recommending the gate be moved — and was twice wrong; the owner pushed back and
the next rounds gained +4 and +2.8.

### Superseded — the round-2 assessment that called the ceiling too early

Two rounds, both scored by isolated agents. The second round re-scored the five surfaces a set of
gap-closers touched and carried the three untouched ones forward.

| Surface | R1 | R2 | Δ |
|---|---|---|---|
| Café · Log | 24/40 | **17/40** | **−17.5pp** |
| Café · Plan | 16/32 | 21/36 | +8.3pp |
| Work · Tasks | 30/40 | 28/40 | −5.0pp |
| Inbox | 23/40 | 28/40 | **+12.5pp** |
| App shell | 23/36 | 25/40 | −1.4pp |
| Home · Money · Objectives | 31 · 28 · 18 | carried | 0 |
| **App-wide** | **24.9/40** | **24.8/40** | **−0.1** |

### Why scores FELL on surfaces that objectively improved

**Round 2 drove the flows end to end; round 1 largely did not.** Café Log's −17.5pp is not a
regression in what shipped — it is the first pass that actually attempted a variance submission and
hit a **P0 dead end**. Work · Tasks' −5pp is the same effect: hands-on interaction found Enter/F2
don't open a row, "Clear filters" doesn't survive reload, and the new PIC/Supervisor tooltip never
renders. *A score that drops because the review got more honest is more useful than one that rises
because the review stayed shallow.*

### DD-18 — Café · Log P0: satisfying the variance gate destroyed the control that satisfies it

`showNote = error !== '' && dirty && (blurred || notes !== '')` — but `error` is the **unsatisfied**
gate, stamped only while `notes` is empty. So the first keystroke in the note textarea cleared
`error`, `showNote` went false, and **the textarea unmounted mid-typing with focus dumped to
`<body>`**. Worse than blocked: Submit then *unblocked* on that one character, so the surface was
shipping `"b"` as a variance explanation. Fixed: `showNote = dirty && (notes !== '' || (error !== ''
&& blurred))`, DD-8's blur behaviour intact. Also fixed alongside: the phone qty field had regressed
to **13.5px** (desktop `.kls-dense` rule leaking onto the phone path via an unconditional `dense`
prop) — the exact mobile-Safari zoom-on-focus bug `--font-size-touch-input` exists to prevent; and a
real footer overlap (sticky's constraint rect is the scrollport's *content* box, so `bottom: 0`
parked the bar above the frame's own padding while rows scrolled underneath).

### DESIGN.md accuracy failures found by the finish review

The file exists and its tokens/rules are sound, but **2 of 6 spot-checked claims did not match the
built app**, and the sidecar contradicted DESIGN.md's own prose:

| Claim | Reality | Status |
|---|---|---|
| touch inputs are 16px, Café Log qty is the reference case | measured 13.5px | **fixed** (DD-18) |
| status pills are 8px rounded-rect; "the 999px capsule spec is retired" | live pill is a **999px capsule** | **OPEN** |
| sidecar's Compact Capture Row | shipped the retired `−`/`+` stepper markup, generated the same day as prose saying "the control is a typed field, not a stepper" | **fixed** |

*A design system that documents what was intended rather than what is live actively misleads the next
agent. The sidecar is generated — it should be regenerated after a build pass, not hand-maintained.*

## Superseded round-1 gate detail — 2026-07-27: 24.9/40 (62.4%)

Gate `OD-V4-4` is **>30 app-wide**. Measured **24.9/40** — short by ~5.1 points. Scored by **8
isolated agents**, one per surface, each driving the live app at 375×812 and 1280×860 in both
locales, following `critique.md`'s Heuristics Scoring Guide. **No self-scoring by the Director.**

| Surface | Score | % | Band |
|---|---|---|---|
| Home (cockpit) | 31/40 | 77.5% | Good |
| Work · Tasks | 30/40 | 75.0% | Good |
| Money · Dashboard | 28/40 | 70.0% | Good |
| App shell | 23/36 | 63.9% | Acceptable |
| Café · Log | 24/40 | 60.0% | Acceptable |
| Inbox | 23/40 | 57.5% | Acceptable |
| Café · Plan | 16/32 | 50.0% | Acceptable (edge) |
| **Work · Objectives** | **18/40** | **45.0%** | **Poor** |

Aggregated as the **mean of per-surface percentages**, deliberately: the owner's instruction was
*"dont judge it on per page basis"*, i.e. a strong surface must not mask a weak one. Summing totals
over maxima gives 62.7% but under-weights Café · Plan (only 32 applicable) — exactly the masking
effect the gate exists to prevent.

### The finding that matters more than the number

**Café · Log scored 24/40 before this session's work and 24/40 after** — despite ~100px less chrome,
the stepper replaced by a typed field, contrast fixed and the module translated. **Layout improved;
the heuristics did not move.** The binding constraint is no longer design:

| Weakest app-wide | Mean | Why |
|---|---|---|
| **H10 Help & Documentation** | **1.25/4** | No in-app help exists anywhere except Money's KPI tooltips. Systemic absence, not a per-surface miss |
| H9 Error recovery | 2.17/4 | Inbox's 401 dead-loop: "Try again" re-fires the identical failing call forever |
| H7 Flexibility | 2.25/4 | Café · Plan renders **fully inert** for the Kitchen Lead — the persona `jtbd.md` names as its primary user |
| H4 Consistency | 2.375/4 | Objectives rows are inert text where Tasks rows link |

**The three highest-leverage fixes are capability wiring, a record drill-through, and an in-app help
system — feature work, not redesign.** More layout passes will not reach 30. This is the honest
ceiling of a redesign-scoped effort against a heuristic gate, and it is an owner decision whether to
fund the feature work or move the gate.

*Caveat on record: the Café · Plan scorer ran while the safety classifier was unavailable; its 16/32
should be re-verified before being treated as final.*

*One aggregator recommendation was **rejected**: it proposed adding "Kotak Masuk" as the Indonesian
Inbox label, which directly contradicts `OD-V4-5` #8. Not actioned.*

## Contradiction register (for the owner) — running, 2026-07-27

Findings that collide with a binding owner verbatim. **Not resolved unilaterally.**

| # | Finding | Binding decision it touches | Disposition |
|---|---|---|---|
| X-1 | The `+` Action Launcher yields on capture surfaces | OD-REDESIGN-46 · D32 — one global Action Launcher | **Taken** under the owner's *"follow best practise and convention"*; narrows OD-46's reach; reversible |
| X-2 | Header bell dropped on phone | OD-REDESIGN-57(i) — "Inbox" in the header cluster | **Taken**, owner-approved desktop-only |
| X-3 | Header hamburger deleted | Restores OD-57(i) (no ☰ in the sketch); OD-91 #37 justified left-slide as "matches the ☰ position + rail side" | **Taken**; the rail-side half of #37's reason survives |
| X-4 | `FR-022` requires a note whenever qty ≠ plan | FR-022 (specced) | **RESOLVED 2026-07-28 — owner: FR-022 STANDS (`OD-V4-6`).** Verbatim: *"if theres any deviation from plan, the input has to capture why? whatever that reason be, that will be reviewed by the planner. otherwise, miscommunication or over communication is required since the input is not capturing any reason."* **The note is the artifact, not friction** — it makes a deviation reviewable in place instead of pushing the explanation into a conversation that may never happen. The Director's earlier recommendation (defer the gate to submit-vs-plan at close) is **withdrawn as wrong on product logic**. **REMAINING GAP:** the code enforces *"something was typed"*, not *"a reason was captured"* — Submit unblocks on a single character (it was shipping `"b"`, see DD-18). Recommended close: tap-selectable reason chips (bahan habis · waktu kurang · permintaan turun · rusak/afkir · lainnya) + optional free text — one tap on a phone, and structured/aggregatable for the planner rather than free prose. Applies to over- as well as under-production, per FR-022's `qty != plan`. |
| X-5 | Row status renders only once a quantity is typed | OQ-2 — "not-started (made=0, plan>0) = destructive Under −plan" | **Taken** on the owner's *"feedback… not necessarily from the total, since they're inputting it on a per menu basis."* Semantic unchanged; timing changed |
| X-6 | `objective.manage` is admin-only, so the BU-head persona cannot see Objectives | OD-V4-1 — "visible to everyone, writeable at lead" | **Migration authored, not applied** (RLS + security review needed). Client gate alone would show UI that then fails against RLS |
| X-7 | Home rendered the whole Home-order radiogroup | OD-REDESIGN-18 — "**Personal Profile** stores Home order…; if the personal canvas comes first, the Home header preserves a visible `Needs attention · N` summary and jump target" | **RESOLVED 2026-07-27 — implemented the OD, not a deviation.** The radiogroup is now a third Profile card matching the pattern OD-REDESIGN-70 set for the Language selector; Home only *reads* the preference. Verified live: absent from Home, present on `/profile` (44px on coarse pointers), preference survives SPA navigation **and a hard reload**, and `Needs attention · N →` renders with its `#attention-brief` jump in personal-first and is correctly absent in attention-first. **Home phone chrome 277.5 → 223.5px (−54px).** 6 tests left red (named) |
| X-8 | ADR-0025 D8's "authorized personal canvas" does not exist in code | ADR-0025 D8 · OD-REDESIGN-17 | **Not built** — new feature scope, not a redesign. Flagged only |
| X-9 | `jtbd.md` Home-contributor row asks for today's production plan / assigned steps above the fold | jtbd.md (Accepted) | **Not built** — Home never loads that data, and PRODUCT.md principle 4 forbids fabricating it |
| X-11 | **OD-V4-2 was ratified on a false premise supplied by the Director — "Events" and "Signals" are NOT the same concept** | OD-V4-2 (2026-07-27) — *"Signals everywhere"*; and OD-REDESIGN-57(iii) / ADR-0025 D1, which establish **Events** as its own destination in the rail | **OPEN — owner call. Director error, owned.** A design audit reported the rail as *"Signals (Work child) directly above Events (root) — two names, one concept, adjacent."* That is **adjacency, not synonymy**. The Director accepted it, framed the question to the owner as *"one noun wins"*, and the owner answered *"Signals everywhere"* on that wrong premise. Evidence the premise was wrong: `src/pages/events-page.tsx` is a 38-line stub spec'd as `docs/specs/events-stub.spec.md`, whose copy reads *"Outlet events — cuppings, workshops, bookings — will appear here once events are turned on."* An outlet calendar is a different domain from a **Signal** (an intentional post carrying attention level, mentions, location). **Current state:** the root renders "Signals"/"Sinyal" over calendar copy, duplicating Work's "Signals Archive". **Recommendation: revert the ROOT label to Events/Acara (or a better noun for the outlet calendar) and restore the Work child to plain "Signals"** — the only genuine INC-2 problem was two *adjacent* entries reading identically, which the archive/feed split already solved. Not reverted unilaterally: undoing a ratification on the Director's own judgement would repeat the error inverted. Cheap either way — the change is i18n strings only; the `/events` route, `Signal` record type and internal ids were never touched. |
| X-10 | **RESOLVED 2026-07-28 — owner granted the narrow exception.** *"do the correctness tests"* after the re-score. Failing-repro regression tests to be written for the three correctness bugs (DD-7, DD-10, DD-18) ONLY; the deferral stands for everything presentational, so the other ~126 red tests stay red until the design settles. This restores `OD-REDESIGN-88`'s red-first-for-bugfixes clause for the cases it actually names, without reopening TDD generally. Original entry below. | | |
| X-10 (original) | **Deferring all test work leaves three real bug fixes with no regression guard** | `CLAUDE.md` / **OD-REDESIGN-88**: *"every behavior change lands WITH its goal-level test in the same commit… **red-first stays required for bug fixes (the failing repro is the proof)**… No untested prod code, ever."* | **OPEN — owner call.** `OD-V4-4` (no tests until the design settles and the app clears >30) deliberately overrides OD-88. The prohibition is carried explicitly in every build brief — verified, not assumed. The styling work is low-risk to defer; **these three are not, because OD-88 names bug fixes as the case that still requires red-first:** DD-7 (band reported typed-as-logged, and claimed "No entries logged yet today" straight after a successful submit), DD-10 (attention count summed a `.slice(0,6)` display array — 9 reported as 6), and the AA contrast regression introduced during this pass against a token DESIGN.md names. Nothing currently stops any of the three silently returning. **Recommendation: carve a narrow exception — allow a failing-repro test for a correctness bug only, keep the deferral for everything presentational.** |

## Impeccable workflow ledger — which flow ran on which surface

**Why this exists.** The owner asked whether the discipline holds without him typing
`/impeccable <command>`. It mostly did, but not entirely: on 2026-07-27 the Café Log redesign pass
was hand-rolled from `craft-floor.md` and general practice **without loading `distill.md` or
`layout.md`**, and `visualize.md` was skipped even though new-work states it is never skipped when
image generation is available. Both were judgment calls of the form *"I know what that playbook would
say"* — the exact paraphrase-drops-rigor failure the project's own "skills are the method" rule
exists to prevent. A recorded ledger makes a skip visible instead of something the owner must catch.

Mark a flow ✅ only with an artifact path as evidence. `—` means not applicable to that surface.

### Project-wide flows

| Flow | Status | Evidence |
|---|---|---|
| `impeccable update` | ✅ | v3 → **v4.0.2**; design hook installed into `.claude` |
| `context.mjs` (Setup) | ✅ | returned `PRODUCT_INIT_REQUIRED` |
| **`init`** | ✅ | `PRODUCT.md` |
| **`new-work`** §1–3 | ✅ | `concept-seed.mjs` rolled twice — seeds `a24af8da`, `3a704a34`; `serve-question.mjs` decision page |
| **`document`** | ✅ | `DESIGN.md` + `.impeccable/design.json` |
| **`craft-floor`** | ✅ | loaded before every UI edit, by the Director and ~12 agents |
| design hook | ✅ | auto-ran on every Write/Edit for the whole session |
| **`visualize`** | ❌ **skipped** | comps hand-built instead — new-work says it is never skipped |
| **`extract`** | ❌ **not run as a command** | effect achieved ad hoc: 4 shared components + DESIGN.md entries |
| **`audit`** | ❌ **hand-rolled** | the a11y / bilingual / consistency audits were custom Director briefs; `reference/audit.md` was never opened |
| **`polish`** | ❌ **not run** | `critique.md` prescribes it as the closing pass |
| **`doctor`** | ❌ **not run** | would have caught the DESIGN.md-vs-code drift the finish review found manually |
| **finish review** | ⚠️ **substituted** | `impeccable-finish-reviewer` is not shipped in the v4.0.2 install (only `SKILL.md`, `reference/`, `scripts/`); an isolated general-purpose agent carried its mandate |

### Per-surface

`layout` · `distill` · `operate` were opened and followed (not paraphrased) on every surface listed.
`critique` = scored live by isolated agents, never self-scored.

| Surface | layout | distill | operate | critique rounds | Trend |
|---|---|---|---|---|---|
| Café · Log | ✅ | ✅ | — | ✅ ×4 | 24 → 24 → **17** → **29**/40 |
| Café · Plan | ✅ | ✅ | — | ✅ ×3 | 16/32 → 21/36 → **29/40** |
| Work · Tasks | ✅ | ✅ | ✅ | ✅ ×3 | 30 → 28 → **27**/40 |
| Home | ✅ | ✅ | ✅ | ✅ ×3 | 31 → 31 → **32**/40 |
| App shell | ✅ | ✅ | ✅ `adapt` | ✅ ×3 | 23/36 → 25 → **25**/40 |
| Inbox | ✅ | ✅ | — | ✅ ×3 | 23 → 28 → **34**/40 |
| Money · Dashboard | ✅ | ✅ | — | ✅ ×3 | 28 → 28 → **31**/40 |
| Work · Objectives | ✅ | ✅ | — | ✅ ×3 | 18 → 18 → **23**/40 |
| 14 further surfaces | ✅ | ✅ | ✅ | not individually scored | — |

**App-wide: 24.9 → 24.8 → 28.8/40.** Gate is >30; short by **1.2**.
All 25 snapshots persisted to `.impeccable/critique/`; `critique-storage.mjs trend <target>` reads
them back. *(Backfilled retroactively, so file timestamps are backfill time, not scoring time.)*

### Why the unrun commands matter — self-assessment

The commands skipped are **not** a random tail. Four of them target precisely the heuristics that
scored worst, which is the likeliest explanation for the plateau at rounds 1–2:

| Unrun command | Owns | Heuristic it would have targeted |
|---|---|---|
| **`harden`** | errors, i18n, edge cases | **H9 error recovery (2.17/4)** — the Inbox 401 dead-loop and the Café Log submit dead end are exactly its subject matter; both were eventually found by other means |
| **`clarify`** | UX copy, labels, error messages | **H2 (2.75/4)** — "1 dish · 1 units", three verbs for one action, a tooltip describing a gated feature |
| **`typeset`** | typography hierarchy | font sizes were explicitly in the owner's scope; the 10→12px and 13.5→16px fixes were made ad hoc, off-playbook |
| **`optimize`** | UI performance | the build has emitted a **1,270 kB chunk warning on every single run** all session and was never acted on — on a phone-first product whose stated scene is intermittent connectivity |
| **`onboard`** | first-run, empty states, activation | **H10 (1.25 → 2.0/4)**, the weakest heuristic app-wide, and the round's headline intervention only reached 3 of 8 surfaces |
| **`doctor`** | drift between impeccable artifacts | the exact DESIGN.md/sidecar drift the finish review had to find by hand |

Defensibly skipped for an **Operate**-mode internal tool where the owner asked not to change colours
or fonts much: `colorize`, `delight`, `bolder`, `quieter`, `overdrive`. `shape` was covered by
`init` + `new-work`. `animate` and `live` are legitimate but optional accelerators.

## v4 scope (owner-set, 2026-07-27)

Pilot surfaces that must carry the new visual world end-to-end:

1. **App shell** — rail, header, phone bottom-nav, density, tokens
2. **Home** — the role-aware cockpit
3. **Café · Log** — the floor scene, real data, hardest case
4. **Tasks** — the Work workspace's core collection

Success test, owner's words: **speed**, **correctness of the JTBD and audience design**, and
**removal of AI slop**.
