# Spec — Redesign Shell + Routes (Step 2: the IA moves)

| | |
|---|---|
| **Status** | DRAFT 2026-07-14 → spec sign-off (owner walkthrough gate) → plan phase |
| **Workstream** | Redesign buildout — `docs/plans/2026-07-14-redesign-buildout.md`, **Step 2** |
| **Scope source (verbatim)** | _"New sidebar (Home / Work ▸ Signals·Tasks·Projects & Processes·Objectives / Events / Money[gated] / Inbox / BU Modules / Admin+profile footer), top bar (breadcrumb · ⌘K palette · inbox · deputy), URL grammar + redirects from every old route."_ |
| **Spec discipline** | feature-forge (requirements + acceptance) |
| **Authority chain** | Master plan Step-2 row + standing acceptance → `docs/experience-contract.md` Rules 1–11 (binding, every rule → ≥1 AC) → `SALVAGE-INVENTORY.md` (convergence OWNS the frame/URL grammar; e7 OWNS the ⌘K centered-modal presentation) → `docs/decisions.md` OD-REDESIGN-57 (frame directives) + OD-1/D1 (rail) → convergence-flows `flows.js` (visual truth: sidebar order, routes, redirects, aria-current logic, ⌘K contents) → `CONTEXT.md` |
| **Build layers touched** | `mos-app/src/router.tsx` + `mos-app/src/shell/*` + `mos-app/src/components/command/*` + `mos-app/src/config/features.ts` + `mos-app/src/i18n/messages.ts` + thin stub pages. **Zero DB/RLS/migration work.** Existing page components are re-homed (route path changes), not rebuilt. |
| **Owner gate** | **YES — interactive walkthrough** (Step-2 flag in master plan) **plus** the standing visual-diff matrix (1280px + 390px before/after vs the convergence reference, in the review ledger). |

---

## 1. Overview & user value

The redesign's structural step. Until now the app's IA has been the ADR-0019 five-destination shell
(Home · Work · Operate · Plan · Inbox). On 2026-07-14 the owner locked a new frame (OD-REDESIGN-57):
**Home · Work ▸ (Signals · Tasks · Projects & Processes · Objectives) · Events · Money[gated] ·
Inbox · BU-grouped Modules (Café · Ecommerce · Roastery) · Admin Settings + profile footer**, with a
header = brand+breadcrumb (left) · Search⌘K + Inbox + Deputy (right), and the universal actions
(Ask Deputy · Share Signal · Create Task) moved **into the ⌘K palette** — no header action buttons.

This step moves the IA for the first time inside `mos-app`. It is **port, not invention**
(Experience Contract Rule 11 / OD-REDESIGN-56): the convergence-flows prototype
(`gordi-mos-e7-prototype/…/convergence-flows/flows.js`) **owns** the frame, the URL grammar, the
redirects, and the exactly-one `aria-current` logic; e7 owns the ⌘K centered-modal presentation. We
extend the existing `mos-app` shell components to that reference; we do not re-create them.

**User (owner) value:** after this step the app *is navigated like the redesign* — one stable rail,
one canonical URL per collection, Back/refresh/new-tab that preserve location, exactly one
current-location marker, and a single ⌘K palette holding every universal action. Every later
buildout step (Tasks re-home, Signal, Home, Café, …) plugs content into this stable frame.

**The single load-bearing idea:** the shell, the routes, and the URL grammar become the redesign's
for real. Existing pages stay reachable — re-homed under new canonical routes, not rebuilt; retired
surfaces (Weekly Updates, Daily Log, Cascade noun) redirect to their successors.

## 2. Scope

### 2.1 IN SCOPE

- New **sidebar** structure (§4): Home / Work(always-expanded: Signals · Tasks · Projects &
  Processes · Objectives) / Events / Money[gated, hidden when unauthorized] / Inbox / BU-grouped
  Modules (Retail Ops → Café · Ecommerce; B2B Ops → Roastery) / Admin Settings + profile footer.
- New **top bar** per OD-57: brand + current-location breadcrumb (left) · Search⌘K + Inbox + Deputy
  (right). Universal actions live in the ⌘K palette, not as header buttons.
- **Canonical routes** per collection (§6) + **URL query state** (`?view=` saved-view param;
  canonical record route grammar).
- **Redirects from every current app route** (§7) — enumerated by reading `mos-app/src/router.tsx`.
- **⌘K palette** (§8): centered modal (e7 presentation), contents = search + Ask Deputy · Share
  Signal · Create Task (+ ≤1 contextual). Extends the existing `command-menu`.
- **Breadcrumb** (§9): header breadcrumb resolving new destinations + Work children + saved-view
  leaf; no brand prefix.
- **aria-current** (§10): exactly one `aria-current="page"` document-wide; Work parent collapses to
  `location`.
- **One page-anatomy shell** (§11): four regions — header → context row → content → record drawer —
  identifiable on every route; no fifth region, no second drawer host.

### 2.2 OUT OF SCOPE (later steps — do not build here)

- **Tasks re-home internals** (Step 3): the Tasks DB-view rewiring into `/work/tasks`, the
  saved-view chips reading/writing `?view=`, the drawer ↔ canonical-page panel/page mode rendering.
  Step 2 owns the *route* + the `?view=` URL grammar + the redirects that produce `?view=`; Step 3
  owns the Tasks UI consuming it.
- **Signal composer/feed** (Step 4): the FB-style composer and the Home feed. `/work/signals` is a
  stub here.
- **Events page body** (Step 10): `/events` is a stub here (job sentence + placeholder).
- **Café retrofit** (Step 7): the occurrence/opening surface. Existing Kitchen screens are
  re-homed under `/cafe/*` here; the occurrence UX lands in Step 7.
- **Money Follow-ups queue** (Step 9): `/money` renders the existing Dashboard here; the Follow-ups
  queue + follow-up record canonicalization lands in Step 9.
- **Any DB/RLS/migration work.** Zero schema changes.
- **The shared stack-navigated Record Panel mechanics** (OD-REDESIGN-19): the panel-stack
  navigation, panel-vs-page `mode` rendering, and the deputy/inbox/record single-host unification.
  Step 2 establishes the *anatomy slot* (region 4 exists, single host); the stack mechanics land with
  Steps 3/4.
- DEV-only harnesses (`/dev/ui`, `/dev/views`, `/__home-stacked`) and auth routes (`/login`,
  `/recovery`) are unchanged and out of scope.

### 2.3 CONFIRMATIONS — already aligned, MUST NOT change

- The **⌘K hotkey** (`use-command-menu.ts` ⌘/Ctrl+K → open) already exists and stays.
- The **`Navigate … replace`** back-guard convention (FR-012: redirect replaces so Back never
  re-enters the old URL) already exists in `router.tsx`; all new redirects reuse it.
- The **`RequireAccessRole` / `RequireCapability` / `AdminRoute` / `ProtectedRoute`** guard
  components exist and are reused unchanged. RLS remains the real security boundary.
- The **`can(accessRoles, capability)`** capability helper (`lib/capabilities.ts`) exists. Money is
  gated by the existing `finance`/`admin` access roles in v1 (see §12 deviation D-3).

---

## 3. The current app shell to MODIFY (Rule 11 — extend, don't rebuild)

All paths verified to exist in `mos-app/`:

| File | Role | Action here |
|---|---|---|
| `src/router.tsx` | `createBrowserRouter(routeConfig, { basename: '/mos' })` — the route table | **EXTEND**: new canonical routes + redirect map (§6, §7) |
| `src/shell/app-shell.tsx` | grid layout: TopBar + Rail + main + BottomTabBar + MobileDrawer + CommandMenu + AssistantPanel; wraps `BreadcrumbTitleProvider` | **EXTEND**: add the shared ContextRow (region 2); keep the single drawer host (region 4) |
| `src/shell/rail.tsx` | renders `<RailNav>` in the rail grid area | unchanged (pass-through) |
| `src/shell/rail-nav.tsx` | renders `DESTINATIONS` as `NavGroup`s + Admin + Settings stub + `LocaleToggle`; uses `NavLink` (react-router auto-sets `aria-current="page"`) | **EXTEND**: new rail structure (Work parent link + always-expanded 4 children, Events, Money gated, BU-grouped Modules, Admin, profile footer); explicit `aria-current` (page/location) per §10 |
| `src/shell/destinations.tsx` | `DESTINATIONS` model + `isLive` + `destinationForPath`; `DestinationId = 'home'\|'work'\|'operate'\|'plan'\|'inbox'` | **EXTEND**: new destination set (Home/Work/Events/Money/Inbox + Modules + Admin/Profile); Work children; retire Operate/Plan roots |
| `src/shell/sections.tsx` | `SECTIONS` / `KITCHEN_SECTIONS` / `ADMIN_SECTIONS` + `sectionForPath` | **EXTEND**: remap kitchen→cafe, add events/money/signals/profile sections (or fold into destinations) |
| `src/shell/top-bar.tsx` | brand lockup + breadcrumb (left) · search field + bell + deputy + user chip (right) | **EXTEND**: align to OD-57 (brand+breadcrumb left; Search⌘K + Inbox + Deputy right); profile moves to rail footer (per convergence); confirm no universal-action header buttons (none today) |
| `src/shell/breadcrumb.tsx` | resolves destination + section; `Section › Leaf` with `›` separator | **EXTEND**: resolve new destinations + Work children + `?view=` saved-view leaf; `·` separator per convergence; last segment bold |
| `src/shell/breadcrumb-title.tsx` | dynamic-title channel (Task title → breadcrumb) | unchanged (reused) |
| `src/shell/bottom-tab-bar.tsx` | phone bottom-nav; sets `aria-current={active ? 'page' : undefined}` explicitly | **EXTEND**: phone bottom-nav = Home · Work · Café · Inbox · More (per convergence); `More` owns every non-primary authorized destination |
| `src/shell/mobile-drawer.tsx` | phone "more" drawer | **EXTEND**: the `More` menu (authorized destinations not in the bottom nav: Events, Money, Ecommerce, Roastery, Admin, Profile) |
| `src/shell/page-head.tsx` | per-page H1 header (title/subtitle/meta) — lives in region 3 | unchanged (the in-page H1 stays; distinct from the new shell ContextRow) |
| `src/shell/use-is-narrow.ts` / `use-is-desktop.ts` / `use-is-split-width.ts` | responsive breakpoints | unchanged |
| `src/components/command/command-menu.tsx` | ⌘K palette: combobox + listbox + Recent + Quick actions + Navigate + async record search | **EXTEND**: new action set (Ask Deputy · Share Signal · Create Task + ≤1 contextual); new Navigate targets (new canonical routes); CSS already top-centered → align to e7 centered modal |
| `src/components/command/command-menu.css` | palette styling (already `left:50%; transform:translateX(-50%)`) | **EXTEND**: centered-modal presentation per e7 (SALVAGE: e7 OWNS ⌘K presentation) |
| `src/components/command/use-command-menu.ts` | ⌘K hotkey + open state | unchanged |
| `src/components/command/recent-tasks.ts` | recent-records store | unchanged (reused; scope to tasks for now) |
| `src/config/features.ts` | feature flags | **EXTEND**: retire/flip flags superseded by the redesign (SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG → retired; SHOW_INBOX → Inbox is a destination root, live; SHOW_FOLLOWUPS → retired; see §12 D-1) |
| `src/i18n/messages.ts` | EN/ID string catalog | **EXTEND**: new keys (`dest.events`, `dest.money`, `dest.signals`, `nav.signals`, `nav.events`, `nav.money`, `nav.cafe`, `nav.ecommerce`, `nav.roastery`, `nav.admin`, `nav.profile`, job-sentence keys) |
| `src/lib/capabilities.ts` | `can()` + `ROLE_CAPABILITIES` | unchanged in v1 (Money gated by finance/admin access roles; `money.view` capability deferred — §12 D-3) |

### 3.1 NEW components (Rule 11 — each has NO existing counterpart; justification given)

| New file | Why it is genuinely new (not a re-implementation) |
|---|---|
| `src/shell/context-row.tsx` | **Region 2 of the anatomy.** No shared shell-level "scope + job sentence" strip exists today — `page-head.tsx` is a per-page H1 inside region 3. The convergence makes the context row a *shell* region (Rule 6: "the context row carries scope + the route's job sentence"), so it is a new shared shell component, not a second page-head. |
| `src/shell/job-sentences.ts` | The Rule-1 job-sentence registry (one job sentence per rail destination/child), ported from the convergence `fixtures.js` `jobSentences`. No such registry exists in the app. |
| `src/pages/slice-stub-page.tsx` | One shared placeholder for not-in-this-slice destinations (Events, Ecommerce, Roastery, Profile, Signals archive) — renders the route's job sentence + a labelled "not in this slice" body. Mirrors the convergence `viewStub`. One component, parameterized — **not** five duplicate stub files (Rule 11). Distinct from `not-found-page.tsx` (a 404; the stub is a real route placeholder). |

> **No new record editor, no new drawer host, no new table, no new palette** is introduced. The
> record drawer host (region 4) stays the existing split-view outlet; the ⌘K palette stays the
> existing `command-menu`. (Rule 2 / Rule 6 / Rule 11.)

---

## 4. Sidebar structure (Rule 1, Rule 3, OD-57)

Ported from convergence `rail()`. The rail is a two-zone structure (Destinations, then BU-grouped
Modules) plus a utility footer.

| Zone | Overline | Items |
|---|---|---|
| **Workspace** (Destinations) | _Workspace_ | **Home** · **Work** (always-expanded children: Signals · Tasks · Projects & Processes · Objectives) · **Events** · **Money** _(gated: absent for non-finance/admin)_ · **Inbox** |
| **Modules** | _Retail Ops_ | Café · Ecommerce |
| | _B2B Ops_ | Roastery |
| **Utility** | _(foot)_ | **Admin Settings** _(gated: absent for non-admin)_ · **profile row** (avatar + "{Site} {role}" + chevron → `/profile`) |

### 4.1 Rail-item → job-sentence map (Rule 1 — every rail item answers one job)

Ported verbatim from the convergence `jobSentences` (the contract's Rule-1 table is the authority):

| Rail item | Job sentence |
|---|---|
| Home | What needs my attention right now? |
| Work (Tasks) | Find and do the work I own or my Team owns. |
| Work / Signals | Search and revisit the Signals your Teams have shared. |
| Work / Projects & Processes | Govern the Processes and Projects that generate the work. |
| Work / Objectives | Track the Objectives the org committed to. |
| Events | See what's happening around our outlets and when. |
| Money | Trust the financial figures and act on money exceptions. |
| Inbox | Triage what asked for me and return to its source. |
| Café | Run today's café floor work — openings, checks, stock, shifts. |
| Ecommerce | Fulfil today's online orders against the right stock. |
| Roastery | Record today's roasts, yield, and transfers truthfully. |

### 4.2 Numeric caps (Rule 3 — held at desktop and phone)

- **5** destination roots: Home · Work · Events · Money[gated] · Inbox.
- **3** Module roots: Café · Ecommerce · Roastery.
- **2** BU group headings above Modules: Retail Ops · B2B Ops.
- **2** utility entries: Admin Settings · Personal Profile (gated, own group).
- **4** Work collection-switcher children: Signals · Tasks · Projects & Processes · Objectives.
- **0** family headings inside the Work switcher (flat; always expanded).
- **1** `aria-current="page"` on the whole document (§10).

### 4.3 Money gating (Rule 9 parity, SALVAGE override #8)

Money is **absent** (not disabled, not a "•" stub) for a viewer holding neither `finance` nor
`admin` — on desktop **and** phone. The existing `destinations.tsx` `isLive` `anyOf` gate already
implements "hide the destination with no authorized children"; extend it to Money.

---

## 5. Top bar (Rule 6, OD-57)

Ported from convergence `shell()` header. Left→right:

1. **Brand lockup** (logo mark + "Gordi MOS") — width `--rail-w`, right divider coincides with the
   rail boundary (already so in `top-bar.tsx`).
2. **Current-location breadcrumb** (§9) — `min-w-0` so a long crumb ellipsizes and cannot shove the
   brand (No-bleed guardrail, OD-P4-11). Hidden at `<920px` (redundant with the page H1).
3. Spacer.
4. **Search⌘K** trigger — opens the centered ⌘K palette (§8). Icon-only at `<920px`.
5. **Inbox** bell — live Inbox link + unread badge (existing `NotificationBell`); absent/stub when
   the Inbox feature is off.
6. **Deputy** launcher — neutral header icon (existing `AssistantTopBarButton`), every viewport.

**No universal-action header buttons.** Ask Deputy · Share Signal · Create Task live **only** in the
⌘K palette. (The current top bar already has no such buttons — this is a hold invariant, not a
removal.) The profile/persona moves out of the header into the **rail footer profile row** (per
convergence); the header `UserChip` is replaced by the rail profile row on desktop and stays
avatar-only on phone behind `More` — exact placement is a design-call ratified in the step-2
walkthrough (deviation D-4 if the owner keeps the header user chip).

---

## 6. Canonical routes + URL state (Rule 4)

### 6.1 Canonical route table (new)

| Route | Component (reused unless marked NEW) | Guard |
|---|---|---|
| `/` | `HomePage` (or `StackedUnionHome` per `SHOW_HOME_STACKED`) | ProtectedRoute |
| `/work/tasks` | `TasksLayout` (re-homed from `/tasks`) | ProtectedRoute |
| `/work/tasks/new` | `TaskDrawer mode="create"` | ProtectedRoute |
| `/work/tasks/:taskId` | `TaskDrawer mode="view"` | ProtectedRoute |
| `/work/signals` | **NEW** `SliceStubPage` (Signals archive — Step 4) | ProtectedRoute |
| `/work/projects` | `ProjectsProcessesPage` (re-homed from `/work/projects-processes`) | RequireCapability `workline.manage` |
| `/work/objectives` | `ObjectivesPage` (already canonical) | RequireCapability `objective.manage` |
| `/events` | **NEW** `SliceStubPage` (Events — Step 10) | ProtectedRoute |
| `/money` | `DashboardPage` (re-homed from `/dashboard`) | RequireAccessRole `finance`/`admin` |
| `/money/detail` | `DashboardPage defaultTab="detail"` (re-homed from `/dashboard/detail`) | RequireAccessRole `finance`/`admin` |
| `/money/budget` | `BudgetPage` (re-homed from `/plan/budget`, `SHOW_PLAN_BUDGET`-gated) | RequireAccessRole `finance`/`admin` |
| `/money/pricing` | `PricingPage` (re-homed from `/plan/pricing`, `SHOW_PLAN_BUDGET`-gated) | RequireAccessRole `finance`/`admin` |
| `/inbox` | `InboxPage` (already canonical; now live — §12 D-1) | ProtectedRoute |
| `/cafe` | redirect → `/cafe/log` | — |
| `/cafe/log` | `KitchenLogPage` (re-homed from `/kitchen/log`) | ProtectedRoute |
| `/cafe/plan` | `KitchenPlanPage` (re-homed) | ProtectedRoute |
| `/cafe/stock` | `KitchenStockPage` (re-homed) | ProtectedRoute |
| `/cafe/review` | `KitchenReviewPage` (re-homed) | RequireAccessRole `ops_lead`/`admin` (existing role visibility) |
| `/cafe/pushes` | `KitchenPushesPage` (re-homed) | RequireAccessRole `ops_lead`/`admin` |
| `/ecommerce` | **NEW** `SliceStubPage` | ProtectedRoute |
| `/roastery` | **NEW** `SliceStubPage` | ProtectedRoute |
| `/admin` | redirect → `/admin/people` | — |
| `/admin/people` | `AdminUsersPage` (already canonical) | AdminRoute |
| `/profile` | **NEW** `SliceStubPage` (Personal Profile — later step) | ProtectedRoute |
| `/work` | redirect → `/work/tasks` | — |
| `*` | `NotFoundPage` | ProtectedRoute |

DEV-only routes (`/dev/ui`, `/dev/views`, `/dev/views/:viewId`, `/__home-stacked`) and auth routes
(`/login`, `/recovery`) are unchanged.

### 6.2 URL query state (Rule 4)

- **Saved-view param** `?view=` on `/work/tasks`: canonical values `all | mine | team | overdue |
  followups` (the convergence `TASKS_VIEWS`). My / Team / Overdue / Follow-ups are saved-view chips
  **inside** Tasks (OD-57), not rail roots. Step 2 owns the URL grammar + the redirects that produce
  `?view=`; Step 3 owns the Tasks UI reading/writing the chips.
- **Canonical record route**: `/work/tasks/:taskId` (deep-linkable; refresh/new-tab/direct URL open
  the canonical Task surface). The `?record=` panel-over-collection param and the panel/page
  `mode="panel"|"page"` rendering are Step 3 (OD-REDESIGN-19) — Step 2 establishes the canonical
  record route + redirects old record paths to it.
- `?view=` (and any future `?record=`) survives Back / refresh / new-tab / bookmark (Rule 4).

### 6.3 The extension test (Rule 10)

The route/nav structure must let a future Module / calendar / record type ship by adding **(i) a
collection + (ii) a view renderer + (iii) feed posts / activity-thread entries** — reusing the
existing UI families (Rule 2) and the existing page anatomy (Rule 6), with **no new rail root, no
new destination job, no new anatomy, no second drawer host**. Events was promoted to a rail root by
explicit owner directive (OD-57) — that is the owner exercising the amendment path, not a Rule-10
violation; the rule still binds every *future* addition. (AC-023 describes the test for a future
"Standards compliance calendar" and a future "Procurement Module".)

---

## 7. Redirect map — from every current app route (Rule 4)

Enumerated from `mos-app/src/router.tsx`. Every redirect uses `<Navigate to={…} replace />`
( FR-012 back-guard: replace so Back never re-enters the old URL).

| Old route (current) | New canonical | Notes |
|---|---|---|
| `/tasks` | `/work/tasks` | Tasks re-homed under Work |
| `/tasks/new` | `/work/tasks/new` | record path preserved |
| `/tasks/:taskId` | `/work/tasks/:taskId` | canonical record route |
| `/work` | `/work/tasks` | Work parent default child |
| `/work/cascade` | `/work/tasks` | Cascade noun retired (redesign Work children supersede it) |
| `/work/follow-ups` | `/work/tasks?view=followups` | Follow-ups = Tasks saved view (OD-9/D9) |
| `/work/follow-ups/:id` | _(unchanged — see D-2)_ | follow-up record canonicalization deferred to Step 9 |
| `/work/projects-processes` | `/work/projects` | child id shortened to `projects` (label stays "Projects & Processes") |
| `/objectives` | `/work/objectives` | was → `/work/cascade`; now → the Work child |
| `/projects-processes` | `/work/projects` | was → `/work/cascade`; now → the Work child |
| `/updates` | `/work/signals` | Weekly Updates retired (OD-33); successor = Signal archive |
| `/ops` | `/` | Daily Log retired (OD-33); successor = Home Signal feed (Step 5) |
| `/ops/new` | `/` | retired |
| `/ops/:id/edit` | `/` | retired |
| `/kitchen` | `/cafe` | Module rename Kitchen → Café (OD-15) |
| `/kitchen/log` | `/cafe/log` | Kitchen screens re-homed under Café |
| `/kitchen/plan` | `/cafe/plan` | re-homed |
| `/kitchen/stock` | `/cafe/stock` | re-homed |
| `/kitchen/review` | `/cafe/review` | re-homed |
| `/kitchen/pushes` | `/cafe/pushes` | re-homed |
| `/dashboard` | `/money` | Dashboard re-homed under Money (financial destination) |
| `/dashboard/detail` | `/money/detail` | re-homed |
| `/sales` | `/money` | was → `/dashboard`; now → `/money` |
| `/plan/budget` | `/money/budget` | Plan destination retired; finance surfaces re-home under Money |
| `/plan/pricing` | `/money/pricing` | re-homed |

Retired page components (`UpdatesPage`, `OpsPage`, `OpsAddForm`, `CascadePage`) are not re-homed —
their routes redirect to successors (OD-33 / Cascade retirement). They may remain in the tree
(unreferenced) for the step-2 PR; removal is a cleanup follow-up (does not block merge).

---

## 8. ⌘K palette (Rule 7, OD-57, SALVAGE)

Port e7's **centered modal** presentation; keep convergence's **contents** (SALVAGE: e7 OWNS ⌘K
presentation; convergence OWNS the contents). Extend the existing `command-menu.tsx` — do not rebuild.

### 8.1 Universal actions (stable, never algorithmically reordered — Rule 7/OD-46)

- **Ask Deputy** — opens the deputy panel (`AssistantPanel`) when `SHOW_ASSISTANT`; otherwise a
  labelled disabled/coming-soon entry. (Deputy depth is its own workstream; Step 2 wires the entry.)
- **Share Signal** — opens the Signal composer. The composer is Step 4; Step 2 wires the palette
  entry to dispatch to the composer-opening target (navigate Home + open composer placeholder), with
  the full composer UX landing in Step 4. The entry is verb+object and present from Step 2 (Rule 7).
- **Create Task** — navigates to `/work/tasks/new` (works end-to-end in Step 2; reuses the existing
  create drawer).

### 8.2 Contextual action (≤1 — OD-46/D32)

At most **one** context action alongside the universal set, e.g. **"Start today's opening"** when the
viewer is on `/cafe*` and the opening occurrence is open (Step 7 owns the real occurrence UX; Step 2
may ship the palette slot empty/hidden until then). The universal actions are never reordered by the
contextual one.

### 8.3 Navigate + Recent + search

- **Navigate** items point to the new canonical routes: Home `/`, Work `/work/tasks`, Signals
  `/work/signals`, Events `/events`, Money `/money` (only when authorized), Inbox `/inbox`, Café
  `/cafe`. (Retire the old "My Week / Weekly updates / Daily Log" navigate entries — those routes
  redirect now.)
- **Recent** + async **record search** (existing) stay; scoped to Tasks for now (widen in later
  steps as more record types ship).
- **Presentation**: centered modal popup (e7), opened by the search field, ⌘K, or the phone FAB
  (Step 2 keeps the existing header search trigger + ⌘K hotkey; the phone FAB→palette is wired if a
  FAB exists, else noted as Step 7+ when Café lands). a11y: `role=dialog` + `aria-modal` + focus
  trap + Esc (already in `command-menu.tsx`).

---

## 9. Breadcrumb (Rule 6, OD-57, OD-P4-11)

Extend `breadcrumb.tsx`. Ported from convergence `contextLabel()`: last segment is the current
location (bold); `·` separator; **no brand prefix** (brand lives in the top bar; OD-P4-11 dedup).

| Route | Breadcrumb |
|---|---|
| `/` | Home |
| `/work/tasks` | Work · Tasks |
| `/work/tasks?view=mine` | Work · Tasks · My work |
| `/work/signals` | Work · Signals |
| `/work/projects` | Work · Projects & Processes |
| `/work/objectives` | Work · Objectives |
| `/work/tasks/:taskId` | Work · Tasks · _{resolved task title}_ (via `BreadcrumbTitleProvider`) |
| `/events` | Events |
| `/money` | Money |
| `/money/detail` | Money · Detail |
| `/inbox` | Inbox |
| `/cafe/log` | Café |
| `/cafe/review` | Café · Review |
| `/admin/people` | Admin Settings · People |
| `/profile` | Personal Profile |

On unknown/404 routes the breadcrumb renders nothing and no nav item claims `aria-current`
(existing FIX-4 behavior preserved).

---

## 10. aria-current — exactly one `page` (Rule 5)

Ported from convergence `activeNav()` + `rail()`. The confirmed defect to fix: a Work parent and its
active child must **never** both carry `aria-current="page"`.

### 10.1 Resolution rules

- **Work parent link** (`to="/work/tasks"`, `end={false}`): when any Work child is active, the parent
  carries `aria-current="location"` (NOT `page`); when no Work route is active, it carries nothing.
- **Active Work child** carries `aria-current="page"`; siblings carry nothing.
- **Non-Work destinations** (Home, Events, Money, Inbox, Modules, Admin, Profile): the active one
  carries `aria-current="page"`; all others nothing.
- A record route (`/work/tasks/:taskId`) resolves to its owning collection (Work → Tasks) so the
  Tasks child is `page` and Work parent is `location`.
- **Phone**: the bottom-nav item for the active primary destination (Home/Work/Café/Inbox) carries
  `page`; when a non-primary destination is active (Events/Money/Ecommerce/Roastery/Admin/Profile),
  the **More** button carries `page` (convergence `mobileNav` `moreActive`). Rail and bottom-nav are
  never rendered simultaneously (`isNarrow` toggles), so the document-wide `page` count stays 1.

### 10.2 Implementation note (Rule 11 — extend, don't rebuild)

react-router's `NavLink` sets `aria-current="page"` on active by default and accepts an `aria-current`
prop to set the value used when active. The Work parent passes `aria-current="location"` so an active
parent announces `location`, not `page`; children keep the default `page`. This achieves exactly-one
`page` without a bespoke active-state machine. (The existing `rail-nav.test.tsx` aria-current tests
are updated to the new structure; the goal-oracle — exactly one `page` — is intact.)

> **Note on `task-row.tsx`:** the keyboard-cursor uses `aria-current="true"` (not `page`) to expose
> the cursor to AT. That value is distinct from `page` and does **not** count toward the
> `[aria-current="page"]` total. Unchanged.

---

## 11. One page-anatomy shell (Rule 6)

Every route renders the same four-region anatomy. Ported from convergence `shell()`:

1. **Header** (region 1) — the top bar (§5): brand + breadcrumb (left) · Search⌘K + Inbox + Deputy
   (right).
2. **Context row** (region 2) — **NEW** `ContextRow`: scope (Person/Team/BU, derived from the viewer
   + route) + the route's job sentence (§4.1). Always present (even if minimal on stubs).
3. **Content region** (region 3) — the page `<Outlet>` (the collection/list/feed; the page's own
   `PageHead` H1 lives here).
4. **Record drawer** (region 4) — the shared right-panel host (the existing split-view drawer outlet;
   the stack-navigated Record Panel of OD-19 lands in Step 3+). One host only — no competing drawers,
   no fifth region.

Phone collapses header + context row into a compact sticky bar and the drawer becomes a page stack
(convergence `.ctx-row { top: 0 }` fix retained); the four roles persist (Rule 6 / Rule 9).

**Pass bar (Rule 6):** each of the 4 regions is identifiable on every route; no route invents a fifth
region or a second drawer host. The deputy panel and ⌘K palette remain overlays (modals), not a
second record drawer; their unification into the single record-panel host (OD-20) is deferred to
Step 4+ (the anatomy *slot* is established here).

---

## 12. Functional requirements (EARS)

### Sidebar / rail
- **FR-001** The system shall render the sidebar in the order: Home · Work (always-expanded: Signals
  · Tasks · Projects & Processes · Objectives) · Events · Money · Inbox · Retail Ops (Café ·
  Ecommerce) · B2B Ops (Roastery) · Admin Settings · profile footer.
- **FR-002** Where the viewer holds neither `finance` nor `admin`, the system shall render no Money
  rail entry (absent, not disabled) on both desktop and phone.
- **FR-003** Where the viewer is not `admin`, the system shall render no Admin Settings rail entry.
- **FR-004** The system shall render exactly four Work collection-switcher children with zero family
  headings, always expanded.
- **FR-005** The system shall render the profile footer row (avatar + "{Site} {role}" + chevron)
  linking to `/profile`.

### Top bar
- **FR-006** The system shall render the top bar left-to-right as: brand lockup · current-location
  breadcrumb · spacer · Search⌘K · Inbox · Deputy.
- **FR-007** The system shall not render any universal-action (Ask Deputy / Share Signal / Create
  Task) button in the top bar; those actions shall be reachable only via the ⌘K palette.

### Routes + redirects
- **FR-008** The system shall expose the canonical routes listed in §6.1, each rendering its named
  component under its named guard.
- **FR-009** When a viewer navigates to any old route listed in §7, the system shall redirect
  (replace) to the named new canonical route, preserving `?view=` and `?record=` query state where
  the mapping carries it.
- **FR-010** The system shall redirect using `replace` semantics so browser Back never re-enters the
  old URL.
- **FR-011** The system shall treat `/work/tasks` `?view=` values `all | mine | team | overdue |
  followups` as the canonical saved-view URL state, preserved across Back / refresh / new-tab.
- **FR-012** When a viewer deep-links, refreshes, or opens a new tab on `/work/tasks?view=…`, the
  system shall render the same collection and saved-view query state.
- **FR-013** The system shall render a labelled stub (job sentence + "not in this slice") for the
  `/work/signals`, `/events`, `/ecommerce`, `/roastery`, and `/profile` routes.

### ⌘K palette
- **FR-014** The system shall render the ⌘K palette as a centered modal (e7 presentation), opened by
  the search field, the ⌘/Ctrl+K hotkey, and (on phone) the FAB when present.
- **FR-015** The ⌘K palette shall list the universal actions **Ask Deputy · Share Signal · Create
  Task** (verb+object), never reordered, plus at most one contextual action.
- **FR-016** The system shall not render any bare `Create` / `Add` / `New` action in the palette or
  any primary surface.
- **FR-017** The ⌘K palette Navigate items shall point to the new canonical routes (Home `/`, Work
  `/work/tasks`, Signals `/work/signals`, Events `/events`, Money `/money` when authorized, Inbox
  `/inbox`, Café `/cafe`).

### Breadcrumb
- **FR-018** The system shall render the breadcrumb with `·` separators, last segment bold as the
  current location, and no brand prefix, per §9.
- **FR-019** When on `/work/tasks/:taskId`, the system shall push the resolved task title as the
  final breadcrumb crumb via `BreadcrumbTitleProvider`.

### aria-current
- **FR-020** At any moment, the system shall render exactly one element with
  `aria-current="page"` across the whole document, at desktop and at ≤390px.
- **FR-021** When a Work child route is active, the Work parent link shall carry
  `aria-current="location"` and the active child shall carry `aria-current="page"`; the parent and
  child shall never both carry `page`.
- **FR-022** On phone, when a non-primary destination (Events/Money/Ecommerce/Roastery/Admin/Profile)
  is active, the More button shall carry `aria-current="page"`.

### Anatomy
- **FR-023** Every route shall render the four-region anatomy: header (§5) → context row (§11) →
  content → record drawer host; no route shall render a fifth region or a second drawer host.
- **FR-024** The context row shall render the active route's job sentence (§4.1) and the viewer's
  resolved scope (Team/BU).

### Responsive
- **FR-025** On phone (≤390px), the system shall render a bottom-nav of Home · Work · Café · Inbox ·
  More, where More opens the menu of every authorized destination not in the bottom nav.
- **FR-026** The system shall make every destination the viewer is authorized for reachable on both
  desktop and phone with the same action names and reachable records (Rule 9 parity).

### Reuse (Rule 11)
- **FR-027** The system shall re-home existing page components (TasksLayout, ObjectivesPage,
  ProjectsProcessesPage, DashboardPage, BudgetPage, PricingPage, Kitchen*Page, AdminUsersPage,
  InboxPage) under their new canonical routes without re-implementing them.
- **FR-028** The system shall extend the existing `command-menu`, `rail-nav`, `destinations`,
  `breadcrumb`, `top-bar`, `bottom-tab-bar`, and `mobile-drawer` components; the only new components
  shall be `context-row`, `job-sentences`, and `slice-stub-page` (each justified in §3.1).

---

## 13. Non-functional requirements

- **NFR-001 (typecheck/lint)** `npm run typecheck` shall report zero errors and ESLint shall report
  zero errors (`--max-warnings=0`) on changed code. Both block merge.
- **NFR-002 (coverage)** Changed lines shall be ≥80% covered; tests assert behavior (routing,
  aria-current, redirects, URL preservation), not line inflation.
- **NFR-003 (a11y)** The ⌘K palette shall retain `role=dialog` + `aria-modal` + focus trap + Esc +
  focus-return; tap targets ≥44px on phone; the breadcrumb shall ellipsize (No-bleed).
- **NFR-004 (no DB)** Zero migrations, zero RLS changes, zero schema touches. All gating reuses
  existing `RequireAccessRole` / `RequireCapability` / `AdminRoute` over the existing JWT/RLS.
- **NFR-005 (no regression of validated flows)** The three curated flows' future routes shall exist
  and not be blocked: F1 `/work/signals` (Step 4), F2 `/cafe` (Step 7), F3 `/work/tasks?view=overdue`
  (Step 3). (The flows themselves land in later steps; Step 2 must not remove or block these routes.)
- **NFR-006 (performance)** Redirects are client-side `<Navigate replace>` (no network round-trip);
  the shell render path is unchanged structurally (no new providers beyond the existing
  `BreadcrumbTitleProvider`). No perceptible regression in shell first paint.
- **NFR-007 (i18n)** All new visible strings shall flow through the i18n catalog
  (`src/i18n/messages.ts`) with EN chrome / ID content (OD-P0-2); no hardcoded user-facing copy in
  components.

---

## 14. Acceptance criteria (Given/When/Then)

Each AC is owned by **one** test at the **lowest sufficient layer**. The owning test's title carries
the AC id so `grep -r AC-XXX` finds the proof. Layer key: **RTL** = Vitest+RTL (component render /
logic); **e2e** = Playwright (routing / aria-current document-wide / Back+refresh / 390px).

### Routing + redirects (Rule 4)

- **AC-001** (e2e) — _Owns FR-008, FR-009, FR-010; Rule 4._
  Given a signed-in viewer, When they navigate to each old route in §7 (`/tasks`, `/tasks/:id`,
  `/work/cascade`, `/work/follow-ups`, `/objectives`, `/projects-processes`, `/work/projects-processes`,
  `/updates`, `/ops`, `/ops/new`, `/ops/:id/edit`, `/kitchen/log`, `/dashboard`, `/dashboard/detail`,
  `/sales`, `/plan/budget`, `/plan/pricing`), Then each lands on its named new canonical route, the
  URL is replaced (not pushed), and browser Back from the new URL does not re-enter the old route.
  - _Owns: `mos-app/e2e/shell-routes-redirects.spec.ts` AC-001 (table-driven over §7)._
- **AC-002** (e2e) — _Owns FR-011, FR-012; Rule 4._
  Given a viewer on `/work/tasks?view=mine`, When they refresh and when they copy the URL into a new
  tab, Then the URL and the `?view=mine` state are preserved on both.
  - _Owns: `mos-app/e2e/shell-url-state.spec.ts` AC-002._
- **AC-003** (e2e) — _Owns FR-011; Rule 4._
  Given a viewer on `/work/tasks?view=overdue` reached via the redirect from `/work/follow-ups`, When
  the redirect fires, Then the final URL is `/work/tasks?view=followups` and `?view=followups`
  survives refresh.
  - _Owns: `mos-app/e2e/shell-routes-redirects.spec.ts` AC-003._
- **AC-004** (e2e) — _Owns FR-009; Rule 4._
  Given a viewer on `/tasks/:taskId`, When the redirect fires, Then the final URL is
  `/work/tasks/:taskId` and the Task surface renders (reused `TasksLayout` + `TaskDrawer`).
  - _Owns: `mos-app/e2e/shell-routes-redirects.spec.ts` AC-004._
- **AC-005** (e2e) — _Owns FR-009; Rule 4 (kitchen→cafe re-home)._
  Given a viewer on `/kitchen/log`, When the redirect fires, Then the final URL is `/cafe/log` and the
  Kitchen Log surface renders (reused `KitchenLogPage`); the same holds for plan/stock/review/pushes.
  - _Owns: `mos-app/e2e/shell-routes-redirects.spec.ts` AC-005._
- **AC-006** (RTL) — _Owns FR-008, FR-027; Rule 4 / Rule 11._
  Given the route table, When rendered, Then `/work/projects` renders `ProjectsProcessesPage` under
  `RequireCapability('workline.manage')` and `/work/projects-processes` redirects to `/work/projects`;
  the visible label remains "Projects & Processes".
  - _Owns: `mos-app/src/router.test.tsx` AC-006._

### aria-current (Rule 5)

- **AC-007** (e2e) — _Owns FR-020; Rule 5._
  Given a signed-in admin viewer, When on each of `/`, `/work/tasks`, `/work/signals`, `/work/projects`,
  `/work/objectives`, `/events`, `/money`, `/inbox`, `/cafe/log`, `/admin/people`, `/profile`, Then
  `document.querySelectorAll('[aria-current="page"]').length === 1` on every route (desktop).
  - _Owns: `mos-app/e2e/shell-aria-current.spec.ts` AC-007._
- **AC-008** (e2e, 390px) — _Owns FR-020, FR-022; Rule 5 / Rule 9._
  Given a signed-in admin viewer on a 390px viewport, When on a primary destination (Home/Work/Café/
  Inbox) and when on a non-primary destination (Events/Money/Profile), Then exactly one
  `[aria-current="page"]` exists in the bottom-nav (primary item) or on the More button
  (non-primary), respectively.
  - _Owns: `mos-app/e2e/shell-aria-current.spec.ts` AC-008 (viewport 390×844)._
- **AC-009** (RTL) — _Owns FR-021; Rule 5._
  Given the rail rendered at `/work/signals`, When inspected, Then the Work parent link has
  `aria-current="location"`, the Signals child has `aria-current="page"`, and no other rail link has
  `aria-current="page"`.
  - _Owns: `mos-app/src/shell/rail-nav.test.tsx` AC-009._
- **AC-010** (RTL) — _Owns FR-021; Rule 5 (record route)._
  Given the rail rendered at `/work/tasks/:taskId`, When inspected, Then the Tasks child has
  `aria-current="page"`, the Work parent has `aria-current="location"`, and exactly one `page` exists.
  - _Owns: `mos-app/src/shell/rail-nav.test.tsx` AC-010._

### Sidebar structure + budgets (Rule 1, Rule 3)

- **AC-011** (RTL) — _Owns FR-001, FR-004; Rule 1 / Rule 3._
  Given an admin viewer, When the rail renders, Then it shows Home, Work (always-expanded with exactly
  the four children Signals · Tasks · Projects & Processes · Objectives and zero family headings),
  Events, Money, Inbox, the Retail Ops group (Café · Ecommerce), the B2B Ops group (Roastery), Admin
  Settings, and the profile footer — in that order.
  - _Owns: `mos-app/src/shell/rail-nav.test.tsx` AC-011._
- **AC-012** (RTL) — _Owns FR-002, FR-003; Rule 3 / Rule 9 / SALVAGE #8._
  Given a viewer with no `finance`/`admin` role, When the rail renders, Then Money is absent (not
  disabled, no "•" stub); given a non-admin, Admin Settings is absent.
  - _Owns: `mos-app/src/shell/rail-nav.test.tsx` AC-012._
- **AC-013** (RTL) — _Owns FR-005, FR-024; Rule 1 / Rule 6._
  Given any signed-in viewer, When the rail renders, Then the profile footer row shows the viewer's
  avatar and **full name** + role and opens the identity menu (UserChip) with a working **Sign out**;
  `/profile` remains reachable as a Utility rail link; the page shows its orientation signal exactly
  once — the active route's job sentence from the registry (context row, or region 3 where a
  PageFamilyFrame route owns it instead) — **or**, where the route's owner ruled a live status row
  answers the orientation question better (Rule 1, amended 2026-07-30), that status row in the
  sentence's place. Never both, never neither.
  _(Amended 2026-07-16, security audit HIGH-1: the original "{Site} {role}, links to /profile" footer
  removed the only sign-out affordance and the viewer's name from the shell — the amended wording is
  the security-correct behavior; original prose preserved in git history.)_
  _(Amended 2026-07-30, owner ruling: the literal-sentence requirement is retired for routes whose
  head carries a status row instead — Home is the first instance. Fixes a defect where Home rendered
  neither the sentence nor an oracle that could catch its absence: `docs/reviews/v4-redesign.md`
  Open item 1. The prior oracle here (`context-row.test.tsx`) exercised a fixture shape `/` never
  renders (a `jobSentence` prop with no `statusRow`) and so passed without ever guarding the real
  route; it has been rebuilt to compose the head the way `/` actually does.)_
  - _Owns: `mos-app/src/shell/context-row.test.tsx` AC-013 (and rail-nav AC-013 for the footer)._

### Top bar + ⌘K palette (Rule 6, Rule 7, OD-57)

- **AC-014** (RTL) — _Owns FR-006, FR-007; Rule 6 / OD-57._
  Given the top bar rendered, When inspected, Then left→right it shows brand + breadcrumb + spacer +
  Search⌘K + Inbox + Deputy, and contains no button labelled Ask Deputy / Share Signal / Create Task.
  - _Owns: `mos-app/src/shell/top-bar.test.tsx` AC-014._
- **AC-015** (RTL) — _Owns FR-014, FR-015, FR-016; Rule 7 / SALVAGE._
  Given the ⌘K palette open, When inspected, Then it renders as a centered modal and lists the
  universal actions Ask Deputy · Share Signal · Create Task (each verb+object), with no bare
  `Create`/`Add`/`New`, and at most one contextual action.
  - _Owns: `mos-app/src/components/command/command-menu.test.tsx` AC-015._
- **AC-016** (RTL) — _Owns FR-017; Rule 4 / Rule 7._
  Given the ⌘K palette open, When the Navigate group is inspected, Then its items point to `/`,
  `/work/tasks`, `/work/signals`, `/events`, `/inbox`, `/cafe`, and `/money` only when the viewer is
  authorized; the old "My Week / Weekly updates / Daily Log" entries are absent.
  - _Owns: `mos-app/src/components/command/command-menu.test.tsx` AC-016._
- **AC-017** (e2e) — _Owns FR-014; a11y._
  Given a viewer anywhere, When they press ⌘/Ctrl+K, Then the centered palette opens, focus moves to
  its input, Esc closes it, and focus returns to the trigger.
  - _Owns: `mos-app/e2e/shell-command-palette.spec.ts` AC-017._

### Breadcrumb (Rule 6, OD-57)

- **AC-018** (RTL) — _Owns FR-018; Rule 6 / OD-57._
  Given the routes in §9, When the breadcrumb renders at each, Then it matches the §9 table (`·`
  separator, last segment bold, no brand prefix); at `/work/tasks?view=mine` it reads
  "Work · Tasks · My work".
  - _Owns: `mos-app/src/shell/breadcrumb.test.tsx` AC-018._
- **AC-019** (RTL) — _Owns FR-019; Rule 6._
  Given the viewer at `/work/tasks/:taskId` with a resolved task title, When the breadcrumb renders,
  Then the final crumb is the resolved task title (via `BreadcrumbTitleProvider`); while loading, the
  section crumb alone shows.
  - _Owns: `mos-app/src/shell/breadcrumb.test.tsx` AC-019._

### Anatomy (Rule 6)

- **AC-020** (RTL) — _Owns FR-023; Rule 6._
  Given any route in §6.1, When the shell renders, Then the four regions are identifiable (header,
  context row, content, record-drawer host) and no fifth region or second drawer host exists.
  - _Owns: `mos-app/src/shell/app-shell.test.tsx` AC-020._

### Responsive parity (Rule 9, Rule 8 light)

- **AC-021** (e2e, 390px) — _Owns FR-025, FR-026; Rule 9._
  Given a signed-in admin viewer on 390px, When the phone shell renders, Then the bottom-nav shows
  Home · Work · Café · Inbox · More, and every authorized destination (Events, Money, Ecommerce,
  Roastery, Admin, Profile) is reachable via More.
  - _Owns: `mos-app/e2e/shell-phone-nav.spec.ts` AC-021 (supersedes `AC-410-nav-five-destinations.spec.ts`)._
- **AC-022** (e2e, 390px) — _Owns FR-002; Rule 9 / SALVAGE #8._
  Given a non-finance/admin viewer on 390px, When the phone shell renders, Then Money is absent from
  both the bottom-nav and the More menu.
  - _Owns: `mos-app/e2e/shell-phone-nav.spec.ts` AC-022._

### Extension + reuse (Rule 10, Rule 11)

- **AC-023** (review-attested) — _Owns FR-028 / §6.3; Rule 10._
  Given the shipped shell, When a reviewer describes adding "a Standards compliance calendar" and "a
  future Procurement Module", Then they can do so by adding (i) a collection + (ii) a view renderer +
  (iii) feed/activity-thread entries, reusing the existing UI families and anatomy, with no new rail
  root, no new destination job, no new anatomy, and no second drawer host. (Attested in the review
  ledger; not a render test.)
  - _Owns: `docs/reviews/<branch>.md` AC-023 (review-attested)._
- **AC-024** (review-attested) — _Owns FR-027, FR-028; Rule 11._
  Given the step-2 diff, When reviewed, Then every changed surface is an extension/re-home of an
  existing component (per §3), and the only new components are `context-row`, `job-sentences`, and
  `slice-stub-page` (each justified in §3.1 with no existing counterpart). (Attested in the review
  ledger against the §3 table.)
  - _Owns: `docs/reviews/<branch>.md` AC-024 (review-attested)._

### Future-flow routes not blocked (NFR-005)

- **AC-025** (e2e) — _Owns NFR-005._
  Given the shipped shell, When a viewer navigates to `/work/signals`, `/cafe`, and
  `/work/tasks?view=overdue`, Then each route resolves (stub or real) and is not a 404 — the three
  future validated flows have a route home.
  - _Owns: `mos-app/e2e/shell-routes-redirects.spec.ts` AC-025._

---

## 15. Experience-Contract Rule → AC matrix (Rules 1–11)

| Rule | What it requires here | Owning AC(s) |
|---|---|---|
| **1** One job per rail item | Every rail item maps to §4.1 job sentence; context row shows it | AC-011, AC-013 |
| **2** Three-layer boundary (surfaces merge, schemas don't) | No new record editor / drawer host / table; existing families extended | AC-020, AC-024 |
| **3** Rail/surface budget (numeric caps) | 5 dest roots · 3 modules · 2 BU headings · 2 utility · 4 Work children · 0 family headings · 1 aria-current | AC-011, AC-012 |
| **4** Canonical routes + URL state | §6 routes; `?view=` preserved; redirects from every old route; Back/refresh/new-tab | AC-001, AC-002, AC-003, AC-004, AC-005, AC-006 |
| **5** One `aria-current="page"` | Exactly one document-wide; Work parent = `location`; phone More | AC-007, AC-008, AC-009, AC-010 |
| **6** One page anatomy | Four regions on every route; no fifth region / second drawer; header=brand+breadcrumb·search+inbox+deputy | AC-014, AC-018, AC-019, AC-020 |
| **7** Verb+object (no bare Create) | Palette = Ask Deputy · Share Signal · Create Task (+ ≤1 contextual); no bare Create | AC-015, AC-016 |
| **8** Capture-first (mobile) | Phone nav is bottom-nav + More (work destinations reachable); collection-picker behind Work child | AC-021 (light — full collection capture-first is Step 3) |
| **9** Responsive parity | Same destinations reachable phone + desktop; Money hidden on both | AC-008, AC-012, AC-021, AC-022 |
| **10** Extension test | New Module/calendar/record ships with no new rail root/anatomy | AC-023 |
| **11** Component reuse | Extend/re-home existing; only justified new components | AC-024 (and §3 table) |

---

## 16. Error handling

| Condition | System behavior |
|---|---|
| Old route with no mapping in §7 (truly unknown) | Falls through to `*` → `NotFoundPage` (unchanged). No redirect loop. |
| `?view=` value not in `all\|mine\|team\|overdue\|followups` | Step 2: the param is preserved in the URL (URL grammar contract) but the Tasks UI ignores unknown values (treats as default `all`) — Step 3 owns chip validation. |
| Redirect chain (`/sales` → `/money`, `/objectives` → `/work/objectives`) | A single `<Navigate replace>` per old route; no chained redirects (each old route maps directly to its final canonical route). `/sales`→`/money` (not `/sales`→`/dashboard`→`/money`). |
| Money route hit by an unauthorized viewer (direct URL) | `RequireAccessRole(['finance','admin'])` bounces to `/` (existing guard behavior). RLS is the real boundary. |
| Work child route hit by a viewer lacking the capability (e.g. `/work/objectives` without `objective.manage`) | `RequireCapability` bounces to `/work/cascade`'s successor → `/work/tasks` (update the bounce target from `/work/cascade` to `/work/tasks`). |
| ⌘K palette opened with `SHOW_ASSISTANT=false` | "Ask Deputy" renders as a labelled coming-soon/disabled entry (no crash; the runtime provider is absent). |
| Stub route (`/events`, `/ecommerce`, `/roastery`, `/profile`, `/work/signals`) | Renders `SliceStubPage` with the route's job sentence + "not in this slice" — never a 404, never an empty white screen. |
| Deep-link to a retired record (`/work/follow-ups/:id`) | Route unchanged in Step 2 (D-2); renders `FollowUpsPage` if `SHOW_FOLLOWUPS`, else redirects to `/` (existing behavior). Step 9 canonicalizes. |

---

## 17. Implementation TODO checklist (→ plan phase)

> 2–5 min tasks, exact paths, real verify commands. The eng-planner expands into
> `docs/plans/2026-07-14-redesign-shell-routes.md`.

- [ ] **T1 — i18n keys.** Add `dest.events`, `dest.money`, `dest.signals`, `nav.signals`,
      `nav.events`, `nav.money`, `nav.cafe`, `nav.ecommerce`, `nav.roastery`, `nav.admin`,
      `nav.profile`, and job-sentence keys to `src/i18n/messages.ts` (EN + ID). Verify:
      `npm run typecheck`.
- [ ] **T2 — job-sentences registry.** Create `src/shell/job-sentences.ts` porting §4.1 from the
      convergence `jobSentences`. Verify: unit test asserts the 11 rows.
- [ ] **T3 — destinations model.** Extend `src/shell/destinations.tsx` to the new destination set
      (Home/Work/Events/Money/Inbox + Modules + Admin/Profile); Work children; retire Operate/Plan
      roots; Money `anyOf=['finance','admin']`. Verify: `npm test -- destinations`.
- [ ] **T4 — sections remap.** Extend `src/shell/sections.tsx`: remap kitchen→cafe, add
      events/money/signals/profile. Verify: `npm test -- sections`.
- [ ] **T5 — rail-nav.** Extend `src/shell/rail-nav.tsx`: Work parent link (`to=/work/tasks`,
      `aria-current="location"`) + always-expanded 4 children; Events; Money gated; BU-grouped
      Modules; Admin; profile footer. Verify: `npm test -- rail-nav` (AC-009..012).
- [ ] **T6 — bottom-tab-bar + mobile-drawer.** Extend for Home·Work·Café·Inbox·More + More menu.
      Verify: `npm test -- bottom-tab-bar mobile-drawer`.
- [ ] **T7 — top-bar.** Extend `src/shell/top-bar.tsx` to OD-57 layout; move profile to rail footer
      (or note D-4); confirm no header action buttons. Verify: `npm test -- top-bar` (AC-014).
- [ ] **T8 — breadcrumb.** Extend `src/shell/breadcrumb.tsx`: new destinations + Work children +
      `?view=` leaf + `·` separator. Verify: `npm test -- breadcrumb` (AC-018, AC-019).
- [ ] **T9 — context-row.** Create `src/shell/context-row.tsx`; mount as region 2 in `app-shell.tsx`.
      Verify: `npm test -- context-row` (AC-013, AC-020).
- [ ] **T10 — slice-stub-page.** Create `src/pages/slice-stub-page.tsx`; mount for
      `/work/signals`, `/events`, `/ecommerce`, `/roastery`, `/profile`. Verify: RTL renders job
      sentence.
- [ ] **T11 — router re-route.** Edit `src/router.tsx`: add §6.1 canonical routes (re-homing
      components) + §7 redirect map (all `<Navigate replace>`); update `RequireCapability` bounce
      targets to `/work/tasks`; retire SHOW_WEEKLY_UPDATES/SHOW_DAILY_LOG gating on retired routes.
      Verify: `npm test -- router` (AC-006); `npm run typecheck`.
- [ ] **T12 — command-menu.** Extend `src/components/command/command-menu.tsx` + `.css`: new action
      set (Ask Deputy/Share Signal/Create Task + ≤1 contextual); new Navigate targets; centered-modal
      CSS. Verify: `npm test -- command-menu` (AC-015, AC-016).
- [ ] **T13 — features flags.** Edit `src/config/features.ts`: retire SHOW_WEEKLY_UPDATES/
      SHOW_DAILY_LOG/SHOW_FOLLOWUPS (pages retired/redirected); make Inbox live (D-1). Verify:
      `npm run typecheck`.
- [ ] **T14 — update superseded tests.** Update `e2e/AC-410-nav-five-destinations.spec.ts` →
      `shell-phone-nav.spec.ts` (AC-021/022); update `e2e/shell-nav.spec.ts` (AC-001) legs to new
      routes; update any e2e asserting old URLs (`/dashboard`, `/kitchen/log`, `/tasks`) to follow
      redirects + assert new canonical URLs (BDD rule: update journey *steps* for the deliberate
      re-route; goal-oracle intact). Verify: `npx playwright test shell-`.
- [ ] **T15 — full gate.** `npm run typecheck && npm run lint && npm test && npx playwright test`.
      Coverage ≥80% changed lines.
- [ ] **T16 — review ledger + visual matrix.** Capture 1280px + 390px before/after vs the
      convergence reference shots; score Rules 1–11 pass/fail in `docs/reviews/<branch>.md`.
- [ ] **T17 — owner walkthrough gate.** Demo the shell + routes + ⌘K + aria-current + redirects;
      owner sign-off before merge.

---

## 18. Deviations / deferred (explicit, reviewable)

- **D-1 — Inbox flag.** Inbox is a redesign destination root (OD-57). The existing `SHOW_INBOX`
  flag is retired (Inbox live) so the rail/bottom-nav always show it. Inbox *content* (triage of
  mentions/exceptions) depends on Signals (Step 4); Step 2 shows the existing `InboxPage` (empty/
  placeholder triage). If the owner prefers to keep Inbox hidden until Step 4, the flag stays and
  Inbox is absent — a one-line decision at the walkthrough.
- **D-2 — Follow-up record canonicalization deferred.** `/work/follow-ups/:id` is **not** redirected
  in Step 2 (it keeps rendering `FollowUpsPage`, flag-gated as today) to avoid breaking deep-links.
  Its canonical home (under `/money` or `/work/tasks/:id`) is Step 9 (Money + Inbox alignment,
  OD-9/D9). The collection `/work/follow-ups` → `/work/tasks?view=followups` redirect *is* in Step 2.
- **D-3 — Money capability.** The convergence gates Money via `can(p, 'money.view')`. The app has no
  `money.view` capability in `lib/capabilities.ts` yet. Step 2 gates Money by the existing
  `finance`/`admin` access roles (the same gate the Dashboard uses today) — extending the existing
  pattern (Rule 11). Introducing a `money.view` capability is a deferred ADR-0020 refinement.
- **D-4 — Header user chip placement.** The convergence moves the persona out of the header into a
  rail-footer profile row. The current `top-bar.tsx` has a `UserChip` in the right cluster. Whether
  the header keeps an avatar-only chip (phone) or fully defers to the rail profile row is a design
  call ratified at the Step-2 walkthrough. Either way, FR-006 (no universal-action buttons) holds.
- **D-5 — Phone FAB→palette.** The convergence opens the ⌘K palette via a phone FAB. The current app
  has no FAB (DESIGN.md No-FAB Rule; the deputy launcher is the header icon). Step 2 wires the palette
  to the header search trigger + ⌘K hotkey on phone; a phone FAB→palette (if the owner wants it) is
  added with the Café Step-7 local-capture FAB (OD-REDESIGN-21/46) — not a global Capture FAB.
- **D-6 — Retired page components.** `UpdatesPage`, `OpsPage`, `OpsAddForm`, `CascadePage` are not
  re-homed (their routes redirect to successors). They may remain in the tree unreferenced for the
  Step-2 PR; deletion is a cleanup follow-up (does not block merge; Rule 11 does not require deletion,
  only non-reimplementation).
- **D-7 — Plan destination retired.** There is no Plan rail root in the redesign (OD-57). Plan's
  finance surfaces (Dashboard, Budget, Pricing) re-home under Money. `/plan/*` redirects to
  `/money/*`. The `SHOW_PLAN_BUDGET` flag still gates `/money/budget` + `/money/pricing` (unchanged
  behavior, new path).
- **D-8 — Shared Record Panel deferred.** The stack-navigated single Record Panel (OD-REDESIGN-19,
  OD-20: deputy/inbox/record share one host) is **not** built in Step 2. Step 2 establishes the
  anatomy slot (region 4, single host = the existing split-view drawer outlet). The panel-stack
  mechanics land with Steps 3 (Tasks) / 4 (Signals). The deputy panel and ⌘K palette remain
  overlays in Step 2.

---

## 19. Self-verification (spec author)

Re-read against the contract + OD-57 + salvage inventory:

- **Every rail item / route / redirect specified?** Rail items: §4 (all 5 destinations + 4 Work
  children + 3 modules + 2 utility). Routes: §6.1 (all canonical). Redirects: §7 (enumerated from
  `router.tsx` — every current authed route has a fate: re-home or redirect). ✅
- **Every Experience-Contract rule has an AC?** §15 matrix — Rules 1–11 each map to ≥1 AC. ✅
- **Rule 11 honored?** §3 EXTEND table + §3.1 NEW table (3 justified new components only). No new
  record editor / drawer / table / palette. ✅
- **Real file paths?** All paths in §3 verified to exist in `mos-app/` (router.tsx, shell/*,
  components/command/*, config/features.ts, i18n/messages.ts, lib/capabilities.ts, pages/*). ✅
- **OD-57 frame directives?** Header = brand+breadcrumb · search+inbox+deputy (FR-006/007); Work
  children = Signals·Tasks·Projects & Processes·Objectives (FR-001/004); Events destination root
  (FR-001/§6); universal actions in ⌘K not header (FR-007/015). ✅
- **SALVAGE overrides respected?** #1 single-`#/work` → distinct Work child routes (§6); #2
  co-active aria-current → §10 exactly-one + parent `location`; #3 8-collection Work rail → 4
  children; #4 generic Create → verb+object (FR-016); #8 gated Money stub → absent (FR-002); #9
  convergence task table → not ported (Tasks re-home is Step 3, reuses shipped `TasksWorkspace`);
  #10 bottom-sheet palette → e7 centered modal (FR-014); #11 My/Team/Library children → saved-view
  chips inside Tasks (§6.2). ✅
- **Standing acceptance?** Visual-diff matrix (T16), Rules 1–11 scored (T16), three flows not
  blocked (AC-025/NFR-005), Playwright asserts mechanical rules (AC-007/008/017), owner walkthrough
  gate (T17). ✅
- **No DB work?** NFR-004; all gating reuses existing guards. ✅

SPEC-DONE
