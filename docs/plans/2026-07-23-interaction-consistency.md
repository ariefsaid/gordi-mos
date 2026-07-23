# Interaction consistency — cross-surface verb-by-verb interrogation (V3 redesign)

**Date:** 2026-07-23 · **Branch:** `feat/redesign-buildout` (worktree `v3-redesign`) · **Method:** seven
read-only cross-surface audits, one per interaction verb, each tracing every live surface at
`mos-app/src`. Consolidated here against the corpus (`docs/decisions.md`,
`docs/interaction-contract.md`, `docs/experience-contract.md`, `DESIGN.md`,
`docs/reference/provenance/`).

> **Corpus-first framing (this changes the verdict).** The auditors flagged many divergences as
> "CONTRACT-GAP / needs an owner ruling." Grepping the corpus first shows **most are already ruled** —
> by owner decisions (OD-REDESIGN-19/20/22/39/46/63) and the BINDING `interaction-contract.md`
> (classes I1/I2/I5/I7). Those are **conformance violations of a written contract**, not open questions.
> Only a small residue is genuinely unruled. Sections below tag each item **RULED (violation)** vs
> **GAP (needs ruling)** and cite the governing line.

---

## 1. Verdict

**The interaction grammar is written but not uniformly obeyed. It is one grammar on paper, four-to-eight
grammars in the running app.** The V3 record surfaces routed through the shared engine + shared host +
the two field primitives (Tasks list, Signals archive, Objectives, Projects/Processes, the RecordViewer,
Follow-ups/Inbox for read) are genuinely cohesive — that is the target and it exists. The fractures are
concentrated in: (a) surfaces that never adopted the shared machinery (Kitchen, Admin/People, the Money
panes, Follow-ups/Inbox filter state); (b) a handful of records that pick the wrong *mode* (ephemeral
where the contract requires route); and (c) two field-lifecycle paths that discard the user's work
against OD-REDESIGN-22.

### Divergence census (35 distinct divergences across 7 verbs)

| Severity | Count | Definition |
|---|---|---|
| **CRITICAL** | 6 | Silent loss of the user's work/data, or a dead-end that ejects the user from the section. Each contradicts a written contract. |
| **HIGH** | 9 | Cross-surface behavior for the *same act* diverges in a way a user hits daily; violates a written contract. |
| **MEDIUM** | 11 | Real inconsistency, contained blast radius, or a11y-only; contract present or majority-clear. |
| **LOW / cleanup** | 9 | Dead code, doc-lies, orphan strings, token-level deviation. |

**Contract-gaps needing a fresh owner ruling: 7** (Section 3). Everything else resolves against an
existing decision — the winning behavior is already law.

### The six CRITICAL divergences (all involve losing the user's work)

1. **Failed-save silently discards the attempt on the optimistic path** (edit / feedback) — same drawer,
   two truths. VIOLATES OD-REDESIGN-22.
2. **Kitchen LOG batch form has no leave-guard** — a whole shift's staged quantities vanish on any nav.
3. **Task create-drawer (`/work/tasks/new`) has no dirty-guard** — Escape discards a typed draft with no
   confirm. VIOLATES OD-REDESIGN-22's "keeps the field open / pending-saved-error-retry" spirit and the
   in-list path's own behavior.
4. **Comment composer + @mention picker bypass field-Escape isolation** — Escape closes the panel and
   loses a typed comment. VIOLATES the I5 field-isolation contract (OD-83.1 build item).
5. **Task open is not URL-addressable + no `deepLinkResolver` wired** — bookmark/refresh a task drawer
   → bare list tomorrow. VIOLATES OD-REDESIGN-19 + OD-REDESIGN-63 + I1/I7.
6. **Follow-up / Inbox open ephemeral → browser Back ejects the user from the section.** VIOLATES I2
   ("Back → where you came from. Never a dead end") + OD-REDESIGN-20 (Inbox Back returns to Inbox).

---

## 2. Per-verb sections

Each verb: **the contract** (with corpus citation) → **per-surface snapshot** → **divergences** (winner +
user-visible consequence). Per-surface tables are condensed; the exhaustive file:line tables live in the
seven source audits this consolidates.

---

### VERB A — open-record + URL addressability + browser-Back

**The contract.**
- `interaction-contract.md` **I1**: in-list click → shared side panel (≥1100px split / <1100px modal);
  **direct URL / refresh / new-tab → full canonical page**; same renderer, `mode` switch.
- `interaction-contract.md` **I2**: ✕/Esc → underlying page; **Browser Back → where you came from; never
  a dead end**; in-panel stack Back pops one.
- **OD-REDESIGN-19** (decisions.md:1246): "Direct URL, refresh, new-tab, and copied links render the
  canonical full page **because every pill retains a real canonical `href`**." Panel Back and Browser Back
  pop one level and restore scroll/focus.
- **OD-REDESIGN-63** (decisions.md:1691): in-list click → shared split drawer; **direct URL/new-tab/
  refresh → the same record as a standalone full canonical page**.
- **I7** (interaction-contract.md:34): "View state in query params survives refresh/share."

The written contract is unambiguous: **every openable record kind is URL-addressable and survives
refresh/new-tab, and Back is never a dead end.**

**Per-surface snapshot**

| Surface | Mode | Id in URL? | Refresh/bookmark | Browser Back | Conformant? |
|---|---|---|---|---|---|
| Tasks (list row) | route | **No** (id in `history.state`) | **Lost → bare list** | closes panel ✓ | ✗ (D-A1) |
| Signals (archive) | route + `?record=` | Yes | escalates to `/work/signals/:id` ✓ | closes panel ✓ | ✓ |
| Signals (Home feed) | route marker | **No** | **Lost** | stays on Home | ✗ (D-A2) |
| Follow-ups (canonical) | **ephemeral** | No | Lost | **ejects to page** | ✗ (D-A3) |
| Inbox (notifications) | **ephemeral** | No | Lost | **ejects to page** | ✗ (D-A3) |
| Catalog rows | none (dead seam) | — | — | — | see D-A6 |
| Kitchen/Admin/Money/Processes | none (inline) | — | — | — | see D-A7 |

Core seam facts: `engine.openRecord` (the documented "one grammar", engine.ts:272) is **bypassed by every
Work surface**; **no `deepLinkResolver` is wired** (app-shell.tsx:41 passes only `historyDriver`), so the
host's hard-load restore path (overlay-host.tsx:399) never runs in production. `createRecordRouteAdapter`
(overlay-navigation.ts:160) already supports both path and query forms — the adapter exists, it just isn't
used uniformly.

**Divergences**

- **D-A1 · Task open is not URL-addressable [CRITICAL · RULED-violation].** Winner: **the addressable
  form** — OD-REDESIGN-19/63 + I1/I7 require it. Put the task id in the URL (path child or `?record=`)
  and wire a `deepLinkResolver`. *Consequence:* bookmark "the task I'm working on" → empty list tomorrow;
  the identical action on a Signal works.
- **D-A2 · Same Signal kind, two URL grammars by entry point [HIGH · RULED-violation].** Archive =
  `?record=` (addressable); Home feed = marker-only, not shareable. Winner: **the archive `?record=`
  form**, UNLESS Home-feed opening is declared an ambient exception (see GAP-1). *Consequence:* "copy link
  to this signal" works from the archive, silently produces a home URL from the feed.
- **D-A3 · Ephemeral Back ejects the user [CRITICAL · RULED-violation].** Follow-ups/Inbox open ephemeral
  (no history entry; overlay-host.tsx:304 early-returns on POP). Winner: **route mode** — a follow-up has
  a canonical `/work/follow-ups/:id`; Inbox is governed by OD-REDESIGN-20 ("Back returns to Inbox"). I2
  forbids the dead-end. *Consequence:* on a task, Back = close drawer; on a follow-up/inbox item the same
  reflex throws the user out of the section (panel AND queue gone).
- **D-A4 · "Open" renders three different things [HIGH · RULED-violation].** Collection → full
  RecordViewer; Inbox notification → summary door card (inbox-record-door.tsx:146); Tasks→Follow-ups embed
  → bare `<Link>` page jump (follow-up-queue-table.tsx:112). Winner (I1): **one shared RecordViewer in a
  panel**. *Consequence:* users can't predict whether a row gives the editable record, a read-only blurb,
  or a full navigation.
- **D-A5 · "Expand" is Tasks-only and unwired elsewhere [MEDIUM · GAP-2].** Only Tasks widens (legacy
  `.split.expanded`, a global pref); `RecordPanelHost.expanded` exists but `OverlayHostSlot` never passes
  it. Note OD-REDESIGN-19 already gives "Open full page" as the canonical escalation — "expand-in-place"
  may be a legacy that should retire in its favor. Needs a ruling (GAP-2).
- **D-A6 · Catalog defines an opening contract nothing calls [LOW · cleanup].** `buildPanelEntry` +
  `toCanonicalPage:/work/:id` exported but never invoked; rows render inline Rename/Archive only. Fossil
  law (CLAUDE.md "redundancy is a fossil") → delete the dead seam (or wire a door if GAP-3 says catalog
  gets one). `/work/:id` is also an anomalous shape.
- **D-A7 · The door grammar is Work-domain-only [note · GAP-3].** Kitchen/Admin/Money/Processes/Catalog
  carry no record door by design (inline dense tables + centered dialogs). Consistent with "a catalog row
  has no record panel" but needs an explicit exemption line so it doesn't read as a gap.

---

### VERB B — close / Escape / focus-return + close-layering

**The contract.** `interaction-contract.md` **I2** (✕/Esc → underlying page, focus to opener; one close
path) and **I4** (modal Esc closes + returns focus). The controller routes every leave through ONE
`requestLeave(intent, commit)` gate against the active frame's `leaveGuard` (overlay-host.tsx:212).
Field Escape is isolated below the host by a native capture listener + `stopImmediatePropagation`
(record-field.tsx:190) — the OD-83.1 build item. Deputy-above-record closes first via document-capture
(overlay-host.tsx:744). **OD-REDESIGN-22** governs the dirty case: a leave with an uncommitted edit must
not silently discard it.

**Per-surface snapshot.** Reference/consistent: Tasks in-list open, Signals archive, Follow-ups, Inbox
(ephemeral by contract), Deputy layering, RecordField (native-capture isolation), all `ModalShell`
dialogs (⌘K, composer, ConfirmDialog, admin), `useMenuPopover` menus, MobileDrawer, full pages
(Escape-inert, correct). **Divergent:** TaskDrawer route, PersonPicker/comment composer.

**Divergences**

- **D-B1 · Task record has TWO mount paths with different Escape semantics [CRITICAL · RULED-violation].**
  In-list click (#1) → overlay host + dirty leave-guard: Escape-with-dirty shows Stay/Discard. TaskDrawer
  **route** — the create form `/work/tasks/new` (reached from every "+ Create task"/FAB) and the
  collapse-to-split view — mounts `RecordPanelHost` **directly** with `onClose=navigate(...)`, **no
  `requestLeave`, no leaveGuard** (task-drawer.tsx:229). Winner: **the overlay-host path**; OD-REDESIGN-22
  requires the guard everywhere. *Consequence:* type a new task title + due date in the create drawer,
  press Escape → whole draft discarded instantly, no confirm; the same edit from a list row prompts
  "Discard changes?". On a hard-loaded `/work/tasks/:id`, focus returns to `document.body`, not a row.
- **D-B2 · @mention picker + comment composer bypass field-Escape isolation [CRITICAL · RULED-violation].**
  `CommentThread`'s textarea is an unsaved draft **not** wired to `onDirtyChange`; its `PersonPicker` has
  **no Escape handler** (`onClose={()=>{}}`). Winner: **the RecordField grammar** — comment draft feeds
  the leaveGuard, or the picker/composer consumes Escape locally first (per OD-83.1). *Consequence:* type
  a multi-line comment, press Escape → panel closes, comment lost, no guard; the picker is never dismissed
  by Escape, only by deleting the `@` text.
- **D-B3 · `use-tasks-keyboard` window Escape double-fires with the panel host [HIGH · RULED-violation,
  latent].** use-tasks-keyboard.ts:63 fires `onClose()` on Escape unconditionally from a **window**
  listener, no `stopPropagation`, before `isTypingTarget`. While a record panel is open both it and
  `RecordPanelHost` call `host.close`. Today masked by `requestLeave` coalescing — the "one leave path"
  invariant is upheld by luck, not design. Winner: **the host** — gate the window Escape off while a
  panel/drawer is open, or route it through the guarded `host.close`. *Consequence (if surfaced):* Tab to
  the panel's Close button with a dirty field, press Escape once → guarded close races an unguarded
  `onCloseDrawer`; panel can vanish and draft is lost with no prompt.
- **D-B4 · Dead code: `StatusTrigger` [LOW · cleanup].** Its only importer (`task-drawer-header`) is
  deleted; V3 renders status through RecordField. Its Escape (`setOpen(false)`, no `stopPropagation`)
  would be a D-B1-class double-close if re-mounted. Remove (fossil law) or route through
  `useMenuPopover`/RecordField if reused.

---

### VERB C — edit-commit grammar (inline commit of a SAVED value)

**The contract — OD-REDESIGN-22 (decisions.md:1280), the single most-cited law here.** One inline-edit
primitive governs table/board/panel/canvas: **Enter** validates+saves+closes; **Tab/Shift+Tab**
saves+moves; **click-outside saves**; **Escape discards the uncommitted value and restores the last saved
value**; validation failure **keeps the field open with an inline error**; **autosave shows
pending/saved/error/retry, with Undo where practical**. This is an intentional MOS divergence from
Twenty's Escape-persists and "supersedes every inconsistent prototype." `interaction-contract.md` **I5**
restates it; `use-inline-commit.ts` is "the ONE inline-edit primitive."

**Per-surface snapshot**

| Surface | Enter | Blur | Escape | Failure | Primitive | Conformant? |
|---|---|---|---|---|---|---|
| RecordField text/date | commit | commit | restore (native capture) | **keeps draft + visible Retry** | own | ✓ (gold) |
| RecordField option/status/pic/checklist | — | — | — | **rollback + sr-only only** | own/eager | ✗ (D-C1) |
| PlanQtyCell (kitchen PLAN desktop) | commit | commit | **restore** | cue | `useInlineCommit` | ✓ |
| PlanQtyStepper (kitchen PLAN phone) | **nothing** | commit | **nothing** | cue | bespoke draft | ✗ (D-C2) |
| WipItemStepper (kitchen LOG, both) | **nothing** | **nothing** | **nothing** | eager→page state | **none** | ✗ (D-C2/C3) |
| QtyCell (kitchen LOG desktop, correct) | commit | commit | restore | cue | `useInlineCommit` | ✓ but **dead code** (D-C4) |
| task-row inline rename | commit +stopProp | commit | restore +stopProp | rollback announce | `useInlineCommit`+own | ✓ (fragile mechanism, D-C5) |

**Divergences**

- **D-C1 · Failed-save has two contradictory shapes in one drawer [CRITICAL · RULED-violation].** Same as
  feedback DIV-1. RecordField text/date/option → **visible** "Couldn't save · Retry" + preserved attempt;
  status/pic/checklist + `useInlineCommit` call sites → **rollback + sr-only announce only**, no visible
  error, nothing to click. OD-REDESIGN-22 mandates "pending/saved/error/retry." Winner: **the visible
  error+retry path** (RecordField's option branch already does it). *Consequence:* in one task drawer a
  failed Due-date edit shows red "Retry" and keeps your text; a failed Status change silently snaps the
  pill back with only a screen-reader murmur — a sighted user never learns it failed.
- **D-C2 · Kitchen has THREE edit-commit grammars for numerically-identical cells [CRITICAL · RULED-
  violation].** PLAN-desktop (correct: draft/Enter/blur commit/Escape restore); PLAN-phone (Enter dead,
  Escape dead); LOG (no draft — every keystroke commits to page state; Enter/blur/Escape all inert).
  PlanQtyStepper's own header falsely claims it "mirrors PlanQtyCell's contract." Winner: **the PLAN-
  desktop reading via `useInlineCommit`** — OD-REDESIGN-22 + the primitive's own "the ONE inline-edit
  primitive" both point there. *Consequence:* type `40`, press Escape → desktop reverts to saved; phone
  keeps `40` as a dead draft; LOG fires two writes (`4`,`40`) and Escape cannot undo — three outcomes for
  the same mistype by screen and device.
- **D-C3 · Kitchen LOG batch form has no leave-guard [CRITICAL · GAP-4].** WipItemStepper commits into
  `lines` page state; nothing persists until Submit; there's a manual Discard (`window.confirm`) but **no
  route-leave guard**. Contrast RecordField, which feeds the host leave-guard. *Consequence:* fill "Made
  today" for 20 dishes, click a nav link → all 20 vanish, no prompt; the same unsaved work in a Task
  raises "unsaved changes." The batched-form model may be deliberate (it is not a single-field edit), so
  the **guard requirement** needs an explicit ruling (GAP-4), but the data-loss is real today.
- **D-C4 · QtyCell (contract-correct LOG cell) is dead code [MEDIUM · cleanup].** `qty-cell.tsx` routes
  through `useInlineCommit` per contract but no page imports it — the LOG page renders WipItemStepper
  instead (kitchen-log-page.tsx:418). The one kitchen LOG cell that gets edit-commit right is unmounted.
- **D-C5 · Escape-isolation *mechanism* differs (correct today, silently fragile) [MEDIUM · note].**
  RecordField uses native capture-phase (host listens natively on the panel, below the React root);
  task-row relies on React synthetic `stopPropagation` (collection host listens on `window`, above the
  root). Both correct **for their host's listener placement**, but load-bearing and invisible. If a
  maintainer moves the collection listener below the React root, a single Escape during rename will BOTH
  cancel the rename AND close the drawer. Harden task-row the way RecordField is hardened.
- **D-C6 · Enter means opposite things in the two composers [LOW · GAP-5].** Deputy: Enter sends,
  Shift+Enter newline. Signal composer: Enter inserts newline, Share button sends. Both are "share a
  message." No contract governs composer Enter (create-grammar). Needs a ruling (GAP-5).

---

### VERB D — create + composer entry points

**The contract.**
- **OD-REDESIGN-21** (decisions.md:1267) + **OD-REDESIGN-46** (decisions.md:1521): no global Capture;
  universal `+ Create`/⌘K/phone-`+` share **one command registry**; the Action Launcher shows **stable
  universal actions (Share Signal · Ask Deputy · Create Task · More) plus at most one context action**,
  capability-filtered, context-prefilled, **never algorithmically reordered**.
- **experience-contract Rule 7** (experience-contract.md:153): every visible primary action is
  **verb+object** ("Share Signal", "Create Task", "Add follow-up"); a bare **`Create`** is forbidden;
  the desktop `+ Create` door is explicitly sanctioned as the launcher.
- **OD-REDESIGN-39** (decisions.md:1458): from a Signal, **"Create follow-up Task" pushes the canonical
  Task composer in the same panel stack with Signal context prefilled; save returns to the Signal.**
- **I1** create = new record + inline title edit (OD-REDESIGN-10 D3e).

**No contract fixes the after-create *destination* or the success-feedback *channel*** — those are GAPs.

**Per-surface snapshot**

| Surface | Grammar | After create → | Feedback |
|---|---|---|---|
| ⌘K / top-bar +Create / phone + | one launcher, dispatches | item's own | — |
| Signal (shared composer) | centered ModalShell, one instance | **stays**, focus to invoker | silent (row appears) |
| Task | route record form `/work/tasks/new` | **navigates AWAY to `/work/tasks/:id`** | silent (record is feedback) |
| Kitchen log | page-as-composer (batch) | **stays**, reset | **inline banner** |
| Admin create-person | local ModalShell | **stays** (people list) | **toast** |
| Catalog (Objectives/Projects) | inline Add bar | **stays** (input cleared) | **sr-only aria-live** |
| Follow-ups | **no create door** (system-generated) | — | — |
| Create-Task-from-Signal | **documented, UNBUILT** | — | — |

Consistent and correct: the Signal composer is one instance dispatched from 5 doors; all three launcher
doors hit one registry; all modal creates ride `ModalShell` (identical focus/Esc/return); every actual
create *action* is verb+object.

**Divergences**

- **D-D1 · After-create destination splits [HIGH · GAP-6].** 4 of 5 composing surfaces create-in-place +
  refresh; **Task alone navigates away** onto the new record. No contract sanctions the split. Majority +
  the fact that the Task form already collects assignee/due/description/workline/objective (landing to
  "finish it" is largely redundant) point to **return-to-collection-with-new-row**. Needs a ruling
  (GAP-6). *Consequence:* creating 3 tasks = 3 round-trips (list→/new→/:id→back→/new); 3 signals or
  objectives = stay-put repeat.
- **D-D2 · Signals-archive Share door blinks with the layout toggle [HIGH · RULED-violation].** FEED
  layout shows an in-feed "Share a Signal" row; TABLE layout shows **no Share door on the page at all**
  (only ⌘K/top-bar); the toolbar hosts none. Rule 7 + OD-REDESIGN-46 make the create verb's reachability
  independent of an unrelated presentation choice. Winner: **a layout-independent Share door** (toolbar
  hosts it, or ⌘K/top-bar is declared the sanctioned door and the feed row is ambient-only).
  *Consequence:* switching the archive to Table silently removes the visible Share entry point.
- **D-D3 · Create-success feedback channel differs on every surface [MEDIUM · GAP-7].** Kitchen = inline
  banner; Admin = toast; Catalog = sr-only only; Signal/Task = silent. Same as feedback DIV-2.
  OD-REDESIGN-22 requires a "saved" indication for edits; DESIGN.md:415 documents the toast; DESIGN's
  "inline direct-edit feedback is local, not a toast" favors an inline transient at the locus. Needs one
  ruling (GAP-7). *Consequence:* reassign a task PIC → nothing on screen; add a person → toast; submit a
  café log → banner; add a catalog objective → nothing visible (sighted keyboard user gets no
  confirmation).
- **D-D4 · "Create Task from a Signal" is documented + i18n'd but UNBUILT [MEDIUM · RULED — build it].**
  `signals.record.createTask`="Create Task" exists and a source comment asserts the flow, but the Signal
  record adapter wires only acknowledge/comment/link/correct. This is **not** an orphan-string-to-delete:
  **OD-REDESIGN-39 decides the feature exists** ("Create follow-up Task pushes the canonical Task
  composer in the same panel stack with Signal context prefilled; save returns to the Signal"). Winner:
  **build it** per OD-REDESIGN-39. *Consequence:* a user reading a Signal that needs follow-up has no
  create-task affordance there, despite the app's own copy implying one and an owner decision requiring it.
- **D-D5 · Top-bar launcher label "Create" is a bare verb [LOW · sanctioned].** Rule 7 forbids bare
  `Create` for *actions* but explicitly names the desktop `+ Create` **door**. It composes nothing itself.
  Negligible; a purist reading relabels "New" or icon-only.

---

### VERB E — collection grammar (toolbar · saved views · filters · sort · group · counts)

**The contract.** Canonical = `record-collection/collection-toolbar.tsx` (row-1 saved-view chips +
presentation switch; row-2 search + ONE "View & filters" disclosure — the OD-84.1 build item), driven by
the RecordCollection engine, framed by `RecordCollectionSurface` (owns the result-count header).
**I7** (interaction-contract.md:34): **"View state in query params survives refresh/share."**
**OD-REDESIGN-8** (Work = one record workspace with collections and saved views) + **OD-REDESIGN-23**
(users pin saved Work views). DESIGN makes CollectionToolbar "the one visible RecordCollection control
grammar."

**Per-surface snapshot**

| Surface | Toolbar | Engine? | URL-synced filter? | Saved views | Count header | Verdict |
|---|---|---|---|---|---|---|
| Tasks | shared | ✓ | ✓ | ✓ | ✓ | CANONICAL |
| Signals archive | shared | ✓ | ✓ | ✓ | ✓ | CANONICAL |
| Objectives | shared | ✓ | ✓ | — (omitted honestly) | ✓ | consistent-by-omission |
| Projects & Processes | shared | ✓ | ✓ | — | ✓ | consistent-by-omission |
| Admin / People | **bespoke** ViewTabs | ✗ | **✗ useState** | — | — | DIVERGENT |
| Kitchen (log/plan/stock) | **bespoke** | ✗ | **✗** | — | — | DIVERGENT |
| Follow-ups | **none** (bespoke aside) | ✗ | ✗ | — | — | DIVERGENT |
| Inbox | **bespoke** chip strip | ✗ **useState** | **✗** | — | — | DIVERGENT + doc-lie |
| Home stream | **none** (by design) | n/a | n/a | n/a | band counts | SANCTIONED (Home attention exception) |

**Divergences**

- **D-E1 · Filter/search does not survive refresh on 4 surfaces [HIGH · RULED-violation].** People,
  Kitchen, Inbox, Follow-ups hold filter in component `useState`; I7 requires query params that survive
  refresh/share. Winner: **URL-synced query** (the engine's `urlMode:'synced'`). *Consequence:* filter
  People to "Disabled" + search "andi", refresh or share the URL → back to "All", empty search; the same
  journey on Tasks restores intact.
- **D-E2 · Saved views exist only on Tasks + Signals [MEDIUM · GAP-3].** Wired through the engine only
  there. Whether People/Inbox/Kitchen/Follow-ups should have saved views depends on whether they are
  "browse collections" — GAP-3 (surface-classification ruling). *Consequence:* saved-view axis silently
  vanishes surface-to-surface.
- **D-E3 · The learned layout (chips left / "View & filters" right) is absent on the fossils [HIGH ·
  RULED-violation].** People = segmented ViewTabs; Inbox = flat chip strip, no search/disclosure; Kitchen
  = search+dropdown; Follow-ups = nothing. Winner: **the canonical CollectionToolbar** for genuine
  collections. *Consequence:* a user who learns "filters hide behind View & filters" on Tasks finds tabs
  on People, no disclosure on Inbox — the "one grammar" promise breaks on sight.
- **D-E4 · Result-count header is inconsistent [MEDIUM · RULED-violation].** Rendered by
  `RecordCollectionSurface` for the 4 engine surfaces; People/Kitchen/Follow-ups/Inbox have no
  equivalent. *Consequence:* the standardized "how many, which view" line appears on Tasks/Signals/
  Catalogs and disappears elsewhere.
- **D-E5 · Inbox docstring is false [LOW · cleanup, CONFIRMED].** inbox-triage.tsx:22 claims filter/query/
  sort "delegated to the landed Issue 6 RecordCollection seam"; the container is plain
  `useState('all')` + `.filter`. Fix the code (migrate) or the docstring — they disagree. Anyone porting
  Inbox from the comment assumes URL-sync/saved-views already work.
- **D-E6 · Follow-ups detail is a bespoke aside, not the shared Record Panel [MEDIUM · RULED-violation].**
  `follow-up-queue-table.tsx:182` (`role=complementary`); the Tasks-embed door passes no `onOpenRecord`
  → bare `<Link>`, while the canonical page opens the overlay host. Same record, two open behaviors
  (overlaps D-A3/D-A4). Winner: the shared host.
- **D-E7 · Objectives `filteredEmpty.clear` sets `type:'all'` — dead key [LOW · cleanup].** Copy-paste
  from Projects; Objectives has no `type` filter. Harmless, flag for cleanup.

---

### VERB F — command menu · search · keyboard model

**The contract.** ⌘K = one document-level owner, four entry doors (⌘K, top-bar search, top-bar +Create,
phone +) all funnel to one `setSearchOpen`. **I3** (`useMenuPopover`: focus enters first item, Arrow/
Home/End cycle, Esc + outside-click close + return focus) is the popover reference. **I7 / ViewTabs**
(view-tabs.tsx:75, "roving-tabindex contract"): roving tabindex **REQUIRES moving DOM focus** with the
selection. **I5** inline-commit (consistent — the one well-unified keyboard grammar). Single-letter Tasks
hotkeys are correctly suppressed inside inputs.

**Divergences**

- **D-F1 · Escape double-fire: Tasks keyboard layer vs record-panel host [HIGH · RULED-violation].** Same
  as D-B3. `useTasksKeyboard` (`enabled: desktopLayout`) is live while a panel is open; its window Escape
  fires before `isTypingTarget` with no `stopPropagation`, so a non-editing panel focus target (Back,
  Close, a value-mode field button) fires BOTH host `onClose('escape')` (guarded) and
  `onCloseDrawer` (may not be guard-aware). Editing fields are shielded by RecordField's capture. Winner:
  the single guarded path (I2) — gate the window Escape while a panel is open. Verify `onCloseDrawer` is
  guard-aware.
- **D-F2 · Roving-tabindex focus not moved on 3 surfaces [MEDIUM · RULED-violation, a11y].** `ViewTabs`
  moves DOM focus on arrow (per its cited I7 contract); `CutToggle`, `WindowSelector`, `RecordFeed`
  implement roving tabindex but only fire the change callback, never `.focus()`. Winner: **ViewTabs
  grammar** — move focus on arrow. *Consequence:* keyboard user Arrow→ from "Branch" to "Region":
  selection moves, focus stays on the now-`tabIndex=-1` element; next Arrow originates stale; Tab exits
  from the wrong element; focus ring and selected pill disagree. `RecordFeed` also lacks Home/End.
- **D-F3 · "Listbox" role with no listbox keyboard on 4 surfaces [MEDIUM · GAP-8, a11y].** `StatusTrigger`,
  `PersonPicker`, `SignalCategoryPicker`, `SignalMentionPicker` announce `role=listbox`/`option` but
  implement no Arrow/Home/End, no focus-into-list, and (except StatusTrigger) no Escape. `useMenuPopover`
  comment even claims "StatusTrigger keeps its listbox contract" — a contract implemented nowhere. Needs a
  ruling (GAP-8): build one `useListboxPopover` peer to `useMenuPopover`, OR downgrade these to `role=menu`
  and reuse `useMenuPopover`; `SignalMentionPicker` specifically needs the combobox idiom like CommandMenu.
  *Consequence:* SR user opens Status, hears "listbox, 4 options", ArrowDown does nothing; mention list is
  mouse-only; PersonPicker/SignalCategoryPicker can't be Escape-dismissed.
- **D-F4 · Collection row keyboard is Tasks-only [MEDIUM · GAP-9].** `useTasksKeyboard` (j/k cursor,
  Enter/o open, n new, e expand) exists only on Tasks; Signals — same RecordCollection grammar — and all
  other collections are click-only. I8 mandates click→open universally but never ruled whether row-cursor
  keys are part of the shared contract. Needs a ruling (GAP-9): promote into the shared engine, or scope
  to Tasks and drop the "one collection grammar" implication for keyboard.
- **D-F5 · Palette record-search reaches only Tasks [MEDIUM · RULED-violation].** ⌘K async search is
  hard-wired to `searchTasksByTitle` (command-menu.tsx:126). From Signals/kitchen/catalogs it still
  returns only Task rows. Winner: **broaden to a multi-kind resolver**, or relabel the group "Tasks" so it
  doesn't read as global search. *Consequence:* in Signals, ⌘K + a signal's text → Task results or "No
  matches", never the signal on screen.
- **D-F6 · Action Launcher opens the FULL ⌘K palette [LOW · GAP / verify].** OD-REDESIGN-46 prescribes a
  reduced stable set + at-most-one contextual action; the phone `+` opens the entire palette (Recent +
  Navigate + record search) via the same `setSearchOpen`. Reuse is defensible but not the prescribed
  launcher. Confirm intent: if the full palette IS the launcher, amend Rule 7 wording; otherwise `+`
  should open a filtered action set.

---

### VERB G — feedback (loading · empty · error · toast · optimistic)

**The contract.** `ui/state-kit.tsx` is "THE one loading grammar" — `LoadingShell` (role=status +
aria-busy + one label, "banishes the literal 'Loading…'"), `EmptyState`, `ErrorState` (role=alert +
Retry), `SkeletonRows`. **OD-REDESIGN-22**: failed save preserves the attempt + truthful retry;
autosave shows pending/saved/error/retry. **DESIGN.md:415**: toast = `popover` bg + **3px left accent
stripe** (primary, or success green), **bottom-right**, overlay shadow. The RecordCollection engine
surfaces (Tasks list, Objectives, Projects/Processes, Signals archive) are the gold standard — all six
states through the kit with query-preserving Retry + filtered-empty Clear-filters.

**Divergences**

- **DIV-G1 · Failed-save feedback has two contradictory shapes [CRITICAL · RULED-violation].** = D-C1.
  RecordField preserve-attempt + visible Retry vs `useInlineCommit`/status/checklist rollback + sr-only
  only. OD-REDESIGN-22 → **visible error + retry** wins.
- **DIV-G2 · Save-SUCCESS shape differs on every surface [MEDIUM · GAP-7].** Admin=toast; Kitchen-log=
  banner; Kitchen-plan=per-cell tick; Task metadata="Saved" text but status/pic=sr-only; Signal/Inbox/
  Catalog/Money=nothing. Kitchen-log vs kitchen-plan disagree **within one module**. Needs GAP-7 ruling
  (majority + DESIGN "inline local, not toast" → a single transient inline "Saved" at the locus).
  *Consequence:* five surfaces, five answers to "did it work?", two of them "nothing."
- **DIV-G3 · Save-FAILURE bypasses the kit [MEDIUM · RULED-violation].** Kitchen uses bespoke `kl-banner`/
  `kp-banner`; Signal composer uses raw `<p role=alert>`. Same "it failed", three geometries. Winner:
  route through `ErrorState` (or add a documented banner variant to the kit).
- **DIV-G4 · LoadingShell bypassed on 5 surfaces + a duplicate primitive [MEDIUM · RULED-violation].**
  Raw `role=status`+SkeletonRows at signal-record-host, dashboard-page, budget-page, pricing-page;
  `dashboard/data-table.tsx` defines its OWN `SkeletonRows` shadowing the kit; auth still emits the literal
  "Loading…" the kit banished. Winner: route through `LoadingShell`; data-table consumes the kit's
  `SkeletonRows`.
- **DIV-G5 · Signals LIVE feed has no error/retry — a load failure reads as a FALSE all-clear [HIGH ·
  RULED-violation].** `signal-feed.tsx` handles only empty; a failed load shows "No signals yet." Every
  engine collection gets ErrorState+Retry. Winner: adopt the majority collection grammar (error/retry
  branch). *Consequence:* Signals service down → home ambient feed says "No signals yet" (looks fine)
  instead of "Couldn't load · Retry."
- **DIV-G6 · The one toast deviates from the DESIGN toast spec [LOW · cleanup].** admin/toast.tsx uses
  `background: var(--foreground)` (dark), **no accent stripe**, **bottom-center**; DESIGN.md:415 says
  popover bg + 3px left blue/green stripe, bottom-right. No cross-surface inconsistency (only one toast)
  but a token-contract deviation.
- **DIV-G7 · Toast is admin-namespaced, not shared [LOW · GAP-7-adjacent].** `components/admin/toast.tsx`
  + `use-toast.ts` live under `admin/`, not `ui/`. If GAP-7 blesses a success toast, promote it to `ui/`.
  (The "no error-toast anywhere; errors are always inline" rule is *consistent* and worth keeping.)

---

## 3. CONTRACT-GAP list — rulings the owner still owes

Corpus grepped first (`docs/decisions.md`, `docs/reference/provenance/`, `interaction-contract.md`,
`experience-contract.md`, `DESIGN.md`). Everything a decision already answers is **excluded** here and
filed as a violation above. The residue below has **no owner answer on record**.

- **GAP-1 · Is Home-feed record-opening an addressable exception?** OD-REDESIGN-19/I7 require every record
  href to be addressable, but Home is a sanctioned attention-stream exception (OD-REDESIGN-17/18; the
  review-ledger "Home direct-nav" carve-out, `docs/reviews/v3-redesign.md`). *Question:* does a Signal
  opened from the Home feed reuse the archive's `?record=` addressable form (D-A2 winner), or is Home-feed
  opening explicitly ambient/non-shareable like Home "My tasks"? **No decision on record.** Recommend:
  reuse the addressable form (cheap, removes the divergence) unless the owner wants Home strictly ambient.

- **GAP-2 · Does "expand" survive as a per-record overlay verb, or retire into "Open full page"?**
  OD-REDESIGN-19 already gives "Open full page" as the canonical escalation. "Expand-in-place" is a Tasks
  legacy (global pref) with no URL effect, unwired on Signals/Follow-ups/Inbox. **No decision.** Recommend:
  retire expand-in-place in favor of Open-full-page (one escalation verb), OR promote
  `RecordPanelHost.expanded` app-wide with a URL bit — but pick one.

- **GAP-3 · Which non-migrated surfaces ARE RecordCollections (and thus owe the toolbar + saved views +
  URL-sync + count header)?** People and Inbox are filter+view lists that already reuse ViewTabs/chip
  idioms — plausibly collections. Kitchen (date-scoped production log) and Follow-ups (lifecycle queue)
  are plausibly NOT browse-collections. OD-REDESIGN-8/23 make saved views a Work concept but never
  enumerate the boundary. **No exemption decision on record.** Recommend an explicit line: migrate People
  + Inbox; exempt Kitchen + Follow-ups by decision, not by accident. (URL-sync of filter state, GAP-3-a,
  is arguably NOT a gap — I7 already mandates it for any view state; only "must this be the full
  CollectionToolbar" is open.)

- **GAP-4 · Does the Kitchen LOG batch-staging form require a route-leave dirty-guard?** The batched model
  (stage many cells → one Submit) may be deliberate and is not a single-field edit, so OD-REDESIGN-22
  doesn't cleanly govern it. But 20 dishes vanish today with no prompt (D-C3, CRITICAL). **No decision.**
  Recommend: yes — any edit-shaped surface with pending unsaved values gets a leave-guard, matching the
  record surfaces.

- **GAP-5 · Composer Enter semantics.** Deputy Enter=send; Signal composer Enter=newline. Composer submit
  is create-grammar, and Rule 7/OD-REDESIGN-46 govern *dispatch*, not the Enter key. **No decision.**
  Recommend one rule for message composers (e.g. Enter=send, Shift+Enter=newline, matching Deputy and
  common chat convention) or the inverse — but one.

- **GAP-6 · After-create destination.** OD-REDESIGN-63 governs *open*, not *create-return*; OD-REDESIGN-39
  specifies Signal→Task returns to the Signal, but nothing rules the general case. Task navigates away; 4
  others stay. **No general decision.** Recommend: return to the originating collection with the new row
  present/highlighted (majority + the Task form already collects the fields), unless the owner blesses
  "Task lands on its new record."

- **GAP-7 · One create/edit success-feedback channel.** Five channels today (toast/banner/tick/text/
  silent). DESIGN.md:415 documents a toast; DESIGN's "inline direct-edit feedback is local, not a toast";
  OD-REDESIGN-22 requires a "saved" indication for edits. **No single-channel decision.** Recommend: one
  transient inline "Saved" at the locus for edits; reserve the (spec-corrected, promoted-to-`ui/`) toast
  for cross-surface create confirmations if the owner wants a visible create ack — decide which.

- **GAP-8 · Is there a real listbox-keyboard contract, or do these become menus?** A named "listbox
  contract" is referenced in code with no shared implementation (D-F3). **No decision.** Recommend: build
  `useListboxPopover` (arrow/Home/End + Esc + focus-in/return + `aria-activedescendant`) as a peer to
  `useMenuPopover`, route all four through it; `SignalMentionPicker` uses the combobox idiom.

- **GAP-9 · Is row-cursor keyboard (j/k/Enter/o/n) part of the shared RecordCollection contract or
  Tasks-only?** I8 mandates click→open universally but is silent on cursor keys (D-F4). **No decision.**
  Recommend: promote into the shared engine so Signals et al. inherit it (keyboard parity for identical-
  looking tables), or scope to Tasks explicitly and drop the "one collection grammar" keyboard implication.

- **GAP-10 (verify, not rule) · Does the phone `+` Action Launcher open the prescribed reduced set or the
  full ⌘K palette?** OD-REDESIGN-46 prescribes reduced; impl opens full (D-F6). Either amend Rule 7's
  wording to bless the full palette as the launcher, or filter the `+` action set.

---

## 4. Fix work-order — ordered by user impact

Each item: what → why (contract) → files. "RULED" items implement an existing decision; "GAP-n" items are
**blocked on the Section-3 ruling** and must not ship a guessed default.

### Tier 1 — CRITICAL (stop losing the user's work). Ship first.

1. **Visible error + retry on every failed save** [RULED OD-REDESIGN-22 · fixes D-C1/DIV-G1].
   Make the optimistic/eager path surface a *visible* failure + Retry and preserve the attempt, matching
   RecordField's option branch. Files: `components/ui/use-inline-commit.ts` (add visible error state, not
   sr-only-only), `components/tasks/task-surface.tsx` (status/pic/checklist commit sites ~L246/297/417),
   `components/tasks/task-row.tsx` (~L235). Tests: extend `use-inline-commit.test.tsx`,
   `record-details-panel.test.tsx`.

2. **Dirty-guard the Task create/route drawer** [RULED OD-REDESIGN-22 + parity with in-list path · fixes
   D-B1]. Route `/work/tasks/new` and collapse-to-split through the same `requestLeave`/`leaveGuard` as the
   overlay-host path (or mount via the host). Files: `components/tasks/task-drawer.tsx` (~L139/226-239),
   `components/tasks/tasks-workspace.tsx`. Tests: task-drawer suite (add dirty-Escape confirm case).

3. **Comment composer + @mention picker consume Escape locally / feed the leave-guard** [RULED I5 /
   OD-83.1 · fixes D-B2]. Wire `CommentThread` textarea to `onDirtyChange`; give `PersonPicker`/
   `SignalMentionPicker` a local Escape (cancel picker → cancel comment) before the host. Files:
   `components/tasks/CommentThread.tsx` (~L107), `components/tasks/person-picker.tsx`,
   `components/signals/signal-mention-picker.tsx`. Overlaps GAP-8 (do the isolation now; the full listbox
   contract can follow).

4. **Task open → URL-addressable + wire `deepLinkResolver`** [RULED OD-REDESIGN-19/63 + I1/I7 · fixes
   D-A1]. Route the Tasks row-click id into the URL via `createRecordRouteAdapter`
   (overlay-navigation.ts:160, already supports path/query) and pass a `deepLinkResolver` at
   app-shell.tsx:41 so hard-load restores (overlay-host.tsx:399). Files:
   `components/tasks/tasks-workspace.tsx` (~L177-207), `shell/app-shell.tsx:41`, wire
   `overlay-host.tsx:399-411`. Tests: overlay-host route seam + a refresh/deep-link acceptance.

5. **Follow-up / Inbox open → route mode (kill the ephemeral Back dead-end)** [RULED I2 + OD-REDESIGN-20 ·
   fixes D-A3]. Open follow-ups via `/work/follow-ups/:id` route-mode; make Inbox item open push the
   canonical record with Back→Inbox. Files: `components/tasks/follow-ups-page.tsx` (~L30-43),
   `components/inbox/inbox-triage-connected.tsx` (~L53-68), `overlay-host.tsx` POP handler (~L304).

6. **Kitchen LOG leave-guard** [GAP-4 — ship the guard once the owner confirms; the data-loss is real ·
   fixes D-C3]. Add a route-leave dirty-guard to the batch-staging form. Files:
   `components/kitchen/kitchen-log-page.tsx` (~L176-272). *Blocked on GAP-4 (recommend: yes).*

### Tier 2 — HIGH (daily cross-surface breakage; each violates a written contract).

7. **URL-sync filter state on People/Kitchen/Inbox/Follow-ups** [RULED I7 · fixes D-E1]. Move filter/
   search from `useState` to the engine's `urlMode:'synced'` (or the query params directly for exempt
   surfaces). Files: `components/admin/user-table.tsx` (PeopleToolbar ~L673-735),
   `components/kitchen/kitchen-toolbar.tsx`, `components/inbox/inbox-triage-connected.tsx` (~L40),
   `components/tasks/follow-up-queue-table.tsx`.

8. **Signals live feed: add ErrorState + Retry** [RULED state-kit · fixes DIV-G5]. Files:
   `components/signals/signal-feed.tsx` (~L28-51) — add the error branch the engine collections have.

9. **One shared RecordViewer for every "open"** [RULED I1 · fixes D-A4/D-E6]. Replace the Inbox summary
   door card and the Tasks→Follow-ups `<Link>` with the shared panel host. Files:
   `components/inbox/inbox-record-door.tsx` (~L132-147), `components/tasks/follow-up-queue-table.tsx`
   (~L112-118, pass `onOpenRecord`).

10. **Signals-archive layout-independent Share door** [RULED Rule 7 / OD-REDESIGN-46 · fixes D-D2]. Host
    Share in the toolbar (or declare ⌘K/top-bar the sanctioned door + make the feed row ambient-only).
    Files: `components/signals/signals-archive-page.tsx` (~L182-286),
    `components/signals/signal-table-presentation.tsx`.

11. **Escape single-path: gate `useTasksKeyboard` while a panel is open** [RULED I2 · fixes D-B3/D-F1].
    Skip the window Escape when an overlay session is active (and when `isTypingTarget`); verify
    `runtime.onCloseDrawer` is guard-aware. Files: `components/tasks/use-tasks-keyboard.ts` (~L59-68).

12. **Canonical CollectionToolbar on the migrated collections** [RULED DESIGN / GAP-3 for scope · fixes
    D-E3/D-E4]. For surfaces GAP-3 rules ARE collections (recommend People + Inbox), adopt
    `CollectionToolbar` + `RecordCollectionSurface` (chips/disclosure/count header). Files:
    `components/admin/*`, `components/inbox/*`. *Scope blocked on GAP-3.*

### Tier 3 — MEDIUM (contained / a11y / needs a ruling first).

13. **Kitchen quantity cells → one `useInlineCommit`** [RULED OD-REDESIGN-22 · fixes D-C2, kills D-C4].
    Route PlanQtyStepper and the LOG desktop cell through the primitive (gain phone Enter + Escape-restore);
    mount `qty-cell.tsx` or fold WipItemStepper onto it. Files: `components/kitchen/plan-qty-stepper.tsx`,
    `components/kitchen/wip-item-stepper.tsx`, `components/kitchen/kitchen-log-page.tsx` (~L418).

14. **Roving-tabindex: move focus on arrow** [RULED I7/ViewTabs · fixes D-F2]. Add `ref.focus()` on arrow
    to `CutToggle`, `WindowSelector`, `RecordFeed`; add Home/End to `RecordFeed`. Files:
    `components/dashboard/cut-toggle.tsx`, `components/dashboard/window-selector.tsx`,
    `components/tasks/record-feed.tsx`.

15. **Palette record-search: multi-kind resolver or relabel** [RULED I1 finder intent · fixes D-F5].
    Files: `components/command/command-menu.tsx` (~L126).

16. **LoadingShell + ErrorState everywhere; delete the duplicate SkeletonRows** [RULED state-kit · fixes
    DIV-G3/DIV-G4]. Files: `components/signals/signal-record-host.tsx` (~L98),
    `components/money/dashboard-page.tsx` (~L205), `components/money/budget-page.tsx` (~L168),
    `components/money/pricing-page.tsx` (~L82), `components/dashboard/data-table.tsx` (~L358, consume kit),
    `components/kitchen/kitchen-log-page.tsx`/`kitchen-plan-page.tsx` (banners → ErrorState),
    `components/signals/signal-composer.tsx` (~L187).

17. **`useListboxPopover` (or downgrade to menu) for the four pickers** [GAP-8 · fixes D-F3]. Files:
    `lib/` (new `use-listbox-popover.ts`), `components/tasks/status-trigger.tsx`,
    `components/tasks/person-picker.tsx`, `components/signals/signal-category-picker.tsx`,
    `components/signals/signal-mention-picker.tsx` (combobox idiom). *Blocked on GAP-8.*

18. **Build "Create Task from a Signal"** [RULED OD-REDESIGN-39 · fixes D-D4]. Wire the Signal record
    action to push the canonical Task composer in the same stack, Signal context prefilled, save-returns.
    Files: `components/signals/signal-record-adapter.tsx` (~L161-200),
    `components/signals/signal-feed-section.tsx`.

19. **After-create destination** [GAP-6 · fixes D-D1]. Once ruled, align Task create-return (recommend:
    return-to-collection). Files: `components/tasks/task-surface.tsx` (~L817-856).

20. **One success-feedback channel** [GAP-7 · fixes DIV-G2/D-D3]. Once ruled, unify (recommend: inline
    "Saved" at the locus; promote toast to `ui/` if a create ack is wanted). Files:
    `components/admin/toast.tsx`+`use-toast.ts` (→ `ui/`), `components/kitchen/*` (banners),
    catalog pages, record commit sites.

### Tier 4 — LOW / cleanup (fossils, doc-lies, token deviations).

21. **Fix Inbox docstring** (or migrate) — inbox-triage.tsx:22 [D-E5].
22. **Delete dead `StatusTrigger`** (fossil law) — status-trigger.tsx [D-B4].
23. **Delete Catalog dead opening seam** — catalog-collection-adapter.tsx:240 [D-A6] *(or wire per GAP-3)*.
24. **Remove Objectives `filteredEmpty` dead `type` key** — objectives-page.tsx:169 [D-E7].
25. **Toast token conformance** — dark bg + no-stripe + bottom-center → DESIGN.md:415 (popover bg, 3px
    blue/green stripe, bottom-right) — admin/toast.tsx [DIV-G6].
26. **Composer Enter unification** [GAP-5 · D-C6] — once ruled. `AssistantPanel.tsx` / `signal-composer.tsx`.
27. **Expand verb disposition** [GAP-2 · D-A5] — retire or promote app-wide.
28. **Action Launcher shape** [GAP-10 · D-F6] — amend Rule 7 wording or filter the `+` set.
29. **Row-cursor keyboard scope** [GAP-9 · D-F4] — promote to shared engine or scope-to-Tasks explicitly.
30. **Top-bar "Create" label** [D-D5] — sanctioned; relabel "New" or icon-only only if desired.

---

**Bottom line.** One grammar already exists on paper and in the engine surfaces. The work is not to invent
a contract — it is to (a) implement the six work-loss fixes the *existing* contract already demands, (b)
pull the four unmigrated collections onto the shared machinery, and (c) get ten specific rulings so the
remaining surfaces stop guessing. Of the 35 divergences, 24 resolve against a written decision or the
binding interaction contract (implement, don't debate); 10 need an owner ruling first (Section 3); 1
(D-D5) is already sanctioned.
