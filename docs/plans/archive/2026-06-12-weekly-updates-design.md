# Design-plan — Weekly updates (P2-2)

> **Design authority.** This design-plan is the UI anchor for the eng-plan
> `docs/plans/2026-06-12-weekly-updates.md` (all its UI tasks reference this file). It is
> **reference / gap-analysis only** — it applies the **adopted** identity in `DESIGN.md` and the
> **signed** mockup `docs/design-mockups/mock-weekly-update.html`; it never re-skins or invents.
> Every visual decision names a `DESIGN.md` token (no raw hex / px). The one new piece is the
> `ProgressMarker` component **token mapping**, which **reuses existing hues** (no new brand) and is
> flagged for owner sign-off in §7.
>
> - **Visual authority (SIGNED):** `docs/design-mockups/mock-weekly-update.html` — write pane first,
>   manager review pane stacked second, single ~1080px density-mode column.
> - **Token authority:** `DESIGN.md` (adopted from PMO) + its **MOS density mode (OD-P0-7)** and
>   **RACI role-chip** sections.
> - **Spec (ACs / states):** `docs/specs/weekly-updates.spec.md` (FR/NFR/AC ids cited inline).
> - **Vocabulary (exact):** `CONTEXT.md` — Weekly Update · Update line · Progress marker ·
>   Submitted/Draft · Week · Person · Manager.
> - **Decisions:** OD-P2-10..14 (locked), OD-P0-2 (EN chrome / ID content), OD-P0-3 (desktop-first,
>   mobile-usable).
>
> **Anti-slop posture (folded from `taste`).** Left-anchored work-tool layout; co-located primaries
> (Save draft + Submit visible from first paint, never a stepper); inline line editing (no
> add-line modal); no needless transitions; borders-not-shadows; one blue carries action; realistic
> Gordi/ID content in every example. No gradients-as-decoration, no centered hero, no card soup
> (the two panes are framed sections, not nested cards).

---

## 0. Scope of this plan

Four UI surfaces, all on the **single ~1080px density-mode column** (`PageFrame` already enforces
`max-width:1080px; margin:0 auto`):

1. **Write pane** — "My weekly update" (mock pane A): week label + due, summary textarea, the
   **update-line editor**, the co-located **Save draft / Submit** cluster + quiet "Draft saved"
   confirm, the **Submitted read-only / Reopen** state.
2. **Manager review pane** — "Team updates" (mock pane B): week header + prior-week nav, roster rows,
   summary counts, read-only, role-conditional (managers only).
3. **`ProgressMarker`** — a **new** small token-based pill (Done / In progress / Blocked), DISTINCT
   from the task `StatusPill` (different vocabulary + semantics), co-located CSS like `StatusPill.css`.
4. **My Week strip wiring** — the existing weekly-update strip in `MyWeek.tsx` reflects real state
   (No update / Draft / Submitted on-time-or-late).

The host route is `UpdatesPage` (`/updates`). Panes 1+2 live there; pane 3 is a shared component
consumed by panes 1, 2, and 4; pane 4 edits `MyWeek.tsx`.

---

## 1. Page shell & composition (UpdatesPage)

Reuses the adopted shell verbatim — rail + 56px header + breadcrumb are owned by the app shell, not
this plan. The page body is one `PageFrame` (the existing `<main>` landmark, `28px 32px 56px`
padding, 1080px centered column).

### 1.1 Page head (`PageHead`)
- **Title:** "Weekly update" — `typography.page-title` (700 / 24px / lh 1.2 / ls -0.02em),
  `foreground`.
- **Subtitle:** `Week of {range} · due Fri {fridayShort} · write yours, then review your team's` —
  `typography.body` (14px) in `muted-foreground`. The "write yours, then review your team's" clause is
  load-bearing: it names the **write-first** reading order the signed mock established.
  - Managers see the full subtitle. **Non-managers** (no team) see `Week of {range} · due Fri
    {fridayShort}` only (no "review your team's" — the review pane does not render for them; FR-030
    is manager-conditional).
- Week values come from `week.ts` (`weekLabel(now).range`, `.fridayShort`); when a **prior week** is
  selected (review nav, §3.5) the head's week label tracks the selected `week_start`.

### 1.2 Two stacked framed sections (NOT side-by-side, NOT nested cards)
Per the signed density-mode re-cut, the panes **stack** in the single column, write first:

```
[ pane caption: "Write — my weekly update" ]   ← overline
[ ───────── WRITE CARD ───────── ]
        (air: 28px)
[ pane caption: "Review — my team's updates" ]  ← overline   (managers only)
[ ───────── REVIEW CARD ───────── ]
```

- **Pane caption** = `typography.overline` (600 / 11px / ls 0.06em / UPPERCASE) in `muted-foreground`,
  `margin: 0 4px 8px`; the second caption adds `margin-top: 28px` (the air between panes — mock
  `.pane-cap.second`). This is the system's section-divider voice; **no colored bars, no eyebrow on
  every block** — exactly two captions, each naming a real surface.
- **Card** = adopted `components.card`: `card` bg, 1px `border`, `rounded.md` (8px), `16px 20px`
  padding. **Flat at rest** (Flat-By-Default Rule) — no drop shadow; the white card on the
  `secondary/35%` main area is the only depth cue.
- **Card head row** (both panes): `<h2>` in `typography.subheading` (600 / 18px) left, a **week pill**
  right. Week pill = `badge-status` shell (`secondary` bg, `muted-foreground` text, `rounded.full`,
  22px) carrying the `tabular` week range. `justify-content: space-between`, `margin-bottom: 14px`.

---

## 2. Write pane — "My weekly update"

### 2.1 Anatomy (top → bottom)
1. **Head row** — `<h2>My weekly update</h2>` + week pill (`Week of {range}`, `tabular`).
2. **Summary field**
   - **Field label** "This week's summary" — `typography.overline` in `muted-foreground`,
     `margin-bottom: 6px`.
   - **Textarea** — `input` border (1px), `rounded.md`, `10px` padding, `min-height: 96px`,
     `typography.body` (14px / lh 1.5), text in `foreground`. Placeholder (empty draft) in
     `muted-foreground`: `Ringkasan minggu ini…` (ID content per OD-P0-2; chrome label stays EN).
   - Focus: inherits the global `*:focus-visible` ring (`2px solid ring`, 2px offset) — no
     per-component focus style.
3. **Update-line editor** (§2.2).
4. **Action cluster** (§2.3) — Save draft + Submit + quiet confirm, on a `border`-top divider.

### 2.2 Update-line editor (the IxD core)
A vertical list of **line rows**, then an **add-line affordance**. Inline editing — **no modal**.

- **Section label** "Update lines" — `typography.overline` / `muted-foreground` (the mock's "My
  tasks this week" label is renamed to the CONTEXT.md term **Update line**; NFR-007 forbids calling a
  line a "task" since lines have no task FK — OD-P2-10).
- **Line row** (`.ref-row` analog): horizontal flex, `gap: 12px`, `padding: 10px 0`, divided by
  `border/70%` (the softened table-divider value), last row no divider. Row contents, left→right:
  1. **Drag/reorder handle** — a ghost icon button (`button-ghost`, 32px square, 18px stroke-2 grip
     icon, `muted-foreground`), `aria-label="Reorder line"`. Reorder is also keyboard-operable
     (§5.3). Hidden affordance is **not** used here — the handle is always visible (it is the only
     reorder cue in a dense list).
  2. **Line text** — an inline-editable text input that reads as plain text until focused: borderless
     / transparent fill, `typography.body` (14px) `foreground`, grows to fill (`flex: 1; min-width:
     0`). On `:focus-visible` it shows the global ring. ID content, e.g. `Finalisasi menu seasonal
     Q3 — 2 SKU lolos uji rasa`.
  3. **`ProgressMarker`** (§4) — the Done / In progress / Blocked pill, here **interactive** (a
     button/menu that opens the 3-option picker). `flex: none`.
  4. **Remove** — ghost icon button (`button-ghost`, 32px, 18px ×/trash icon, `muted-foreground`;
     hover wash `accent`), `aria-label="Remove line"`. Destructive *intent* but **not** a destructive
     solid fill (line removal is reversible by re-adding; the One-solid-fill rule reserves the
     `destructive` button for irreversible actions).
- **Add-line affordance** — a `button-outline` (32px, `rounded.md`, `input` border) labelled
  **"Add line"** with a leading 18px `+` icon, full-width-left (not centered). Verb+object copy.
  Appending a line gives it the next `position` and default progress `in_progress` (FR-016).

### 2.3 Action cluster — co-located Save draft + Submit (mock IxD lens b)
A `save-row`: top `border` divider, `padding-top: 14px`, `margin-top: 16px`, `display:flex;
align-items:center; gap:10px`. **Both actions present from first paint** (never a stepper, never a
reveal):
- **Save draft** — `button-outline` (background fill, `input` border, `foreground` text, 32px,
  `rounded.md`). Verb+object label "Save draft".
- **Submit update** — `button-primary` (`primary` bg, `primary-foreground` text, faint brand shadow
  `0 1px 2px primary/0.25` — the one allowed rest shadow). Label "Submit update".
  - **Disabled** when summary is blank AND zero lines (FR-019, AC-033): apply the DESIGN.md
    proposed disabled treatment — `opacity: 0.5; cursor: not-allowed; pointer-events: none` —
    plus `aria-disabled="true"` and a `title`/visually-hidden hint "Add a summary or a line to
    submit". Save draft stays enabled (empty drafts are allowed).
- **Quiet save confirm** — `margin-left: auto`, `typography.label`-ish 12px in
  `--status-won-text` (`hsl(142 64% 30%)`) with a 6px `success` dot: `Draft saved · 2 min ago`.
  **Ambient, not a toast/modal** (AC-035). Rendered via `aria-live="polite"` so it is announced
  without stealing focus. Hidden until a save has occurred.

### 2.4 Submitted read-only (locked) + Reopen (FR-013/015, AC-031/036/037)
On `status = 'submitted'` the write card swaps to a **locked** presentation — same card frame, same
layout rhythm, **no edit affordances**:
- Head-row week pill gains a **Submitted** state pill (the `ProgressMarker`-family tinting is NOT
  reused here; this is a lifecycle state, so use the `badge-status` neutral shell + a `success` dot +
  `--status-won-text` text, label "Submitted" — and an **on-time / late** chip beside it, §2.5).
- Summary renders as static `typography.body` `foreground` text (no textarea border).
- Lines render read-only: text as plain `foreground`, the `ProgressMarker` in its **static**
  (non-interactive) form, **no** handle / remove / add-line.
- Action row collapses to a single **Reopen** `button-outline` (verb+object "Reopen to edit"),
  left-anchored, with a `muted-foreground` 12px note: `Submitted {on-time|late} · {Day HH:mm}`
  (`tabular` time). Reopen → `status='draft'` and the editable layout returns (AC-037).

### 2.5 On-time vs late visual (FR-033, OD-P2-14)
A signal, never a gate. Derived from `submitted_at` vs the week's Fri 17:00 WIB (the new
`week.ts` helper).
- **On-time** — `success` family: 6px `success` dot + `--status-won-text` text "on time", on a
  `success/14%` tint (the won-pill tint).
- **Late** — `warning` family (caution, not error — a late *filing* is allowed, OD-P2-14, so it is
  amber not red): 6px `warning` dot + `warning-foreground` (`hsl(22 78% 26%)`) text "late", on a
  `warning/18%` tint. **Not** `destructive` — red is reserved for failure/overdue, and per the
  density-mode due-date rule destructive is for genuinely overdue, which a late-but-filed update is
  not.

---

## 3. Manager review pane — "Team updates" (managers only)

Role-conditional: renders **only** when `viewer.isManager` (mirrors the `MyWeek.tsx` team-module
guard and FR-030). For non-managers the pane and its caption are simply **absent** (not hidden) —
the page is just the write pane.

### 3.1 Anatomy
1. **Pane caption** "Review — my team's updates" (overline, 28px top air).
2. **Card head row** — `<h2>Team updates</h2>` + week pill, **plus** prior-week nav (§3.5).
3. **Summary counts** (§3.4) — `N filed · M draft · K not started`.
4. **Roster rows** (§3.2), each ≥56px.

### 3.2 Roster row (≥56px — density-mode review posture)
`min-height: 60px`, `padding: 8px 0`, divided by `border/70%`, `gap: 12px`, hover wash
`accent/60%`. Whole row is the open-affordance (opens that person's **read-only** update; FR-031).
Left→right:
- **Avatar** — 32px circle, the adopted avatar gradient (`primary`→`violet`), `primary-foreground`
  initials, `aria-hidden` (name is the accessible label). Per OwnerCell precedent (initials are
  decorative; the name carries meaning).
- **Main** (`flex: 1; min-width: 0`):
  - **Name + role** — name `13.5px / 600` `foreground`; role appended `· {role}` in
    `muted-foreground` 12px / 400. e.g. `Raka Wijaya · Roastery Lead`.
  - **Summary excerpt** — single-line truncated (`overflow:hidden; text-overflow:ellipsis;
    white-space:nowrap`), `typography.body`-13px `muted-foreground`. ID content excerpt, or the
    **"No update yet"** placeholder in `muted-foreground` italic for Not-started.
- **Meta** (`margin-left:auto; text-align:right; flex:none; gap:12px`):
  - **Submit time** — `tabular` 12px `muted-foreground` (e.g. `Mon 09:12`), or `—` when none.
  - **State pill** — Filed / Draft / Not started (§3.3), `min-width: 96px` so the column aligns.
  - For **Filed** rows, the **on-time/late** signal (§2.5) sits with the time (e.g. `Mon 09:12 ·
    on time`), keeping the pill column purely state.

### 3.3 Review state pills (lifecycle states — NOT the ProgressMarker)
These are **per-person filing states**, a different axis from update-line progress. Use the
`badge-status` shell + a leading 6px dot, tinted-status pattern:
- **Filed** (submitted exists) — `success/14%` bg, `--status-won-text` text, `success` dot.
- **Draft** (draft exists) — `warning/18%` bg, `warning-foreground` text, `warning` dot.
- **Not started** (no row) — neutral `secondary` bg, `muted-foreground` text + dot.

> Vocabulary note (NFR-007): the **status name** is Submitted/Draft; **"Filed"** is the
> manager-review *pill label only* for a submitted update — never used as the status value.

### 3.4 Summary counts (FR-032)
Above the rows: `display:flex; gap:16px`, `typography.body`-13px `muted-foreground`, with the count
numerals `tabular` and `foreground`/bold: **`2` filed · `1` draft · `1` not started**. Empty-but-valid
team reads `0 filed · 0 draft · N not started` (AC-045).

### 3.5 Prior-week navigation (FR-035)
In the review card head, beside the week pill: a pair of ghost icon buttons `‹` / `›` (`button-ghost`,
32px, `aria-label="Previous week"` / `"Next week"`), `tabular` week label between. Defaults to the
current WIB week; **Next** is disabled at the current week (no future weeks). Moving weeks recomputes
the roster + counts for the new `week_start` (AC-044). The page head's week label and the write pane's
week pill **also** track the selected week (one selected `week_start` governs the whole page).

### 3.6 Read-only guarantee (FR-034, AC-043)
**No** edit, acknowledge, comment, or remind affordance anywhere in this pane. The only interaction is
"open a person's read-only update". This is a hard acceptance item.

---

## 4. `ProgressMarker` — new token-based component

### 4.1 Why a new component (not a StatusPill variant)
`StatusPill` encodes a **task's** four-value Status `{Open, In Progress, Blocked, Done}` where
`Open`→**amber** (warning). The **Progress marker** is a three-value, **self-reported achievement**
cue `{Done, In progress, Blocked}` (OD-P2-10, CONTEXT.md) — no "Open", and `Done` is success, not the
task's amber Open. Folding it into `StatusPill` would couple two independent vocabularies and risk a
future task-status edit silently changing update semantics. So: a **separate component**, its own
co-located CSS (`ProgressMarker.css`), mirroring the `StatusPill` shape primitives but **distinct
class names**.

### 4.2 Token mapping (reuses existing hues — the one new mapping, flagged for sign-off §7)
The pill shape reuses the shared primitives exactly (22px, `rounded.full`, 12px/600 label, 6px dot —
identical to `StatusPill.css` `.pill`/`.dot`). The three marker→tint mappings reuse the **existing
status text tokens** from DESIGN.md §"Status-pill text tokens" — **no new hue, no new brand**:

| Marker | Hue family | Bg tint | Text token | Dot |
|---|---|---|---|---|
| **In progress** (default) | `primary` (blue) | `primary/12%` (`hsl(221 83% 53% / 0.12)`) | `--status-open-text` (`hsl(221 75% 38%)`) | `primary` |
| **Blocked** | `destructive` (red) | `destructive/12%` (`hsl(0 84% 60% / 0.12)`) | `--status-lost-text` (`hsl(0 72% 45%)`) | `destructive` |
| **Done** | `success` (green) | `success/14%` (`hsl(142 71% 45% / 0.14)`) | `--status-won-text` (`hsl(142 64% 30%)`) | `success` |

These three values **match the signed mock's `.pill.inprogress / .blocked / .done`** exactly, and
each text token already clears WCAG-AA ≥4.5:1 on its tint (DESIGN.md a11y posture). The mapping is a
**re-use**, not an addition to the palette — the only "new" artifact is the component + class names.

### 4.3 Two forms
- **Static** (read-only contexts: submitted lock, review excerpts if shown): just the tinted pill +
  dot + label. No interaction, no focus target.
- **Interactive** (draft line editor): the pill is a button that opens a 3-option picker (a `popover`
  per DESIGN.md overlays — `popover` bg, `border`, `rounded.md`, overlay shadow, 32px `accent`-hover
  menu items, each item a static `ProgressMarker` + label). The trigger carries the global focus
  ring, `aria-haspopup="listbox"`, `aria-expanded`; the picker is `role="listbox"` with
  `role="option"` + `aria-selected`; `Esc` closes and returns focus to the trigger (DESIGN.md notes
  overlays must add focus management — a build requirement).

### 4.4 Copy (NFR-007, EN chrome)
Labels exactly: **"Done"**, **"In progress"**, **"Blocked"**. Never "Status" for a line.

---

## 5. States, responsive, accessibility (all panes)

### 5.1 All states (the required-states checklist)
**Write pane**
- **Empty** (no row this week) — same card shell, empty textarea with ID placeholder, zero lines,
  one "Add line" button, Submit **disabled** (FR-019), Save draft enabled. Quiet-confirm hidden.
- **Draft with content** — populated; both actions enabled; quiet "Draft saved" after a save.
- **Submitted-locked** — §2.4 read-only + Reopen + on-time/late note.
- **Loading** — skeletons: a `secondary`-fill block for the textarea (`min-height:96px`,
  `rounded.md`) and 2 shimmer line rows; the action row hidden until loaded. No layout shift on
  resolve (skeleton occupies final height).
- **Error** — inline panel inside the write card: `muted-foreground` text "Couldn't load your update"
  + a **Retry** `button-outline`. **Degrades pane-by-pane** — the review pane stays usable (AC-038).
- **Saving / submitting (in-flight)** — the clicked button shows a busy state (label unchanged,
  `aria-busy="true"`, control disabled to prevent double-submit); on resolve → quiet confirm (save)
  or transition to locked (submit).
- **On-time vs late** — §2.5 (drives the submitted note + strip).

**Review pane**
- **Populated** — mixed Filed / Draft / Not-started rows + counts.
- **Empty team / nobody filed** — every row "Not started"; counts `0 filed · 0 draft · N not started`
  (AC-045). If the manager has **zero** reports at all, the pane shows a single muted line "No direct
  reports to review." (defensive; FR-030 implies a non-empty team but the guard must not render an
  empty card).
- **Loading** — skeleton roster (3–4 shimmer rows at 60px) + hidden counts until loaded.
- **Error** — inline "Couldn't load team updates" + Retry; write pane stays usable (AC-046).

**My Week strip** — No update / Draft / Submitted(+on-time/late) — §6.

**Edge** — a person who is **both** author and reviewer (Dina writes, then reviews her people):
same identity (OD-P0-1); she is **not** a row in her own review roster. Dual-hat report appears in
**every** manager's roster (FR-036) — purely a data concern, no special UI.

### 5.2 Responsive (OD-P0-3 desktop-first, mobile-usable)
Two relevant breakpoints from DESIGN.md: **920px** (rail collapse — shell-owned, not this plan) and
**768px** (content reflow).

- **Desktop (≥768px, ~1080px column)** — as drawn: line rows are single-row flex (handle · text ·
  marker · remove); review rows are single-row (avatar · main · meta).
- **<768px (mobile-usable)** —
  - **Write line row** reflows to **two rows** inside the row container (`flex-wrap`): line text on
    its own row (full width), then a second row of [handle · marker · remove] right-aligned. Touch
    targets on handle / remove / marker extend to **≥44px** via the `.touch-target` utility
    (DESIGN.md mobile rule). "Add line" stays full-width-left.
  - **Action cluster** wraps: Save draft + Submit stack to full-width-left buttons (still both
    visible, still co-located); quiet confirm drops below them (loses `margin-left:auto`).
  - **Review row** keeps avatar + main on row one; **meta** (time · pill · signal) wraps to a second
    line left-aligned under the name. Row min-height grows to fit; whole row stays the tap target
    (≥44px). Prior-week nav buttons are already ≥44px-tappable.
  - **Summary counts** wrap naturally (`flex-wrap`).
  - The single column never needs a second column to drop — density mode already mandates one column,
    so there is **no DataTable-style table→card reflow** here (these are list rows, not a `<table>`).

### 5.3 WCAG-AA accessibility
- **Contrast** — every text/tint pair is a DESIGN.md AA-cleared token: `foreground` on
  `card`/`background` (~AAA); `muted-foreground` (L40) on white and on `secondary` (≥4.5:1, the
  reason it was darkened from 46.1); the three `--status-*-text` pill texts ≥4.5:1 on their tints;
  `warning-foreground` deep-brown on amber tints. **No** body text in a fully-saturated status hue
  (Tinted-Status Rule).
- **Focus order** — DOM order = visual order: page head → week nav → write summary → each line
  (handle → text → marker → remove) → Add line → Save draft → Submit → (review) week nav → each
  roster row. Global `:focus-visible` ring on every focusable (no focus suppression).
- **Labels** — textarea has a programmatic label (the "This week's summary" overline wired via
  `<label htmlFor>` / `aria-labelledby`, not a bare visual label). Every icon-only button
  (`Reorder line`, `Remove line`, `Previous week`, `Next week`, the marker trigger) has an
  `aria-label`. Roster rows expose the person name as accessible name; avatar initials `aria-hidden`.
  Counts and pills are text, not color-only (every status carries a **label + dot**, so colourblind
  users get the word, not just the hue).
- **Keyboard paths** —
  - Add line: focus "Add line", Enter → new line appended, focus moves into the new line's text input.
  - Edit line text: tab into the inline input, type, Tab out commits.
  - Set marker: focus the marker trigger, Enter/Space opens the listbox, ↑/↓ moves, Enter selects,
    Esc closes returning focus to trigger.
  - Reorder: the handle is operable by keyboard — Enter/Space to "pick up", ↑/↓ to move,
    Enter to drop (and a visually-hidden `aria-live` announces "Line moved to position N"); drag is
    an enhancement, not the only path.
  - Remove line: focus the Remove button, Enter removes; focus moves to the previous line (or the
    Add-line button if none remain).
  - Submit disabled state is reachable but announces `aria-disabled` + the hint.
  - Week nav: ‹ / › are buttons, Enter activates; Next disabled at current week is `aria-disabled`.
- **Live regions** — quiet "Draft saved" confirm is `aria-live="polite"`; reorder + add/remove
  announcements `aria-live="polite"`; error panels are `role="alert"` (assertive) so a load failure
  is announced.
- **Reduced motion** — the only motion is the quiet-confirm fade and the picker open; both honour
  `@media (prefers-reduced-motion: reduce)` (instant, no transform). No decorative motion.

---

## 6. My Week strip wiring (FR-040/041/042, AC-050/051)

Edits the **existing** "weekly update" auxiliary strip in `MyWeek.tsx` (currently a static
placeholder). **Match the strip pattern already there** — `bg-card border border-border rounded-md`,
`min-height:60px`, `padding:12px 20px`, flex-wrap, a leading neutral pill + a sentence + a trailing
`primary` link. The wiring swaps the static copy/pill for live state from the viewer's current-WIB-week
update. Three states (one auxiliary strip, the density-mode 56–64px aux-strip budget):

| State | Leading pill | Sentence | Trailing link |
|---|---|---|---|
| **No update** (no row) | neutral `secondary` / `muted-foreground` "No update" | `No weekly update for this week yet.` + `Due Fri {fridayShort}` in `muted-foreground` | `Write update →` (`primary`) |
| **Draft** (row, draft) | `warning/18%` tint pill "Draft" + `warning` dot | `Draft — not filed yet.` + `Due Fri {fridayShort}` | `Continue draft →` |
| **Submitted** (row, submitted) | `success/14%` tint pill "Submitted" + `success` dot | `Submitted {on time | late}.` (the on-time/late chip per §2.5, the **late** word in `warning-foreground`) | `View update →` |

- Pill tints reuse the §3.3 review-state tokens (same Filed/Draft/Not-started hue families →
  consistency across the strip and the review roster). The strip's pill keeps the existing
  `height:24px; padding:0 10px` sizing already in `MyWeek.tsx` (do not shrink to 22px — match the
  sibling ops strip).
- **Due** label keeps `week.ts` `fridayShort` (already wired). Link copy changes by state (verb+object,
  standalone meaning) but the destination stays `/updates`.
- Loading: the strip can render its neutral "No update" shell until the query resolves (no skeleton
  needed for a single strip), then settle to the real state — but must not **flash** "No update" then
  jump to "Submitted"; gate the pill/sentence on the loaded flag (render the pill area muted/blank
  while loading, then the resolved state). Error: fall back to the existing static "No update" copy
  with the Open-Updates link (the strip is a glance, not the source of truth — full state lives on
  `/updates`).
- `aria-label="My weekly update"` on the `<section>` is already present — keep it.

---

## 7. Token ledger & owner sign-off

### 7.1 Tokens used (all existing — no additions)
`background` · `foreground` · `card` / `card-foreground` · `secondary` / `muted` / `accent` ·
`muted-foreground` · `border` / `input` (+ `border/70%` dividers) · `ring` · `primary` /
`primary-foreground` (+ brand shadow `primary/0.25`, active tints `primary/10–12%`) · `violet`
(avatar gradient only) · `success` / `--status-won-text` · `warning` / `warning-foreground` ·
`destructive` / `--status-lost-text` · `--status-open-text` · `popover` / `popover-foreground` +
overlay shadow · typography `page-title` / `subheading` / `body` / `label` / `overline` · `rounded`
`md` / `full` · `spacing` `1`–`6` · `badge-status` (22h) · `button-primary` / `button-outline` /
`button-ghost` (32h) · `card` · `input` · `nav-item` (shell) · `--rail-w` / `--header-h` (shell) ·
`tabular-nums` on every week label / time / count · global `:focus-visible` ring · proposed
DESIGN.md **disabled** treatment (`opacity:0.5; not-allowed; pointer-events:none`).

### 7.2 The one item for owner sign-off — `ProgressMarker` component token mapping
**Not a new palette entry.** It is a **new component** whose three marker→token mappings **re-use**
existing hues exactly as the signed mock already drew them:
- `In progress` → `primary/12%` bg + `--status-open-text`
- `Blocked` → `destructive/12%` bg + `--status-lost-text`
- `Done` → `success/14%` bg + `--status-won-text`

If the owner approves, record in `DESIGN.md` (a short "Progress marker (Update lines)" note under the
Badges/Status section, beside the RACI role-chip note) that these three mappings are the canonical
ProgressMarker tints — so the marker's meaning is owned by DESIGN.md, not buried in a component. **No
new hue, no new brand, within The One Blue Rule** (the blue here is non-interactive meaning on a draft
line, like the RACI R chip).

### 7.3 Open questions for the owner
1. **DESIGN.md note for ProgressMarker (§7.2)** — approve recording the three reused mappings as a
   named ProgressMarker entry in DESIGN.md? (Recommended: yes — it keeps marker semantics in the token
   doc and prevents a future StatusPill edit from drifting them.)
2. **Late signal hue — amber vs red.** This plan uses **amber/warning** for "late" (a late *filing* is
   allowed per OD-P2-14, so it is caution not failure; red stays for genuinely overdue/error). Confirm
   amber is the intended "late" colour and red is not wanted here.
3. **Submitted-lock state pill** — confirm the locked write pane shows a **"Submitted"** state pill +
   on-time/late note in the head row (this plan's read of AC-031/036); the mock didn't draw the
   submitted state explicitly (it noted it).

All four mock OPEN-QUESTIONS are already resolved by locked ODs (spec §9) and are **not** re-opened
here.

---

## 8. Acceptance hooks (design → test)

This design-plan's pieces map to the spec ACs the UI owns (Vitest/RTL unless noted):
- Write states/validation: **AC-031..038** (read-only+Reopen, both-actions-co-located,
  Submit-disabled-when-empty, line add/edit/marker/reorder/remove, Save-draft quiet confirm, Submit
  transition, Reopen, loading/error).
- Review pane: **AC-040..046** (roster rows + name/role/excerpt/pill, Filed/Draft/Not-started +
  counts, on-time/late, no edit/ack/comment, prior-week recompute, empty team, error).
- My Week strip: **AC-050/051** (No-update / Draft / Submitted+on-time-late).
- WIB helpers feeding the visuals: **AC-030 / AC-031b** (week.ts).
- E2E (Playwright): **AC-090** write→submit→Filed-in-review, **AC-091** reopen→edit→resubmit.

Every state in §5.1 has an owning AC above; any state without one (e.g. in-flight saving busy state)
is a craft detail enforced at review, not a separate AC.
