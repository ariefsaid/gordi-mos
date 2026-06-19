# UI / UX / IA / IxD revamp — design plan (Phase-0 exploration → converged direction)

> **Status:** Phase-0 design exploration + converged design-plan. **Gate:** owner sign-off on the
> converged direction + the `docs/design-mockups/ui-revamp/*.html` mockups is required before ANY
> implementation issue proceeds.
> **Authorities:** `docs/reference/mos-design-kit/guidelines/ia-patterns.md` (IA/IxD spec — the target),
> `DESIGN.md` (binding visual system + ratified ODs), `docs/jtbd.md` (Lens-D intent oracle),
> `docs/reference/engineering-conventions.md` §1b (no-hardcoded-colors).
> **Token rule:** every color names a `--ds-*` token (or its `--surface-*` / `--text-*` / `--accent`
> alias). No literal hex/rgb/hsl anywhere in mockups or the implemented revamp.
> **Scope note:** this plan is design-direction + mockups only. It does not implement app code.

---

## 0. The frame: why a revamp, and what "converged" means here

The owner's read is correct: the app surfaces are **not yet** the records-workspace the kit describes.
The rail was already reworked to the kit idiom (workspace switcher, in-rail search + ⌘K, 28px nav items
with accent-tinted active icon, foot user chip — see `mos-app/src/shell/RailNav.tsx`). The remaining
surfaces still read as "a dashboard with a sidebar" rather than "a data workspace with rich records."

The kit's signature is a **four-part loop**: a persistent rail → a dense **record table** → a rich
two-column **record page** → a ⌘K **command menu** overlaying everything, with the breadcrumb living at
**content-top** (the kit explicitly has *no* global top bar). Today MOS has: a near-empty 56px global
Header that only holds a breadcrumb; a side **drawer** for task detail (not a record page); a My Week
whose mini-table still wears the old bespoke uppercase-overline inline styles; and a ⌘K affordance with
no actual palette behind it.

"Converged" = for each surface I diverge (2–3 alternatives), then recommend ONE, justified against the
kit's IA/IxD **and** the three MOS jobs (`docs/jtbd.md`): the manager's *"what needs me / is my team
filing / who owns what"*, the ops user's *"record it in under a minute"*, and Arief's *org-wide read-only
oversight*. The recommendation never invents a new aesthetic — it applies the adopted kit harder.

### A note on two token namespaces (load-bearing, read before implementing)
The **runtime app** consumes shadcn HSL tokens (`--background`, `--muted-foreground`, `--primary`, …,
per `DESIGN.md` "How to use these tokens"). The **mockups** consume the kit's `--ds-*` tokens (per the
task brief + `engineering-conventions.md`). These are **two expressions of one identity** — the kit's
`--ds-background-primary` ≙ shadcn `--card`/`--background`; `--ds-font-color-secondary` ≙
`--muted-foreground`; `--ds-color-blue` ≙ `--primary`; etc. The mockups in `ui-revamp/` are authored in
`--ds-*` (linking the kit's `styles.css`) so they validate against the kit and the no-hardcoded-colors
rule. **At implementation time** the ui-implementer maps each `--ds-*` token the mockup uses to its
shadcn runtime equivalent via the crosswalk in §8 — no literal colors enter `src/`. This crosswalk is
the one piece of new shared vocabulary this revamp introduces; it is documentation, not a new token set.

---

## 1. App shell + top bar

### 1.1 Current → gap
- **Current:** `AppShell.tsx` is a 2-col grid `[var(--rail-w) | 1fr]`; the right column is a stacked
  `Header` (56px, `--header-h`) + page `Outlet`. `Header.tsx` now holds only a hamburger (narrow) +
  `Breadcrumb` + an empty spacer. The user chip + ⌘K already moved into the rail.
- **Gap vs `ia-patterns.md`:** the kit's shell is `[ left rail (fixed) ] [ main area ]` with the
  command menu overlaying — there is **no global top bar**. The breadcrumb belongs at **content-top**
  (the record-page "breadcrumb row," bottom `border-light`), not in a persistent 56px chrome strip. The
  current Header is 56px of mostly-empty horizontal chrome that (a) eats vertical space on dense list
  surfaces, (b) duplicates a structural role the record-table header row + record-page breadcrumb row
  already own, and (c) reads as legacy-app chrome, not a data workspace.

### 1.2 Diverge
- **Alt 1A — Keep the global Header, shrink to 44px, add back affordances.** Move ⌘K + notifications +
  user chip back up top. *Rejected:* directly contradicts the kit (rail owns ⌘K + user chip + utilities)
  and re-introduces the chrome the rail rework just removed.
- **Alt 1B — Remove the global Header entirely; breadcrumb moves to a per-surface content-top
  breadcrumb row.** The main area becomes a single scroll column whose first row is the surface's own
  header (record-table header row, or record-page breadcrumb row). Narrow-width hamburger relocates into
  that content-top row (left-aligned, before the breadcrumb). *This is the kit's literal shell.*
- **Alt 1C — Hybrid: a 40px "context bar" that is part of the content column, not global chrome.** A
  thin sticky bar at content-top carrying breadcrumb + a right-aligned surface-action slot
  (e.g. "+ New task"). *Close to the kit, but the kit folds breadcrumb into the surface header rather
  than a separate persistent bar; a free-floating context bar risks becoming the old Header again.*

### 1.3 Converge → **Alt 1B (remove the global Header; breadcrumb at content-top).**
**Why:** it is the kit's exact `[rail][main]` shell, recovers ~56px of vertical height on every dense
surface (serves the manager's scan-many job and Arief's oversight), and removes a chrome strip that
carries no job. The narrow-width hamburger lives in the content-top row so mobile nav is preserved
without resurrecting global chrome. Notifications (today a stub) defer to the rail's utility group when
they ship (kit: Search / Notifications / Settings are rail NavItems) — not the top bar.

**Override flag (needs ratification):** `DESIGN.md` §5 Navigation documents a **56px top bar (`--header-h`)
holding breadcrumb + ⌘K + notifications + user chip.** This revamp **retires the global top bar**: ⌘K +
user chip already live in the rail; the breadcrumb moves to content-top; notifications become a rail
utility item. → **OD-OVERRIDE-1** below.

### 1.4 Component breakdown
- `AppShell`: 2-col grid `[rail | main]`; main is a single flex-column scroll container, no Header child.
- `ContentHeader` (new, per-surface): the content-top row. Two shapes:
  - *list shape* — entity icon + title + count chip + (right) primary action; the kit record-table
    "header row."
  - *record shape* — breadcrumb (entity ← / chevron / current record); the kit "breadcrumb row."
- Narrow-width hamburger: leading slot of `ContentHeader`, `aria-label="Open navigation"`.

### 1.5 States
- **Loading:** title + count chip render a skeleton shimmer (`--ds-background-tertiary`); breadcrumb
  shows the entity crumb immediately (it's route-derived), current-record crumb skeletons until loaded.
- **Empty:** N/A (the header is structural). Count chip reads `0`.
- **Error:** breadcrumb current-crumb falls back to the route id; surface body owns the error block.
- **Edge:** very long record names truncate with ellipsis + `title`; the entity crumb never truncates.

### 1.6 Responsive
- **≥920px:** rail visible, no hamburger.
- **<920px:** rail collapses to the mobile drawer; hamburger appears in `ContentHeader` leading slot
  (preserves the existing `--rail-w: 0` + MobileDrawer behavior from `DESIGN.md` §5 Mobile).
- **<768px:** content padding tightens; primary action in `ContentHeader` may collapse to an icon button.

### 1.7 a11y (WCAG-AA)
- One `<main>` landmark on the content column; `ContentHeader` is a `<header>` *inside* main (not a
  second page banner).
- Breadcrumb is `<nav aria-label="Breadcrumb">` with an ordered list; current crumb `aria-current="page"`.
- Tab order: rail → content-header (hamburger → breadcrumb → action) → surface body. Focus ring is the
  global `--ds-color-blue` ring + `--ds-accent-tertiary` 3px soft ring (kit foundations).
- Removing the global banner does not remove a landmark users relied on (it held no interactive content
  beyond the hamburger, which is preserved).

### 1.8 Tokens
| Piece | Token |
|---|---|
| Main canvas | `--ds-background-primary` (white) |
| Rail surface | `--ds-background-secondary` (faint grey) |
| Rail right border / content-header bottom border | `--ds-border-color-light` |
| Breadcrumb links | `--ds-font-color-secondary`; hover `--ds-font-color-primary` |
| Breadcrumb current | `--ds-font-color-primary` |
| Title | `--ds-font-color-primary`, `--ds-font-display`, `--ds-font-size-md`, weight `--ds-font-weight-semi-bold` |
| Count chip | bg `--ds-background-tertiary`, text `--ds-font-color-tertiary`, pill radius |
| Focus ring | `--ds-color-blue` + `--ds-accent-tertiary` |

---

## 2. Record table (Tasks)

### 2.1 Current → gap
- **Current (`TasksWorkspace.tsx`, `TaskSurface.css`):** dense 50px DB-view rows (OD-P3-6), light
  uppercase headers, soft status tags, neutral bordered toolbar, view-tab strip, group headers as
  hairline rows. Much of the kit idiom is already in place — this surface is the closest to target.
- **Gap vs `ia-patterns.md` record table:**
  1. **Checkbox column:** kit hides the checkbox until **row hover or selected** (`visibility`), 32px
     column, `paddingLeft 12`. Confirm MOS does this; if the checkbox is always visible it reads busier
     than the kit's "quiet at rest."
  2. **Primary-name cell as a Chip that opens the record:** kit makes the name cell a clickable **Chip**
     (a contained, hover-affordant control), not just a text link. MOS uses a row→navigate; the name
     should read as the record-open affordance with a hover state, and be a real `<a>` (a11y +
     middle-click, per `engineering-conventions.md` "prefer `<Link>`").
  3. **Row hover fill:** kit row hover = `--ds-background-secondary`. MOS uses `accent/60%`. Same intent;
     align to the kit value in the `--ds-*` crosswalk.
  4. **th weight 400:** kit headers are weight **400** (not bold) `--ds-font-size-xs` `--ds-font-color-light`.
     `DESIGN.md` §5 Data Table currently specs the overline treatment (11.5px/600 UPPERCASE). This is a
     **divergence to flag** — see §2.3.
  5. **Count chip in the header row** with the entity icon + title (now folded into `ContentHeader`, §1).
  6. **Row `⋯` menu hidden until hover** — kit "affordances appear on hover." Confirm.

### 2.2 Diverge
- **Alt 2A — Keep the DESIGN.md overline header (11.5px/600 UPPERCASE).** Preserves the ratified
  "section-divider voice" and the `View-tab strip` / group-header consistency. *The bespoke uppercase
  header is part of MOS's current identity but reads heavier than the kit's quiet weight-400 header.*
- **Alt 2B — Adopt the kit's quiet weight-400 header (`--ds-font-size-xs`, `--ds-font-color-light`,
  sentence-or-caps, no bold).** Lighter, more "data workspace," matches `ia-patterns.md` exactly.
- **Alt 2C — Hybrid: keep UPPERCASE + tracking (the MOS section voice) but drop weight 600 → 400 and
  color to `--ds-font-color-light`.** Keeps the recognizable MOS overline rhythm while shedding the
  weight that makes it read as a legacy table header.

### 2.3 Converge → **Alt 2C (UPPERCASE + tracking, but weight 400 + `--ds-font-color-light`).**
**Why:** the uppercase-tracked overline is a deliberate, ratified MOS "section-divider voice"
(`DESIGN.md` Typography → Overline; used by the view-tab strip + group headers too) — dropping caps
entirely would fracture that rhythm. But the kit is right that **weight-600 bold headers read heavy** for
a dense scan surface. Lowering to weight 400 + the lighter `--ds-font-color-light` gets the kit's quiet
header while keeping the MOS overline shape. This is the minimal, identity-preserving move.

Everything else in §2.1 (hover-revealed checkbox + `⋯`, name-as-Chip-link, row-hover =
`--ds-background-secondary`) is adopted straight from the kit — these are craft/discipline, not aesthetic
changes, so no ratification needed beyond the header-weight flag.

**Override flag:** `DESIGN.md` §5 Data Table header cells = "11.5px/600 uppercase." This revamp keeps the
uppercase+tracking but **drops weight to 400 + lightens color** to match the kit. → **OD-OVERRIDE-2**.

### 2.4 Component breakdown
- `RecordTable` shell: `ContentHeader` (list shape) + toolbar row + `<table>`.
- Toolbar row: view-tab strip (Table · Board · Calendar, OD-P3-6) + filter/sort chips (`--ds-radius-sm`,
  `--ds-font-size-sm`) + segmented Mine/RACI/All + search-mini. Flat at rest.
- `<thead><th>`: sticky, 32px, weight 400, `--ds-font-size-xs`, `--ds-font-color-light`, bottom
  `--ds-border-color-light`, optional 14px sort glyph.
- `<tbody><tr>`: 50px (OD-P3-6 dense DB-view), `0 --ds-spacing-2` cell padding, bottom
  `--ds-border-color-light`; hover `--ds-background-secondary`; selected `--ds-accent-tertiary`.
- Cells: checkbox col (32px, hover/selected-revealed), name **Chip-link** (opens `/tasks/:id`), status
  **Tag** (soft tinted, dot + label), owner cell (R-avatar + "+N" muted — OD-P0-8/RACI), due (muted;
  destructive when overdue, warning when ≤3d), activity-age (muted; warning/destructive when stale).

### 2.5 States
- **Loading:** 6–8 skeleton rows (`--ds-background-tertiary` shimmer at row height 50px); header +
  toolbar render immediately; checkbox col hidden.
- **Empty (no tasks):** in-body centered message, e.g. *"No tasks match these filters."* + a "+ New task"
  primary; if filters are active, a "Clear filters" ghost.
- **Empty (no filters, truly zero):** *"No tasks yet. Create the first one."* + "+ New task."
- **Error:** in-body block (icon + message + Retry) spanning all columns; toolbar stays interactive.
- **Edge:** long task names truncate with ellipsis + `title`; many RACI people → R-avatar + "+N";
  grouped view always shows empty groups (layout stability, OD-P3-6).

### 2.6 Responsive
- **≥768px:** `<table>` renders (single-render reflow, OD-W4-4).
- **<768px:** stacked **card list** — first cell = title/open button, remaining = `<dl>` label:value
  grid; cards take `--ds-radius-md` + resting lift; touch targets ≥44px. Exactly one branch in the DOM.
- **920px:** rail collapse breakpoint (separate from the 768 table reflow).

### 2.7 a11y
- Sortable `<th>` are `<button>`s with `aria-sort`. Checkbox col: `role="checkbox"` + `aria-checked` +
  `tabindex="0"`; "select all" supports `aria-checked="mixed"` (indeterminate). Name Chip is a real
  `<a href>`. Row hover-revealed controls remain keyboard-focusable (revealed on `:focus-within`, not
  hover-only). Status Tag is never color-alone — always dot **+** text label (OD Tinted-Status). Numeric
  cells `tabular-nums`. Contrast: status pill text uses AA-darkened variants.

### 2.8 Tokens
| Piece | Token |
|---|---|
| Page / table surface | `--ds-background-primary` |
| Header cell text | `--ds-font-color-light`; bg `--ds-background-primary`; border `--ds-border-color-light` |
| Body cell text | `--ds-font-color-primary`; secondary text `--ds-font-color-secondary` |
| Row hover | `--ds-background-secondary`; selected `--ds-accent-tertiary` |
| Name Chip (link) | text `--ds-font-color-primary`; hover bg `--ds-background-tertiary` |
| Status Tag | bg `--ds-tag-background-*`; text `--ds-tag-text-*` (e.g. blue/amber/green/red) |
| Overdue due / stale age | `--ds-color-red` (text via tag-text-red); ≤3d `--ds-tag-text-amber` |
| Toolbar chips | border `--ds-border-color-medium`; text `--ds-font-color-secondary`; radius `--ds-border-radius-sm` |
| Checkbox | border `--ds-border-color-medium`; checked fill `--ds-color-blue`; radius `--ds-border-radius-xs` |

---

## 3. Record / detail page (the big one)

### 3.1 Current → gap
- **Current (`TaskDrawer.tsx` + `TaskSurface.tsx`):** a side **drawer** — non-modal `<aside>` beside the
  table at ≥1100px, modal sheet/full-screen below. Holds the task fields, RACI, status, checklist,
  activity. It's a good triage surface but it is **not** the kit's record page.
- **Gap vs `ia-patterns.md` record page:** the kit's highest-value pattern is a **two-column record
  page**: `[ breadcrumb ] / [ left details panel ~332px | right tabbed feed ]`. Left = identity row
  (xl avatar + name) + actions + field sections (label col 104px, inline-editable). Right = tab strip
  (Timeline / Tasks / Notes / Files) with a 2px accent active underline, feed = events list. The drawer
  collapses both columns into one narrow scroll, so the activity/updates feed is cramped and the fields
  fight the feed for the same ~500px.

### 3.2 Diverge
- **Alt 3A — Keep the drawer.** Pros: great for fast triage (stay in the list, Tab between table and
  drawer at ≥1100px — a real manager-scan affordance, see `TaskDrawer` docstring). Cons: not the kit's
  record page; the RACI + activity + checklist crowd a single narrow column; can't grow into the larger
  MOS (a Project/Objective record needs the two-column richness).
- **Alt 3B — Full record page (`/tasks/:id` is its own route, two-column kit layout).** Pros: the kit's
  literal record page; room for left fields + right tabbed feed; the canonical "one home per task" (JTBD
  §3.3). Cons: loses in-list triage; every open is a full navigation; heavier for the "glance and close"
  loop.
- **Alt 3C — Hybrid (RECOMMENDED): the drawer *becomes* a mini two-column record page, and the same
  `TaskSurface` renders full-width as a record page when deep-linked / expanded.** At ≥1100px the
  non-modal drawer keeps triage but internally adopts the kit's structure: a compact left details
  block + a right tabbed feed (Activity / Checklist / Notes). The existing "expand" control promotes the
  surface to the **full two-column record page** (the kit layout at full width). Below 1100px it's the
  modal sheet (mobile = full-screen record page). One `TaskSurface`, three widths — exactly the
  architecture already in `TaskSurface` (`width="drawer"` + `expanded`).

### 3.3 Converge → **Alt 3C (hybrid: drawer = mini record page; expand = full kit record page).**
**Why:** it preserves the manager's fast-triage job (drawer beside the list, Tab-to-continue — a job the
kit's pure record page would *lose*) **and** delivers the kit's two-column record-page IxD (left details
+ right tabbed feed) as the surface's internal structure, which scales to the larger MOS (Projects /
Objectives reuse the same record-page shell). It's also the smallest delta from today's code: the
`TaskSurface` already supports `drawer` width + `expanded` + modal regimes; this revamp re-lays-out its
*internals* to the kit's two-column anatomy and makes "expanded" the full-width record page.

**JTBD alignment:** Task detail's job (§2 "One piece of work") is *"status + R/A above the fold, change
inline, move it forward without leaving the page."* The two-column record page puts **status + R/A in the
left details panel (above the fold), the activity/updates in the right feed** — exactly the decision-first
ordering Lens-D Q3 wants. Inline status/RACI editing (OD-P2-1/3) stays. **Lens-D guard (A2):** the right
feed's tabs are Activity / Checklist / Notes — a **weekly-update** never gets a write/ack affordance
here; this surface is a task, not the upward review pane.

**No override needed:** `DESIGN.md` doesn't mandate a drawer — the drawer is an ADR-0007 implementation
choice. The kit record page is *adopted*, expressed through the existing surface. (If the owner prefers
**Alt 3B pure record page**, that is a roadmap call, not a token one — `ia-patterns.md` "which entities
get this treatment is a roadmap decision.")

### 3.4 Component breakdown (`TaskRecordPage` / `TaskSurface` internals)
- **Breadcrumb row** (record shape of `ContentHeader`): Tasks ← / chevron / task name. Bottom
  `--ds-border-color-light`.
- **Left details panel** (~332px full-width; compresses in drawer width): identity row (xl avatar +
  task name `--ds-font-size-xl` weight 600 + sub-line `--ds-font-size-sm` tertiary, e.g. BU · code);
  action icon buttons; field sections with a section label (`--ds-font-size-xs` UPPERCASE tracked
  `--ds-font-color-light`) then field rows (`min-height 30`, label col 104px `--ds-font-color-tertiary`
  + 14px glyph, value `--ds-font-color-primary`, inline-editable). Sections: **Ownership** (R/A/C/I
  chips — OD-P2 RACI tokens), **Status** (inline StatusTrigger), **Dates** (due/created), **Checklist**
  (count + inline toggle).
- **Right feed:** tab strip (Activity / Checklist / Notes), active = `--ds-font-color-primary` + 2px
  `--ds-color-blue` bottom-border; inactive `--ds-font-color-tertiary`. Feed = event list (glyph +
  secondary text + light timestamp); a note renders in a soft `--ds-color-yellow1` card.

### 3.5 States
- **Loading:** breadcrumb shows entity crumb; left panel skeletons identity + 4 field rows; right feed
  shows 3 skeleton events. `aria-busy`.
- **Empty (feed):** *"No activity yet."* in the right feed; left panel always has fields.
- **Empty (checklist):** *"No checklist items."* + inline "+ Add item" (for editors).
- **Error (load):** full-surface error block (icon + message + Retry).
- **Error (inline save):** the edited field shows `--ds-border-color-danger` outline + a helper line in
  `--ds-font-color-danger` (mirrors `DESIGN.md` field-error tokens); the rest of the surface stays live.
- **Edge:** archived task → read-only banner + restore action (A/manager); not-R/A viewer → fields
  read-only (no edit affordance), per OD-P2-3.

### 3.6 Responsive
- **≥1100px:** non-modal drawer beside the table (two-column internals) **or** expanded full-width record
  page (kit two-column). Tab flows table↔drawer (no trap).
- **920–1100px:** modal sheet (single column: left details stacked above right feed); scrim + focus trap
  + Esc.
- **<768px:** full-screen record page; details collapse above the feed; tabs become a horizontal scroll
  strip; touch targets ≥44px.

### 3.7 a11y
- Record page is a `<main>` region with the breadcrumb `<nav>`. Tab strip: `role="tablist"`/`role="tab"`/
  `aria-selected`, roving tabindex, arrow-key navigation; panels `role="tabpanel"` + `aria-labelledby`.
- Inline-editable fields: each is a labeled control (visible label = the 104px label col); edit affordance
  reachable by keyboard; save on blur/Enter, cancel on Esc. Modal regimes keep focus trap + Esc + return
  focus (already in `TaskDrawer`). Status/RACI chips never color-alone (dot + text). Contrast: RACI chip
  text uses AA-darkened tinted-status variants.

### 3.8 Tokens
| Piece | Token |
|---|---|
| Record surface | `--ds-background-primary` |
| Left-panel right border | `--ds-border-color-light` |
| Identity name | `--ds-font-color-primary`, `--ds-font-display`, `--ds-font-size-xl`, weight 600 |
| Field label col | `--ds-font-color-tertiary` |
| Field value | `--ds-font-color-primary` |
| Section label | `--ds-font-color-light`, `--ds-font-size-xs`, UPPERCASE |
| Tab active | text `--ds-font-color-primary`; underline `--ds-color-blue` |
| Tab inactive | `--ds-font-color-tertiary` |
| Note card | bg `--ds-color-yellow1`; border `--ds-border-color-light` |
| RACI: R | `--ds-color-blue` (tinted pill) |
| RACI: A | `--ds-color-violet` (tinted pill) |
| RACI: C / I | `--ds-font-color-secondary` on `--ds-background-secondary` |
| Inline-edit error | border `--ds-border-color-danger`; text `--ds-font-color-danger` |

---

## 4. My Week

### 4.1 Current → gap
- **Current (`MyWeek.tsx`):** a single content column with a dominant "My tasks" card (a 5-col mini-table)
  + auxiliary strips (weekly update, ops) + a manager team module. Honors MOS density mode (OD-P0-7).
  **But** the mini-table `<th>` are hand-rolled inline styles: `fontSize: 11, letterSpacing: '0.06em',
  uppercase, font-semibold, text-muted-foreground, height: 36` — the **old bespoke overline**, not the
  kit's quiet header, and not sharing the `RecordTable` header treatment from §2.
- **Gap:** My Week should feel like a **calm at-a-glance home** in the kit idiom — its mini-table headers
  should match the converged §2.3 header (weight 400, lighter), and the whole surface should read as the
  kit's quiet records-home, not a dashboard. The `surface-wash` gradient (OD-P3-12) is already wired.

### 4.2 Diverge
- **Alt 4A — Leave the bespoke inline headers; just retune values.** Minimal, but keeps drift (two header
  treatments in the app).
- **Alt 4B — Reuse the converged `RecordTable` header treatment (§2.3) on the My Week mini-table.** One
  header voice across the app; My Week's mini-table reads as a quiet excerpt of the full Tasks table.
- **Alt 4C — Replace the mini-table with a denser "card list" of task rows (no `<table>`).** More
  "home-like," but loses column alignment (status/owner/due/age) the manager scans — fails Lens-D Q3
  (decision-relevant facts in aligned columns).

### 4.3 Converge → **Alt 4B (share the §2.3 header treatment; keep the dominant mini-table).**
**Why:** Lens-D's My Week job is *"see what's drifting in my R/A tasks first."* Aligned columns
(status · owner · due · activity-age) are exactly the decision-relevant facts — a card list would scatter
them. Sharing the converged header treatment kills the second header voice (consistency, Lens-A) and
makes My Week read as a calm excerpt of the records workspace. MOS density mode (OD-P0-7: single ~1080px
column, one dominant module, ≤2 strips, progressive RACI) is **preserved** — this is a typography/token
alignment, not a composition change.

**No override:** the change is bringing the bespoke inline header into line with `DESIGN.md` Overline +
the §2.3 converged weight. (OD-OVERRIDE-2's weight-400 applies here too.)

### 4.4 Component breakdown
- `PageFrame surfaceWash` (home gradient wash, OD-P3-12) → `PageHead` (title + subtitle) → dominant
  **My tasks** card (`CardHead` + mini `RecordTable`, 44–48px rows per OD-P0-7) → ≤2 strips (weekly
  update, ops) → manager team module (role-conditional).
- Mini-table `<th>`: the converged §2.3 header (weight 400, `--ds-font-color-light`, UPPERCASE tracked).
- Rows: task name Chip-link → `/tasks/:id`; status Tag; owner R-avatar + "+N"; due (muted/warn/dest);
  activity-age.

### 4.5 States
- **Loading:** dominant card shows 4–6 skeleton rows; strips show skeleton pills (already implemented).
- **Empty:** *"No tasks where you're R or A this week — you're clear."* (already implemented; keep).
- **Error:** per-module independent error (strip = inline Retry; team module = `ErrorState` block) —
  already implemented; keep.
- **Edge:** non-manager → no team module; flags off → strips hidden (current behavior).

### 4.6 Responsive
- **Single column ~1080px**, centered; below ~1120 it fluid-narrows. <768px: mini-table reflows to the
  card list (§2.6). Strips wrap (already `flex-wrap`).

### 4.7 a11y
- Each module is a labeled `<section aria-label>`. Mini-table is a real `<table>` with `<th scope="col">`.
  Surface-wash gradient AA-verified at the top 3.5% navy band (OD-P3-12). Strip links have descriptive
  `aria-label`. Status pills dot + text.

### 4.8 Tokens
| Piece | Token |
|---|---|
| Home surface wash | `--ds-*` navy wash (kit: faint top-wash; runtime `--gradient-surface-wash`) |
| Card | bg `--ds-background-primary`; border `--ds-border-color-light`; resting lift `--ds-box-shadow-light` |
| Mini-table header | `--ds-font-color-light`, UPPERCASE, `--ds-font-size-xs`, weight 400 |
| Strip card | bg `--ds-background-primary`; border `--ds-border-color-light` (flat, no resting shadow) |
| Strip link | `--ds-color-blue` |
| Pills | tinted-status (`--ds-tag-background-*` + `--ds-tag-text-*`) |

---

## 5. Command menu (⌘K)

### 5.1 Current → gap
- **Current:** the rail has a **Search trigger** (`RailNav.tsx`: search glyph + "Search" + `⌘K` chip)
  that opens nothing — there is no palette.
- **Gap vs `ia-patterns.md`:** *"A command menu (⌘K) overlays everything."* The trigger must open a real
  command palette: a centered overlay with a search input + grouped results (navigate / actions / recent)
  + keyboard navigation.

### 5.2 Diverge
- **Alt 5A — Search-only palette** (jump to entities/records). Simple; matches the "Search" label.
- **Alt 5B — Command palette** (navigate **and** act: "New task", "Go to Tasks", "Write weekly update",
  filter shortcuts, recent records). The kit's "command menu," richer; the MOS jobs (create task, write
  update, jump to a record) are all one keystroke away.
- **Alt 5C — Hybrid: command palette whose **default** (empty query) shows *Recent* + *Quick actions*,
  and typing filters across **Navigate / Records / Actions** groups.** The kit idiom + the MOS jobs.

### 5.3 Converge → **Alt 5C (command palette: Recent + Quick actions default, grouped filter on type).**
**Why:** every primary MOS job is reachable in one overlay — manager: jump to Tasks / a record; ops:
"Add log entry"; everyone: "Write weekly update." Empty-state Recent + Quick actions gives information
scent (Lens-D Q1) before the user types. It overlays everything (kit), opens from the rail trigger **and**
⌘K (Ctrl+K on non-mac), Esc closes.

**No override:** `DESIGN.md` §5 Overlays already specs popover/menu/modal surfaces, radius, and the ⌘K
chip; the command menu is an overlay built from those tokens. (One small addition: a documented
"command menu" overlay variant — recorded for completeness, not a new token.)

### 5.4 Component breakdown
- `CommandMenu` overlay: scrim (`--ds-background-overlay-primary`) + centered panel (`--ds-radius-md`,
  `--ds-box-shadow-strong`). Header = search input (borderless, inherits font, leading search glyph).
  Body = grouped result list (group label = quiet overline; item = leading glyph + label + optional
  trailing hint/`⌘`-chip). Footer = key hints (↑↓ navigate · ↵ open · esc close).
- Groups: **Quick actions** (New task, Write weekly update, Add log entry), **Navigate** (My Week, Tasks,
  Updates, Daily Log), **Records** (matching tasks — typed), **Recent** (last opened).

### 5.5 States
- **Default (empty query):** Recent (if any) + Quick actions + Navigate.
- **Typing:** filtered groups; matched substring may bold (not a new color).
- **No matches:** *"No matches for '<query>'."* + Quick actions still listed.
- **Loading (record search async):** Records group shows a skeleton row; other groups render instantly.
- **Error (record search failed):** Records group shows *"Couldn't search records."*; navigation/actions
  still work.
- **Edge:** very long record names truncate; the input never loses focus while open.

### 5.6 Responsive
- **≥768px:** centered panel ~560px, ~`40vh` from top.
- **<768px:** panel goes near-full-width (16px insets), taller; results scroll; key-hint footer hides
  (no physical keyboard assumed) and tap selects.

### 5.7 a11y
- `role="dialog"` `aria-modal="true"` `aria-label="Command menu"`; focus trap; Esc closes; focus returns
  to the rail trigger. Input is `role="combobox"` `aria-expanded` `aria-controls` the listbox; results
  `role="listbox"` with `role="option"` + `aria-selected`; active option tracked via
  `aria-activedescendant` (focus stays in the input). ↑↓ move active option, ↵ activates, Home/End jump.
  Contrast: active option bg `--ds-background-tertiary` with `--ds-font-color-primary` text clears AA.

### 5.8 Tokens
| Piece | Token |
|---|---|
| Scrim | `--ds-background-overlay-primary` |
| Panel | bg `--ds-background-primary`; border `--ds-border-color-light`; radius `--ds-border-radius-md`; shadow `--ds-box-shadow-strong` |
| Input text / placeholder | `--ds-font-color-primary` / `--ds-font-color-light` |
| Group label | `--ds-font-color-light`, UPPERCASE, `--ds-font-size-xs` |
| Item label | `--ds-font-color-primary`; meta `--ds-font-color-tertiary` |
| Active/hover item | bg `--ds-background-tertiary` |
| ⌘ chip | border `--ds-border-color-light`; text `--ds-font-color-tertiary`; mono `--ds-code-font-family` |
| Selected-action accent (leading glyph on actions) | `--ds-color-blue` |

---

## 6. Empty / loading / error states + dark mode (cross-cutting)

### 6.1 State vocabulary (one shape across all surfaces)
- **Loading:** skeleton shimmer in `--ds-background-tertiary`; structural chrome (headers, breadcrumb,
  toolbar) renders immediately so layout doesn't jump; `aria-busy="true"` on the loading region; never a
  full-page spinner on a surface that has stable chrome.
- **Empty:** a calm centered block — quiet glyph (`--ds-font-color-light`), one-line message
  (`--ds-font-color-secondary`), and **the one next action** adjacent (Lens-D Q4: a number/empty is never
  a dead end). Distinguish *filtered-empty* ("Clear filters") from *truly-empty* ("Create the first one").
- **Error:** a centered block — message (`--ds-font-color-secondary`) + a **Retry** action; failures are
  **scoped to the module** (a strip's error doesn't blank My Week; the Records group failing doesn't
  break the command menu's navigation). Inline-save errors use the field-error tokens, not a block.

### 6.2 Dark mode (consistency)
- The kit ships a full dark theme (`tokens/theme-dark.css`, `.dark` scope). Every surface above must read
  correctly in dark: surfaces step **darker** not lighter, borders stay hairline, the **one blue** stays
  the only action color, status tints keep AA against the dark tinted backgrounds. The mockups include a
  **dark section** (`class="dark"` wrapper) for each surface so the owner can sign off light + dark
  together. No surface hard-codes a light-only value — every color is a `--ds-*` token that flips with the
  theme scope. **a11y:** re-verify status-pill text AA on dark tints; the focus ring (`--ds-color-blue`)
  must remain visible on dark surfaces (it is — blue on near-black clears 3:1 non-text contrast).

### 6.3 a11y baseline (all surfaces)
- Global `:focus-visible` = `--ds-color-blue` outline + 3px `--ds-accent-tertiary` soft ring.
- Color is never the sole signal (status = dot + text; active tab = underline + weight; selected row =
  fill + checkbox).
- DOM order = visual order (rail → content-header → body); one `<main>`.
- Touch targets ≥44px on mobile affordances.

---

## 7. DESIGN.md OD overrides proposed for ratification

These are the only places this revamp **diverges from a ratified OD / `DESIGN.md` clause.** Nothing else
changes a hue, font, radius, or named rule — the rest is applying the adopted kit harder.

| ID | Clause overridden | Change | Why | Risk if ratified |
|---|---|---|---|---|
| **OD-OVERRIDE-1** | `DESIGN.md` §5 Navigation → "Top bar (header): 56px (`--header-h`) … breadcrumb + cmdk + notification + user chip" | **Retire the global top bar.** Breadcrumb → content-top (kit record/list header row); ⌘K + user chip already in rail; notifications → rail utility item when they ship. `--header-h` retained only for the narrow-width content-header row height if useful. | The kit's shell has **no global top bar**; the current Header is near-empty chrome that costs ~56px on every dense surface and duplicates the record-table/record-page header role. | Low — purely subtractive; mobile hamburger preserved in content-header. The `Header` component + `--header-h` references retire. |
| **OD-OVERRIDE-2** | `DESIGN.md` §5 Data Table → header cells "11.5px/600 uppercase"; Typography → Overline weight 600 | **Table column headers drop to weight 400 + `--ds-font-color-light`** (keep UPPERCASE + 0.06em tracking). | The kit's record-table header is quiet weight-400; 600-bold reads heavy for a dense scan surface. Keeps the MOS overline *shape*, sheds the *weight*. Applies to Tasks table + My Week mini-table. | Low — typographic weight only; the Overline elsewhere (rail group labels, group-header rows) is **unchanged**. Scope the weight-400 to `thead th` only. |

**Explicitly NOT overridden (kept verbatim):** The One Blue Rule, the near-monochrome palette, the
Single-Border Rule, Soft-Elevation, the Tinted-Status pattern, all RACI / progress-marker / Ops Log /
field-error tokens, MOS density mode (OD-P0-7), the OD-P3-9..12 refresh (fonts/radius/shadow/gradients),
the view-tab strip + group-header treatments (OD-P3-6), and the rail (already at target).

---

## 8. `--ds-*` ↔ runtime (shadcn) crosswalk for implementers

The mockups use `--ds-*`; the app runs on shadcn HSL tokens. At build time, map each used `--ds-*` token
to its runtime equivalent — **no literal colors enter `src/`** (`engineering-conventions.md` §1b / §4.8).

| Kit `--ds-*` (mockup) | Runtime (shadcn, `DESIGN.md`) | Role |
|---|---|---|
| `--ds-background-primary` | `--card` / `--background` | white surface |
| `--ds-background-secondary` | `--secondary` (rail uses `bg-secondary`) | faint grey panel / rail / row-hover |
| `--ds-background-tertiary` | `--accent` (hover wash) / `--muted` | hover/active fill, skeleton |
| `--ds-font-color-primary` | `--foreground` | primary text |
| `--ds-font-color-secondary` | (between `--foreground` and `--muted-foreground`) | body/labels |
| `--ds-font-color-tertiary` / `--ds-font-color-light` | `--muted-foreground` | meta / quiet header |
| `--ds-color-blue` | `--primary` | the one action color / focus / links |
| `--ds-color-violet` | `--violet` | categorical (RACI-A, KPI, timeline) |
| `--ds-border-color-light` / `-medium` | `--border` / `--input` | hairline borders (Single-Border Rule) |
| `--ds-border-color-danger` | `--destructive` (as field-error border) | invalid field outline |
| `--ds-font-color-danger` | `--status-lost-text` / `--field-error-text` | error helper text (AA) |
| `--ds-tag-background-blue/amber/green/red` | `--primary`/`--warning`/`--success`/`--destructive` @ ~10–18% tint | status pill bg |
| `--ds-tag-text-blue/amber/green/red` | `--status-open/violet/won/lost-text`, `--warning-foreground` | status pill text (AA-darkened) |
| `--ds-color-yellow1` | a `--success`/yellow-tint note surface | note card |
| `--ds-box-shadow-light` | `--shadow-rest` (OD-P3-11) | card resting lift |
| `--ds-box-shadow-strong` | overlay shadow (`DESIGN.md` §4 overlay) | menu / command palette |
| `--ds-radius-md` (8px) | `--radius-sm` controls / `--radius-md` nesting | note: kit radius scale differs from OD-P3-10; use the OD-P3-10 scale (controls 8px, cards/overlays 12px) at runtime |
| `--ds-font-display` | `--font-display` (Plus Jakarta Sans) | headings |
| `--ds-font-family` | `--font-sans` (DM Sans) | body/UI/table |
| `--ds-code-font-family` | `--font-mono` (SF Mono) | IDs / ⌘K chip |

> **Radius note for implementers:** the kit's raw scale (`xs 2 / sm 4 / md 8`) predates OD-P3-10. At
> runtime use the **OD-P3-10** scale (controls 8px, cards/containers/overlays 12px). The mockups use the
> kit radii for kit-fidelity; the crosswalk row above flags the one place runtime intentionally differs.

---

## 9. Acceptance checklist (folds in taste anti-slop + required states + a11y)

A surface is "revamp-done" when:
- [ ] Every color is a `--ds-*` token (mockup) / runtime token (app) — **zero literal hex/rgb/hsl** in `src/`.
- [ ] The **one blue** is the only action color on the surface (≤~10% coverage); no second action hue.
- [ ] **All states present:** loading (skeleton, chrome stays) · empty (filtered vs truly-empty, with the
      one next action) · error (scoped, Retry) · edge (truncation, archived, read-only viewer).
- [ ] Light **and** dark both verified (mockup dark section signed off).
- [ ] **No anti-slop:** no generic gradients (only the two ratified navy whispers), nothing
      centered-by-default that should be left-aligned, **realistic Gordi data** (no lorem), hairline
      borders over shadow-soup, status = dot + text never color-alone.
- [ ] WCAG-AA: focus ring on every focusable; DOM = visual order; one `<main>`; AT names on icon-only
      controls; status/RACI text AA on tints (light + dark); touch targets ≥44px mobile.
- [ ] Responsive: 920 (rail) + 768 (table reflow) breakpoints honored; single-render reflow (OD-W4-4).
- [ ] Matches the owner-signed `docs/design-mockups/ui-revamp/` mockup for the surface.

---

## 10. Open questions for the owner

1. **Detail surface (§3): hybrid (Alt 3C) vs pure record page (Alt 3B)?** I recommend the hybrid (keeps
   manager triage + delivers the kit record page + smallest code delta). If the owner wants the pure
   full-page record (`ia-patterns.md` literal), it loses in-list triage — a deliberate trade.
2. **OD-OVERRIDE-1 (retire global top bar):** ratify? It retires the `Header` component + `--header-h`
   usage and moves notifications (when they ship) to a rail utility item.
3. **OD-OVERRIDE-2 (table header weight 600 → 400 + lighter):** ratify? Scoped to `thead th` only; the
   Overline stays 600 everywhere else.
4. **Command-menu scope (§5):** confirm the Quick-actions set for v1 — I assumed New task / Write weekly
   update / Add log entry / Navigate / Recent. Should record-search be in v1 or deferred (it needs a
   search endpoint)?
5. **Notifications:** today a stub. Confirm it becomes a **rail utility item** (kit: Search /
   Notifications / Settings) rather than returning to a top bar. Out of first-slice scope to build, but
   the IA slot should be reserved.
