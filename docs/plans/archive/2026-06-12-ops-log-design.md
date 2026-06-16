# Design-Plan — Ops Log (daily ops feed) UI (P2-3)

- **Spec:** `docs/specs/ops-log.spec.md` (FR-030..062, NFR-008/009/010, AC-060..082/090/091).
- **Eng-plan:** `docs/plans/2026-06-12-ops-log.md` — its UI tasks **T-300..T-372** reference this file
  for component anatomy, the token map, and the state inventory. This plan owns the **UI design**; the
  eng-plan owns the schema / RLS / data-layer / wiring contracts.
- **Visual authority (SIGNED):** `docs/design-mockups/mock-daily-ops-feed.html` — the **generic
  typed-event stream** framing (single ~1080px density-mode column; **source badge only** + muted type
  text; needs-attention warning tint + 2px left rule + linked-task line; phone ~390px frame with a
  co-located 44px "+ Add" submit). The kitchen-specific-tabs alternate in mock history is **dropped**
  (WALL-4 resolved by OD-P2-15..19). Every layout call below anchors to this mockup.
- **Identity authority:** `DESIGN.md` (adopted from PMO; "calm, dense, data-first"). This plan
  **applies and extends** it — it never re-skins. Tokens-first: every visual decision names a token, no
  raw hex/px in the built UI beyond a token's own value. The three new mappings (§3) **reuse existing
  hues** — no new brand — and are flagged for owner sign-off (§9).
- **Vocabulary (NFR-009, CONTEXT.md, used exactly):** **Log entry · Ops Log · Needs attention ·
  Business Unit** (source) · **Task** (the linked reference). The word **"event" must not appear** in
  user-facing chrome — the mockup's legacy `.event` CSS class / "events" copy are pre-rename fixtures;
  the built UI says **"log entr(y/ies)"**. Page title is **"Daily ops feed"** / strip says "ops",
  never "event".
- **Language (NFR-010, OD-P0-2):** **EN chrome**, **ID content**. Labels, buttons, column heads,
  empty/error copy in English; user-authored `title`/`detail` render as-is in Indonesian. Examples in
  this plan follow that split (e.g. chrome "Needs attention", content "Stock opname mingguan tertunda").

---

## 1. Reuse-first inventory (what already exists — mirror, don't reinvent)

The system already ships the primitives this feature needs. The discipline here is **mirror the
existing token-bearing components**, extract two small new ones, and add exactly three token mappings.

| Need | Existing source of truth | How this feature uses it |
|---|---|---|
| Tinted-status pill (dot + tint + AA text) | `components/tasks/StatusPill.tsx` + `.css` | The **canonical pill grammar**. The linked-task status reference reuses `StatusPill` directly (FR-034). New source badge / type chip follow the same `.pill`/`.dot` skeleton. |
| Late/on-time warning pill | `components/weekly/TimingChip.tsx` + `.css` | The **needs-attention amber** treatment is the same `warning/18%` + `warning-foreground` family (TimingChip-late). The strip-amber mirrors its tint. |
| Owner avatar + name + "+N" | `components/tasks/OwnerCell.tsx` | NOT used on the feed (a Log entry has **no owner/RACI** — OD-P2-16). Its `.ownav` avatar-tint pattern is the reference for any future per-author chip; **not** rendered in P2-3. |
| Dense list page (toolbar seamed to body, filters, skeleton, empty, error, mobile card reflow, `useIsDesktop`) | `pages/TasksPage.tsx` | The **structural reference** for `OpsPage`: same toolbar grammar (`.control` selects, `.seg`, `.archived-toggle`), same `SkeletonRow`/`.error-banner`/`.empty-state` patterns, same `useIsDesktop()` single-render reflow. |
| Create-form field grammar | `pages/TaskCreate.tsx` | The **structural reference** for the Add form: `.tc-field`/`.tc-label`/`.tc-input`/`.tc-select`/`.tc-textarea`, `aria-required`/`aria-invalid`/`aria-describedby`, submit-disabled + inline error, primary-unit default via `viewer.roles[0].business_unit_id`. |
| Strip pattern (pill + sentence + trailing link, loading/error per-pane) | `pages/MyWeek.tsx` `WeeklyUpdateStrip` | The **exact pattern** the ops strip mirrors — 24px pill, `flex-wrap`, `minHeight 60`, `12px 20px` padding, trailing `text-primary` link, independent load-state machine. |
| Single-render breakpoint hook | `shell/useIsDesktop()` (`(min-width: 768px)`, synchronous first paint) | The feed's desktop-row vs phone-block branch (DESIGN.md DataTable-reflow rule, OD-W4-4). |
| WIB day math | `lib/week.ts` (`wibDayRange`, added in eng-plan T-211) | The feed-time WIB render + the strip "today" window. |

**Anti-slop posture (taste checklist, folded in):** left-anchored work-tool layout (no centered hero,
no centered empty states — empty copy is left-aligned like `TasksPage`); **calm** source badges (one
quiet tinted-pill treatment, NOT a per-unit rainbow — §3.1); borders not shadows; realistic Gordi data
in every state example (ID content); `tabular-nums` on every time/quantity; mono **only** on machine IDs
inside `detail`; no double badge (source badge is the only badge per row); no nav badge-counts.

---

## 2. Component breakdown

```
OpsPage (route /ops, replaces placeholder)          ── feed page, §4
├─ PageFrame + PageHead("Daily ops feed", subtitle: "<weekday>, <date> · N log entries")
├─ OpsToolbar (seamed to feed card)                 ── filters, §4.2
│   ├─ Source filter   (Business Unit select — "All sources" + per-unit)
│   ├─ Type filter     (event_type select — All / Production / Receiving / QC / Follow-up / Other)
│   ├─ Show-archived toggle (mirror TasksPage .archived-toggle)
│   └─ "+ Add log entry"  (primary, opens OpsAddForm; desktop placement)
├─ OpsFeed (desktop: row list; phone: block list — useIsDesktop branch)
│   └─ OpsLogRow  ×N                                 ── one Log entry, §4.3
│       ├─ time         (occurred_at WIB, tabular, 46px col)
│       ├─ OpsSourceBadge (Business Unit name)       ── NEW primitive, §3.1
│       ├─ OpsTypeText   (event_type, muted)         ── NEW primitive, §3.2
│       ├─ title         (.ev-text, ID content)
│       ├─ detail meta   (optional; machine IDs in mono)
│       ├─ needs-attention treatment (row tint + left rule when needs_attention) ── §3.3
│       └─ LinkedTaskRef (optional: link icon + task title + StatusPill)  ── §4.4
├─ states: loading skeleton · empty (per-filter) · error (inline retry) · archived-shown
└─ OpsAddForm (modal over /ops — recommended; §5)
    ├─ Business Unit (select, primary-unit default)  *required
    ├─ Type          (select, default "Other")
    ├─ Title         (text)                           *required
    ├─ Detail        (textarea, optional)
    ├─ Occurred at   (datetime-local, default now, editable)
    ├─ Needs attention (toggle)
    └─ Linked Task   (select/combobox over mos.tasks, optional)

MyWeek ops strip (replaces static "0 events" placeholder)  ── §6
└─ OpsStrip (count pill + sentence + "Today on Ops →"; amber when needs-me; loading/error)
```

**New components to build:** `OpsSourceBadge`, `OpsTypeText` (or fold into the row), `OpsLogRow`,
`OpsFeed`, `OpsToolbar`, `OpsAddForm`, `OpsStrip`. **Reused as-is:** `StatusPill` (linked-task status),
`PageFrame`/`PageHead`, `useIsDesktop`. **CSS strategy:** match the repo convention — a single inline
`<style>{...}` block in `OpsPage.tsx` using `hsl(var(--token))` (as `TasksPage`/`TaskCreate` do), plus
small co-located `.css` files for the two extracted pill-family primitives (as `StatusPill.css` /
`TimingChip.css`). The two new primitives' tints map to ratified `:root` tokens where they exist.

---

## 3. New token mappings (reuse existing hues — owner sign-off, §9)

All three reuse hues already in `DESIGN.md`; **no new brand color, font, or border value**. Each follows
the **Tinted-Status Rule** (hue at ~10–18% bg + a darkened-AA text variant + optional 6px dot) so it
reads as part of the adopted system, not a new vocabulary.

### 3.1 Source badge (Business Unit) — `OpsSourceBadge`

The source badge names the **Business Unit** that a Log entry came from. Per the signed mockup it is the
**only** badge on a row (no source+type double badge). **Calm, not a rainbow:** the default is **one
neutral treatment for all units** (`badge-status` token: `secondary` bg + `muted-foreground` text). The
mockup tints **two** units categorically (Kitchen / Roastery) for floor-scannability; we keep that as an
**opt-in two-tone**, never a full per-unit palette (that would break The One Blue Rule and the calm
posture). Beyond the two mocked units, every other Business Unit (Cafe Ops, Sales, Finance & People)
uses the **neutral** badge.

| Variant | Background token | Text token | Dot | Rationale |
|---|---|---|---|---|
| **Neutral (default, all units)** | `secondary` (`hsl(240 4.8% 95.9%)`) | `muted-foreground` (`hsl(240 4% 40%)`) | none | `badge-status` component token verbatim. The calm default. |
| **Kitchen and Bar** (mocked) | `primary` @ 10% (`hsl(221 83% 53% / 0.10)`) | `--status-open-text` (`221 75% 38%`) | `primary` 6px | The mocked categorical tint; mirrors the OwnerCell `.ownav` blue-tint. Categorical, non-interactive — within The One Blue Rule (never an action). |
| **Roastery** (mocked) | `violet` @ 12% (`hsl(262 83% 58% / 0.12)`) | `--status-violet-text` (`262 60% 42%`) | `violet` 6px | Categorical violet — DESIGN.md's exact sanctioned non-interactive use. |

**Proposed tokens** (`:root`, named so the mapping is the applied value, mirroring the status-pill
tokens): `--ops-source-default-bg/-text` (= `secondary` / `muted-foreground`),
`--ops-source-kitchen-bg/-text`, `--ops-source-roastery-bg/-text`. Implementation maps `business_unit_id`
→ variant via a small lookup (kitchen/roastery slugs tinted, all else neutral); a unit with no mapping
falls back to neutral safely. **Owner decision (§9 Q1):** confirm only Kitchen+Roastery get a categorical
tint, or all-neutral, or a named tint for one more unit.

Badge geometry = `badge-status` token: 20–22px tall, `rounded.full`, `label` type (12px/600), `0 8-9px`
pad, leading 6px dot on the tinted variants.

### 3.2 Type chip / text (`event_type`) — `OpsTypeText`

Per the signed mockup (delta #2) the `event_type` is **muted text, not a second badge** — quiet, so it
never competes with the source badge. Label-mapped EN chrome:

| `event_type` | Display label (EN chrome) | Token |
|---|---|---|
| `production` | Production | — |
| `receiving` | Receiving | — |
| `qc` | QC | — |
| `follow_up` | Follow-up | — |
| `other` | Other | — |

Treatment: `label` type (12px/600), `muted-foreground` color, sits inline after the source badge with an
8px gap (mock `.etype`). **No background, no border** in the default feed — it is text. *(If the owner
later wants it as a quiet chip rather than text, the fallback mapping is `secondary` bg +
`muted-foreground` text at `badge-status` geometry — the same neutral badge as source-default. Default is
text per the signed mock; §9 Q2.)*

### 3.3 Needs-attention treatment — the amber state

The visible "something waits on the floor" signal, used in **three places** (row tint, mockup
`.event.attn`; the strip amber, §6; and as the conceptual sibling of the late-update amber). All from the
**warning** hue via the Tinted-Status Rule — the **same family as `TimingChip`-late**:

| Surface | Background token | Accent | Text on tint |
|---|---|---|---|
| **Feed row** (`needs_attention = true`) | `warning` @ 7% fill (`hsl(43 96% 56% / 0.07`) | 2px **left rule** `warning` (`hsl(43 96% 56%)`); `rounded.sm` right corners | row text stays `foreground`; the row's own labels keep their tokens |
| **My Week strip amber** (§6) | `warning` @ 18% pill (`hsl(43 96% 56% / 0.18)`) | `warning` 6px dot | `warning-foreground` (`hsl(22 78% 26%)`) — the deep-brown AA text |

**Proposed tokens:** `--ops-attn-row-bg` (= `warning / 0.07`), `--ops-attn-rule` (= `warning`),
`--ops-attn-strip-bg` (= `warning / 0.18`), `--ops-attn-strip-text` (= `warning-foreground`).

> **Anti-slop / DESIGN.md guard — the left rule.** The skill anti-slop list bans `border-left > 1px` as a
> decorative side-stripe. This is the one **deliberate, signed exception**: it is **2px** (minimal),
> carries real state (needs-attention, not decoration), and is exactly what the owner approved in the
> signed mockup. It pairs with the fill tint (not a bare stripe). Flagged here so the design-reviewer
> reads it as intentional, not as the banned pattern.

---

## 4. Ops Log feed page (`/ops`) — layout, states, tokens

### 4.1 Frame & header (FR-030, OD-P0-7 density mode)

- `PageFrame` shell (adopted rail + breadcrumb, already in place). Content in a **single column,
  `max-width: 1080px`, centered** (mock `.col`) — density-mode single column, no side asides.
- `PageHead` — title **"Daily ops feed"** (`page-title` token: 24/700/-0.02em), subtitle
  `muted-foreground` 13px: `"<weekday>, <date> · N log entries"` (tabular count; EN chrome). Example:
  `"Tuesday, 10 Jun 2026 · 4 log entries"`.
- The feed sits in one `card` (`card` token: white bg, 1px `border`, `rounded.md`) with the toolbar
  seamed to the top (mirror `TasksPage .assembly`, top corners rounded, seam squared).

### 4.2 Toolbar / filters (FR-035/036/037)

Mirror `TasksPage .toolbar` grammar (flex-wrap, `8px` gap, `10px 12px` pad, bottom `border`):

- **Source filter** — a `.control` `<select>` (mock shows chips; use the **select** to match the shipped
  TasksPage control grammar and keep parity — chips are a visual-only delta, select is the system's
  filter primitive): label "Business unit", options "All sources" + each unit from
  `directory.getBusinessUnits()`. Tokens: `input` border, `background` fill, `rounded.md`, 32px,
  `muted-foreground` label + chevron.
- **Type filter** — `.control` `<select>`: label "Type", options All / Production / Receiving / QC /
  Follow-up / Other. Same tokens.
- **Show archived** — `.archived-toggle` checkbox verbatim from TasksPage (`input` border, 16px checkbox,
  `accent-color: primary`, "Show archived" label).
- **"+ Add log entry"** — primary button (`button-primary` token: `primary` bg, `primary-foreground`,
  `rounded.md`, 32px, brand `0 1px 2px` shadow), right-aligned on the toolbar (desktop) and in a
  co-located 44px phone submit bar (FR-038). Verb+object label.

> Decision: filters are **server-side** (`listLogEntries({ businessUnitId, eventType, includeArchived })`)
> per the eng-plan data layer; "All" clears each. Selecting a filter re-queries (no client-only filtering)
> so the empty state reflects the real filtered set.

### 4.3 Feed rows (FR-031/032/033) — `OpsLogRow`

Desktop row (mock `.feed .event`, 44–48px, `min-height 46px`, `11px 4px` pad, bottom divider
`border / 70%`):

```
[ time 46px ] [ source badge ] [ type text ]            ← ev-head row (8px gap, baseline)
              [ title — .ev-text, 14px body, ID content ]
              [ detail meta — 12px muted-foreground, mono IDs ]   (optional)
              [ linked-task ref line ]                            (optional, §4.4)
```

- **time** — `occurred_at` rendered WIB (`HH:mm`), `muted-foreground` 12px, **tabular**, fixed 46px
  column (mock `.time`). NFR-005: WIB via `lib/week.ts`, no host-tz leak.
- **source badge** — `OpsSourceBadge` (§3.1).
- **type text** — `OpsTypeText` (§3.2), `muted-foreground`.
- **title** — `body` token (14px), `foreground`. ID content verbatim
  (e.g. "Roast batch Ethiopia Guji selesai QC").
- **detail meta** — optional second line, `muted-foreground` 12px; machine identifiers (`#R-882`,
  `#G-114`, `25.0 kg`) in the **mono** face (`mono` token, the Mono-For-Identifiers Rule) and quantities
  `tabular`. Approver cues reuse status text tokens: "Approved Dina" in `--status-won-text`; "Blocked" in
  `--status-lost-text` (mock `.ok` / `.bad`).
- **needs-attention** — when `needs_attention`, apply §3.3 row treatment (`--ops-attn-row-bg` fill + 2px
  `--ops-attn-rule` left rule + `rounded.sm` right corners), and bump left padding so text doesn't collide
  with the rule (mock `.event.attn`).
- Rows are **not** individually clickable as a whole (a Log entry has no detail page in P2-3); the only
  in-row interactive target is the **linked-task reference** (§4.4) and the row's **edit/archive
  affordance** (below).
- **Edit / archive affordance (FR-024):** exposed **only** on entries the viewer may edit (author or
  manager — gated by `can_edit_log_entry` server-side; the UI hides the control otherwise). Rendered as a
  ghost `⋯` icon button (`button-ghost` token, 32px, revealed on row hover / always visible on phone for
  touch) opening a small popover (Edit, Archive/Unarchive) — overlay tokens (`popover` bg, `border`,
  overlay shadow, `accent` hover, Archive as a quiet item; **no destructive-red** — archive is reversible,
  not a delete). *P2-3 edit/archive UI is minimal: archive toggles `archived_at`; edit reuses the
  Add-form pre-filled. If owner prefers archive-only in this slice, edit can defer — §9 Q4.*

### 4.4 Linked-task reference (FR-034, NFR-006) — `LinkedTaskRef`

When `linked_task_id` is set, render an inline reference line (mock `.linked`): a 13px link icon +
**task title** (resolved **client-side** from `mos.tasks` — never a cross-schema embed) as a
`primary`-colored link (`Link` to `/tasks/:id`, the system's link-in-context use of the one blue), then
`·` + the task's **status** via **`StatusPill`** (reused verbatim). Example:
`🔗 SOP stock opname mingguan kitchen · [Blocked pill]`.

- **Degrade gracefully** (NFR-006, error table): if the title can't be resolved (task archived / out of
  view), show a plain non-link "linked task" label or hide the line — never retry an embed. The status
  pill renders only when status resolved.

### 4.5 States (FR-039, AC-066) — all four + archived-shown

| State | Trigger | Treatment (tokens) | Copy (EN chrome) |
|---|---|---|---|
| **Loading** | feed query pending | 3–5 skeleton rows (mirror `TasksPage SkeletonRow`): `secondary` blocks pulsing, time + badge + 2 text lines per row; `aria-busy="true"` + sr-only "Loading the Ops Log". | — |
| **Empty (no entries)** | zero rows, no filter | left-aligned `.empty-state`: title `foreground` 15/600, copy `muted-foreground` 13px, then the "+ Add log entry" primary. | Title: "No log entries yet today." Copy: "Kitchen, Roastery, and the floor show up here as things happen. Add the first one." |
| **Empty (per-filter)** | zero rows under an active source/type/archived filter | same `.empty-state`, copy keyed to the active filter. | e.g. source=Roastery: "No Roastery log entries match." · type=QC: "No QC log entries yet." · archived on, none: "No archived log entries." Always offer "Clear filters". |
| **Error** | query rejects | inline `.error-banner` (`role="alert"`): `destructive` text + outline Retry button; **toolbar/filters stay usable** (don't unmount them). | "Couldn't load the Ops Log" + Retry. |
| **Archived-shown** | Show-archived on | archived rows appear **visibly distinguished**: reuse the `.archived-tag` chip (`secondary` bg + `muted-foreground`, mock/TasksPage pattern) before the title, and the title in `muted-foreground` (de-emphasized). The needs-attention tint does **not** apply to archived rows in the strip-amber logic (FR-061 counts non-archived only). | "Archived" tag. |

### 4.6 Responsive — desktop (~1080px) + phone (<768px) (FR-038, AC-067)

- **Breakpoint:** `useIsDesktop()` (`min-width: 768px`, single-render, no flash) chooses **desktop rows**
  vs **phone blocks** — exactly the DESIGN.md DataTable-reflow rule (OD-W4-4). Exactly one branch in the
  DOM (no `aria-hidden` doubling).
- **Phone block** (mock `.phone .event`, ~390px target): row becomes a **block** — `ev-head` is a flex
  line with source badge + type + the time pushed to the right (`margin-left:auto`); title on its own
  line; detail/linked-task below; needs-attention tint preserved (left rule + fill, `-10px` margin trick
  from mock so the rule reaches the card edge). All affordances ≥44px (OD-P0-3): the `⋯` edit control and
  the linked-task link get `min-height: 44px` touch targets.
- **Co-located submit bar (phone):** a sticky/bottom **"+ Add log entry"** button, **44px** tall, full
  width, `button-primary` token + brand shadow (mock `.submit-bar .btn-primary`). This is the phone's
  primary add affordance (the toolbar add button is desktop-placed).
- The 1080px column is fluid below 1080 down to the phone breakpoint (padding shrinks `32px → 14px`).

---

## 5. "+ Add log entry" form (FR-040..047, AC-070..073)

**Recommendation: a modal dialog over `/ops`** (not a separate route). Rationale: the add action is
**fast, high-frequency, single-step** ("log a thing that just happened"), the user wants to **stay in the
feed** and see the new entry appear (FR-046), and there's no deep-link need (contrast TaskCreate, which is
a richer multi-party RACI form worth its own `/tasks/new` route). Use the **native `<dialog>`** element
(focus-trap + `Esc`-close built in; escapes the feed's overflow stacking context — the skill dropdown-
clipping rule) with `aria-labelledby` the form title. The phone submit-bar button opens the same dialog.
*(If the owner prefers a route for consistency with TaskCreate, the field grammar below is route-portable
unchanged — §9 Q3.)*

**Fields** (grammar mirrors `TaskCreate` `.tc-field`/`.tc-label`/`.tc-input`/`.tc-select`, all 36px,
`input` border, `rounded.md`, `:focus-visible` ring):

| Field | Control | Default | Required | Tokens / notes |
|---|---|---|---|---|
| **Business unit** | `<select>` | creator's **primary unit** = `viewer.roles[0].business_unit_id` (earliest-assigned role; the TaskCreate rule) | ✅ | `tc-select`; "Select business unit…" placeholder; editable to any unit. AC-070. |
| **Type** | `<select>` | **Other** | — | options Production / Receiving / QC / Follow-up / Other. AC-070. |
| **Title** | `<input type=text>` | empty | ✅ | `tc-input`; placeholder "What happened?" (EN chrome — content typed in ID); `aria-required`. AC-071. |
| **Detail** | `<textarea rows=3>` | empty | — | `tc-textarea`; placeholder "Optional — quantities, batch IDs, who signed off…". |
| **Occurred at** | `<input type=datetime-local>` | **now** (WIB) | — | editable to any instant ("log a 9am happening at noon", FR-044). `tc-input`. AC-072. |
| **Needs attention** | checkbox/switch | off | — | label "Needs attention" (CONTEXT term exactly); when on, a small inline preview hint in the §3.3 amber-text token so the author sees the consequence. AC-072. |
| **Linked Task** | `<select>` / typeahead over `mos.tasks` (by title) | none | — | optional; sets `linked_task_id`; empty → NULL. Reuse the people/BU directory `<select>` grammar; if task list is long, a filterable combobox (same field shell). FR-045. |

**Validation & states (FR-047, AC-071):**
- **Submit disabled** while Title is blank **or** no Business Unit chosen; inline cue under the offending
  field (`tc-field-error`, `destructive` 12px, `aria-describedby` + `aria-invalid` — the TaskCreate
  pattern). Submit label "Add log entry" (verb+object); `Cancel` ghost/outline.
- **Submitting:** button `aria-busy`, label "Adding…", disabled (TaskCreate pattern).
- **Submit error:** `.tc-submit-error` banner (`destructive` @10% bg + `destructive` text + `destructive`
  @25% border, `role="alert"`) above the form.
- **Success:** dialog closes; feed **re-queries** (or optimistic-prepends) so the new entry appears in
  `occurred_at` order without a full reload (FR-046, AC-073). Focus returns to the "+ Add log entry"
  trigger.
- The form **never sends** `org_id` / `created_by` (server-stamped — NFR-002); dispatch shape is
  `CreateLogEntryInput` with `origin: 'manual'` implicit (AC-072, proven at the data layer).

---

## 6. My Week ops-strip wiring (FR-060/061/062, AC-080/081/082) — `OpsStrip`

Replaces the **static "0 events" placeholder** at `MyWeek.tsx` lines ~183-206. Mirror the sibling
`WeeklyUpdateStrip` exactly: a `card` strip (`bg-card`, `border`, `rounded.md`, `min-height 60`,
`12px 20px` pad, `flex-wrap`), with its **own** load-state machine (loading / ready / error) so it
degrades **independently** of the weekly-update strip (AC-082). Data: `getTodayOpsSummary(now)` →
`{ count, needsAttention }` over the WIB-today window.

> **Vocabulary fix:** the placeholder copy says **"events"** — the wired strip must say **"log entries"**
> (NFR-009, "event" banned in chrome).

| Strip state | Count pill (tokens) | Sentence (EN chrome) | Trailing link |
|---|---|---|---|
| **Loading** | blank `secondary` pill shell, transparent text (no flash — WeeklyUpdateStrip pattern); `aria-busy` | (none / muted shell) | "Today on Ops →" |
| **Ready, N>0, none needs-attention** | `secondary` bg + `muted-foreground`, 24px, `rounded.full`: **"N today"** (tabular) | "N log entr(y/ies) on the floor today." | "Today on Ops →" |
| **Ready, N=0** | `secondary` + `muted-foreground`: "0 today" | "No log entries on the floor today." | "Today on Ops →" |
| **Ready, needs-me (any non-archived needs-attention today)** | **amber**: `--ops-attn-strip-bg` (`warning/18%`) + `--ops-attn-strip-text` (`warning-foreground`) + `warning` 6px dot: "**N today**" | "N log entr(y/ies) today · something needs attention." | "Review on Ops →" |
| **Error** | (suppressed) | inline "Couldn't load today's ops." + Retry (text-primary button, WeeklyUpdateStrip/TeamModule pattern) | link stays |

- **Amber rule (FR-061, eng-plan D-E):** a Log entry has no per-person assignee, so "needs me" =
  **any non-archived `needs_attention` entry in today's WIB day** (the org-readable set; Director
  resolution — NOT per-viewer). The amber is a **pull signal**, not a notification.
- Link target `/ops` always; label shifts to "Review on Ops →" in the amber state (verb cues the waiting
  work), neutral "Today on Ops →" otherwise. Both are standalone-meaningful link text.
- Strip remains **auxiliary strip 2** in the density-mode home composition (≤2 strips rule, OD-P0-7); no
  change to its slot.

---

## 7. Accessibility (WCAG-AA) — contrast, focus, semantics, keyboard

**Contrast (all AA-verified against the adopted tokens):**
- `foreground` on `card`/`background` ~AAA; `muted-foreground` (40% L) on white and on `secondary` clears
  AA (the DESIGN.md darkening). Source-badge text uses the **darkened** `--status-open-text` /
  `--status-violet-text` (both AA on their ≤12% tints — ratified). Needs-attention strip text uses
  `warning-foreground` (deep brown, AA on the 18% amber — same as TimingChip-late, already shipped).
- Type text is `muted-foreground` on `card` — AA. Due/approver cues reuse the AA status-text tokens.
- The **needs-attention row tint (7%)** is decorative reinforcement only; the signal is **not
  color-alone** — it is also carried by the **2px left rule** + (where present) the linked-task
  "Blocked" pill, satisfying SC 1.4.1 (use of color). The strip carries text ("something needs
  attention") + dot, not color alone.

**Focus & keyboard:**
- Global `:focus-visible` ring (`2px ring`, 2px offset) on every interactive element (filters, toggle,
  add button, `⋯` menu, linked-task link, all form fields, dialog buttons) — inherited, not overridden.
- Tab order follows DOM: toolbar (source → type → archived → add) → feed rows (each linked-task link, then
  edit control) → (dialog when open). The `<dialog>` **traps focus** and restores it to the trigger on
  close; **`Esc` closes** (native dialog; the DESIGN.md "overlays must add focus management + Esc" build
  gap is closed by using native `<dialog>`).
- Filters are real `<select>`/checkbox (native keyboard). The `⋯` popover is keyboard-operable (arrow/Esc)
  or, simplest, two plain buttons.

**Semantics / labels:**
- `OpsFeed` is a `<ul role="list">` of `<li>` entries (or an `aria-label="Ops Log"` region); each row's
  time is in a `<time datetime=...>` element. Source badge text is real text (the BU name), not
  color-only. The needs-attention state adds a visually-hidden "Needs attention" label or `aria-label` on
  the row so AT announces it (the tint/rule are visual-only).
- Skeleton: `aria-busy="true"` + sr-only `role="status"` "Loading the Ops Log". Empty state is a real
  heading + paragraph. Error is `role="alert"`.
- Add dialog: `aria-labelledby` the title; each field `<label htmlFor>`; required fields
  `aria-required` + `aria-invalid`/`aria-describedby` on error (TaskCreate pattern). The "Needs
  attention" toggle has an accessible name and `aria-checked` if a custom switch (or use native checkbox).
- Phone: all touch targets ≥44px (OD-P0-3).

---

## 8. Responsive breakpoint summary

| Width | Layout |
|---|---|
| **≥1080px** | single 1080px centered column; desktop feed rows (46px); toolbar inline with desktop "+ Add" button. |
| **768–1080px** | same desktop rows; column fluid, page padding shrinks; toolbar wraps (`flex-wrap`). |
| **<768px** (`useIsDesktop` false) | phone-block rows (time pushed right in ev-head, title/detail/linked stacked); needs-attention tint preserved; co-located 44px "+ Add log entry" submit bar; all targets ≥44px. |
| **920px** (rail collapse) | inherited from shell (rail → hamburger); not feature-specific. |

(Two distinct breakpoints, matching the system: 920px rail collapse, 768px row→block reflow.)

---

## 9. Open questions for the owner

1. **Source-badge tint scope (§3.1).** Confirm the calm default: **only Kitchen and Bar + Roastery** get
   a categorical tint (blue@10% / violet@12%), **all other Business Units stay neutral** (`badge-status`).
   Alternative: all-neutral (quietest), or add one more named tint. Recommendation: keep the two mocked
   tints + neutral-for-the-rest (matches the signed mockup; avoids a rainbow).
2. **Type as text vs quiet chip (§3.2).** Signed mockup renders `event_type` as **muted text** (no
   badge). Confirm we keep text (recommended — no badge soup), or promote it to a neutral chip.
3. **Add as modal vs route (§5).** Recommend a native `<dialog>` modal over `/ops` (fast, stay-in-feed).
   Confirm, or prefer a `/ops/new` route for parity with `/tasks/new`.
4. **Edit/archive UI depth in P2-3 (§4.3).** Spec gates edit + archive (author-or-manager) server-side.
   Confirm the feed ships the `⋯` edit+archive popover this slice, or **archive-only** now (edit deferred)
   to keep the slice tight. (Either way the affordance shows only to editors.)

None of these block the **schema / RLS / data-layer** PR (eng-plan PR-a); they shape **PR-b (feed +
form)** only. All are token/composition choices within the adopted system — **no new brand, font, hue,
or border value is proposed**; the three new mappings (§3) are alpha-tints and named aliases of existing
DESIGN.md hues, recorded here for sign-off and (on approval) to be added to `DESIGN.md` `:root` +
the "MOS additions" section like the RACI / progress-marker tokens before them.
