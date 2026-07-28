# v4 cross-cutting audit register — 2026-07-27

Produced by three independent, isolated read-only audits (accessibility · bilingual EN/ID layout · cross-surface consistency) run as one workflow, then deduplicated by a fourth agent. Every finding except #23 carries a live DOM or computed-contrast measurement. Not self-scored.

Owner gate: `OD-V4-4` — Nielsen >30 **app-wide**, not per surface.

---

# Audit Register — v4 Redesign (accessibility · bilingual layout · cross-surface consistency)

Merged from 3 independent audits, 24 raw findings → deduplicated below. No finding was independently confirmed by two *different* audits catching the *same* defect — each specialized lens caught things the others didn't. Where one audit raised multiple instances of one root cause, they're merged and marked **[same audit, multiple instances]**.

---

## P0

### 1. Bottom tab bar — Indonesian "Kotak Masuk" overflows its slot, every phone route
**Surface:** Bottom tab bar, all mobile routes, id locale, 320–375px
**File:** `mos-app/src/shell/bottom-tab-bar.tsx` / `bottom-tab-bar.css`
**Evidence:** Label scrollWidth **74px** (67px on the `<a class="bottom-tab">`) inside a **61px-wide slot** at 320px viewport — **21% overflow (13px)**. English "Inbox" in the same slot measures 32px scrollWidth, no overflow. Re-verified via live DOM measurement across `/work/tasks`, `/work/signals`, `/events`, `/inbox`, `/cafe`.
**Fix proposed by audit:** shrink font at ≤340px, let the tab size to content, or shorten the Indonesian string ("Kotak Masuk" → "Masuk").
**⚠️ See Owner-Conflict §1 below** — this exact defect already has a binding owner disposition that differs from the audit's proposed fix.

### 2. Café module — all 5 sub-pages hardcode English page titles + empty/error/banner copy, never routed through i18n
**Surface:** `/cafe/log`, `/cafe/plan`, `/cafe/stock`, `/cafe/review`, `/cafe/pushes` — H1s, empty states, offline/error banners
**File:** `mos-app/src/pages/kitchen-review-page.tsx` (+ `kitchen-log-page.tsx`, `kitchen-plan-page.tsx`, `kitchen-stock-page.tsx`, `kitchen-pushes-page.tsx`)
**Evidence:** Every H1 is a literal string ("Café · Log", "Café · Plan", "Café · Stock", "Café · Review", "Café · Pushes") with no `t()` call. Live on `/cafe/review`, 320px, id locale: breadcrumb correctly reads **"Kafe · Tinjauan"**, H1 directly below reads **"Café · Review"** — mixed-locale on one screen, screenshotted. Additional confirmed-live English strings: `kitchen-review-page.tsx` — "{N} submitted ·" (573), offline banner (586), error banner (606), EmptyState title "Nothing to review" / copy / note (614-616), button "Refresh" (623); `kitchen-log-page.tsx:351` "No active WIP items"; `kitchen-plan-page.tsx:328,448`; `kitchen-stock-page.tsx:156`; `kitchen-pushes-page.tsx` outbox meta/copy (328, 364, 300) + its own hardcoded H1, live-confirmed as "Café · Pushes / 81 in outbox".
**Why P0:** This is the floor-operations module — the one most likely used by Indonesian-reading staff on a phone — and every title/empty/error/banner on it is silently stuck in English regardless of locale.
**Fix:** Route all listed strings through `messages.ts` + `useT()`; reuse existing translated `nav.kitchen.*` keys for the 5 titles, add new keys for each empty-state/banner/button.

### 3. Home KPI tiles + Money dashboard — revenue/margin delta text and freshness stamp carry hardcoded English fragments mid-Indonesian sentence
**Surface:** Home top KPIs, all Money dashboard KPI/chart cards
**File:** `mos-app/src/lib/sales-dashboard.ts` (`formatDelta`), `mos-app/src/components/dashboard/freshness-label.tsx`
**Evidence:** Live on `/money`, 320px, id locale: `"Pendapatan 7 hari terakhir ... +4,2% vs prev"`; `"5 cabang · as of 23 Jul 2026, 13:00 WIB"`. Root cause: `formatDelta()` returns `` `${sign}${pct}% vs prev` `` and the literal string `'no comparison'` as plain string literals (it's a `.ts` utility, can't call `useT()`); `freshness-label.tsx` has `prefix = 'as of'` as a hardcoded default prop, never imports `useT()`.
**Why P0:** These are the most prominent numbers on the two most-viewed pages in the app; every figure a finance/leadership user reads carries an English fragment mid-Indonesian-sentence — the exact "mixed-locale surface" the bilingual requirement forbids.
**Fix:** Thread `vsPrevLabel`/`noComparisonLabel`/`prefix` into these utilities from the calling component via `useT()`, since neither is itself a component.

---

## P1

### 4. Signal record page has zero heading elements
**Surface:** `/work/signals/:signalId`, 1280×860 and 375×812
**File:** `mos-app/src/components/signals/signal-record.tsx`
**Evidence:** `document.querySelectorAll('h1,h2,h3,h4,h5,h6').length === 0` on a page with a visually bold title and three section labels (SIGNAL / REACH & RESPONSE / DISCUSSION) — none are heading elements.
**Fix:** Mark the record title `<h1>`/`<h2>` (matching PageFamilyFrame) and SIGNAL/REACH & RESPONSE/DISCUSSION `<h2>`/`<h3>`, matching the already-correct task-detail record page pattern.

### 5. `document.documentElement.lang` never updates on locale switch
**Surface:** App-wide, verified via Profile → Language switch, 1280×860
**File:** `mos-app/src/i18n` (`use-t.ts`, `messages.ts`)
**Evidence:** Selecting "Bahasa Indonesia" changed all visible text and `document.title` (e.g. "Profil Pribadi — Gordi MOS"), but `document.documentElement.lang` measured **'en' both before and after**.
**Fix:** Set `document.documentElement.lang` to the current locale wherever the i18n locale changes (locale-change effect in the provider).

### 6. Task create drawer — required-field asterisk fails contrast AND has no programmatic required state
**Surface:** `/mos/work/tasks/new`, 4 required fields (Title/Team/Assignee/Supervisor)
**File:** `mos-app/src/components/tasks/task-drawer.tsx`
**Evidence:** (1) Red `*` measures **3.82:1** (rgb(229,72,77) on rgb(255,252,247)) vs the 4.5:1 AA minimum, canvas-sRGB computed. (2) `document.querySelectorAll('input[required],select[required],textarea[required]')` returned **0** across the 4 required inputs.
**Fix:** Darken the asterisk to ≥4.5:1; add `aria-required="true"` (or native `required`) to all 4 fields.

### 7. Status/filter pill text falls below AA contrast, systemically, app-wide
**Surface:** Café · Pushes status column, Inbox filter tabs, 1280×860
**File:** `mos-app/src/index.css` (design tokens), instances in `kitchen-pushes-page.tsx`, `inbox-page.tsx`
**Evidence:** "Terkirim" (Sent) pill **4.36:1** (rgb(0,130,77) on rgb(230,246,235)) — repeated in **70 of 77** flagged nodes on Pushes; "Gagal" (Failed) pill **4.27:1** (rgb(173,98,0) on rgb(255,247,194)). Separately, the selected "Semua" filter-tab on Inbox measures **2.98:1** (rgb(37,36,34) on rgb(62,99,221)) — the widest-margin failure, confirmed by measurement and screenshot.
**Why:** Systemic design-token issue, not one-off — every status badge in every operational table plus the selected-pill-tab token pair.
**Fix:** Darken badge text (or adjust background) to clear 4.5:1; the selected-tab-pill pair needs the largest correction.

### 8. Two nav destinations both surface the accessible name "Signals"/"Sinyal"
**Surface:** Sidebar rail + bottom tabs, every authenticated route
**File:** `mos-app/src/i18n/messages.ts` (~594-605 en, ~1597-1608 id); `mos-app/src/pages/events-page.tsx`
**Evidence:** `<a href="/mos/events">Sinyal</a>` alongside `<a href="/mos/work/signals">Arsip Sinyal2</a>` — /events' own `<h1>` and `document.title` also read "Signals"/"Sinyal" with no distinguishing text.
**Why:** WCAG 2.4.4/2.4.2 — a screen-reader user pulling a link/heading list hears two identical "Signals" entries.
**⚠️ See Owner-Conflict §2 below** — this traces to a named, ratified decision (OD-V4-2) that the project's own ledger has already flagged as resolved-on-a-false-premise.

### 9. `record-collection-result__label` clips text without ellipsis at 320px, across list pages, both locales
**Surface:** Tasks, Signals, Signals-Archive, Objectives, Projects & Processes list headers, 320px **[same audit, multiple instances — merged]**
**File:** `mos-app/src/components/record-collection/record-collection.tsx` (`.record-collection-result__label`)
**Evidence (id locale, hard clip mid-word, no ellipsis):** Tasks "Semua · Tugas" scrollWidth 95 vs clientWidth 82 (13px cut, renders "Semua · Tug"); Work/Signals "Semua · Sinyal" 95 vs 86 (9px); Signals Archive "Semua · Arsip Sinyal" 130 vs 86 (44px); Objectives "Aktif · Objective" 103 vs 86 (17px). English on Tasks fits exactly (61/61) — proves it's Indonesian-string-length triggered. **Projects & Processes clips in BOTH locales**: id "Aktif · Proyek & Proses" 142 vs 86 (56px); en "Active · Projects & Processes" 184 vs 124 (60px) — confirms the container is undersized independent of translation, not purely a bilingual-expansion bug.
**Fix:** Let the label wrap to a second line, reduce font-size/spacing at ≤340px, or give the container `flex-shrink` so the count badge yields space first.

### 10. Signal record's attention badge shows the raw English enum, not the translated label
**Surface:** `/work/signals/:signalId`, attention/severity badge
**File:** `mos-app/src/components/signals/signal-record.tsx:68`
**Evidence:** Live body text: `"...morning rush.\nUrgent\nTerjadi 23 Jul 2026, 22:57 WIB"` — "Urgent" untranslated, everything else id. List view's equivalent badge (`signal-feed-rows.tsx:116`) correctly renders "Mendesak" via `t('signals.archive.attentionUrgent')`.
**Fix:** Have `signal-record.tsx` call the same `t()` lookup / a shared `attentionLabel(t, attention)` helper instead of rendering the raw enum.

### 11. `nav.work.objectives` Indonesian value was never actually translated
**Surface:** i18n catalog — rail nav, breadcrumb, Objectives page collection-result label
**File:** `mos-app/src/i18n/messages.ts` lines 621 (en), 1624 (id)
**Evidence:** en='Objectives', id='Objective' — a singularized copy of the English word, not a missing key (parity check passes, 906/906). Surfaces live as "Aktif · Objective" in id locale.
**Fix:** Translate properly (e.g. "Sasaran"/"Objektif") in `messages.ts`.

### 12. Café Log vs Café Plan use two contradictory quantity-entry models for the identical job
**Surface:** `kitchen-log-page.tsx` vs `kitchen-plan-page.tsx`, same module, same shift
**File:** `mos-app/src/pages/kitchen-plan-page.tsx:238-246` (`PlanQtyStepper`), vs `kitchen-log-page.tsx:477-506` (`renderLogCard`, typed field)
**Evidence:** Log renders a blank-at-rest, placeholder-anchored, right-aligned `<input inputmode=decimal>` (44px tall, `.kl-card`). Plan still renders `PlanQtyStepper` — a −/+ tap stepper (44px control, `mos-app/src/components/kitchen/plan-qty-stepper.css:16,34`) inside the generic `<dl>` card (`.dt-card`, 119.5px tall at `/mos/cafe/plan`).
**Why:** This is the **same defect DD-5 (below) already killed on Log** — it just wasn't ported to Plan. Not a new design question; a porting gap.
**Fix:** Port `renderLogCard`'s typed-field pattern to Café Plan's phone card; retire `PlanQtyStepper`.

### 13. Kitchen Log — Discard button uses the styled `ConfirmDialog`; the route-leave guard on the same page uses raw `window.confirm`
**Surface:** `kitchen-log-page.tsx` — Discard button vs `RouteLeaveGuard`
**File:** `mos-app/src/pages/kitchen-log-page.tsx:542,631-643`; `mos-app/src/shell/route-leave-guard.tsx:40`
**Evidence:** Discard confirm (634-643) uses the app's `ConfirmDialog`; the code's own comment (631-633) says this replaced `window.confirm`. Two lines earlier, `RouteLeaveGuard` (542) calls raw `window.confirm(message)` at `route-leave-guard.tsx:40` for the identical "lose staged quantities" event.
**Fix:** Route `RouteLeaveGuard`'s confirmation through `ConfirmDialog`/`ModalShell` (the primitive `dirtyLeaveGuard` already uses), or document a ratify-before-merge exception if native confirm is intentionally kept for the beforeunload case.

---

## P2

### 14. A non-navigational action button is a direct child of `<nav aria-label="Primary">`
**Surface:** Mobile bottom nav, 375×812, every route
**File:** `mos-app/src/shell/bottom-tab-bar.tsx`
**Evidence:** `<button type="button" class="mobile-action-launcher" aria-label="Buka aksi"><span aria-hidden="true">+</span></button>` confirmed via `outerHTML` inside `<nav>`; opens a create/action sheet, not a destination.
**Fix:** Move the '+' outside `<nav>` (e.g. sibling FAB in the app shell).

### 15. Nav rail badge concatenates into an unpronounceable run ("Tugas12")
**Surface:** Sidebar rail, every route, 1280×860
**File:** `mos-app/src/shell/destinations.tsx` / `app-shell.tsx`
**Evidence:** `<a aria-current="page">…<span>Tugas</span><span class="…badge…">12</span></a>` announced as one run "Tugas12"; Signals link similarly "Sinyal2"/"Signals2".
**Fix:** Add a visually-hidden separator, e.g. `<span class="sr-only">, 12 open</span>` or `aria-label="Tasks, 12 open"`.

### 16. Heading level skips h1 → h3 on a recurring shared component
**Surface:** Task detail, Money, Inbox, Café · Review, 1280×860 — 4+ independent pages
**File:** `mos-app/src/components/ui/state-kit.tsx` (`EmptyState`) + section-header component on money/task-detail
**Evidence:** h1 immediately followed by h3 on all 4 pages (Task detail's "Detail tugas", Money's "Pendapatan harian", Inbox's "Semua sudah terbaca" empty state, Café · Review's "Nothing to review" empty state).
**Fix:** Make the shared header component's `headingLevel` prop (already present per source, e.g. `EmptyState headingLevel={2}`) consistently passed as h2 at call sites.

### 17. Multiple touch targets under the 44×44px minimum
**Surface:** Money, Café · Log, sidebar nav rail, Tasks/Signals/Projects tables, Projects & Processes / Objectives filters — 1280×860
**File:** `mos-app/src/pages/dashboard-page.tsx` (info tooltips), `mos-app/src/shell/app-shell.tsx` (nav rail rows)
**Evidence (`getBoundingClientRect()`):** 8 '?' tooltip buttons on Money **14×14px**; 2 collapse chevrons on Café · Log **24×24px**; nav-rail rows **36px** tall app-wide (215×36 / 203×36); table/list rows on Tasks/Signals/Projects **36px** tall; sortable column headers **16-38px**; filter inputs on Projects & Processes/Objectives **810/653×20px**.
**Fix:** Pad the '?' tooltip and chevron hit areas to ≥44×44 (keep the visual glyph small); bump nav-rail/table row height or document a desktop-only dense-table exception, but don't carry 36px rows into touch breakpoints.

### 18. Adjacent nav-rail links have only ~2px edge-to-edge spacing
**Surface:** Sidebar nav rail, 1280×860, every route
**File:** `mos-app/src/shell/app-shell.tsx` (nav rail CSS)
**Evidence:** Consecutive `<a>` elements (Home/Work/Tasks/Projects/Objectives/Signals/Events/Money/Inbox) separated by ~2px; Home-dashboard list rows separated by ~1px.
**Fix:** Add 4-6px vertical margin between rows, or increase row height.

### 19. `--row-min-h` token is 50px globally but 52px inside `.record-collection-view` only
**Surface:** Money, all remaining Café pages, Follow-ups, Sales revenue table vs Tasks/Signals archive/Objectives/Projects & Processes
**File:** `mos-app/src/index.css:306` (global token) vs `mos-app/src/components/record-collection/record-collection.css:29-33` (local override)
**Evidence:** `getComputedStyle` on `/mos/money` resolves `--row-min-h` to **50px**; on `/mos/work/tasks` `.record-collection-view` resolves it to **52px**. DESIGN.md states 52px in its frontmatter and three prose sections.
**Fix:** Either raise the global token to 52px (removing the need for the override) or apply the same override to `dashboard/data-table.css`'s `.dt-table tbody tr`.

### 20. Three different verbs name the same "create record" action across surfaces
**Surface:** Tasks/Signals/⌘K vs Objectives/Projects catalog vs Admin create-person dialog
**File:** `mos-app/src/i18n/messages.ts:144,157,677,683,547,562`; `mos-app/src/pages/objectives-page.tsx:141,155`; `mos-app/src/pages/projects-processes-page.tsx:158,186`; `mos-app/src/components/admin/create-person-dialog.tsx:197,387`
**Evidence:** "Create task"/"Create Task" (Tasks, Signals, ⌘K) vs "Add objective"/"Add project or process" (Objectives/Projects) vs Admin dialog uses **both** — heading "Add person" but submit button "Create person" in the same modal.
**Fix:** Standardize on "Create X"; fix the Admin dialog's internal disagreement (heading vs button) at minimum.

---

## P3

### 21. Home dashboard live counters have no `aria-live`/`role=status` region
**Surface:** Home, 1280×860 and 375×812
**File:** `mos-app/src/pages/home-page.tsx`
**Evidence:** `document.querySelectorAll('[aria-live],[role=status],[role=alert]')` returned **0** on Home, though the pattern exists elsewhere (Task detail, Objectives).
**Fix:** Wrap counters in `aria-live="polite"` if/when they become live-updating (not urgent for current reload-driven implementation).

### 22. Browser tab title (`<title>`) hardcodes English regardless of locale
**Surface:** Signal record page, Budget page
**File:** `mos-app/src/pages/signals-archive-page.tsx:369`; `budget-page.tsx:45`
**Evidence:** `` `${title} · Signal — Gordi MOS` `` / `'Budget — Gordi MOS'` literal strings. Live: id-locale signal record produced tab title "...morning rush. · Signal — Gordi MOS" (word "Signal" untranslated).
**Fix:** Route through `t('nav.signals')`/`t('plan.budget.title')` — both already exist and are correctly translated.

### 23. Budget/Pricing empty-state titles hardcoded English — **unmeasured live, source-grep only**
**Surface:** Budget page, Pricing page
**File:** `mos-app/src/pages/budget-page.tsx:192` ("No BOM snapshot data yet"); `pricing-page.tsx:107` ("No budgets captured yet")
**Status: flagged unmeasurable** — the audit states explicitly: *"Not live-verified in id locale this session (route not reached before the audit window closed — see limitations)"*; confirmed only via source grep against the same pattern verified live elsewhere.
**Fix:** Route through `messages.ts` + `useT()`, matching other EmptyState titles on the same pages that already do.

### 24. Café Plan's generic `<dl>` card is 2.7× taller than Café Log's compact row for the same job class — **[same underlying gap as #12, downstream measurement]**
**Surface:** `/mos/cafe/plan` vs `/mos/cafe/log`
**File:** `mos-app/src/components/dashboard/data-table.css` (`.dt-card`) vs `mos-app/src/pages/kitchen-log-page.tsx:477` (`.kl-card`)
**Evidence:** Café Plan card measured **119.5px** tall live vs Café Log's **44px** — for what DESIGN.md's "Compact capture row" section describes as the same job class.
**Fix:** Same as #12 — give Café Plan's `DataTable` a `renderCard` producing Log's compact anatomy.

---

# Findings that conflict with a binding owner decision

Per `docs/v4-inheritance.md`. **Not resolved here — for the owner.**

### Conflict §1 — "Kotak Masuk" overflow fix vs owner-directed Inbox label decision

**Finding #1** (P0, above) proposes fixing the tab-slot overflow by shortening the Indonesian string ("Kotak Masuk" → "Masuk") or letting the tab resize.

**Binding decision it touches — `OD-V4-5`, mobile shell decisions, point 8 (verbatim):**
> *"Indonesian label for Inbox stays "Inbox" (owner-directed) — not "Kotak Masuk", which measured 62px in a 61px tab slot. This removes the bilingual overflow without touching the +."*

The owner already ratified a different fix for this exact defect (don't translate the word at all) than the one the bilingual audit proposes (translate it, but shorter). The audit also shows the code currently still renders "Kotak Masuk" (74px/67px scrollWidth in a 61px slot) — i.e. either OD-V4-5#8 was never implemented, or it regressed. Owner call: which string, and whether the fix has actually landed.

### Conflict §2 — Duplicate "Signals" nav name vs OD-V4-2

**Finding #8** (P1, above): two distinct nav destinations (`/mos/events` and `/mos/work/signals`) both carry the accessible name "Signals"/"Sinyal", confirmed via live DOM.

**Binding decision it touches — `OD-V4-2` (verbatim):**
> *"RESOLVED — owner, 2026-07-27 (`OD-V4-2`): Signals everywhere. The rail root becomes **Signals**; the Work child is the archive; the record type stays **Signal**. The noun "Events" is retired from the UI."*

This is not a fresh conflict — `docs/v4-inheritance.md`'s own contradiction register already carries it as **X-11**, flagged **OPEN — owner call, Director error, owned**, stating the ratification happened *"on a false premise supplied by the Director"* (conflating adjacency with synonymy — Events is a 38-line calendar stub, not the Signal record type) and recommending reverting the root label to Events/Acara while restoring the Work child to plain "Signals." The accessibility audit reached the same defect independently via WCAG 2.4.4, corroborating X-11's severity from a different angle, but the disposition is already on record as unresolved and owner-owned — not something this register should re-litigate.

---

# Five highest-leverage fixes for the app-wide Nielsen score (`OD-V4-4` gate: >30, app-wide)

1. **Fix `record-collection-result__label` sizing** (finding #9) — one component change fixes clipped, mid-word-truncated labels on 5 list pages in both locales at 320px; *Aesthetic and minimalist design / recognition rather than recall* — users currently can't even read what collection they're looking at.
2. **Darken status/filter pill contrast tokens** (finding #7) — one token-pair fix propagates to every status badge on the highest-frequency operational screens (Pushes, task chips, follow-ups); *Visibility of system status* — badges are literally how the app communicates state, and they're currently under AA on 70+ instances.
3. **Route Café module's 5 titles + empty/error/banner strings through i18n** (finding #2) — single largest concentration of "system speaks the wrong language" defects in the app, on the module floor staff use most; *Match between system and the real world*.
4. **Fix `document.documentElement.lang` + `formatDelta`/`FreshnessLabel` hardcoded fragments** (findings #5, #3) — one provider-level fix corrects screen-reader pronunciation app-wide and stops every finance/leadership figure on Home + Money from reading as a mixed-locale sentence; *Match between system and the real world / Consistency and standards*.
5. **Port DD-5's typed-field pattern from Café Log to Café Plan** (finding #12) — closes the one remaining instance of a motor-tedium regression the owner already ordered killed once (~20 taps/dish → one typed value), for the identical job on the very next screen in the same workflow; *Consistency and standards / Efficiency of use*.

---

# Unmeasurable findings

Only one finding was explicitly flagged by its auditor as not independently live-verified:

- **Budget/Pricing empty-state hardcoded English titles** (finding #23, `budget-page.tsx:192`, `pricing-page.tsx:107`) — the audit states: *"Not live-verified in id locale this session (route not reached before the audit window closed — see limitations)... confirmed via source grep alongside the same PageFamilyFrame-title pattern verified live elsewhere in this codebase (Café module)."* Treat as high-confidence-but-unconfirmed until someone loads these two routes in id locale and screenshots them, unlike every other finding in this register which carries live DOM/contrast measurements.
