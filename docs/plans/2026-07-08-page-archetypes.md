# Design-plan: page-archetype retrofit (B2)

- **Date:** 2026-07-08
- **Author:** design-architect (Frontend lens)
- **Decision:** `docs/decisions.md` **B2** (adopt 3 page archetypes; retrofit every route to one)
- **Teardowns:** `docs/reviews/design-teardown-2026-07-07.md` (root problem #1 + §B2), `docs/reviews/audit-probe-craft.md` (finding #1)
- **Identity authority:** `DESIGN.md` → new `## Page Archetypes (OD-DASH-adjacent, 2026-07-08)` section (this plan's source of truth for the three archetypes)
- **Shell primitives (unchanged, reused):** `mos-app/src/shell/page-frame.tsx` (`PageFrame variant='data'|'prose'`), `mos-app/src/shell/page-head.tsx` (`PageHead variant='prose'|'content'`), `mos-app/src/components/ui/state-kit.tsx`, `mos-app/src/components/dashboard/{data-table,kpi-tile,chart-frame,freshness-label}.tsx`, `mos-app/src/components/catalog/catalog-manager.tsx`
- **Identity rule (hard):** archetypes are COMPOSITIONS of existing primitives — this plan adds **no** component, CSS token, route, or test beyond the per-wave conformance edits. Every visual decision names a `DESIGN.md` token. No new color/font/radius/shadow/gradient.

> **Scope of this plan = retrofit only.** It moves each non-conformant route onto its declared archetype's
> shell contract (`PageFrame` variant + `PageHead` variant + body primitive). It does **not** redesign any
> route's information architecture, task-detail hierarchy (B4), rail structure (B3), or Home identity (B1) —
> those are separate owner-decision workstreams cross-referenced below. The empty-state pass (A3) is folded
> into Wave 4 because it is a state-kit conformance edit, not a new surface.

---

## 0. The three archetypes (one-line recall — full anatomy in DESIGN.md)

| Archetype | Shell contract | Body primitive | One-line intent |
|---|---|---|---|
| **Workspace** | `PageFrame variant="data"` + `PageHead variant="content"` | shared `DataTable` (or `ChartFrame`) | scan + act on many records |
| **Write-Review** | `PageFrame variant="prose"` (1080 cap) + `PageHead` (content or prose) | bounded form/review stack (≤720 measure) | author or decide on ONE thing |
| **Catalog-Manage** | `PageFrame variant="data"` + `PageHead variant="content"` w/ ＋ New action | `DataTable` or `CatalogManager` grouped list | curate a short reference list |

Invariants (all archetypes): one `PageFrame` owns `<main>`; one shared `PageHead` carries `<h1>`; 24px left gutter; sparse states via state-kit with one CTA; no new tokens; `surfaceWash` is home/digest-only.

---

## 1. Route census

Source of truth: `grep -nE "path:" mos-app/src/router.tsx`. Every routed path is listed.

**Wave key:** **W1** Cascade→Workspace · **W2** Catalog consolidation · **W3** Write-Review · **W4** Empty-state pass (A3, folded) · **N** conforms — no-op · **D** deferred (owned elsewhere) · **O** owner open-question · **X** out of scope (dev/auth/catch-all).

| route | current shell / grammar | target archetype | conformance delta (what must change to conform) | wave |
|---|---|---|---|---|
| `/` (index → `HomePage`) | `PageFrame surfaceWash` + `PageHead variant="prose"` + KPI grid + `MyWeekPanel` (grouped table) — a hybrid landing | **O** Home identity (B1) | **Open question** — cockpit (Workspace) vs "My Week" (Write-Review digest). No shell change in this plan. See §4. | **O** |
| `/__home-stacked` (DEV) | `StackedUnionHome` preview | — | DEV-only preview harness; not a shipped surface. | **X** |
| `/tasks` | `PageFrame variant="data"` + `PageHead variant="content"` (icon/title/count/action) + `TasksWorkspace` (view-tabs + toolbar + `DataTable`) | Workspace | **Conforms — no-op.** This is the de-facto Workspace reference; other Workspaces pattern on it. | **N** |
| `/tasks/new`, `/tasks/:taskId` | `TaskDrawer` (create/view) beside the `/tasks` table (split-view, ADR-0007) | Write-Review (as a drawer) | **Conforms — no-op** at the archetype level. (B4 rebuilds the drawer *hierarchy* around the decision — separate owner workstream, not archetype conformance.) | **N** |
| `/work/cascade` | `PageFrame variant="data"` + `PageHead variant="prose"` (title+subtitle) + bespoke `DesktopLadder`/`PhoneLadder` accordion tree + raw Mine/All `<button>` + raw manage-links | Workspace | prose head → **content** head (icon+title+count); raw Mine/All buttons → tool-rail `seg`; bespoke ladder → grouped `DataTable` **or** the tree retained inside Workspace grammar (open-question Q2). | **W1** |
| `/work/follow-ups`, `/work/follow-ups/:id` | silent redirect → `/` when `SHOW_FOLLOWUPS` off (router) | — | **Owned by deferred A4** (explicit blocked/not-live states). No archetype edit; router-level. See §5 dep. | **D** |
| `/updates` | `PageFrame` (prose) + `PageHead variant="content"` (title + meta) + giant write card + manager review pane | Write-Review | Bound the write card to ≤720 measure (it's an essay card today); keep the write+review two-stack; keep 1080 cap. Shell already prose+content — delta is body measure + rhythm. | **W3** |
| `/ops` | `PageFrame` (prose default) + `PageHead variant="prose"` (title + count-line meta) + `ops-assembly` (toolbar seamed to a bespoke feed) | Workspace | `PageFrame variant="data"` + `PageHead variant="content"` (icon+title+count); bespoke feed may stay (it is the Daily Log body) but must sit full-bleed under the content head + tool rail. Empty-state + phone double-CTA = W4. | **W4** (shell) |
| `/inbox` | `PageFrame variant="data"` + `PageHead variant="content"` (icon+title+count) + `InboxList` | Workspace | **Shell conforms.** W4 folds the empty-state polish (A3). | **W4** (empty only) |
| `/ops/new`, `/ops/:id/edit` | `PageFrame` (prose) + bespoke `.tc-page-head`/`.tc-page-title` `<h1>` + `.tc-card` form stack | Write-Review | Replace the bespoke `.tc-page-head` with the **shared `PageHead`** (`variant="content"` or `prose`); keep the bounded `.tc-card` form; add saved/submitting feedback. | **W3** |
| `/kitchen/log` | `PageFrame variant="data"` + `PageHead variant="content"` (title+count+date meta) + KPI strip + `KitchenToolbar` + shared `DataTable` | Workspace | **Conforms — no-op.** (Just ported to the shared DataTable; the teardown names it the most coherent operator screen.) | **N** |
| `/kitchen/plan` | `PageFrame variant="data"` + `PageHead variant="content"` + derived KPI strip + plan body | Workspace | **Conforms — no-op** for the shell. (A5 saved/pending feedback is a separate A-level fix, not archetype conformance.) | **N** |
| `/kitchen/stock` | `PageFrame variant="data"` + `PageHead variant="content"` + stock body | Workspace | **Conforms — no-op.** (A6 provenance is a separate A-level fix.) | **N** |
| `/kitchen/review` | `PageFrame variant="data"` + `PageHead variant="content"` (loading/empty variants present) | Workspace | **Shell conforms.** W4 folds the empty-state polish (A3). | **W4** (empty only) |
| `/kitchen/pushes` | `PageFrame variant="data"` + `PageHead variant="content"` (loading/empty variants present) | Workspace | **Shell conforms.** W4 folds the empty-state polish (A3). | **W4** (empty only) |
| `/admin/people` | `PageFrame variant="data"` + bespoke `<div class="flex items-start justify-between">` head wrapping a prose `PageHead` + "＋ Add person" button + `UserTable` | Catalog-Manage | Replace the bespoke flex-wrap head with the **shared `PageHead variant="content"`** carrying the ＋ Add-person action in the `action` slot; `UserTable` stays as the body (grouped list with row actions is conformant). | **W2** |
| `/objectives`, `/projects-processes` | `<Navigate to="/work/cascade">` (router redirects) | — | **Router redirects** — owned by A4/nav workstream; no archetype edit. | **D** |
| `/work/objectives` | `CatalogManager` → `PageFrame` (prose default) + `PageHead variant="content"` (title+count+meta) + inline Add form + grouped active/archived list | Catalog-Manage | `CatalogManager` `PageFrame` → **`variant="data"`** (reference lists align with the other workspaces' full-bleed head/body); inline Add bar already conformant. | **W2** |
| `/work/projects-processes` | same `CatalogManager` shell + a `typeField` (Project/Process) | Catalog-Manage | Same delta as `/work/objectives` (`PageFrame` → `variant="data"`). | **W2** |
| `/sales` | `SalesDashboardPage` → `PageFrame variant="data"` + `PageHead variant="content"` | Workspace | **Owned by the parallel dashboard session.** It renames this to `/dashboard` and rebuilds it as the reference Workspace instance. **No edit here** — conforms by construction. See §5 dep. | **D** |
| `/dev/views`, `/dev/views/:viewId` (DEV) | `DevViewsPage` view-composition harness | — | DEV-only harness; not a shipped surface. | **X** |
| `/plan/budget`, `/plan/pricing` | `PageFrame variant="data"` + `PageHead variant="content"`; **flag-hidden** (`SHOW_PLAN_BUDGET`, redirect → `/` when off) | Catalog-Manage / Write-Review (provisional) | **Owned by deferred A4** (the silent redirect is the A4 seam). While hidden, no archetype work; when unhidden, re-baseline then. | **D** |
| `/login`, `/recovery` | bare auth pages (no `AppShell`) | — | Auth surfaces; outside the archetype system (no `AppShell`, no workspace). | **X** |
| `*` (`NotFoundPage`) | catch-all | — | Not a workspace surface. | **X** |

**Conformance summary:** 8 routes already conform (N: `/tasks`, `/tasks/new`, `/tasks/:taskId`, `/kitchen/log`, `/kitchen/plan`, `/kitchen/stock` + the W4-empty-only trio `/inbox`, `/kitchen/review`, `/kitchen/pushes` whose *shell* conforms). 6 routes need shell edits (W1–W3 + W4 `/ops`). 5 are deferred to other owners (D). Home is an open question (O). 6 are out of scope (X).

---

## 2. Wave ordering (leverage + collision-avoidance)

Order is set by (a) felt leverage on the "several apps" root problem, (b) collision-avoidance with the live dashboard session and the deferred A4 router task, and (c) cheapest-first within a theme.

**Hard constraints honored:**
- **(a) `/dashboard` + `/sales` are owned by the parallel dashboard session.** Neither appears as an editable task below. The dashboard session rebuilds `/sales`→`/dashboard` as the reference Workspace instance (`docs/specs/dashboard.spec.md`, `docs/plans/2026-07-07-dashboard.md`); it conforms by construction. This plan only *reads* those docs to align the Workspace anatomy.
- **(b) router.tsx redirects are owned by the deferred A4 task.** `/plan/*`, `/work/follow-ups`, `/objectives`, `/projects-processes` redirects, and the `SHOW_*` hide-redirects are NOT touched here. The waves below edit page *components* and the `CatalogManager`, never `router.tsx`. Each deferred route carries a §5 dependency note.

| Wave | Theme | Routes | Why this order |
|---|---|---|---|
| **W1** | Cascade → Workspace | `/work/cascade` | Highest-leverage named seam (teardown: "internal tree viewer dropped into the app"). No collision — cascade is unowned. |
| **W2** | Catalog-Manage consolidation | `/work/objectives`, `/work/projects-processes`, `/admin/people` | One shared edit to `CatalogManager` + two thin call-sites + one head swap. Batches the "back-office CRUD" tell. |
| **W3** | Write-Review bound | `/updates`, `/ops/new`, `/ops/:id/edit` | Removes the "giant essay card" + bespoke `.tc-page-head` tells. Independent of W1/W2 files. |
| **W4** | Empty-state pass (A3, folded) | `/ops`, `/inbox`, `/kitchen/review`, `/kitchen/pushes` | Cheapest, fully verified A-level fixes; folded here because they are state-kit *conformance* edits. `/ops` shell lift rides with this wave. |

---

## 3. Per-wave tasks

Each task is 2–5 min, names exact files + the conformance change + the verify note. No placeholders.

### Wave 1 — Cascade → Workspace

**W1-1 · Cascade head → content variant.**
- **File:** `mos-app/src/pages/cascade-page.tsx` (~line 169–171).
- **Change:** `<PageHead title={…} subtitle={…} />` → `<PageHead variant="content" title={t('cascade.title')} count={loading||error ? null : ladder.reduce((n,g)=>n+g.rows.length,0)} meta={<span>{t('cascade.subtitle')}</span>} />`. Drops the bespoke subtitle; the subtitle copy moves into the `meta` slot (content chrome keeps one baseline meta line).
- **Verify:** `npm test -- cascade` — assert `getByTestId('page-head')` renders the `.content-header` chrome and an `<h1>` = title; assert the count pill reflects total rows when ready, omitted on load/error.

**W1-2 · Cascade Mine/All → tool-rail seg.**
- **File:** `mos-app/src/pages/cascade-page.tsx` (~line 181–185, the raw `<button>` Mine/All pair).
- **Change:** Replace the two raw `<button>`s with the shared `seg` segmented control grammar (`role="tablist"`/`role="tab"`/`aria-selected`, the Mine/RACI/All shell already used by Tasks). Reuses `secondary` track + white on-pill (DESIGN.md §Tabs/Segmented). No new component if an existing `Seg`/`CutToggle`-style primitive exists; else inline the same classes.
- **Verify:** `npm test -- cascade` — assert the control has `role="tablist"` and toggling flips the `mine` state; keyboard `arrow`/`Enter` moves selection.

**W1-3 · Cascade manage-links → head action / context strip.**
- **File:** `mos-app/src/pages/cascade-page.tsx` (~line 173–178, the `objective.manage`/`workline.manage` `<Link>` row).
- **Change:** Move the two manage links out of the raw `<div>` and into either the content head's trailing area or a slim context strip directly under the head (one row, muted). They are secondary nav, not a tool rail — keep them quiet (`muted-foreground` links).
- **Verify:** Director render at ≥1280 + 390px — confirm the links sit in one row under the head, not floating above the tree.

**W1-4 · Cascade body — grouped DataTable OR retained tree in Workspace grammar (open-question Q2).**
- **File:** `mos-app/src/pages/cascade-page.tsx` (`DesktopLadder`/`PhoneLadder`).
- **Change:** *If* the owner folds the tree into a table (Q2 → table): render the ladder as a grouped `DataTable` (groups = objective/work-line, `headerActions` = the per-group affordances) reusing the OD-P3-6 group-header row. *If* Q2 → keep tree: leave the ladder but ensure it sits full-bleed under the content head + seg with the same 24px gutter rhythm (no bespoke padding). **Decide Q2 before this task.**
- **Verify:** `npm test -- cascade` desktop branch — assert grouped `DataTable` renders group-header rows with caret + label + count (if table path); or assert the tree container has no bespoke left padding (if keep-tree path). Director visual pressure-test both breakpoints.

### Wave 2 — Catalog-Manage consolidation

**W2-1 · `CatalogManager` PageFrame → `variant="data"`.**
- **File:** `mos-app/src/components/catalog/catalog-manager.tsx` (~line 149, `<PageFrame>`).
- **Change:** `<PageFrame>` → `<PageFrame variant="data">`. Reference lists align full-bleed head+body with the other workspaces (the list is short, but the *frame* is shared). The inline Add form (lines ~159–185) already matches the Catalog-Manage "inline create bar" region — leave it.
- **Verify:** `npm test -- objectives projects-processes` — assert the frame no longer carries the 1080 cap (content spans full-bleed); head count + Add form still render.

**W2-2 · `CatalogManager` head — keep content variant, confirm ＋ affordance singular.**
- **File:** `mos-app/src/components/catalog/catalog-manager.tsx` (~line 150–155).
- **Change:** The head is already `variant="content"`. Confirm there is exactly **one** create affordance: the inline Add form is the create surface, so the head carries **no** `action` (do not also add a ＋ New button — the State-Kit/Archetype Rule forbids duplicate create affordances). Add a one-line code comment naming the rule.
- **Verify:** `npm test -- objectives` — assert exactly one "Add" control in the ready state; assert empty state's create affordance is the SAME form, not a second CTA.

**W2-3 · `AdminUsersPage` bespoke head → shared content `PageHead`.**
- **File:** `mos-app/src/pages/admin-users-page.tsx` (~line 213–219, the `<div class="flex items-start justify-between mb-4">` + prose `PageHead` + "＋ Add person" `Button`).
- **Change:** Replace the bespoke flex-wrap head with `<PageHead variant="content" title="People" count={loadState==='loaded'?people.length:null} meta={<span>Manage who can sign in and what they can do.</span>} action={<Button variant="primary" onClick={()=>setAddOpen(true)}>＋ Add person</Button>} />`. The subtitle copy moves into `meta`; the ＋ Add-person button moves into the `action` slot. `UserTable` stays as the body (grouped list with row actions is conformant).
- **Verify:** `npm test -- admin-users` — assert `getByTestId('page-head')` renders with the content chrome, the ＋ Add-person button in the head's action slot, and the count pill reflects people length when loaded.

### Wave 3 — Write-Review bound

**W3-1 · `/updates` write card → bounded measure.**
- **File:** `mos-app/src/pages/updates-page.tsx` (the `WeeklyUpdateWritePane` mount ~line 96) + the pane's own CSS (`mos-app/src/components/weekly/*.css`).
- **Change:** Cap the write + review stacks at a ≤720px measure (a `maxWidth: 720` wrapper or a `measure` utility) so the card is a bounded Write-Review stack, not an essay-width acreage. Keep the two-stack structure (write above, manager review below) and the 1080 prose `PageFrame`. The content `PageHead` + meta already conform.
- **Verify:** `npm test -- updates` — assert the write pane's container has a bounded measure; Director render — confirm the card no longer reads as a giant writing surface.

**W3-2 · `/ops/new` + `/ops/:id/edit` bespoke head → shared `PageHead`.**
- **File:** `mos-app/src/pages/ops-add-form.tsx` (~line 142, 158, 167 — the three `.tc-page-head`/`.tc-page-title` blocks including the not-found + loading variants).
- **Change:** Replace each bespoke `<div class="tc-page-head"><h1 class="tc-page-title">…</h1></div>` with `<PageHead variant="content" title={…} />` (import already present). Keep the bounded `.tc-card` form body (it is the conformant Write-Review stack). Title = "Add log entry" / "Edit log entry" / "Log entry not found" / "Loading…".
- **Verify:** `npm test -- ops-add-form` — assert `getByTestId('page-head')` renders for the ready + not-found + loading branches; assert the `<h1>` text matches each branch.

**W3-3 · `/ops` form submitting feedback.**
- **File:** `mos-app/src/pages/ops-add-form.tsx` (the submit handler ~line 130 + the submit button).
- **Change:** While submitting, surface an `aria-live="polite"` "Saving…" label beside the submit button (it already sets `submitting`/`aria-busy`); on success the navigate to `/ops` is the feedback. No duplicate submit CTA. (Mirrors the A5 saved/pending pattern the archetype requires.)
- **Verify:** `npm test -- ops-add-form` — assert the live region announces "Saving…" while `submitting`; assert exactly one submit button.

### Wave 4 — Empty-state pass (A3, folded) + `/ops` shell lift

**W4-1 · `/ops` shell lift to Workspace.**
- **File:** `mos-app/src/pages/ops-page.tsx` (~line 358–361).
- **Change:** `<PageFrame>` → `<PageFrame variant="data">`; `<PageHead title="Daily Log" meta={…} />` → `<PageHead variant="content" title="Daily Log" count={loading||error?null:entries.length} meta={<span …>{wib.today}{countLabel}</span>} />`. The `ops-assembly` (toolbar seamed to the feed) stays as the Workspace body; it now sits full-bleed under the content head.
- **Verify:** `npm test -- ops` — assert `getByTestId('page-head')` renders the content chrome with a count pill; assert full-bleed (no 1080 cap).

**W4-2 · `/ops` empty + filtered-empty via state-kit; kill phone duplicate CTA.**
- **File:** `mos-app/src/pages/ops-page.tsx` (empty/filtered branches + the phone CTA).
- **Change:** Route the empty + filtered-empty states through `EmptyState` (already imported) with ONE next action (add entry / clear filters). Remove the duplicate primary CTA on the phone `/ops` layout (the A3 phone double-CTA) — exactly one create affordance.
- **Verify:** `npm test -- ops` — empty state asserts `EmptyState` with a single CTA; phone render asserts one "Add" affordance.

**W4-3 · `/inbox` empty-state polish.**
- **File:** `mos-app/src/pages/inbox-page.tsx` (~line 43, the `EmptyState`).
- **Change:** The empty state already uses `EmptyState`; tighten copy to name the source (notifications) + ONE next action (it currently has none — the inbox routes to content, so the empty action is "nothing to triage" with no CTA, which is conformant). Confirm no second CTA. Shell already conforms.
- **Verify:** `npm test -- inbox` — empty state asserts `EmptyState` with ≤1 action.

**W4-4 · `/kitchen/review` + `/kitchen/pushes` empty-state polish.**
- **Files:** `mos-app/src/pages/kitchen-review-page.tsx` (~line 542 empty branch), `mos-app/src/pages/kitchen-pushes-page.tsx` (~line 213 empty branch).
- **Change:** Both already render `<PageFrame>` + `<PageHead variant="content" … count={null} />` for empty. Route the empty body through `EmptyState` with ONE next action (review: "nothing to approve"; pushes: "no dead-letter pushes") so the sparse state preserves page rhythm instead of reading as a vacuum. Shell conforms — body-only edit.
- **Verify:** `npm test -- kitchen-review kitchen-pushes` — empty state asserts `EmptyState` present with exactly one action.

---

## 4. Open questions for the owner

- **Q1 — Home identity (B1).** Does `/` stay a Write-Review "My Week" digest (drop the faux-cockpit KPI strip) or become a Workspace cockpit? `docs/decisions.md` **OD-DASH-2** already leans **Home = light landing, `/dashboard` = cockpit**. If ratified, Home is a Write-Review digest (`PageFrame variant="prose" surfaceWash` + bounded grouped table) and the finance KPI strip relinks to `/dashboard` (the dashboard plan already lists "Update Home v1 finance-tile links `/sales` → `/dashboard`"). **This plan assumes OD-DASH-2 holds and makes no Home shell change.** Owner call unblocks a W5 Home wave.
- **Q2 — Cascade tree vs table.** Does `/work/cascade`'s accordion tree stay (retained inside Workspace grammar, W1-4 keep-tree path) or fold into a grouped Workspace `DataTable` (W1-4 table path)? The teardown calls it "an internal tree viewer dropped into the app"; folding to a table maximizes grammar unity, but the tree carries parent→child roll-up the table would have to recreate via group-header rows. **Owner call unblocks W1-4.**
- **Q3 — `/ops` feed body.** Should the Daily Log feed migrate from its bespoke `ops-assembly` to the shared `DataTable` (maximal Workspace unity), or stay bespoke under the content head (lower risk, the feed has unique source-badge/attention-rule treatments per DESIGN.md Ops Log tokens)? This plan keeps it bespoke (W4-1 shell-only) to avoid disturbing the ratified Ops Log tokens; a later wave can migrate the body.
- **Q4 — `/plan/budget` + `/plan/pricing` archetype.** Provisionally Catalog-Manage (capture a list) / Write-Review (capture a version). Re-baseline at A4 unhide time; not decided here.

---

## 5. Dependencies & non-edit boundaries

- **`/dashboard` + `/sales` — parallel dashboard session.** Files untracked in this checkout; READ-ONLY by absolute path (`docs/specs/dashboard.spec.md`, `docs/plans/2026-07-07-dashboard.md`). Its layout (PageFrame variant="data" + FreshnessLabel + KPI strip + global toolbar + tab strip + dense DataTable/ChartFrame) IS the reference Workspace instance; the Workspace archetype in DESIGN.md is written so `/dashboard` conforms by construction. **This plan edits neither route nor its components.**
- **router.tsx redirects — deferred A4 task.** `/plan/*` and `/work/follow-ups` silent redirects, the `/objectives`+`/projects-processes` redirects, and the `SHOW_*` hide-redirects are the A4 "explicit blocked/not-live states" seam. **This plan does not edit `router.tsx`.** When A4 lands, the now-visible routes (`/plan/budget`, `/plan/pricing`, `/work/follow-ups`) get baseline-archetyped then.
- **No new tokens.** The dashboard plan proposes `--basis-chip` + `--dq-*` (its §6.2); those land under the dashboard's own OD, never via this plan. The archetype system reuses existing tokens exclusively.
- **B1/B3/B4 are separate owner workstreams.** Home identity (B1), rail restructure (B3), and task-detail hierarchy (B4) reshape IA and are out of scope here; this plan only cross-references them where a wave touches the same file.

---

## 6. Verify (whole-plan gate)

Run from `mos-app/` after each wave; all must pass before the wave's PR:

- `npm run typecheck` — zero errors (binding).
- `npm run lint -- --max-warnings=0` — zero errors/warnings (binding).
- `npm test -- <wave-file>` — the wave's unit/RTL tests green (each task's verify note names the AC-layer assertion; archetype conformance is a **render** assertion: `getByTestId('page-head')` present + correct variant chrome + `<h1>`).
- `npm run dev` — Director render + visual pressure-test **per route touched**, desktop ≥1280 **and** phone 390: confirm one `<main>` + one shared head + 24px gutter + sparse state via state-kit with one CTA + no horizontal scroll.

**Definition of Done (this plan):** every shipped route renders exactly one `PageFrame` (owning `<main>`) + one shared `PageHead` and conforms to its declared archetype's shell contract; sparse states route through state-kit with a single next action; zero new tokens introduced; `/dashboard`+`/sales` and the A4 router redirects untouched.
