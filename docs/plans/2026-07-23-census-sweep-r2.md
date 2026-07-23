# Census-sweep R2 — findings ledger (Gordi MOS V3 redesign)

> **Deliverable type:** consolidated findings ledger for the round-2 per-route census sweep.
> Supersedes the **VOIDED round-1 total-sweep findings** (round-1 captured the wrong tree and is
> discarded — do not cite it). This ledger is the evidence of record for the R2 sweep.

## 1. Provenance

**Attested commit:** captures were provenance-gated at `ab61009` (v3-redesign). Every capture run
confirmed `ab61009` via `git rev-parse` **at the gate, before work started**.

**Drift (declared, not hidden):** the shared worktree `.claude/worktrees/v3-redesign` is served by
each capturer's own live Vite dev server, so concurrent fast-forward merges landing on the branch
rewrote files on disk **mid-capture**. HEAD moved `ab61009 → 97940c4` during the Director run (two
merges: `v3/mech-guards`, `v3/sweep-admin-people`); the Cafe-Ops and Kitchen runs saw HEAD advance
further (`94af522`) and **aborted per the round-1 contamination lesson rather than shoot a moving
target**. Worktree HEAD is now `438d262` (OD-REDESIGN-88), 31 commits past `ab61009`.

**Consequence for evidence weighting:**
- Shots flagged **pre-drift / low-risk** (home, tasks, task-record, task-create, signals,
  signal-record, inbox): usable as captured.
- Shots flagged **post-drift / suspect** (cafe, money, objectives, projects, follow-ups,
  admin-people): pixel geometry is indicative only.
- **Every DEFECT below is additionally anchored in current source** (`mos-app/src` at HEAD),
  re-verified this round — so the findings are drift-immune even where the PNG is suspect. Where a
  claim rests only on a screenshot, it is marked screenshot-only.
- Two whole personas (Cafe-Ops, Kitchen) aborted, and several routes rendered only their empty/awaiting
  state → large **NOT REVIEWED** gaps (see §4 DO-25, the re-capture work-order item). Un-rendered
  states are recorded NOT REVIEWED, never assumed passing.

**Input provenance:** 3 persona-capture reports (Director completed 115 shots; Cafe-Ops + Kitchen
abort contracts) + 12 per-route census audits (Steps 1–6 of the audit protocol in
`docs/plans/2026-07-23-skill-rule-mechanization.md`). The 16th input block (a consolidator refusal
from a prior broken run) was discarded per instruction.

---

## 2. Verdict

**No P0 on any route.** Every route cleared the historically-caught structural classes it could test:
one create door per width (mostly), rail containment, no color-only status on rendered surfaces,
destructive-action confirmation, icon-only controls accessible-named, identity untruncated on the
default (non-drawer) table.

### Severity totals (live findings — excludes cited-not-flagged notes and the 1 ALREADY-FIXED item)

| Severity | As-reported | After dedup¹ |
|---|---|---|
| **P0** | 0 | 0 |
| **P1** | 9 | 9 |
| **P2** | 38 | 37 |
| **P3** | 38 | 37 |
| **Total** | **85** | **83** |

¹ Two findings were double-reported across the Signals-collection and Signal-record audits and are
counted once: **notify-N naked count** (SR-1 = Signals F-5) and **record page reuses the list job
sentence** (SR-3 = Signals F-2).

### What the mechanical guards would / would not have caught

- **The dominant recurring class — off-ladder / raw-px `font-size` in component CSS (D2 "type-size
  soup") — is caught by NO existing guard.** It appears on **9 routes** (cafe, home, signals,
  signal-record, task-create, inbox, objectives, money, admin-people). The merged `a26945c`
  ("tokenize component+shell type/radius + GUARD-VOCAB ratchet") ratcheted the vocabulary guard but
  **the KIT-VOCAB-FONT scan still only reads `ui/*.css`**, so raw literals like `15px`/`16px`/`11.5px`
  in `components/**` and `pages/**` survive (verified present at HEAD). The **top-10 planned guard
  rule C3** ("type-ladder source-lock across ALL component CSS, extend KIT-VOCAB-FONT to
  `components/**` + `pages/**`") is exactly the guard that would catch every one of these. → **build C3.**
- **D-3 raw-px radius** (home, task-create) — same gap; C3/D-3's token-scan extension catches it.
- **H1 naked-number** findings (money `0` pill, objectives count pill, follow-ups "11 items", rail
  `Tasks 9`) — the existing **GUARD-R2** naked-number test is **Tasks-only**
  (`components/tasks/guard-r2-naked-numbers.test.tsx`); extending its enumeration to Money / Objectives
  / Admin page-heads (planned) catches money F-1 and objectives F7. The Tasks page **already** got this
  remediation — the direction is settled; the other routes just never received it.
- **E1/E2 44px tap-target** (task-create fields, cafe/admin phone floors) — the tap-target guard's
  selector list omits the `.tc-*` form-field and search-mini classes (an **enumeration gap**);
  widening the selector list (planned) catches them.
- **F1 shared loading grammar** — MECHANIZED for the kit, but task-create's field-loading escapes it
  with literal `"Loading tasks"` text (no `role=status`). The guard asserts the kit; it does not scan
  bespoke surface code that bypasses the kit.
- **Owner-caught structural ratchet R1–R4 + one-solid-primary** (`65193d1`) and the **geometry guard
  spec** (`a0ac361`) are landed; the residual D4/one-door findings here are the *visual-weight* and
  *breakpoint-mismatch* variants those structural asserts don't measure (tasks FINDING2/FINDING3).

**Bottom line:** the single highest-leverage mechanization is **C3** — it retires the most-recurring
defect class on the sweep in one guard. GUARD-R2 enumeration extension is second.

### ALREADY-FIXED after `ab61009` (verified in git log `ab61009..HEAD`)

| Prior finding | Status | Commit |
|---|---|---|
| task-create "no unsaved-changes guard on discard (create path)" | **FIXED** — `TaskDrawer`/`CreateSurface` now wire `onDirtyChange` + `ConfirmDialog` leave-guard (verified at HEAD) | `f8c3077` (D-B1, interaction Tier-1 item 2) |

The other post-`ab61009` merges (interaction Tier-1 items 1a/1b/1c error-states `e6a9b42`/`5a87e19`/
`428d6fe`; Escape-consumes item 3 `ca6edc5`, item 11 `85ea4bb`; fossil deletes `d6c14a3`/`b29640e`/
`3be9fc2`/`b9af1f2`; admin-people fixes `4bb26a1`/`33f0f31`/`2b4508d`; ambient ErrorState `6abec8c`;
a11y `e7ecd87`) landed on states/paths this census **never rendered**, so none overturn a finding here
— but note the admin-people shots were captured **after** `4bb26a1`/`33f0f31`/`2b4508d`, so the STATUS
column, neutral role tag, and `/admin/*` job sentence already read as fixed in the evidence; the
admin-people findings below are the **residual** live defects, not those.

---

## 3. Per-route sections

Each section: compact census + findings, with evidence PNGs (under
`output/census-r2/{Director,Cafe-Ops,Kitchen}/`) and source paths preserved. `NR` = NOT REVIEWED.

### 3.1 Home (`/mos`) — pre-drift, low-risk

**Census.** Numbers: `Tasks 9` rail badge is persona-invariant while home shows 4/5/2 owned tasks →
scopeless; **`All tasks · 4/5/2`** is mislabeled (shows my-count, links `?view=my-work`) and collides
with rail `9`. Controls: toolbar = 2 (order radiogroup, single axis); one solid primary (shell
`Create`); `Share a Signal` is a muted field → D4 clean. States: default only; hover/loading/error/
empty **NR**. Geometry: ultra-wide left-aligned void at 1870 (cited convention); Urgent-Signal title
truncates at 768/1024; my-work→ambient seam rhythm break. Affordance: no color-only status; no
unnamed icon-only. Copy: "All tasks·N" factually wrong; no locale leaks.

**Findings.** F1 P2 off-ladder fonts (`home-stream.css:120/170/199`, `home-page.css:46/81`) · F2 P2
raw/off-ladder radius (`home-stream.css:169`, `home-page.css:37/49/77`) · F3 P2 phone order-disclosure
overflows and clips its trigger (`home-page.css:66-69`) · F4 P2 "All tasks·N" mislabel + collide
(`home-stream.tsx:215`, `messages.ts:676`, `rail-nav.tsx:32`) · F5 P2 Urgent Signal title truncated
768/1024 (`home-stream.css:119-126`) · F6 P2 my-work→ambient seam rhythm break (`home-stream.css`,
`signal-feed-section.css`) · F7 P3 FLAG dup "SIGNALS" label · F8 P3 FLAG my-work rows front PIC avatar
· F9 P3 NOTE 1024 icon rail (cite OD-REDESIGN-84, not a defect) · F10 P3 ultra-wide void → **cited
convention** (`page-families.css:5-9` left-align cap; not re-flagged).

### 3.2 Tasks (`/mos/work/tasks`) — pre-drift, low-risk

**Census.** Numbers: rail `9` (open) vs page `11 tasks` (total) unreconciled; `11 items in your scope`
restates `11`. Controls: `Overdue` view chip and `N need attention` chip both hit the overdue axis;
View & filters popover = 7 controls (disclosed). Create doors: 390 = FAB only ✓; **768–919 = header
`+Create task` AND FAB both render** (breakpoint mismatch); ≥1024 = page CTA + top-bar `Create` both
solid indigo. States: default/drawer/grouped/card ✓; loading/error/empty **NR**; desktop popover **NR**.
Geometry: **drawer-open truncates 6/11 Task titles** at 1280; default table untruncated; split-height
parity already fixed (`align-items:stretch`); 390 tab-strip clips `Follow-up…`. Affordance: all
icon-only named; status not color-only; **rail badge `aria-hidden`**. Copy: `Activity 12d ago` terse.

**Findings.** FINDING1 P2 drawer-open Task-identity truncation (`TasksWorkspace.css:34`) · FINDING2 P2
two create doors in the 768–919 band (`tasks-workspace.tsx:264` gates on `isDesktop`≥768 not
`isNarrow`≥920) · FINDING3 P2 FLAG desktop two solid-indigo create doors · FINDING4 P3 "Activity 12d
ago" terse (`messages.ts:204`) · FINDING5 P3 rail badge naked + `aria-hidden` (`rail-nav.tsx:30-33/138`)
· FINDING6 P3 390 tab-strip overflow clip (`collection-toolbar.css`) · FINDING7 P3 FLAG overdue axis
two doors. Cited-not-flagged: Source field (OD-P2-17), ultrawide right-void (owner CONV 2026-06-17),
two count phrasings (knowingly kept).

### 3.3 Task-record (`/mos/work/tasks/:id` full page) — pre-drift, low-risk

**Census.** Numbers clean (well-labeled; only shared rail badges bare). Controls: record-chrome = 3
icon-only (Back / Deputy / collapse), all named; footer `Reopen`·`Archive` both secondary, zero solid
primary (Done task suppresses "Mark complete") → D4 ✓; Archive confirm-guarded. States: default +
edit-focus + empties ✓; loading/error **NR**. Geometry: identity untruncated all widths; wide-void at
1870 (~410px gutters + ~600px per field row); read-only rows render a *different* rhythm than editable;
mobile edit-textarea crowds the fixed tab bar. Personas: Director/Cafe editable, Kitchen read-only.

**Findings.** P2-1 P2 FLAG wide-void; two-column OD-P4-11 page not rendered (single column; unused
two-column path `task-surface.tsx:704-723`) · P3-1 P3 DEFECT read-only vs editable row-rhythm diverges
(`record-field.tsx`, `record-viewer.css`) · P3-2 P3 DEFECT permission note names problem, no recovery
(`task-record-adapter.tsx:188`) · P3-3 P3 FLAG Deputy-spark ≈ collapse glyph (confusable) · P3-4 P3
DEFECT mobile edit-textarea/actions overflow under fixed tab bar (`TaskSurface.css`/`record-viewer.css`).

### 3.4 Task-create (`/mos/work/tasks/new`) — pre-drift, low-risk

**Census.** Zero numbers on the create panel. Controls: **dismiss axis has 3 controls** — host ✕,
surface ✕ (near-identical "Create task ✕" bars), and Cancel; one solid submit → footer D4 ✓. States:
default + directory-loading + focus ✓; field-error/submit-error/submitting **NR**. Geometry: **doubled
chrome header** (~92–120px, lower bar pure duplication); fields 36px (sub-44px on phone); loading
reflow pops 2 fields in. Affordance: two close controls with near-duplicate accessible names; **open
focus lands on host ✕, not Title**; expand ⤢ is a no-op below split. Copy: "Loading tasks" wrong noun
for a directory load; submit error "Something went wrong".

**Findings.** F1 P1 doubled "Create task" header + two identical close buttons (`task-surface.tsx`
`CreateSurface` ignores `showPanelUtility`; `task-drawer.tsx:221`) · F2 P2 form type off-ladder
(`TaskSurface.css` 15/16/26px) · F3 P2 fields sub-44px on phone (`TaskSurface.css:375-392`; tap-target
guard selector gap) · F4 P2 "Loading tasks" wrong noun (`messages.ts:120`) · F5 P2 field-loading uses
literal text not shared `role=status` grammar (`task-surface.tsx:976-1034`) · F6 P2 generic "Something
went wrong" (`messages.ts:154`) · **F7 — ALREADY-FIXED** (`f8c3077`) · F8 P2 open focus on close ✕ not
Title (`record-panel-host.tsx:101`) · F9 P3 expand ⤢ no-op below split (`task-drawer.tsx:201`) · F10 P3
raw-px spacing (`TaskSurface.css`) · F11 P3 FLAG optional fields hidden when catalog empty
(`task-surface.tsx:1055/1079`).

### 3.5 Signals (`/mos/work/signals`) — pre-drift, low-risk

**Census.** Numbers: page-title badge borderline-naked; rail `Signals N` naked (drift-unreliable);
**`notify 1`** cryptic; `0 Tasks · 0 open` redundant; composer datetime `23/07/2026, 01:42 pm` locale
leak. Controls: saved-view chips (`Needs attention`, `Retracted`) overlap the granular Attention filter
/ Show-retracted toggle; one Signal-create door (`Share a Signal`) → A3 ✓. States: default/loading ✓;
empty/error/hover **NR**. Geometry: **390 feed clamps title to ~3 words while category label keeps full
text** (identity starvation); record FACTS dead void; table identity healthy. Affordance: attention =
pill + stripe + text (D-11 ✓); **left 2px stripe is OD-sanctioned** (DESIGN.md §Operations tokens).

**Findings.** F-1 P1 off-ladder fonts across signals CSS (`signal-feed-rows.css:78`,
`signal-record.css:20/23/38`, `signal-composer.css:37/46`, `signal-mention-picker.css:18/39`,
`signal-card.css` [fossil]) · F-2 P2 record reuses list job sentence (**= SR-3**,
`signals-archive-page.tsx:368`) · F-3 P2 mobile feed title starvation (`signal-feed-rows.css`) · F-4 P3
FLAG Urgent ≈ Needs-attention same pill · F-5 P3 notify-N naked (**= SR-1**) · F-6 P2 FLAG composer
defaults owning team to arbitrary `teamOptions[0]` "B2B Sales Team" (`signal-composer.tsx:60-65`) · F-7
P3 FLAG native datetime locale format · F-9 P3 FLAG saved-view chips overlap filter axes. Cited: left
accent stripe (DESIGN.md), record title 80-char `firstLine`, attention taxonomy (OD-REDESIGN-43).

### 3.6 Signal-record (`/mos/work/signals/:id`) — pre-drift, low-risk

**Census.** Numbers: **`notify 1` naked** (owner spec is `notify N people`); `0 Tasks · 0 open`
unpluralized. Controls: `Create follow-up Task` (outline) · `Link existing Task` (ghost) · `Acknowledge`
(one primary, below fold) → D4 ✓. States: default/loading/empties ✓; error/whole-empty/hover **NR**.
Geometry: **record title truncated with `…` at every width** while identical full text sits below;
**FACTS value column strands short values** (~650–890px void/row); body `<p>` has **no measure**
(~110ch line); `.record-signal-body` class is **orphaned** (rendered but zero CSS — real styled class
is `.signal-record-body`); Comments render as a bordered `.card` with a 20px `.card-h2` inside a
borderless-section document. Copy: full-page subtitle is the archive's job sentence; edit hint shows on
an all-read-only record.

**Findings.** SR-1 **P1→settled P2** notify-N naked (`messages.ts:571/1285`; **owner already answered —
`provenance/02-the-50plus-qna-grill-2026-07-10_12.md:1924,2317`** "notify N people" — cite, DO-now
restore) · SR-2 P1 Comments nested card + heading-size soup (`CommentThread.tsx:69-70`,
`TaskSurface.css:182-191`) · SR-3 P2 record reuses list job sentence · SR-4 P2 body/FACTS strand + dead
voids + orphaned `.record-signal-body` (`record-viewer.css:22-27`) · SR-5 P2 off-ladder fonts
(`signal-record.css:20/23/38`, `TaskSurface.css:194-195`) · SR-6 P3 edit hint on all-read-only record
(`record-viewer.tsx:240-242`) · SR-7 P3 FLAG title truncation on wide record · SR-8 P3 "Signal/Signals/
SIGNAL" ×3 → DO-now (`showIdentityHeader={false}`) · SR-9 P3 dead `createSignalRecordAdapter` (tests-only;
diverges from live `wrapSignalRecord`) → DO-now delete.

### 3.7 Inbox (`/mos/inbox`) — pre-drift; **only empty state rendered**

**Census.** Empty state renders zero numbers. Controls: `All`/`Unread` (one axis, 2 vals) ✓; `Handled`
correctly omitted (owner-gated). States: **only empty REVIEWED**; populated/hover/loading/error/
unavailable **NR** (empty seed for all 3 personas). Geometry: **`.record-split` grid applied
unconditionally at every width** — below 1100px it crushes triage into ~80px (390) / ~396px (768) /
~534px (1024) and reserves a 290–420px dead void, violating the class's own "drop below 1100px" comment
(`.inbox-page-split` is a no-op with no CSS). Affordance (code): severity dot is **color-only**, and the
same dot doubles as read/unread. Row model carries **no time/actor/source**. Copy: job sentence "Triage
what asked for me…" is awkward. Bell = full page on phone (OD-REDESIGN-20 ✓), quick-panel on desktop.

**Findings.** F-INBOX-1 P1 `record-split` at all widths (`inbox-page.tsx:22`, `drawer.css:19-28`) ·
F-INBOX-2 P1 populated triage (J06) never rendered — ready/hover/loading/error unverified (seed layer /
`inbox-triage.tsx`) · F-INBOX-3 P2 severity color-only + read-state overloaded (`inbox.css:49-61`,
`inbox-triage.tsx:121-124`) · F-INBOX-4 P2 row omits time/actor/source (`inbox-triage.tsx:111-129`) ·
F-INBOX-5 P3 filter chips on wrong type rung (mono vs control) (`inbox.css:106`) · F-INBOX-6 P3 FLAG
filter-blind empty copy · F-INBOX-7 P3 job-sentence grammar → DO-now (`messages.ts:521`). Cited: bell
full-page-on-phone + quick-panel (OD-REDESIGN-20); `Handled` omission (owner-gated).

### 3.8 Cafe (`/mos/cafe` + re-homed Kitchen sub-tabs) — **post-drift, suspect**

**Census.** Opening surface has **no naked numbers**; sub-tab **title badges 32/32/0** are naked and
present on only 3 of 4 tabs. Controls: not-started = 1 primary (`Start today's opening`) + 4 capture
links → A7 boundary ✓. States: default/some-empties ✓; **loading/error/no-team/team-picker/started-panel
(rollup, resolve queue) all NR** — >half the route unrendered. Geometry: **mobile capture links balloon
to ~140px tall** (flex-basis bug); orphaned team label floats top-left.

**Findings.** F1 P2 mobile capture links balloon — `.cafe-capture-link{flex:1 1 140px}` never reset in
the mobile column block (`cafe-opening-page.css:5-20`) · F2 P2 off-ladder `16px`
(`cafe-opening-panel.css:7`) · F3 P3 inline `fontSize:12` (`cafe-opening-panel.tsx:107`) · F4 P3
orphaned team label (`cafe-opening-panel.tsx:104-120`) · F5 P3 FLAG naked/inconsistent title
count-badge (Kitchen page-family — Kitchen route owns the ruling). Cited: icon-tile-stack empty states
are shared state-kit grammar (not a per-route defect).

### 3.9 Follow-ups (`/mos/work/follow-ups` → `?view=followups`) — post-drift, suspect

**Census.** Feature flag-gated OFF (`SHOW_FOLLOWUPS=false`) → reserved "coming soon" placeholder
(decided-deferred: `decisions.md:838`, AC-311). **Route-owned number `11 items in your scope` is wrong
for this view** (task-count leaked into a follow-up scope; live view shows AR, a different record type).
Controls: page create-door correctly suppressed → one door ✓; **but Filter/View&filters/Table-Card are
all live no-ops** above an empty placeholder. `.empty-state--quiet` modifier is applied but undefined.

**Findings.** F1 P1 result-header "11 items in your scope" contradicts the reserved body + mislabels
tasks as follow-up scope (`tasks-workspace.tsx:384-388`) · F2 P2 full data-collection toolbar live above
coming-soon (dead controls) (`tasks-workspace.tsx:389`) · F3 P3 dead `.empty-state--quiet` class
(`task-collection-presentation.tsx:473`) · F4 P2 FLAG rail `Tasks 9` vs header `11 tasks`. Cited:
coming-soon chip is decided (OD `decisions.md:838` + AC-311).

### 3.10 Objectives + Projects catalogs (`/mos/work/objectives`, `/mos/work/projects`) — post-drift, suspect

**Census.** Role-gating correct (Cafe-Ops sees Projects only per OD-C-2; Kitchen no access). Numbers:
head count pill `3`/`6` naked + redundant with labeled result-header; **up-trace `Under: … (2), … (1)`
emits bare counts with no unit** while the sibling down-trace units its counts (asymmetric). Controls:
top-bar `Create` + inline `Add objective` share the create axis. States: default only; 8 of 9 states
**NR**. Geometry: **390 name truncates to ~8 chars** (`Café HQ …`, `Operational Excell…`); **no
content max-width cap** → ~1000px void at 1870; rows with a trace ≈84px vs ≈52px without. Copy: **"Saved
view" mislabels the Active/Archived toggle** (saved views structurally disabled here); Objectives
carries two overlapping subtitles, Projects one.

**Findings.** F1 P1 mobile identity truncation to ~8 chars (`catalog-collection.css`,
`catalog-list-presentation.tsx:123-157`) · F2 P2 off-ladder `15px` name (`catalog-collection.css:48`) ·
F3 P2 up-trace naked counts (`catalog-collection-adapter.tsx:161-187`) · F4 P2 no max-width cap →
dead void (`objectives-page.tsx`/`projects-processes-page.tsx`) · F5 P3 "Saved view" mislabels
Active/Archived (`collection-toolbar.tsx:134-135`, shared) · F6 P3 Objectives 2 subtitles vs Projects 1
(`objectives-page.tsx:132`) · F7 P3 FLAG naked head count pill → **resolved by Tasks GUARD-R2 precedent,
DO-now** · F8 P3 FLAG two create doors → app-wide launcher FLAG · F9 P3 FLAG uneven row heights →
content-driven, **DEFER**.

### 3.11 Money (`/mos/money`) — post-drift, suspect; **only empty/awaiting rendered**

**Census.** Finance/admin route-gated (Director only). **Zero sales-snapshot rows in seed → every shot
is the empty state**; the entire populated value surface (KPI tiles, revenue chart, Detail table — all
OD-DASH-5 money numbers), loading, and error are **NR**. The one rendered number is the **naked,
misleading `0` count pill** (hard-codes `count={0}` in an awaiting state). Controls: window(4)/cut(3)/
view(2) = 3 distinct axes on desktop; **mobile drops the divider so window+cut merge into one undivided
7-pill strip** with two selected pills (reads as one broken segmented control), and **selecting Custom
pushes the entire cut axis off-screen**. Affordance: awaiting `↻` glyph reads as a clickable refresh but
is inert. Copy: empty state honest (J19-aligned); "CUT" jargon acceptable for gated audience (OD-DASH-6).

**Findings.** F-1 P2 naked/misleading `0` pill (`dashboard-page.tsx:238`, `page-head.tsx:65`; Tasks was
remediated via GUARD-R2, Money never was) · F-2 P2 off-ladder `11.5px` ×2 (`global-toolbar.css:30` —
**not in the tokenize commit's file set**, `window-selector.css:84`) · F-3 P2 FLAG mobile axis
conflation · F-4 P2 mobile Custom hides cut axis (`window-selector.tsx:94-127`, `global-toolbar.css:46-77`)
· F-5 P3 FLAG inert `↻` glyph · F-6 P2 populated/loading/error never rendered → finance numbers
un-audited (`dashboard-page.tsx:255-429`) · F-7 P3 "CUT" jargon → cited OD-DASH-6, not flagged.

### 3.12 Admin-people (`/mos/admin/people`) — post-drift; captured **after** the admin-people fixes

**Census.** Admin-gated (Director only). Numbers: single `9` count pill labeled by adjacency (clean).
Controls: list search ≠ global search; one status filter (5 segments); `+Add person` + top-bar `+Create`
+ FAB → **OD-REDESIGN-21 + OD-REDESIGN-46 sanction the coexistence** (cited, not flagged). States:
default only; hover/loading/error/empties/menus **NR**. Geometry: **phone search-mini balloons to ~180px
tall** (flex-basis bug, twin of cafe F1); **person cards nest inside the container card**; access-roles
column 45% holds 1–2 small pills → sparse mid-row void; ultrawide right-void is the cited left-align
convention. Affordance: `⋯` row action door is `opacity-0` at rest → **invisible in all shots and
unreachable by touch at 768–1024**. Copy: clean (job sentence + verbs), no locale leaks. STATUS column,
neutral role tag, `/admin/*` job sentence already read as FIXED (`4bb26a1`/`33f0f31`/`2b4508d`).

**Findings.** P1 phone search field balloons to ~180px void — `.people-search-mini{flex:1 1 180px}` not
reset in the mobile column block (`people-toolbar.css:33/72-82`) · P2-A P2 row action door invisible at
rest + unreachable by touch 768–1024 (`user-table.tsx:339`, `use-is-desktop.ts`) · P2-B P2 nested cards
on phone (`admin-users-page.tsx:195-245`, `user-table.tsx:527-604`) · P3-C P3 sparse column proportions
(`user-table.tsx:441-471`) · P3-D P3 off-ladder `15px` (`people-toolbar.css:33`) · P3-E P3 "No login"
tab wraps two lines on phone (`people-toolbar.css:83-95`). **No new-ruling FLAGs** (both candidates
OD-answered).

---

## 4. Cross-route defect work-order (deduped, grouped by owning file/seam, severity-ordered)

Owner discipline: every item is **DO-now (with files)** or **DEFER (reason + tracker)**. No floating
suggestions. Deduped across routes; the biggest wins collapse many route findings into one seam fix.

### DO-now — P1 tier

**DO-1 · Inbox: gate `record-split` behind ≥1100px** — remove the resting dead void and stop crushing
triage on phone/tablet. `inbox-page.tsx:22` (apply the class conditionally like Signals/Tasks), reserve
the right track only when a record is open; give `.inbox-page-split` real CSS or delete it.
*(F-INBOX-1)*

**DO-2 · Catalog: fix mobile identity truncation to ~8 chars** — on coarse/phone stack
`.catalog-collection__actions` below the identity (or collapse Rename/Archive into an overflow menu) so
the name keeps a full line. `catalog-collection.css`, `catalog-list-presentation.tsx:123-157`.
*(objectives F1)*

**DO-3 · flex-basis balloon on column reflow (shared root cause, 2 files)** — the mobile column block
never resets `flex-basis`, so the width-basis governs height. Add `flex:0 0 auto; min-height:44px` in
each mobile block: `cafe-opening-page.css:5-20` (`.cafe-capture-link`, was `1 1 140px`) and
`people-toolbar.css:72-82` (`.people-search-mini`, was `1 1 180px`). *(cafe F1 P2 + admin-people P1)*

**DO-4 · Task-create: collapse the doubled Create header** — make `CreateSurface` read
`showPanelUtility` and suppress its `chromeBar` when the host owns chrome (mirror `ViewSurface`); move
the expand toggle into the host's create-mode actions → one bar, one title, one ✕, one expand.
`task-surface.tsx` (`CreateSurface`), `task-drawer.tsx:221`. *(task-create F1; also removes one
dismiss-axis control per A6)*

**DO-5 · Signal-record: return the Comments block to the record-document grammar** — render
`CommentThread` with `heading="srOnly"` (prop exists) or a record-scoped variant using
`.record-viewer__section` + overline; drop the `.card` border/shadow/20px `.card-h2`.
`CommentThread.tsx:69-70`, `TaskSurface.css:182-191`. *(SR-2)*

**DO-6 · Follow-ups: stop the reserved view lying + showing dead controls** — when
`view==='followups' && !SHOW_FOLLOWUPS`, pass `count:null` (renders "—") and hide the row-operating
controls (Filter rows / View & filters / Table-Card), leaving only the saved-view chips; when the flag
is on, source the count from the follow-up queue, never `stats.total`. `tasks-workspace.tsx:384-389`.
*(follow-ups F1 P1 + F2 P2)*

**DO-7 · Naked count-pill remediation — extend the Tasks GUARD-R2 fix to Money + Objectives** — the
direction is settled (Tasks already did it). Money: pass **no** count in the awaiting/empty state
(match loading/error, which omit the pill) — `dashboard-page.tsx:238`. Objectives/Projects: drop the
bare head pill or label it (the labeled result-header already carries the count) — `page-head.tsx:65`
call sites. **Extend `guard-r2-naked-numbers.test.tsx` enumeration to Money + Objectives + Admin.**
*(money F-1, objectives F7)*

**DO-8 · Re-capture the un-rendered states from a FROZEN worktree/tag** *(process — gates sign-off of 3
routes)* — cut a tag/dedicated worktree at the intended commit so no concurrent merge can move HEAD,
seed real data, and re-shoot: **Money** populated + loading + error (all KPI/table numbers currently
un-audited, `dashboard-page.tsx:255-429`); **Inbox** populated triage + hover + loading + error (J06
core journey never rendered); **Cafe** started-panel (rollup + resolve queue) + team-picker + loading/
error; and every route's loading/error/hover. Coordinate exclusive worktree access — the whole R2 round
drifted precisely because the worktree was shared. *(money F-6, inbox F-INBOX-2, cafe state-matrix, all
NR states)*

### DO-now — P2 tier

**DO-9 · Type-ladder source-lock across component CSS + build guard C3** *(the single largest dedup —
retires D2 on 9 routes)* — replace every raw / off-ladder `font-size` literal with a `var(--font-size-*)`
ladder token, and **widen the KIT-VOCAB-FONT scan from `ui/*.css` to `components/**` + `pages/**`** (plan
rule C3) so it cannot re-rot. Files (verified present at HEAD): `cafe-opening-panel.css:7` (16px) +
`cafe-opening-panel.tsx:107` (inline `fontSize:12`); `home-stream.css:120/170/199`, `home-page.css:46/81`;
`signal-feed-rows.css:78`, `signal-record.css:20/23/38`, `signal-composer.css:37/46`,
`signal-mention-picker.css:18/39`; `TaskSurface.css` (15px/16px cluster: :7/:20/:126/:156/:179/:194/:195/
:223/:248/:257/:272/:303/:315/:325/:363/:367/:375/:387/:389/:392/:402/:482); `inbox.css:106` (chips on
wrong rung → `--font-size-control`); `catalog-collection.css:48`; `global-toolbar.css:30` +
`window-selector.css:84` (11.5px); `people-toolbar.css:33`; `collection-toolbar.css:196/237/261`,
`record-collection.css:128`. *(cafe F2/F3, home F1, signals F-1, SR-5, task-create F2, inbox F-INBOX-5,
objectives F2, money F-2, admin P3-D)*

**DO-10 · Raw-px radius → tokens (fold into the same token pass)** — `home-stream.css:169` (6px→`--radius`),
`home-page.css:37/49/77`, `TaskSurface.css:240`, and the `.tc-*` raw-px spacing (`TaskSurface.css:344/355/
362/395-396`) → `--space-*`. *(home F2, task-create F10)*

**DO-11 · Signal-record identity + copy cluster** — (a) give `SignalRecordPage` its own record-scoped
subtitle instead of the archive job sentence — `signals-archive-page.tsx:368` *(SR-3 = Signals F-2)*;
(b) pass `showIdentityHeader={false}` on the record page to kill "Signal/Signals/SIGNAL" ×3 —
`record-viewer.tsx:120-127` *(SR-8)*; (c) gate the edit hint on "≥1 editable field" not `!readOnly` —
`record-viewer.tsx:240-242` *(SR-6)*; (d) delete the dead `createSignalRecordAdapter` + its tests
(tests-only, diverges from live `wrapSignalRecord`) — `signal-record-adapter.tsx:61-204` *(SR-9)*.

**DO-12 · Signal-record measure + dead voids** — give the record body a prose `max-width` (~72ch); cap
the FACTS value column so short values don't strand; style-or-rename the **orphaned `.record-signal-body`**
(rendered with zero CSS). `record-viewer.css:22-27`, `signal-record-adapter.tsx:207`. *(SR-4)*

**DO-13 · Restore the owner-spec'd notify noun** — `"Visible to ${team} · notify ${count} ${count===1?
'person':'people'}"` (ID `orang`). **Owner already ruled this** — `provenance/02-the-50plus-qna-grill-
2026-07-10_12.md:1924,2317` ("notify N people"); cite, do not re-ask. `messages.ts:571/1285`.
*(SR-1 = Signals F-5)*

**DO-14 · Signals mobile feed title starvation** — on coarse/≤480px drop the tail (attention pill +
category) to its own line so the title spans full width, or give the title `min-width` priority.
`signal-feed-rows.css`. *(signals F-3)*

**DO-15 · Task-create field + copy + loading** — (a) phone `≥44px` field floor and add the `.tc-*`
classes to the tap-target guard selector list — `TaskSurface.css:375-392` *(F3)*; (b) directory-scoped
loading copy ("Loading people…"/"Loading…") not "Loading tasks" — `messages.ts:120` *(F4)*; (c) render
the shared `LoadingShell`/`role=status` grammar for loading fields, not literal text —
`task-surface.tsx:976-1034` *(F5)*; (d) name the submit error's problem + recovery — `messages.ts:154`
*(F6)*; (e) move initial focus to Title, not the close ✕ — `record-panel-host.tsx:101` *(F8)*; (f) hide
expand ⤢ when `!isSplit` — `task-drawer.tsx:201` *(F9)*.

**DO-16 · Home layout + copy** — (a) `.home-order-disclosure{flex-direction:column;align-items:flex-end}`
so the phone panel stacks below its trigger — `home-page.css:66-69` *(F3)*; (b) relabel "All tasks·N" →
"My open tasks·N" and reconcile with the rail badge scope — `messages.ts:676`, `home-stream.tsx:215`
*(F4)*; (c) 2-line clamp the stream-row title so the Urgent Signal stays legible at 768/1024 —
`home-stream.css:119-126` *(F5)*; (d) restore the 24px seam at my-work→ambient — `home-stream.css`/
`signal-feed-section.css` *(F6)*.

**DO-17 · Tasks create-door breakpoint** — gate the header `+Create task` on `!isNarrow` (≥920) not
`isDesktop` (≥768) so header button and FAB never co-exist in the 768–919 band. `tasks-workspace.tsx:264`.
*(tasks FINDING2)*

**DO-18 · Tasks identity + overflow + rail** — (a) at split width give the Task column more share (cap
drawer ~360–420px) or allow the title to wrap 2 lines — `TasksWorkspace.css:34` *(FINDING1)*; (b) 390
tab-strip: wrap / shorten / scroll affordance for the clipped `Follow-up…` — `collection-toolbar.css`
*(FINDING6)*; (c) `Activity Nd ago` → unambiguous recency ("Updated N days ago") — `messages.ts:204`
*(FINDING4)*; (d) give the rail badge an accessible name + drop `aria-hidden` — `rail-nav.tsx:138`
*(FINDING5 a11y half; the open-vs-total semantic → FLAG-2)*.

**DO-19 · Inbox severity + row meta** *(verify on the DO-8 populated re-render)* — carry severity by
icon/shape/text not hue alone and separate read-state from severity — `inbox.css:49-61`,
`inbox-triage.tsx:121-124` *(F-INBOX-3)*; render occurred-at (relative time) + actor + source in the
row, confirming the model carries them — `inbox-triage.tsx:111-129` *(F-INBOX-4)*.

**DO-20 · Objectives/Projects trace + width + toolbar + subtitle** — (a) unit the up-trace counts to
mirror the down-trace grammar ("… · N tasks") — `catalog-collection-adapter.tsx:161-187` *(F3)*; (b) cap
the catalog content width (~1280, match Tasks) — `objectives-page.tsx`/`projects-processes-page.tsx`
*(F4)*; (c) label the segment "View" (or suppress the "Saved view" zone label when `savedViews` is
disabled) — `collection-toolbar.tsx:134-135`, shared *(F5)*; (d) drop the redundant Objectives `meta`
subtitle (or give Projects a parallel one) — `objectives-page.tsx:132` *(F6)*.

**DO-21 · Money mobile Custom-range** — drop the Custom From/To onto its own row/sheet below the seg
(don't inline into the horizontal scroller) so Branch/Channel/Activity stay visible. `window-selector.tsx:
94-127`, `global-toolbar.css:46-77`. *(money F-4)*

**DO-22 · Admin-people row door + nested cards + columns + phone tab** — (a) give the `⋯` trigger a
persistent low-emphasis rest state and reflow to the "Manage" card on coarse-pointer (not width alone),
so touch tablets at 768–1024 can reach row actions — `user-table.tsx:339`, `use-is-desktop.ts` *(P2-A)*;
(b) on phone strip the outer container's border/shadow/bg so person cards don't nest — `admin-users-page.
tsx:195-245` *(P2-B)*; (c) rebalance table columns (widen Person, shrink 45% access-roles) —
`user-table.tsx:441-471` *(P3-C)*; (d) fit "No login" on one line on phone — `people-toolbar.css:83-95`
*(P3-E)*.

**DO-23 · Task-record rhythm + permission copy + mobile padding** — (a) give read-only field rows the
same min-height/gap tokens as editable rows (permission-invariant rhythm) — `record-field.tsx`,
`record-viewer.css` *(P3-1)*; (b) add a recovery clause to the permission note ("Ask a manager/admin to
change ownership") — `task-record-adapter.tsx:188` *(P3-2)*; (c) add `scroll-padding-bottom` = tab-bar
height on the mobile record scroll container — `TaskSurface.css`/`record-viewer.css` *(P3-4)*.

### DO-now — P3 tier

**DO-24 · Small copy/geometry cleanups** — (a) bind the cafe team name into the panel header block so it
reads as the panel's subject — `cafe-opening-panel.tsx:104-120` *(cafe F4)*; (b) rewrite the inbox job
sentence ("Triage what asked for me…" → "Triage what was directed to you and return to its source.") —
`messages.ts:521` *(F-INBOX-7)*; (c) define or drop the dead `.empty-state--quiet` modifier —
`task-collection-presentation.tsx:473` *(follow-ups F3)*.

### DEFER

**DEFER-1 · Objectives/Projects uneven row-height cadence (trace present ≈84px vs absent ≈52px)** —
content-driven on independent list rows; no fixed-geometry contract violated. Track in `docs/backlog.md`
as a density-judgment item; only escalate if the owner reads the cadence as broken. *(objectives F9)*

---

## 5. FLAG list — items needing a genuinely new owner ruling

Each was checked against `docs/decisions.md` (OD-*) and `docs/reference/provenance/` and found
**unanswered**; where an OD *partly* answered, the settled part is cited and only the residual is
flagged (grill-corpus rule — never re-ask what the owner already ruled). Phrased as one-line decisions.

1. **Create-door visual weight (app-wide).** OD-REDESIGN-21/46 sanction the *coexistence* of a page's
   contextual solid CTA and the universal top-bar `Create`/FAB, but rule nothing on **equal visual
   weight**. When co-located both render solid indigo — demote the universal launcher to ghost/secondary?
   *(tasks FINDING3, objectives F8)*
2. **Rail nav-badge semantics.** Rail `Tasks 9` (open) disagrees with page `11 tasks` (total) with no
   reconciling label; no OD covers rail-badge labeling. Should nav badges carry a disambiguating
   label/tooltip (open vs total)? *(tasks FINDING5, follow-ups F4, home F4)*
3. **Signal attention escalation.** OD-REDESIGN-43 groups Needs-attention + Urgent and only Urgent may
   fire doorbell delivery, but does not mandate a visual distinction. Should Urgent be visually escalated
   above Needs-attention, and should the *record* show the attention pill rather than plain text?
   *(signals F-4)*
4. **Signal composer default owning-team.** For can-post-for-any users the default falls to
   `teamOptions[0]` ("B2B Sales Team"), unrelated to the author, and "never blocks capture" lets a
   mis-targeted signal post silently — is this a seed gap (`is_primary` unpopulated) or a real
   safe-default bug to fix? *(signals F-6)*
5. **Signal composer datetime format.** The native `datetime-local` picker renders `DD/MM/YYYY, hh:mm
   pm` (browser locale) vs the app's `DD Mon YYYY, HH:MM WIB` convention — accept the native picker or
   build a WIB-formatted control? *(signals F-7)*
6. **Signals saved-view vs granular filters.** `Needs attention` chip duplicates the Attention filter
   axis and `Retracted` chip duplicates the Show-retracted toggle — intended preset+filter pattern, or
   collapse each to one control? *(signals F-9)*
7. **Tasks overdue axis, two doors.** Overdue is reachable via the `Overdue` view chip and the `N need
   attention` quick filter — deliberately distinct intents (saved view vs in-panel filter) or collapse
   to one? *(tasks FINDING7)*
8. **Task-record two-column page (OD-P4-11 vs V3 grammar).** OD-P4-11 specified the record as a
   two-column full page; the V3 single-grammar RecordViewer renders one column with tabbed feed
   (unused two-column path exists). Does V3 intentionally supersede OD-P4-11, or should the feed sit
   beside the details at ≥1280 to consume the wide void? *(task-record P2-1)*
9. **Task-record header glyph clarity.** The Deputy "spark" and the collapse glyph are similar 16px line
   icons (both accessible-named); differentiate the glyphs and/or add a text label at ≥1024? *(task-record P3-3)*
10. **Signal-record title truncation.** The record's identity heading is cut at 80 chars with "…" even on
    a 1870px page (deliberate `firstLine` convention, no OD on record-title truncation) — acceptable, or
    show the full first sentence when width allows (keep the 80-char cap only for table cells)?
    *(signal-record SR-7)*
11. **Money awaiting refresh affordance.** The awaiting `↻` glyph reads as a clickable refresh but is
    inert — swap to a non-action glyph (clock/hourglass), or make awaiting offer a real manual refetch?
    *(money F-5)*
12. **Money mobile axis separation.** On phone the window + cut axes merge into one undivided scroll strip
    (two selected pills read as one broken segmented control) — restore an inline axis separator / group
    heading, or stack the two segments on two rows? (design-plan G2 residual) *(money F-3)*
13. **Inbox filter-blind empty copy.** With the Unread filter active and items present but all read, the
    state still resolves to "You're all caught up" — acceptable, or a filter-aware message ("No unread —
    N handled")? *(inbox F-INBOX-6)*
14. **Cafe/Kitchen sub-tab title count-badge.** The bare `32/32/0` title badges are naked and present on
    only 3 of 4 tabs (Kitchen page-family) — keep (made uniform + labeled, e.g. "32 dishes") or drop?
    *(cafe F5 — Kitchen route owns it)*
15. **Home ambient "SIGNALS" label.** The split is ratified (OD-REDESIGN-43 / A12), but the ambient tail
    and the attention band both render the identical word "SIGNALS" — relabel the ambient section (e.g.
    "TEAM SIGNALS")? *(home F7)*
16. **Home my-work PIC framing.** My-work rows front the PIC/Responsible avatar+name (Luna J01/J02
    enrichment, intended) — does the PIC need a role qualifier in the my-work context so it doesn't
    misread as "assigned to me"? *(home F8)*
17. **Task-create optional fields when empty.** Project/Process and Objective pickers are hidden when
    their catalog is empty (no OD on create-form optional-field visibility) — hide-when-empty, or
    always-show-disabled so the field's existence is discoverable? *(task-create F11)*

**FLAG-18 (post-census, Money lane 2026-07-23):** Budget/Pricing pages are gated behind
`SHOW_PLAN_BUDGET` (default false → redirect Home). They now render fully against the seeded
scenarios. One-line ruling: ship them enabled in this V3 cut, or keep gated until the plan
destination work (ADR-0022) resumes?
