# Plan — Redesign Shell + Routes (Buildout Step 2)

| | |
|---|---|
| **Spec** | `docs/specs/redesign-shell-routes.spec.md` (DRAFT 2026-07-14, SPEC-DONE) |
| **Workstream** | Redesign buildout — `docs/plans/2026-07-14-redesign-buildout.md`, **Step 2** |
| **Authority** | Experience Contract Rules 1–11 (binding) → SALVAGE-INVENTORY (convergence OWNS frame/URL/aria/⌘K-contents; e7 OWNS ⌘K centered-modal presentation) → convergence-flows `flows.js` (visual truth) → spec §6/§7/§10 |
| **Owner gate** | YES — interactive walkthrough (Step-2 flag) + standing visual-diff matrix (1280px + 390px before/after vs convergence, in `docs/reviews/<branch>.md`) |
| **DB/RLS** | **Zero.** All gating reuses existing `RequireAccessRole`/`RequireCapability`/`AdminRoute`/`ProtectedRoute` over the existing JWT/RLS. |
| **Branch** | `feat/redesign-buildout` (current); commit per task, worktree already on this branch. |

This plan is **port, not invention** (Rule 11). The convergence `flows.js` owns the frame,
the URL grammar, the redirects, the exactly-one `aria-current` logic, and the ⌘K *contents*;
e7 owns the ⌘K *centered-modal presentation*. Every change below extends or re-homes an
existing `mos-app` component. The only new components are `context-row`, `job-sentences`,
and `slice-stub-page` — each justified in spec §3.1 with no existing counterpart.

---

## 1. Design decisions (brainstorm — one at a time)

### D-PLN-1 — Flag retirement is scoped to the route layer + `SHOW_INBOX` only (DEVIATION from spec §17 T13, surfaced for the Director)

The spec's T13 says "retire `SHOW_WEEKLY_UPDATES`/`SHOW_DAILY_LOG`/`SHOW_FOLLOWUPS`". A repo
scan shows `SHOW_WEEKLY_UPDATES`/`SHOW_DAILY_LOG` are consumed by **Home/MyWeek inline
surfaces** (`mos-app/src/pages/home-page.tsx`, `pages/my-week.tsx`,
`components/weekly/my-week-panel.tsx`, `pages/my-week.test.tsx`,
`pages/my-week.hidden.test.tsx`, `components/weekly/weekly-update-review-pane.fixes.test.tsx`)
— not only by routes. Removing those exports in Step 2 would delete the Home Weekly-Updates /
Daily-Log panels, which is a **Home content change** owned by Steps 4 (Signal) / 5 (Home
proper) — out of Step 2's scope (spec §2.2).

**Decision (behavior-preserving, scope-respecting):**
- **Retire the route-layer gating only.** `/updates`, `/ops`, `/ops/new`, `/ops/:id/edit`
  become **unconditional** `<Navigate replace>` to their successors (spec §7), ignoring the
  flags. `/work/follow-ups` (collection) → unconditional `<Navigate to="/work/tasks?view=followups" replace />`.
- **Keep** `SHOW_WEEKLY_UPDATES`, `SHOW_DAILY_LOG`, `SHOW_FOLLOWUPS` exported from
  `config/features.ts` (still `true`/`false` as today; still consumed by Home/MyWeek + the
  `/work/follow-ups/:id` route per spec D-2). Step 4/5 retire them with the Signal/Home work.
- **Retire `SHOW_INBOX`** (spec D-1 primary path): it is consumed only by in-scope files
  (`top-bar.tsx`, `destinations.tsx`, `router.tsx`) — no Home inline surface. Inbox becomes
  always-live. Behavior is unchanged today (the flag is already `true`), so this is a pure
  de-flagging. **Walkthrough-confirm** (D-1 fallback: if the owner wants Inbox hidden until
  Step 4, keep the flag — one-line revert).

**Why this is the right call:** it moves the IA (routes redirect) without touching Home
content, preserves the `/work/follow-ups/:id` deep-link contract (D-2), and keeps the
typecheck green across the 6 Home/MyWeek files. Full flag retirement is tracked for Step 4/5.

### D-PLN-2 — Money gating reuses the existing `anyOf=['finance','admin']` access-role gate (spec D-3)

The convergence gates Money via `can(p, 'money.view')`. The app has no `money.view` capability
in `lib/capabilities.ts` (only `objective.manage`/`workline.manage`/`followup.confirm`). Adding
one is an ADR-0020 refinement, out of scope. **Money is gated by `RequireAccessRole
anyOf={['finance','admin']}`** — the exact gate `/dashboard` uses today — on both the route
(`/money`, `/money/detail`, `/money/budget`, `/money/pricing`) and the rail/bottom-nav
(`destinations.tsx` `anyOf`). RLS remains the real boundary. No new capability, no schema.

### D-PLN-3 — Exactly-one `aria-current="page"` via NavLink's `aria-current` prop (spec §10.2)

react-router's `NavLink` sets `aria-current="page"` on active by default and accepts an
`aria-current` prop to set the value used when active. The **Work parent** `NavLink` passes
`aria-current="location"` so an active parent announces `location`, never `page`; the four
Work **children** keep the default `page`. Non-Work destinations use default `page`. This
achieves exactly-one `page` document-wide **without a bespoke active-state machine** (Rule 11
— extend, don't rebuild). The phone bottom-nav keeps its existing explicit
`aria-current={active ? 'page' : undefined}` and adds the **More** button carrying `page`
when a non-primary destination is active (convergence `mobileNav` `moreActive`). Rail and
bottom-nav are never rendered simultaneously (`useIsNarrow` toggles), so the document-wide
`page` count stays 1.

### D-PLN-4 — Three registries model the three rail zones (Rule 3 numeric caps)

`destinations.tsx` is extended from one `DESTINATIONS` list to **three registries** that map
1:1 to the convergence rail's three zones (Workspace / Modules / Utility):

- `DESTINATIONS` — the **5** destination roots: `home`, `work` (+ always-expanded 4 children:
  signals · tasks · projects · objectives), `events`, `money` (`anyOf:['finance','admin']`),
  `inbox`. Used by the rail Workspace zone + the phone bottom-nav primary tabs.
- `MODULES` — **2** BU groups: Retail Ops [café, ecommerce], B2B Ops [roastery] (**3** module
  roots, **0** family headings inside Work switcher).
- `UTILITY` — **2** entries: `admin` (gated `admin`), `profile` — own foot group.

`isLive`/`destinationForPath` are extended to resolve across all three so the breadcrumb and
aria-current logic see one owner per route. `DestinationId` widens to the union of all zone
ids. This keeps the single-source-of-truth invariant (rail + bottom-nav + breadcrumb read the
same model) while honoring the caps.

### D-PLN-5 — `ContextRow` is a new shell region (region 2), not a second page-head

`page-head.tsx` is a per-page H1 inside region 3. The convergence makes the context row a
**shell** region (Rule 6: "the context row carries scope + the route's job sentence"),
rendered above the `<Outlet>` on every route. It is genuinely new (no shared shell-level
scope+job strip exists). It reads the active route's job sentence from `job-sentences.ts` and
the viewer's resolved scope (Person/Team/BU) from `useAuth`. Minimal on stubs. Mounted once in
`app-shell.tsx` between the header and the content Outlet — **no new provider** (spec NFR-006).

### D-PLN-6 — Anatomy region 4 = the existing per-route split-view drawer (spec D-8)

The stack-navigated single Record Panel (OD-REDESIGN-19/20) is **deferred to Steps 3/4**.
Step 2 establishes the **anatomy slot**: `app-shell.tsx` renders regions 1 (TopBar) + 2
(ContextRow) + 3 (content Outlet) explicitly and adds **no new drawer host** (Rule 11). The
record drawer (region 4) remains the existing per-route split-view outlet (e.g. `TasksLayout`'s
drawer on `/work/tasks/*`). AC-020 (RTL on `app-shell.test.tsx`) asserts the shell itself
contributes exactly header + context-row + content regions and **zero** competing drawer
hosts / fifth regions; the per-route drawer is verified by the existing Tasks e2e. This is the
honest, Rule-11-safe reading of "establish the slot, defer the mechanics."

### D-PLN-7 — `command-menu` extends `CommandItem` with an optional `run` callback

The existing `CommandItem` is `{ id, label, glyph, action, to, meta?, record? }` and
`activate()` does `navigate(item.to)`. The redesign's universal actions are not pure
navigations: **Ask Deputy** opens the `AssistantPanel`; **Share Signal** dispatches to the
composer-opening target (navigate Home + composer placeholder — full composer is Step 4);
**Create Task** navigates `/work/tasks/new`. **Extend** `CommandItem` with `run?: () => void`
and a `kind: 'action' | 'navigate' | 'record'` discriminator; `activate()` calls `item.run?.()`
when present, else `navigate(item.to)`. The centered-modal CSS (`left:50%;
transform:translateX(-50%)`) **already matches e7's centered presentation** (SALVAGE #10) —
the CSS task is confirm/align only (no bottom-sheet). The contents (universal actions + new
Navigate targets) are ported from convergence `launcherActions`/`mountLauncher`.

### D-PLN-8 — Redirects preserve query state via two tiny local helpers (FR-009)

`<Navigate to="...">` does not interpolate route params or preserve `?view=`/`?record=`. Add
two local helper components in `router.tsx` (route plumbing, not a new surface — Rule 11):
`SearchRedirect(to)` reads `useLocation().search` and navigates `{ pathname: to, search }`
`replace`; `TasksIdRedirect()` reads `useParams().taskId` + search →
`/work/tasks/:taskId`. Every redirect that can carry query/param state uses the appropriate
helper; pure redirects (`/updates`→`/work/signals`, `/ops`→`/`) use plain `<Navigate replace>`.
No chained redirects (spec §16): `/sales`→`/money` directly, not via `/dashboard`.

---

## 2. File list (real paths, EXTEND vs NEW — Rule 11)

### EXTEND (existing files)

| File | Change summary |
|---|---|
| `mos-app/src/i18n/messages.ts` | Add new EN+ID keys (§3.1). Keep retired keys (`dest.operate`/`dest.plan`/`nav.updates`/…) unreferenced — no removal (parity test stays green). |
| `mos-app/src/shell/icons.tsx` | Add `WorkIcon`, `EventsIcon`, `SignalsIcon`, `MoneyIcon`, `CafeIcon`, `EcommerceIcon`, `RoasteryIcon`, `ProfileIcon`, `ShieldIcon`, `MoreIcon` (all verified absent today). Reuse existing `KitchenIcon`/`ObjectiveIcon`/`WorkLineIcon`/`InboxIcon`/`HomeIcon`/`TasksIcon` where the destination already has a mark. |
| `mos-app/src/shell/destinations.tsx` | Three-registry model (D-PLN-4); retire operate/plan roots; Work 4 children; Money `anyOf:['finance','admin']`; widen `DestinationId`; extend `isLive`/`destinationForPath`. |
| `mos-app/src/shell/sections.tsx` | Remap `KITCHEN_SECTIONS`→`CAFE_SECTIONS` (paths `/cafe/*`); add events/money/signals/profile sections; drop retired `/updates`/`/ops` entries. |
| `mos-app/src/shell/rail-nav.tsx` | New rail structure (Workspace/Modules/Utility); Work parent `NavLink aria-current="location"`; always-expanded 4 children; BU groups; Admin gated; profile footer row; retire Settings stub + operate special-case. |
| `mos-app/src/shell/breadcrumb.tsx` | Resolve new destinations + Work children + `?view=` saved-view leaf; `·` separator (was `›`); last segment bold; no brand prefix. |
| `mos-app/src/shell/top-bar.tsx` | OD-57 layout (brand+breadcrumb left · Search⌘K + Inbox + Deputy right); NotificationBell always renders (retire `SHOW_INBOX` conditional); profile → rail footer (D-4 walkthrough-confirm: keep avatar-only chip on phone or fully defer — either way FR-006/007 hold). |
| `mos-app/src/shell/bottom-tab-bar.tsx` | Home · Work · Café · Inbox · More; `More` carries `aria-current="page"` when a non-primary destination is active. |
| `mos-app/src/shell/mobile-drawer.tsx` | `More` menu = every authorized non-primary destination (Events, Money, Ecommerce, Roastery, Admin, Profile). |
| `mos-app/src/shell/app-shell.tsx` | Mount `ContextRow` as region 2 above the content Outlet; add `data-anatomy` region markers (header/context/content); no new drawer host (D-PLN-6). |
| `mos-app/src/router.tsx` | §6.1 canonical routes (re-home components) + §7 redirect map (`SearchRedirect`/`TasksIdRedirect`/plain `<Navigate replace>`); update `RequireCapability` bounce to `/work/tasks`; retire route-layer flag gating (D-PLN-1). |
| `mos-app/src/auth/require-capability.tsx` | Bounce target `/work/cascade` → `/work/tasks` (cascade noun retired). |
| `mos-app/src/config/features.ts` | Retire `SHOW_INBOX` (remove export). **Keep** `SHOW_WEEKLY_UPDATES`/`SHOW_DAILY_LOG`/`SHOW_FOLLOWUPS` (D-PLN-1). |
| `mos-app/src/components/command/command-menu.tsx` | New universal actions (Ask Deputy · Share Signal · Create Task + ≤1 contextual) + new Navigate targets; `CommandItem.run`/`kind` (D-PLN-7). |
| `mos-app/src/components/command/command-menu.css` | Confirm centered-modal presentation (already `left:50%; transform:translateX(-50%)`); align `top` to e7 (`12vh`-style) if owner prefers — minor. |

### NEW (justified — no existing counterpart, spec §3.1)

| File | Why genuinely new |
|---|---|
| `mos-app/src/shell/job-sentences.ts` | Rule-1 job-sentence registry (12 rows), ported verbatim from convergence `fixtures.js` `jobSentences`. No such registry in the app. |
| `mos-app/src/shell/context-row.tsx` | Region 2 of the anatomy (D-PLN-5). `page-head.tsx` is a per-page H1 in region 3 — not a counterpart. |
| `mos-app/src/pages/slice-stub-page.tsx` | One parameterized placeholder for not-in-this-slice routes (`/work/signals`, `/events`, `/ecommerce`, `/roastery`, `/profile`). Distinct from `not-found-page.tsx` (a 404; the stub is a real route placeholder). |

### TEST files (TDD — written red-first, then impl)

| Test file | ACs owned | Layer |
|---|---|---|
| `mos-app/src/shell/job-sentences.test.ts` | (T2 sanity: 12 rows) | Unit |
| `mos-app/src/shell/rail-nav.test.tsx` (extend) | AC-009, AC-010, AC-011, AC-012, AC-013 (footer) | RTL |
| `mos-app/src/shell/breadcrumb.test.tsx` (extend) | AC-018, AC-019 | RTL |
| `mos-app/src/shell/top-bar.test.tsx` (extend) | AC-014 | RTL |
| `mos-app/src/shell/context-row.test.tsx` (new) | AC-013, AC-020 (partial) | RTL |
| `mos-app/src/shell/app-shell.test.tsx` (extend) | AC-020 | RTL |
| `mos-app/src/shell/bottom-tab-bar.test.tsx` + `mobile-drawer.test.tsx` (extend) | AC-021, AC-022 (unit arm) | RTL |
| `mos-app/src/shell/destinations.test.ts` + `sections.test.ts` (rewrite) | (model invariants) | Unit |
| `mos-app/src/router.test.tsx` (extend) | AC-006 | RTL |
| `mos-app/src/components/command/command-menu.test.tsx` (extend) | AC-015, AC-016 | RTL |
| `mos-app/e2e/shell-routes-redirects.spec.ts` (new) | AC-001, AC-003, AC-004, AC-005, AC-025 | e2e |
| `mos-app/e2e/shell-url-state.spec.ts` (new) | AC-002 | e2e |
| `mos-app/e2e/shell-aria-current.spec.ts` (new) | AC-007, AC-008 | e2e |
| `mos-app/e2e/shell-command-palette.spec.ts` (new) | AC-017 | e2e |
| `mos-app/e2e/shell-phone-nav.spec.ts` (new, supersedes `AC-410-nav-five-destinations.spec.ts`) | AC-021, AC-022 | e2e |
| `mos-app/e2e/shell-nav.spec.ts` (update) | AC-001 legs → new routes | e2e |
| 9 re-homed e2e (update journey steps) + 4 retired-surface e2e (skip) | (BDD: steps updated, goal intact) | e2e |

---

## 3. The exact changes

### 3.1 i18n keys to add (`mos-app/src/i18n/messages.ts`, EN + ID, shape-identical)

Add to both `en` and `id` (exact strings; ID translations inline):

```
'dest.events': 'Events' / 'Acara'
'dest.money': 'Money' / 'Keuangan'
'dest.cafe': 'Café' / 'Kafe'
'dest.ecommerce': 'Ecommerce' / 'Ecommerce'
'dest.roastery': 'Roastery' / 'Roastery'
'dest.admin': 'Admin Settings' / 'Pengaturan Admin'
'dest.profile': 'Personal Profile' / 'Profil Pribadi'
'nav.signals': 'Signals' / 'Sinyal'
'nav.events': 'Events' / 'Acara'
'nav.money': 'Money' / 'Keuangan'
'nav.cafe': 'Café' / 'Kafe'
'nav.ecommerce': 'Ecommerce' / 'Ecommerce'
'nav.roastery': 'Roastery' / 'Roastery'
'nav.admin': 'Admin Settings' / 'Pengaturan Admin'
'nav.admin.people': 'People' / 'Orang'
'nav.profile': 'Personal Profile' / 'Profil Pribadi'
'nav.work.signals': 'Signals' / 'Sinyal'
'nav.work.projects': 'Projects & Processes' / 'Proyek & Proses'
'nav.work.objectives': 'Objectives' / 'Objective'
'rail.workspace': 'Workspace' / 'Ruang Kerja'
'rail.retailOps': 'Retail Ops' / 'Retail Ops'
'rail.b2bOps': 'B2B Ops' / 'B2B Ops'
'nav.more': 'More' / 'Lainnya'
'job.home': 'What needs my attention right now?' / 'Apa yang perlu perhatian saya sekarang?'
'job.work': 'Find and do the work I own or my Team owns.' / 'Temukan dan kerjakan tugas yang jadi tanggung jawab saya atau Tim saya.'
'job.tasks': 'Find and do the work I own or my Team owns.' / 'Temukan dan kerjakan tugas yang jadi tanggung jawab saya atau Tim saya.'
'job.signals': 'Search and revisit the Signals your Teams have shared.' / 'Cari dan tinjau kembali Sinyal yang dibagikan Tim Anda.'
'job.projects': 'Govern the Processes and Projects that generate the work.' / 'Kelola Proses dan Proyek yang menghasilkan kerja tersebut.'
'job.objectives': 'Track the Objectives the org committed to.' / 'Pantau Objective yang sudah dikomitmenkan org.'
'job.events': 'See what’s happening around our outlets and when.' / 'Lihat apa yang terjadi di outlet kita dan kapan.'
'job.money': 'Trust the financial figures and act on money exceptions.' / 'Percayai angka keuangan dan bertindak pada pengecualian uang.'
'job.inbox': 'Triage what asked for me and return to its source.' / 'Triage apa yang meminta saya dan kembali ke sumbernya.'
'job.cafe': 'Run today’s café floor work — openings, checks, stock, shifts.' / 'Jalankan kerja floor kafe hari ini — pembukaan, cek, stok, shift.'
'job.ecommerce': 'Fulfil today’s online orders against the right stock.' / 'Penuhi pesanan online hari ini terhadap stok yang tepat.'
'job.roastery': 'Record today’s roasts, yield, and transfers truthfully.' / 'Catat roast hari ini, yield, dan transfer dengan jujur.'
'job.profile': 'Your account and Home region order preference.' / 'Akun dan preferensi urutan region Home Anda.'
'stub.notInSlice': 'Not in this slice' / 'Belum ada di tahap ini'
'stub.comingLater': '${name} lands in a later build step.' / '${name} hadir pada langkah build berikutnya.'
'breadcrumb.detail': 'Detail' / 'Detail'
```

Keep `dest.operate`/`dest.plan`/`nav.updates`/`nav.dailyLog`/`nav.dashboard`/`nav.kitchen.*`
(they stay exported, unreferenced — parity test stays green; removing them risks breaking other
importers and gains nothing).

### 3.2 Redirect map — concrete `router.tsx` entries (FR-008/009/010, spec §7)

Local helpers (top of `router.tsx`, after imports):

```tsx
import { useLocation, useParams } from 'react-router-dom'
// Preserve ?view=/?record= across a redirect (FR-009).
function SearchRedirect({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={{ pathname: to, search }} replace />
}
// /tasks/:taskId → /work/tasks/:taskId (preserve param + query).
function TasksIdRedirect() {
  const { taskId } = useParams()
  const { search } = useLocation()
  return <Navigate to={{ pathname: `/work/tasks/${taskId}`, search }} replace />
}
```

Canonical routes (under `AppShell`, replacing the current `tasks`/`work/*`/`kitchen/*`/`dashboard`/`plan/*` blocks):

```tsx
// ── Work (canonical) ──
{ path: 'work', element: <Navigate to="/work/tasks" replace /> },
{
  path: 'work/tasks',
  element: <TasksLayout />,
  children: [
    { path: 'new', element: <TaskDrawer mode="create" /> },
    { path: ':taskId', element: <TaskDrawer mode="view" /> },
  ],
},
{ path: 'work/signals', element: <SliceStubPage jobKey="job.signals" name="Signals" /> },
{ path: 'work/projects-processes', element: <Navigate to="/work/projects" replace /> },
{
  element: <RequireCapability capability="workline.manage" />,
  children: [{ path: 'work/projects', element: <ProjectsProcessesPage /> }],
},
{
  element: <RequireCapability capability="objective.manage" />,
  children: [{ path: 'work/objectives', element: <ObjectivesPage /> }],
},
{ path: 'work/cascade', element: <Navigate to="/work/tasks" replace /> },
{ path: 'work/follow-ups', element: <Navigate to="/work/tasks?view=followups" replace /> },
{ path: 'work/follow-ups/:id', element: SHOW_FOLLOWUPS ? <FollowUpsPage /> : <Navigate to="/" replace /> },

// ── Events / Money / Inbox (canonical) ──
{ path: 'events', element: <SliceStubPage jobKey="job.events" name="Events" /> },
{
  element: <RequireAccessRole anyOf={['finance', 'admin']} />,
  children: [
    { path: 'money', element: <DashboardPage /> },
    { path: 'money/detail', element: <DashboardPage defaultTab="detail" /> },
    { path: 'money/budget', element: SHOW_PLAN_BUDGET ? <BudgetPage /> : <Navigate to="/" replace /> },
    { path: 'money/pricing', element: SHOW_PLAN_BUDGET ? <PricingPage /> : <Navigate to="/" replace /> },
  ],
},
{ path: 'inbox', element: <InboxPage /> },

// ── Café (Kitchen re-homed) ──
{ path: 'cafe', element: <Navigate to="/cafe/log" replace /> },
{ path: 'cafe/log', element: <KitchenLogPage /> },
{ path: 'cafe/plan', element: <KitchenPlanPage /> },
{ path: 'cafe/stock', element: <KitchenStockPage /> },
{
  element: <RequireAccessRole anyOf={['ops_lead', 'admin']} />,
  children: [
    { path: 'cafe/review', element: <KitchenReviewPage /> },
    { path: 'cafe/pushes', element: <KitchenPushesPage /> },
  ],
},

// ── Ecommerce / Roastery / Profile (stubs) ──
{ path: 'ecommerce', element: <SliceStubPage jobKey="job.ecommerce" name="Ecommerce" /> },
{ path: 'roastery', element: <SliceStubPage jobKey="job.roastery" name="Roastery" /> },
{ path: 'profile', element: <SliceStubPage jobKey="job.profile" name="Personal Profile" /> },

// ── Admin (canonical; /admin → /admin/people) ──
{ path: 'admin', element: <Navigate to="/admin/people" replace /> },
{
  element: <AdminRoute />,
  children: [{ path: 'admin/people', element: <AdminUsersPage /> }],
},

// ── Redirects from every old route (FR-009/010, spec §7) ──
{ path: 'tasks', element: <SearchRedirect to="/work/tasks" /> },
{ path: 'tasks/new', element: <SearchRedirect to="/work/tasks/new" /> },
{ path: 'tasks/:taskId', element: <TasksIdRedirect /> },
{ path: 'updates', element: <Navigate to="/work/signals" replace /> },
{ path: 'ops', element: <Navigate to="/" replace /> },
{ path: 'ops/new', element: <Navigate to="/" replace /> },
{ path: 'ops/:id/edit', element: <Navigate to="/" replace /> },
{ path: 'kitchen', element: <Navigate to="/cafe" replace /> },
{ path: 'kitchen/log', element: <SearchRedirect to="/cafe/log" /> },
{ path: 'kitchen/plan', element: <SearchRedirect to="/cafe/plan" /> },
{ path: 'kitchen/stock', element: <SearchRedirect to="/cafe/stock" /> },
{ path: 'kitchen/review', element: <SearchRedirect to="/cafe/review" /> },
{ path: 'kitchen/pushes', element: <SearchRedirect to="/cafe/pushes" /> },
{ path: 'objectives', element: <Navigate to="/work/objectives" replace /> },
{ path: 'projects-processes', element: <Navigate to="/work/projects" replace /> },
{ path: 'dashboard', element: <SearchRedirect to="/money" /> },
{ path: 'dashboard/detail', element: <SearchRedirect to="/money/detail" /> },
{ path: 'sales', element: <SearchRedirect to="/money" /> },
{ path: 'plan/budget', element: <SearchRedirect to="/money/budget" /> },
{ path: 'plan/pricing', element: <SearchRedirect to="/money/pricing" /> },
```

Remove now-unused imports from `router.tsx`: `CascadePage`, `UpdatesPage`, `OpsPage`,
`OpsAddForm`, `SHOW_WEEKLY_UPDATES`, `SHOW_DAILY_LOG`, `SHOW_INBOX`. **Keep** `FollowUpsPage`
+ `SHOW_FOLLOWUPS` (the `:id` route, D-2/D-PLN-1). Add import of `SliceStubPage`. The retired
page components stay in the tree unreferenced (spec D-6 — deletion is a cleanup follow-up).

> **Route-order note:** react-router v6 ranks routes by specificity, not order, so the
> `tasks/:taskId` redirect vs `work/tasks/:taskId` canonical do not collide (different paths).
> `tasks` (static) outranks `tasks/:taskId` correctly. Verify via AC-004 (e2e).

### 3.3 Destinations model (`mos-app/src/shell/destinations.tsx`) — three registries

```tsx
export type DestinationId =
  | 'home' | 'work' | 'events' | 'money' | 'inbox'
  | 'cafe' | 'ecommerce' | 'roastery'
  | 'admin' | 'profile'

export interface Destination {
  id: DestinationId
  labelKey: MessageKey
  Icon: React.FC
  links: Section[]          // Work: the 4 children; others: the primary link(s)
  children?: Section[]      // Work's always-expanded switcher (4, flat)
  anyOf?: string[]          // access-role gate (Money: finance/admin)
  primaryPath?: string      // bottom-tab + Work-parent target
  zone: 'workspace' | 'modules' | 'utility'
}

export const DESTINATIONS: Destination[] = [
  { id: 'home', zone: 'workspace', labelKey: 'dest.home', Icon: HomeIcon, primaryPath: '/',
    links: [{ path: '/', label: 'Home', labelKey: 'nav.home', Icon: HomeIcon }] },
  { id: 'work', zone: 'workspace', labelKey: 'dest.work', Icon: WorkIcon, primaryPath: '/work/tasks',
    links: [{ path: '/work/tasks', label: 'Tasks', labelKey: 'nav.work.tasks', Icon: TasksIcon }],
    children: [
      { path: '/work/signals', label: 'Signals', labelKey: 'nav.work.signals', Icon: SignalsIcon },
      { path: '/work/tasks', label: 'Tasks', labelKey: 'nav.work.tasks', Icon: TasksIcon },
      { path: '/work/projects', label: 'Projects & Processes', labelKey: 'nav.work.projects', Icon: WorkLineIcon, capability: 'workline.manage' },
      { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.work.objectives', Icon: ObjectiveIcon, capability: 'objective.manage' },
    ] },
  { id: 'events', zone: 'workspace', labelKey: 'dest.events', Icon: EventsIcon, primaryPath: '/events',
    links: [{ path: '/events', label: 'Events', labelKey: 'nav.events', Icon: EventsIcon }] },
  { id: 'money', zone: 'workspace', labelKey: 'dest.money', Icon: MoneyIcon, anyOf: ['finance', 'admin'], primaryPath: '/money',
    links: [{ path: '/money', label: 'Money', labelKey: 'nav.money', Icon: MoneyIcon }] },
  { id: 'inbox', zone: 'workspace', labelKey: 'dest.inbox', Icon: InboxIcon, primaryPath: '/inbox',
    links: [{ path: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', Icon: InboxIcon }] },
]

export const MODULES: { bu: MessageKey; items: Section[] }[] = [
  { bu: 'rail.retailOps', items: [
    { path: '/cafe', label: 'Café', labelKey: 'nav.cafe', Icon: CafeIcon },
    { path: '/ecommerce', label: 'Ecommerce', labelKey: 'nav.ecommerce', Icon: EcommerceIcon },
  ] },
  { bu: 'rail.b2bOps', items: [
    { path: '/roastery', label: 'Roastery', labelKey: 'nav.roastery', Icon: RoasteryIcon },
  ] },
]

export const UTILITY: Destination[] = [
  { id: 'admin', zone: 'utility', labelKey: 'dest.admin', Icon: ShieldIcon, anyOf: ['admin'], primaryPath: '/admin/people',
    links: [{ path: '/admin/people', label: 'People', labelKey: 'nav.admin.people', Icon: PeopleIcon }] },
  { id: 'profile', zone: 'utility', labelKey: 'dest.profile', Icon: ProfileIcon, primaryPath: '/profile',
    links: [{ path: '/profile', label: 'Personal Profile', labelKey: 'nav.profile', Icon: ProfileIcon }] },
]
```

`isLive(d, roles)`: `anyOf` unsatisfied → false; else `links.length > 0`.
`destinationForPath(pathname)`: scan `DESTINATIONS` + `UTILITY` (and `MODULES` items wrapped as
pseudo-destinations) by exact-or-prefix; a record route `/work/tasks/:taskId` resolves to the
`work` destination (Tasks child). Returns the owner so breadcrumb + aria-current see one owner.

> `WorkIcon` — reuse `TasksIcon`? No: add a distinct `WorkIcon` (briefcase) so the Work *parent*
> is visually distinct from the Tasks *child*. This is a new icon mark, justified (the current
> rail has no Work-parent icon — Work was a group label). Add to `icons.tsx`.

### 3.4 Rail Work-parent `aria-current` (`mos-app/src/shell/rail-nav.tsx`)

The Work parent `NavLink` (D-PLN-3):

```tsx
<NavLink
  to="/work/tasks"
  aria-current="location"   /* active parent announces location, never page (Rule 5) */
  end={false}
  className={({ isActive }) => isActive ? '…active' : '…inactive'}
>
  … Work …
</NavLink>
```

Work children are rendered always-expanded (no collapse) as `NavLink` with default
`aria-current` (page when active). Non-Work destinations use default `page`. The profile footer
row is a `NavLink to="/profile"` (page when active) with avatar + "{Site} {role}" + chevron,
gated only by authentication (always present for signed-in viewers). Admin is gated
(`accessRoles.includes('admin')`).

### 3.5 Breadcrumb `·` separator + `?view=` leaf (`mos-app/src/shell/breadcrumb.tsx`)

Replace the `›` separator span with `·` (convergence `contextLabel`). Add a `?view=` saved-view
leaf on `/work/tasks`: map `mine`→"My work", `team`→"Team work", `overdue`→"Overdue",
`followups`→"Follow-ups", `all`→none (no leaf). Resolve the Work child label from the route
(`/work/signals`→"Signals", etc.). Record route `/work/tasks/:taskId` pushes the resolved task
title via `useBreadcrumbTitle()` (unchanged channel). Examples per spec §9 table.

### 3.6 `ContextRow` (`mos-app/src/shell/context-row.tsx`, NEW)

```tsx
export function ContextRow() {
  const { pathname, search } = useLocation()
  const auth = useAuth()
  const t = useT()
  const jobKey = jobKeyForPath(pathname)   // resolves Work child / record → owning job key
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const scope = viewer ? scopeLabel(viewer) : ''   // "{Site} {role}" or Team
  return (
    <div role="region" aria-label="Context" data-anatomy="context-row"
         className="ctx-row flex items-center gap-3 px-4 …">
      <span className="ctx-scope">{scope}</span>
      <b className="ctx-job truncate">{t(jobKey as MessageKey)}</b>
    </div>
  )
}
```

`jobKeyForPath` lives in `job-sentences.ts` (port of convergence `contextRow` jobKey resolution:
`work`→child, `record`→owning type). `scopeLabel` derives from `auth.viewer` (Person + primary
Team/Site). Mounted in `app-shell.tsx` above the content Outlet.

### 3.7 `SliceStubPage` (`mos-app/src/pages/slice-stub-page.tsx`, NEW)

```tsx
type Props = { jobKey: string; name: string }
export function SliceStubPage({ jobKey, name }: Props) {
  const t = useT()
  useDocumentTitle(`${name} — Gordi MOS`)
  return (
    <PageFrame>
      <h1 className="font-semibold text-foreground" style={{ fontSize: 26 }}>{name}</h1>
      <p className="text-muted-foreground" style={{ marginTop: 8 }}><b>{t(jobKey as MessageKey)}</b></p>
      <p className="text-muted-foreground" style={{ marginTop: 16 }}>
        {t('stub.notInSlice')} — {t('stub.comingLater', { name })}
      </p>
    </PageFrame>
  )
}
```

Distinct from `not-found-page.tsx` (404): this is a real route placeholder (job sentence + "not
in this slice"), never a 404. One parameterized component for all 5 stub routes (Rule 11).

### 3.8 `command-menu` universal actions + Navigate (`mos-app/src/components/command/command-menu.tsx`)

Replace `QUICK_ACTIONS` and `NAVIGATE`:

```tsx
type CommandItem = {
  id: string; label: string; glyph: string
  kind: 'action' | 'navigate' | 'record'
  to?: string
  run?: () => void
  meta?: string
  gated?: boolean          // hide when unauthorized (Money navigate)
  record?: { id: string; title: string }
}

const UNIVERSAL_ACTIONS: CommandItem[] = [
  { id: 'a-deputy', label: 'Ask Deputy', glyph: '✦', kind: 'action',
    run: () => { /* openPanel() via useAgentRuntime when SHOW_ASSISTANT; else no-op/disabled */ } },
  { id: 'a-signal', label: 'Share Signal', glyph: '➤', kind: 'action',
    run: () => { navigate('/'); /* composer opens Step 4; Step 2: navigate Home as the target */ } },
  { id: 'a-task', label: 'Create Task', glyph: '＋', kind: 'action', to: '/work/tasks/new' },
]

const NAVIGATE: CommandItem[] = [
  { id: 'n-home', label: 'Home', glyph: '⌂', kind: 'navigate', to: '/' },
  { id: 'n-work', label: 'Work', glyph: '▦', kind: 'navigate', to: '/work/tasks' },
  { id: 'n-signals', label: 'Signals', glyph: '✦', kind: 'navigate', to: '/work/signals' },
  { id: 'n-events', label: 'Events', glyph: '▤', kind: 'navigate', to: '/events' },
  { id: 'n-money', label: 'Money', glyph: '$', kind: 'navigate', to: '/money', gated: true },
  { id: 'n-inbox', label: 'Inbox', glyph: '📥', kind: 'navigate', to: '/inbox' },
  { id: 'n-cafe', label: 'Café', glyph: '☕', kind: 'navigate', to: '/cafe' },
]
```

- `gated` items (Money) render only when `accessRoles` includes `finance`/`admin` (read
  `useAuth`). The old "My Week / Weekly updates / Daily Log" entries are **absent** (FR-017).
- `activate(item)`: `item.run ? item.run() : item.to && navigate(item.to)`; `onClose()`.
  Records keep `pushRecentTask` + navigate `/work/tasks/:id`.
- "Ask Deputy": when `SHOW_ASSISTANT` false, render as a labelled disabled/coming-soon entry
  (no crash — the runtime provider is absent). Use `useAgentRuntime()` safely (null-runtime
  no-op default already exists per `top-bar.tsx`'s `AssistantTopBarButton`).
- ≤1 contextual action slot (e.g. "Start today's opening" on `/cafe*`): ship **empty/hidden**
  in Step 2 (Step 7 owns occurrence UX). The universal actions are never reordered (Rule 7).
- The centered-modal CSS is already correct (SALVAGE #10); `command-menu.css` task = confirm
  no bottom-sheet regression + optional `top` align to e7.

---

## 4. Task list (TDD-ordered, 2–5 min each)

> Each behavior task: write the failing test (red) → implement (green) → verify command. AC ids
> tag the owning test title so `grep -r AC-XXX` finds the proof.

### Phase A — Foundations

**T1 — i18n keys.** EXTEND `mos-app/src/i18n/messages.ts`: add the §3.1 keys to both `en` and
`id` (shape-identical). Verify: `cd mos-app && npm run typecheck && npm test -- messages`.

**T2 — job-sentences registry (NEW).** RED: create `mos-app/src/shell/job-sentences.test.ts`
asserting `jobSentences` has exactly the 12 keys (home/work/tasks/signals/projects/objectives/
events/money/inbox/cafe/ecommerce/roastery) with the verbatim convergence strings, plus
`jobKeyForPath('/work/signals') === 'job.signals'` and `jobKeyForPath('/work/tasks/123') ===
'job.tasks'`. GREEN: create `mos-app/src/shell/job-sentences.ts` porting `fixtures.js`
`jobSentences` + `jobKeyForPath` (Work child / record resolution). Verify: `npm test --
job-sentences`. (Rule 1, FR-024 prep.)

**T3 — icons.** EXTEND `mos-app/src/shell/icons.tsx`: add `WorkIcon` (briefcase — the Work
*parent*, distinct from the Tasks child), `EventsIcon` (calendar), `SignalsIcon` (spark),
`MoneyIcon` ($), `CafeIcon` (cup), `EcommerceIcon` (bag), `RoasteryIcon` (roast),
`ProfileIcon` (user), `ShieldIcon` (shield — Admin, verified absent today), `MoreIcon` (dots).
All stroke-2, 18px, `aria-hidden` (NFR-002 convention). Verify: `npm run typecheck`.

### Phase B — Data model

**T4 — destinations model.** RED: rewrite `mos-app/src/shell/destinations.test.ts` to the new
model — `DESTINATIONS` ids `['home','work','events','money','inbox']` in order; `MODULES` has
2 BU groups (Retail Ops [café, ecommerce], B2B Ops [roastery]); `UTILITY` has admin
(`anyOf:['admin']`) + profile; Work has exactly 4 children (signals/tasks/projects/objectives)
with 0 family headings; Money `anyOf:['finance','admin']` and `isLive` false for a member;
`destinationForPath('/work/tasks/123')` → work; `destinationForPath('/cafe/log')` → café;
`destinationForPath('/admin/people')` → admin. GREEN: rewrite `destinations.tsx` per §3.3.
Verify: `npm test -- destinations`. (FR-001, FR-002, FR-003, FR-004, AC-011, AC-012 prep.)

**T5 — sections remap.** RED: rewrite `mos-app/src/shell/sections.test.ts` — `CAFE_SECTIONS`
paths `/cafe/log|plan|stock|review|pushes`; `sectionForPath('/cafe/log')` resolves; add
events/money/signals/profile sections; retired `/updates`/`/ops` absent. GREEN: rewrite
`sections.tsx` (rename `KITCHEN_SECTIONS`→`CAFE_SECTIONS` with `/cafe/*` paths + `nav.cafe.*`
keys; add the new sections; drop retired entries; keep `ADMIN_SECTIONS`). Verify:
`npm test -- sections`. (FR-027 prep.)

### Phase C — Router (the IA move)

**T6 — RequireCapability bounce.** EXTEND `mos-app/src/auth/require-capability.tsx`: change
`<Navigate to="/work/cascade" replace />` → `<Navigate to="/work/tasks" replace />` (cascade
noun retired). Update its test if any asserts the old target. Verify: `npm test -- require-
capability`. (FR-009, §16.)

**T7 — features.ts (retire SHOW_INBOX only).** EXTEND
`mos-app/src/config/features.ts`: **remove** the `SHOW_INBOX` export (D-PLN-1). **Keep**
`SHOW_WEEKLY_UPDATES`/`SHOW_DAILY_LOG`/`SHOW_FOLLOWUPS`/`SHOW_PLAN_BUDGET`/`SHOW_ASSISTANT`/
`SHOW_HOME_STACKED`/`SHOW_USER_VIEWS`. Then fix every `SHOW_INBOX` import site (T11 top-bar,
T4 destinations, T9 router, + the test mocks in `top-bar.test.tsx`/`top-bar-assistant.test.tsx`/
`app-shell-assistant.test.tsx`/`AgentRuntimeProvider.test.tsx`/`router.test.tsx` — remove the
`SHOW_INBOX` key from each `vi.mock('./config/features', …)` factory). Verify:
`npm run typecheck`. (FR-002, D-1.)

**T8 — SliceStubPage (NEW).** RED: create `mos-app/src/pages/slice-stub-page.test.tsx`
asserting it renders the `name` H1, the `jobKey` job sentence (via i18n), and the
"not in this slice" copy — never a 404. GREEN: create `slice-stub-page.tsx` per §3.7. Verify:
`npm test -- slice-stub-page`. (FR-013.)

**T9 — router re-route (AC-006).** RED: extend `mos-app/src/router.test.tsx`:
- Update the `vi.mock('./config/features', …)` factory to drop `SHOW_INBOX` (and keep the rest).
- AC-006: assert `/work/projects` renders `ProjectsProcessesPage` under
  `RequireCapability('workline.manage')`; `/work/projects-processes` is a `<Navigate to=
  "/work/projects" replace />`; `/work/objectives` under `RequireCapability('objective.manage')`;
  `/work/follow-ups` is `<Navigate to="/work/tasks?view=followups" replace />`; `/money` is under
  `RequireAccessRole(['finance','admin'])`; `/cafe/review` under
  `RequireAccessRole(['ops_lead','admin'])`; `/events`/`/ecommerce`/`/roastery`/`/profile`/
  `/work/signals` render `SliceStubPage`; `/work` → `/work/tasks`; `/admin` → `/admin/people`.
- Update the existing guard/redirect assertions (AC-302/304/405/dashboard/plan-budget) to the
  new canonical paths (`/objectives`→`/work/objectives`, `/dashboard`→`/money`, `/sales`→`/money`,
  `/plan/budget`→`/money/budget`, etc.).
GREEN: edit `mos-app/src/router.tsx` per §3.2 (canonical routes + redirect map +
`SearchRedirect`/`TasksIdRedirect` helpers; remove unused imports; retire route-layer flag
gating per D-PLN-1; `/work/follow-ups/:id` keeps `SHOW_FOLLOWUPS`). Verify:
`npm test -- router`. (FR-008, FR-009, FR-010, FR-011, FR-013, FR-027, AC-006.)

### Phase D — Shell chrome

**T10 — rail-nav (AC-009/010/011/012/013-footer).** RED: extend
`mos-app/src/shell/rail-nav.test.tsx`:
- AC-011: admin sees Workspace overline + Home · Work (4 always-expanded children, 0 family
  headings) · Events · Money · Inbox · Retail Ops (Café · Ecommerce) · B2B Ops (Roastery) ·
  Admin Settings · profile footer — in that order.
- AC-009: at `/work/signals`, Work parent has `aria-current="location"`, Signals child has
  `aria-current="page"`, no other rail link has `page`.
- AC-010: at `/work/tasks/:taskId`, Tasks child `page`, Work parent `location`, exactly one `page`.
- AC-012: non-finance/admin → Money absent (not disabled, no stub); non-admin → Admin absent.
- AC-013 (footer): profile footer shows avatar + "{Site} {role}" + links `/profile`.
- Remove/replace the legacy operate/plan/cascade/catalog tests with the new structure.
GREEN: rewrite `rail-nav.tsx` per §3.3/§3.4 (three zones; Work parent `aria-current="location"`;
profile footer; retire Settings stub + operate special-case). Verify:
`npm test -- rail-nav`. (FR-001..005, FR-020, FR-021, AC-009, AC-010, AC-011, AC-012, AC-013.)

**T11 — top-bar (AC-014).** RED: extend `mos-app/src/shell/top-bar.test.tsx`:
- AC-014: left→right brand + breadcrumb + spacer + Search⌘K + Inbox + Deputy; no button labelled
  Ask Deputy / Share Signal / Create Task; NotificationBell always renders (no `SHOW_INBOX`
  conditional — update the flag-OFF tests to the always-live posture, BDD: goal = bell present).
GREEN: edit `top-bar.tsx` — retire `SHOW_INBOX` import (bell always renders); OD-57 layout
confirm; profile → rail footer (D-4: keep avatar-only `UserChip` on phone OR remove — ratify at
walkthrough; default: keep avatar-only on phone, remove on desktop since rail footer owns it).
Verify: `npm test -- top-bar`. (FR-006, FR-007, AC-014.)

**T12 — breadcrumb (AC-018/019).** RED: extend `mos-app/src/shell/breadcrumb.test.tsx`:
- AC-018: `·` separator; last segment bold (`<b>`); no brand prefix; per §9 table — `/`→"Home",
  `/work/tasks`→"Work · Tasks", `/work/tasks?view=mine`→"Work · Tasks · My work",
  `/work/signals`→"Work · Signals", `/work/projects`→"Work · Projects & Processes",
  `/events`→"Events", `/money`→"Money", `/money/detail`→"Money · Detail", `/cafe/log`→"Café",
  `/cafe/review`→"Café · Review", `/admin/people`→"Admin Settings · People", `/profile`→
  "Personal Profile".
- AC-019: at `/work/tasks/:taskId` with a resolved title, final crumb = the title; while loading,
  section crumb alone.
- Replace the legacy `›`/Operate/Plan/Dashboard tests with the new `·`/new-destination tests.
GREEN: rewrite `breadcrumb.tsx` per §3.5. Verify: `npm test -- breadcrumb`.
(FR-018, FR-019, AC-018, AC-019.)

**T13 — context-row (AC-013/020-partial, NEW).** RED: create
`mos-app/src/shell/context-row.test.tsx`:
- AC-013: renders `role="region" aria-label="Context"`; shows the active route's job sentence
  (at `/work/signals` → the Signals job sentence; at `/` → the Home job sentence); shows the
  viewer's resolved scope.
GREEN: create `context-row.tsx` per §3.6. Verify: `npm test -- context-row`.
(FR-024, AC-013, AC-020 partial.)

**T14 — app-shell anatomy (AC-020).** RED: extend `mos-app/src/shell/app-shell.test.tsx`:
- AC-020: shell renders exactly three identifiable regions it owns — header (`role="banner"`),
  context-row (`data-anatomy="context-row"`), content (`data-anatomy="content"`); asserts **no**
  second drawer host / fifth region added by the shell (query `data-anatomy` count = 3; no extra
  `role="region"` drawer). ContextRow is mounted above the Outlet.
GREEN: edit `app-shell.tsx` — mount `<ContextRow />` between TopBar and the content Outlet;
add `data-anatomy` markers; no new drawer host (D-PLN-6). Verify: `npm test -- app-shell`.
(FR-023, AC-020.)

**T15 — bottom-tab-bar + mobile-drawer (AC-021/022 unit arm).** RED: extend
`mos-app/src/shell/bottom-tab-bar.test.tsx` + `mobile-drawer.test.tsx`:
- Bottom-nav = Home · Work · Café · Inbox · More (5); `More` carries `aria-current="page"` when
  a non-primary destination is active (mock location `/events`/`/money`/`/profile`).
- More menu (mobile-drawer open) lists every authorized non-primary destination (Events, Money,
  Ecommerce, Roastery, Admin, Profile); Money absent for non-finance/admin.
GREEN: edit `bottom-tab-bar.tsx` (hardcode the 5 primary + More; `More` active logic) +
`mobile-drawer.tsx` (More menu from `DESTINATIONS`/`MODULES`/`UTILITY` minus primary). Verify:
`npm test -- bottom-tab-bar mobile-drawer`. (FR-025, FR-026, AC-021/022 unit arm.)

### Phase E — ⌘K palette

**T16 — command-menu actions + navigate (AC-015/016).** RED: extend
`mos-app/src/components/command/command-menu.test.tsx`:
- AC-015: open palette renders `role="dialog"` centered; lists exactly the universal actions
  Ask Deputy · Share Signal · Create Task (verb+object, stable order); no bare
  Create/Add/New; ≤1 contextual slot (empty/hidden in Step 2).
- AC-016: Navigate group items point to `/`, `/work/tasks`, `/work/signals`, `/events`,
  `/inbox`, `/cafe`, and `/money` only when authorized; old "My Week / Weekly updates / Daily
  Log" absent.
- Create Task activates → navigates `/work/tasks/new` + closes.
- Update the legacy AC-K03/K04/K05 tests: records navigate `/work/tasks/:id` (was `/tasks/:id`);
  default groups = universal actions + Navigate (+ Recent when present).
GREEN: edit `command-menu.tsx` per §3.8 (`CommandItem.kind`/`run`; `UNIVERSAL_ACTIONS`;
`NAVIGATE` with `gated`; `activate` dispatch). Verify: `npm test -- command-menu`.
(FR-014..017, AC-015, AC-016.)

**T17 — command-menu.css centered-modal confirm.** EXTEND
`mos-app/src/components/command/command-menu.css`: confirm `left:50%;
transform:translateX(-50%)` (no bottom-sheet — SALVAGE #10); optionally align `top` from `64px`
to e7's `12vh`-style if the owner prefers vertical centering at the walkthrough. No structural
change. Verify: `npm run lint:css && npm test -- command-menu.css`. (FR-014, NFR-003.)

### Phase F — E2E (own the routing/aria/back-refresh ACs)

> E2E use the existing `e2e/helpers/login.ts` + `e2e/fixtures/users.ts` (VIEWER=non-finance,
> ADMIN). Each new spec is table-driven where the spec lists many routes.

**T18 — `e2e/shell-routes-redirects.spec.ts` (AC-001, AC-003, AC-004, AC-005, AC-025).**
Table-driven over spec §7: for each old route (`/tasks`, `/tasks/:id`, `/work/cascade`,
`/work/follow-ups`, `/objectives`, `/projects-processes`, `/work/projects-processes`,
`/updates`, `/ops`, `/ops/new`, `/ops/:id/edit`, `/kitchen/log`, `/kitchen/plan`,
`/kitchen/stock`, `/kitchen/review`, `/kitchen/pushes`, `/dashboard`, `/dashboard/detail`,
`/sales`, `/plan/budget`, `/plan/pricing`) assert: lands on the named new canonical URL, URL is
replaced (Back from the new URL does not re-enter the old — `page.goBack()` then assert still on
new). AC-003: `/work/follow-ups` → `/work/tasks?view=followups` survives refresh. AC-004:
`/tasks/:taskId` → `/work/tasks/:taskId` + Task surface renders (ownership tablist). AC-005:
`/kitchen/log` → `/cafe/log` + Kitchen Log surface renders (and plan/stock/review/pushes).
AC-025: `/work/signals`, `/cafe`, `/work/tasks?view=overdue` resolve (stub/real), not 404.
Verify: `npx playwright test shell-routes-redirects`. (FR-008..012, AC-001, AC-003, AC-004,
AC-005, AC-025, NFR-005.)

**T19 — `e2e/shell-url-state.spec.ts` (AC-002).** Sign in → `/work/tasks?view=mine`; refresh →
URL + `?view=mine` preserved; copy URL to new tab → same. (FR-011, FR-012, AC-002.)
Verify: `npx playwright test shell-url-state`.

**T20 — `e2e/shell-aria-current.spec.ts` (AC-007, AC-008).** Desktop (1280): admin on each of
`/`, `/work/tasks`, `/work/signals`, `/work/projects`, `/work/objectives`, `/events`, `/money`,
`/inbox`, `/cafe/log`, `/admin/people`, `/profile` →
`document.querySelectorAll('[aria-current="page"]').length === 1`. Phone (390×844): primary
dest (Home/Work/Café/Inbox) → bottom-nav item `page`; non-primary (Events/Money/Profile) →
`More` button `page`; always exactly one. (FR-020, FR-021, FR-022, AC-007, AC-008.)
Verify: `npx playwright test shell-aria-current`.

**T21 — `e2e/shell-command-palette.spec.ts` (AC-017).** Anywhere → ⌘/Ctrl+K opens centered
palette, focus in input, Esc closes, focus returns to trigger. (FR-014, AC-017, NFR-003.)
Verify: `npx playwright test shell-command-palette`.

**T22 — `e2e/shell-phone-nav.spec.ts` (AC-021, AC-022; supersedes AC-410).** 390px: admin sees
bottom-nav Home·Work·Café·Inbox·More; More opens menu with Events/Money/Ecommerce/Roastery/
Admin/Profile. Non-finance/admin (VIEWER) → Money absent from bottom-nav AND More.
Delete `e2e/AC-410-nav-five-destinations.spec.ts` (its IA is superseded). (FR-002, FR-025,
FR-026, AC-021, AC-022.) Verify: `npx playwright test shell-phone-nav`.

**T23 — update existing e2e (BDD: update journey *steps* for the deliberate re-route; goal-
oracle intact).**
- `e2e/shell-nav.spec.ts` (AC-001): drop the `SHOW_WEEKLY_UPDATES`/`SHOW_DAILY_LOG` imports;
  the Tasks leg → `/work/tasks` (follow redirect or click new rail link); the Weekly Updates /
  Daily Log legs are removed (routes redirect to successors — retire those legs, keep the
  reload-preserves-URL goal on `/work/tasks`).
- **Re-homed surfaces** (update `page.goto`/assertions to the new canonical URL, follow
  redirects): `AC-025-026-dashboard-responsive.spec.ts` (`/dashboard`→`/money`),
  `AC-090-kitchen-log-approve.spec.ts` (`/kitchen/log`→`/cafe/log`), `AC-411-catalog-manage-
  mode.spec.ts` (`/work/projects-processes`→`/work/projects`, `/work/objectives` unchanged path
  but label/redirect from `/objectives`), `AC-134.spec.ts` + `AC-230.spec.ts` +
  `tasks-archive.spec.ts` + `tasks-create-status.spec.ts` + `tasks-deeplink-mobile-keyboard.
  spec.ts` + `tasks-split-view.spec.ts` (`/tasks`→`/work/tasks`).
- **Retired surfaces** (skip with a pointer to the successor step — goal-oracle preserved as a
  skipped test): `weekly-update-reopen.spec.ts`, `weekly-update-submit.spec.ts` (→ Step 4
  Signals), `ops-log-add.spec.ts`, `ops-log-needs-attention.spec.ts` (→ Step 5 Home), `AC-305-
  cascade.spec.ts` (cascade noun retired → `/work/tasks`; skip the cascade-read journey, pointer
  to Step 8 catalog re-home). Use `test.skip(true, '…retired OD-33; successor in Step N')`.
Verify: `npx playwright test`. (BDD authoring rule; NFR-005.)

### Phase G — Gates

**T24 — full gate.** `cd mos-app && npm run typecheck && npm run lint && npm test &&
npx playwright test`. Coverage ≥80% changed lines (`npm run test:coverage`). Fix any
flag-staleness fallout from the `SHOW_INBOX` removal. (NFR-001, NFR-002.)

**T25 — review ledger + visual matrix (AC-023, AC-024 attested).** Capture 1280px + 390px
before/after screenshots vs the convergence reference shots; score Experience Contract Rules
1–11 pass/fail in `docs/reviews/feat-redesign-shell-routes.md`. AC-023 (extension test) +
AC-024 (Rule 11 reuse attestation) are review-attested here against the §3 table. (Standing
acceptance; AC-023, AC-024.)

**T26 — owner walkthrough gate.** Demo shell + routes + ⌘K + aria-current + redirects at 1280
+ 390; owner sign-off before merge. Confirm D-1 (Inbox live), D-4 (header user chip placement),
D-5 (phone FAB→palette deferred). (Owner gate.)

---

## 5. AC → task traceability

| AC | Owning test | Task(s) | FR(s) |
|---|---|---|---|
| AC-001 | `e2e/shell-routes-redirects.spec.ts` + `shell-nav.spec.ts` | T18, T23 | FR-008/009/010 |
| AC-002 | `e2e/shell-url-state.spec.ts` | T19 | FR-011/012 |
| AC-003 | `e2e/shell-routes-redirects.spec.ts` | T18 | FR-011 |
| AC-004 | `e2e/shell-routes-redirects.spec.ts` | T18 | FR-009 |
| AC-005 | `e2e/shell-routes-redirects.spec.ts` | T18 | FR-009 |
| AC-006 | `src/router.test.tsx` | T9 | FR-008/027 |
| AC-007 | `e2e/shell-aria-current.spec.ts` | T20 | FR-020 |
| AC-008 | `e2e/shell-aria-current.spec.ts` | T20 | FR-020/022 |
| AC-009 | `src/shell/rail-nav.test.tsx` | T10 | FR-021 |
| AC-010 | `src/shell/rail-nav.test.tsx` | T10 | FR-021 |
| AC-011 | `src/shell/rail-nav.test.tsx` | T10 | FR-001/004 |
| AC-012 | `src/shell/rail-nav.test.tsx` | T10 | FR-002/003 |
| AC-013 | `src/shell/context-row.test.tsx` + `rail-nav.test.tsx` | T13, T10 | FR-005/024 |
| AC-014 | `src/shell/top-bar.test.tsx` | T11 | FR-006/007 |
| AC-015 | `src/components/command/command-menu.test.tsx` | T16 | FR-014/015/016 |
| AC-016 | `src/components/command/command-menu.test.tsx` | T16 | FR-017 |
| AC-017 | `e2e/shell-command-palette.spec.ts` | T21 | FR-014 |
| AC-018 | `src/shell/breadcrumb.test.tsx` | T12 | FR-018 |
| AC-019 | `src/shell/breadcrumb.test.tsx` | T12 | FR-019 |
| AC-020 | `src/shell/app-shell.test.tsx` | T14 | FR-023 |
| AC-021 | `e2e/shell-phone-nav.spec.ts` + unit | T22, T15 | FR-025/026 |
| AC-022 | `e2e/shell-phone-nav.spec.ts` + unit | T22, T15 | FR-002 |
| AC-023 | `docs/reviews/…md` (attested) | T25 | FR-028/§6.3 |
| AC-024 | `docs/reviews/…md` (attested) | T25 | FR-027/028 |
| AC-025 | `e2e/shell-routes-redirects.spec.ts` | T18 | NFR-005 |

**FR coverage check:** every FR-001..028 → ≥1 task. NFR-001..007 → T24/T25/T17 + the no-DB
stance (zero migrations, verified by `git diff supabase/` empty). Rule 1..11 → §15 matrix,
each ≥1 AC (above).

---

## 6. Risk / rollback

- **Highest risk: the redirect map (T9).** A wrong/missing redirect or a route-order collision
  breaks every deep-link. Mitigation: T18 is table-driven over **all** §7 old routes + Back-
  guard. Rollback: revert `router.tsx` (single file) — the page components are untouched
  (re-homed, not modified), so reverting the route table restores the old IA instantly.
- **`SHOW_INBOX` removal (T7) blast radius.** Every `SHOW_INBOX` import site is in-scope and
  listed; the test mocks must drop the key too. A missed site fails typecheck (loud, safe).
  Rollback: re-add the export + restore the conditionals.
- **aria-current regression (T10/T20).** The Work-parent `location` rule is the confirmed
  defect being fixed. AC-009/010 (RTL) + AC-007/008 (e2e document-wide count) catch a
  co-active `page` at both viewports. Rollback: revert `rail-nav.tsx`.
- **Retired-surface e2e (T23).** Skipping 5 specs is explicit (`.skip` with pointer), not
  deletion — recoverable. The three future flows (F1/F2/F3) are protected by AC-025 (NFR-005).
- **No DB/RLS risk** (NFR-004): `git diff --stat supabase/` must be empty; verified in T24.
- **Behavior preservation (D-PLN-1):** Home/MyWeek inline surfaces are untouched (flags kept);
  Step 2 changes only the IA + chrome. If the owner wants the Home Weekly-Updates panel gone
  now, that's a Step-4/5 task, not this one.
- **Rollback granularity:** each phase (A–G) is independently revertible; the route table (T9)
  is the load-bearing revert point.

---

## 7. Deviations from the spec (explicit, reviewable)

| ID | Deviation | Why | Resolution |
|---|---|---|---|
| **D-PLN-1** | Do NOT retire `SHOW_WEEKLY_UPDATES`/`SHOW_DAILY_LOG`/`SHOW_FOLLOWUPS` exports in Step 2 (spec §17 T13 says retire). Retire route-layer gating + `SHOW_INBOX` only. | Those flags gate Home/MyWeek inline surfaces (`home-page.tsx`, `my-week.tsx`, `my-week-panel.tsx`) — removing them changes Home content, which is Step 4/5 scope (spec §2.2). Full retirement lands with Signal. | **Director + owner walkthrough confirm.** Track flag retirement for Step 4/5. |
| **D-PLN-2** | Money gated by `finance`/`admin` access roles, not `can('money.view')` (spec D-3, already in spec). | No `money.view` capability exists; adding one is an ADR-0020 refinement, out of scope. | Documented; deferred ADR-0020 refinement. |
| **D-PLN-6** | Anatomy region 4 = existing per-route split-view drawer; AC-020 asserts the shell adds no competing host (not that a drawer renders on every route). | The stack-navigated single Record Panel (OD-19/20) is deferred to Steps 3/4 (spec D-8). | Spec D-8 endorsed; mechanics land Step 3/4. |
| **D-4** (spec) | Header user-chip placement (keep avatar-only on phone vs fully defer to rail footer). | Convergence moves persona to rail footer; current `top-bar.tsx` has a `UserChip`. | Ratify at T26 walkthrough; either way FR-006/007 hold. |
| **D-5** (spec) | Phone FAB→palette deferred. | No FAB today (DESIGN.md No-FAB Rule). | Step 7 (Café local-capture FAB), not a global Capture FAB. |

All other spec deviations (D-1 Inbox, D-2 follow-up `:id`, D-3 Money capability, D-6 retired
components, D-7 Plan retirement, D-8 Record Panel) are honored as written.

---

## 8. Open questions for the Director

1. **D-PLN-1 (flag retirement scope):** confirm Step 2 retires only the route-layer gating +
   `SHOW_INBOX`, and keeps `SHOW_WEEKLY_UPDATES`/`SHOW_DAILY_LOG`/`SHOW_FOLLOWUPS` for Home/
   MyWeek until Step 4/5. (Recommended: yes — behavior-preserving, scope-respecting.)
2. **D-4 (header user chip):** keep an avatar-only `UserChip` on phone (recommended, lowest
   churn) or fully defer to the rail footer profile row on both viewports? Decide before T11.
3. **D-1 (Inbox live):** confirm Inbox is always-live in Step 2 (recommended — flag is already
   `true`, so zero behavior change) vs hidden until Step 4.
4. **⌘K `top` position (T17):** keep the current `top: 64px` (near-top centered) or align to
   e7's `12vh` (more vertically centered)? Cosmetic; owner preference at walkthrough.

---

## 9. Self-verification

- **Every FR → ≥1 task?** FR-001..004 (T4/T10), FR-005 (T10), FR-006/007 (T11), FR-008 (T9),
  FR-009/010 (T9/T18), FR-011/012 (T9/T19), FR-013 (T8), FR-014 (T16/T17/T21), FR-015/016 (T16),
  FR-017 (T16), FR-018/019 (T12), FR-020/021/022 (T10/T20), FR-023/024 (T13/T14), FR-025/026
  (T15/T22), FR-027/028 (T9/T25). ✅
- **Every AC → a verify step?** §5 table — all 25 ACs map to a owning test + task with a verify
  command. ✅
- **Every Experience-Contract rule covered?** Rule 1 (T2/T13), 2 (T9/T14 — no new
  editor/drawer/table), 3 (T4 — numeric caps), 4 (T9/T18/T19), 5 (T10/T20), 6 (T11/T12/T13/T14),
  7 (T16), 8 (T15/T22 — phone capture-first light), 9 (T10/T15/T22 — parity + Money hidden),
  10 (T25 attested), 11 (§2 file list — extend/re-home, 3 justified new). ✅
- **Every file path exists?** Verified: `router.tsx`, `shell/*` (app-shell, rail-nav, rail,
  destinations, sections, top-bar, breadcrumb, breadcrumb-title, bottom-tab-bar, mobile-drawer,
  page-head, page-frame, icons, use-is-narrow), `components/command/*`, `config/features.ts`,
  `i18n/messages.ts`, `lib/capabilities.ts`, `auth/*` guards, all 15 page components. ✅
- **Redirect map complete?** §3.2 enumerates every current authed route from `router.tsx` with a
  fate (re-home or redirect) — verified by reading `router.tsx` in full. ✅
- **TDD ordering?** Every behavior task is red-test-first (named AC in the title), then impl. ✅
- **No DB?** Zero migration/RLS files touched; `git diff supabase/` empty (T24). ✅
- **Rule 11 (no re-implementation)?** Every changed surface is EXTEND/re-home; the 3 new
  components each have a stated non-counterpart. No new record editor / drawer host / table /
  palette. ✅

PLAN-DONE
