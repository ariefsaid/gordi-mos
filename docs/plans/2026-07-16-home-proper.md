# Plan — Home proper (redesign buildout Step 5)

**Spec (contract):** `docs/specs/home-proper.spec.md`. **ADR:** none (nothing architectural — no schema, no new
cross-cutting seam; the region-order store and failed-checks source are conservative, reversible, and behind
one-function boundaries — §RATIFY in the spec). **Branch:** the Step-5 buildout branch (Director assigns).
**Master plan row:** `docs/plans/2026-07-14-redesign-buildout.md` Step 5. **Read-first:**
`docs/experience-contract.md` (Rules 1/6/8/9/11/12), `docs/decisions.md` OD-REDESIGN-18/59/64, `SALVAGE-INVENTORY.md`.

> **No-placeholder rule.** Every task has an exact path, real code, a cited `AC-###` (behavior tasks), and an
> exact verify command. TDD order per task: the **failing test is written first**, then the implementation makes
> it pass. All verify commands run from `mos-app/`. There is **no** pgTAP (no schema change) and **no** new e2e
> (the cross-stack overdue read is covered by the curated F3 journey — spec §6/RATIFY-4).

> **Assumptions about Step 4 (being built now — treat its plan as the binding contract):**
> A1. After Step 4 merges, `mos-app/src/components/signals/signal-feed.tsx` exports `SignalFeed` and Step-4 task
> C3 has mounted it in `home-page.tsx` below an *attention placeholder* region. Step 5 **replaces that
> placeholder** with `<AttentionBrief>` and wraps `<SignalFeed>` + the existing personal tiles in the
> region-order container. If Step 4 named the feed export differently, adjust the import in H-tasks only.
> A2. `SignalFeed` self-loads its own data (Step-4 `listReadableSignals`/`orderSignalsForFeed`); Step 5 does
> **not** call feed DALs — it only positions the component.
> A3. Home renders via `home-page.tsx` (`HomePage`). The `SHOW_HOME_STACKED` flag / `StackedUnionHome` is a
> separate composition; Step 5 targets `HomePage` (the redesign Home). If the shell routes `/` at
> `StackedUnionHome`, the same two-region wrapper applies there — flag to the Director at wire time (spec RATIFY
> is silent on this; conservative default = target `HomePage` per Step-4 C3's explicit reference to it).

## Parallelization map

- **Track P — pure libs** (`src/lib/`): **P1–P6**. No I/O, no deps beyond types. Fully parallel with D and after
  nothing. P1–P4 (attention selectors) and P5–P6 (region order) are two independent files → two parallel lanes.
- **Track D — DAL** (`src/lib/db/`): **D1**. Independent (mocks supabase). Parallel with P.
- **Track C — component** (`src/components/home/`): **C1–C4**. Depends only on the **types** frozen in P4
  (`AttentionLane`/`AttentionItem`) — not on P/D impl (component tests pass lane props). Start once P4 lands.
- **Track H — Home wiring** (`src/pages/`): **H1–H4**. Depends on C (AttentionBrief), P (selectors + region
  order), D (failed-checks), and the Step-4 `SignalFeed`. The integration seam — do it after P/C/D.
- **Track S — strings, styles, gates**: **S1** (i18n) parallel anytime; **S2** (CSS) after C1; **S3–S4** last.

Recommended split: **Builder 1 = Track P + D** (sonnet), **Builder 2 = Track C** (sonnet), **Director = Track H + S**.

---

## Track P — pure attention selectors + region order

### P1 — `overdueTasks` selector (**AC-501**)
**Test first:** `mos-app/src/lib/home-attention.test.ts` (create). Title `AC-501`. Build `TaskListRow[]` (reuse
the shape from `home-page.test.tsx` line ~296) with: an owned overdue task (`due_date:'2026-07-10'`,
`status:'In Progress'`, viewer is `responsible_person_id`), an owned Done overdue task, an owned future task
(`due_date:'2026-07-20'`), an owned null-due task, and a non-owned overdue task. Assert
`overdueTasks(tasks, viewerId, '2026-07-16')` returns only the first, mapped to `{ id, title, route:'/work/tasks/<id>' }`.
**Impl:** `mos-app/src/lib/home-attention.ts` (create):
```ts
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { NotificationRow } from '@/lib/db/notifications'
import { notificationRoute } from '@/lib/db/notifications'
import { raciOwner } from '@/lib/raci-member'

export type AttentionLaneKind = 'overdue' | 'due-today' | 'mentions' | 'failed-checks'
export type LaneState = 'loading' | 'ready' | 'error'

export interface AttentionItem { id: string; title: string; meta?: string; route: string }
export interface AttentionLane { kind: AttentionLaneKind; state: LaneState; items: AttentionItem[] }

/** WIB (Asia/Jakarta) calendar date YYYY-MM-DD from an injected clock — never scattered Date.now() (FR-512). */
export function wibToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now)
}

const toTaskItem = (t: TaskListRow): AttentionItem =>
  ({ id: t.id, title: t.title, meta: t.due_date ?? undefined, route: `/work/tasks/${t.id}` })

/** Owned (R/A), non-Done tasks due strictly before `today` (YYYY-MM-DD WIB). */
export function overdueTasks(tasks: TaskListRow[], viewerId: string, today: string): AttentionItem[] {
  return tasks
    .filter(t => raciOwner(t, viewerId) && t.status !== 'Done' && t.due_date != null && t.due_date < today)
    .map(toTaskItem)
}
```
**Verify:** `cd mos-app && npm test -- src/lib/home-attention.test.ts`.

### P2 — `dueTodayTasks` selector (**AC-502**)
**Test first:** extend `home-attention.test.ts`, title `AC-502`. Assert `dueTodayTasks(tasks, viewerId,
'2026-07-16')` returns only owned non-Done tasks with `due_date === '2026-07-16'`, and the overdue task from P1
is excluded.
**Impl:** add to `home-attention.ts`:
```ts
export function dueTodayTasks(tasks: TaskListRow[], viewerId: string, today: string): AttentionItem[] {
  return tasks
    .filter(t => raciOwner(t, viewerId) && t.status !== 'Done' && t.due_date === today)
    .map(toTaskItem)
}
```
**Verify:** `cd mos-app && npm test -- src/lib/home-attention.test.ts`.

### P3 — `unreadMentions` selector (**AC-503**)
**Test first:** extend `home-attention.test.ts`, title `AC-503`. Build `NotificationRow[]`: an unread row with a
safe route in `metadata.entity.route:'/work/signals?record=abc'`; an unread row with no route; a read row. Assert
`unreadMentions(rows)` returns the two unread rows, the first routed to `/work/signals?record=abc`, the second to
`/inbox`; the read row is excluded.
**Impl:** add to `home-attention.ts`:
```ts
export function unreadMentions(notifications: NotificationRow[]): AttentionItem[] {
  return notifications
    .filter(n => n.read_at == null)
    .map(n => ({ id: n.id, title: n.title, meta: n.body ?? undefined, route: notificationRoute(n) ?? '/inbox' }))
}
```
**Verify:** `cd mos-app && npm test -- src/lib/home-attention.test.ts`.

### P4 — `attentionCount` + freeze lane/item types (**AC-504**)
**Test first:** extend `home-attention.test.ts`, title `AC-504`. Assert `attentionCount([{items:[a,b]},{items:[c]},{items:[]},{items:[d]}])`
returns `4`.
**Impl:** add to `home-attention.ts`:
```ts
export function attentionCount(lanes: { items: AttentionItem[] }[]): number {
  return lanes.reduce((sum, l) => sum + l.items.length, 0)
}
```
(Types `AttentionItem`/`AttentionLane`/`LaneState`/`AttentionLaneKind` are now frozen — this unblocks Track C.)
**Verify:** `cd mos-app && npm test -- src/lib/home-attention.test.ts && npm run typecheck`.

### P5 — `resolveRegionOrder` default (**AC-505**)
**Test first:** `mos-app/src/lib/home-region-order.test.ts` (create), title `AC-505`. `localStorage.clear()` in
`beforeEach`. Assert `resolveRegionOrder('p1')` returns `'attention-first'`.
**Impl:** `mos-app/src/lib/home-region-order.ts` (create):
```ts
export type HomeRegionOrder = 'attention-first' | 'personal-first'
const DEFAULT: HomeRegionOrder = 'attention-first'
const key = (personId: string) => `gordi.home.regionOrder.${personId}`

/** Per-user Home region order (OD-18). v1 store = localStorage (RATIFY-1); one-line swap to a profile column
 *  later. Guarded against private-mode/quota throws → always resolves to a valid order. */
export function resolveRegionOrder(personId: string): HomeRegionOrder {
  try {
    const v = window.localStorage.getItem(key(personId))
    return v === 'personal-first' || v === 'attention-first' ? v : DEFAULT
  } catch { return DEFAULT }
}
```
**Verify:** `cd mos-app && npm test -- src/lib/home-region-order.test.ts`.

### P6 — `setRegionOrder` persistence + per-user keying (**AC-506**)
**Test first:** extend `home-region-order.test.ts`, title `AC-506`. `setRegionOrder('p1','personal-first')`;
assert `resolveRegionOrder('p1')==='personal-first'` and `resolveRegionOrder('p2')==='attention-first'`.
**Impl:** add to `home-region-order.ts`:
```ts
export function setRegionOrder(personId: string, order: HomeRegionOrder): void {
  try { window.localStorage.setItem(key(personId), order) } catch { /* ignore quota / private-mode */ }
}
```
**Verify:** `cd mos-app && npm test -- src/lib/home-region-order.test.ts`.

---

## Track D — failed-checks DAL adapter

### D1 — `loadFailedChecksForViewer` (**AC-507**)
**Test first:** `mos-app/src/lib/db/home-attention-data.test.ts` (create), title `AC-507`. Mock the supabase
client shape used by other DAL tests (`vi.mock('@/lib/supabase', …)` returning a chainable
`schema().from().select().eq().order().limit()` resolving `{ data, error }`). Assert: (a) `.eq` is called with
`('status','Rejected')`; (b) no call passes `org_id`; (c) rejected rows map to `AttentionItem`s with
`route:'/cafe/log'` and a plain-language title; (d) `{ data:null, error:null }` → returns `[]` (no throw);
(e) `{ error:{message:'x'} }` → throws.
**Impl:** `mos-app/src/lib/db/home-attention-data.ts` (create):
```ts
import { supabase } from '@/lib/supabase'
import type { AttentionItem } from '@/lib/home-attention'

const ops = () => supabase.schema('ops')
// Café route the barista returns to in order to re-log a rejected check (RATIFY-3 — v1 failed-check source).
const CAFE_LOG_ROUTE = '/cafe/log'

interface RejectedLogRow { id: string; log_date: string; action_type: string; review_note: string | null }

/** v1 "failed checks" = the viewer's RLS-readable rejected kitchen logs (spec §2, RATIFY-3). Never sends
 *  org_id/person_id (RLS is the authority); returns [] when none (fail-closed), throws only on a real error.
 *  Step 6's Check/Exception object replaces this adapter body without touching AttentionBrief/HomePage. */
export async function loadFailedChecksForViewer(limit = 20): Promise<AttentionItem[]> {
  const { data, error } = await ops()
    .from('kitchen_logs')
    .select('id,log_date,action_type,review_note')
    .eq('status', 'Rejected')
    .order('log_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`loadFailedChecksForViewer failed — ${error.message}`)
  return ((data ?? []) as RejectedLogRow[]).map(r => ({
    id: r.id,
    title: `${r.action_type} · ${r.log_date}`,
    meta: r.review_note ?? undefined,
    route: CAFE_LOG_ROUTE,
  }))
}
```
**Verify:** `cd mos-app && npm test -- src/lib/db/home-attention-data.test.ts`.

---

## Track C — AttentionBrief component

### C1 — Lanes with items render as drill-links (**AC-508**)
**Test first:** `mos-app/src/components/home/attention-brief.test.tsx` (create), title `AC-508`. Render inside
`MemoryRouter` + `I18nProvider` (mirror `home-page.test.tsx` wrapper). Pass `lanes` = overdue/due-today/mentions/
failed-checks each `state:'ready'` with one item. Assert each item's title is a link (`closest('a')`) whose
`href` equals the item `route`.
**Impl:** `mos-app/src/components/home/attention-brief.tsx` (create). `role="region"` with `id="attention-brief"`
and an accessible name from i18n `home.attention.title`. For each lane in a fixed order (overdue → due-today →
failed-checks → mentions): `ready`+items → a titled `<ul>` of `<Link to={item.route}>`; `ready`+empty → render
nothing; `loading` → skeleton with `aria-busy`; `error` → the error affordance (C3). If every lane is `ready`
and empty → the all-clear state (C2). Lane titles/copy from i18n (S1). Reuse existing kit classes; no new
record/list component (Rule 11 — this is a composition of `<Link>`s + the shared card/pill primitives).
**Verify:** `cd mos-app && npm test -- src/components/home/attention-brief.test.tsx`.

### C2 — All-clear empty state, no misleading zeros (**AC-509**)
**Test first:** extend `attention-brief.test.tsx`, title `AC-509`. Pass all four lanes `state:'ready', items:[]`.
Assert the all-clear text (`home.attention.allClear`) is present and there is **no** element containing a bare
`"0"` lane count (query lane titles absent).
**Impl:** already structured in C1 (`ready`+empty omits the lane; all-empty → all-clear). Add the all-clear branch
if not yet present.
**Verify:** `cd mos-app && npm test -- src/components/home/attention-brief.test.tsx`.

### C3 — Per-lane error is fail-soft (**AC-510**)
**Test first:** extend `attention-brief.test.tsx`, title `AC-510`. Pass mentions lane `state:'error', items:[]`
and overdue lane `state:'ready'` with one item. Assert the error affordance (`home.attention.laneError`) shows
for mentions **and** the overdue item still renders.
**Impl:** the `error` branch in C1 renders the error affordance for that lane only; sibling lanes are unaffected.
**Verify:** `cd mos-app && npm test -- src/components/home/attention-brief.test.tsx`.

### C4 — ≤390px first content is attention, not config (**AC-511**)
**Test first:** extend `attention-brief.test.tsx`, title `AC-511`. Render with one ready overdue item inside a
`style={{ width: 390 }}` container. Assert the first interactive/content element is the attention item link and
that `AttentionBrief` renders **no** order toggle / select / configuration control (the toggle lives on HomePage,
not in the brief — assert `queryByRole('combobox')`/order-toggle testid is null within the region).
**Impl:** confirm `AttentionBrief` contains no configuration control (it is presentation-only). No layout code
beyond the region; the ≤390px capture-first guarantee is structural.
**Verify:** `cd mos-app && npm test -- src/components/home/attention-brief.test.tsx`.

---

## Track H — Home wiring (region order + fetch)

> **Shape after edit:** `HomePage` fetches (a) tasks via the existing `listTasks({})` effect — reused for the
> tasks tile AND now feeding `overdueTasks`/`dueTodayTasks`; (b) `listNotifications()` for `unreadMentions`;
> (c) `loadFailedChecksForViewer()`. It builds `AttentionLane[]` (each lane carries its own `loading|ready|error`
> state) and renders two regions in `resolveRegionOrder(personId)` order:
> `PersonalCanvas` = existing finance KPI row + tasks tile + `MyWeekPanel` + `<SignalFeed/>` (Step-4);
> `Attention` = `<AttentionBrief lanes={lanes}/>`. An inline order **toggle** (button group) calls
> `setRegionOrder` + local state. When `personal-first`, `PageHead` renders a **"Needs attention · N"** summary
> anchored to `#attention-brief`.

### H1 — Default order = attention-first (**AC-512**)
**Test first:** extend `mos-app/src/pages/home-page.test.tsx`, title `AC-512`. Add mocks:
`vi.mock('../lib/db/notifications', …)` → `listNotifications: vi.fn().mockResolvedValue([])`,
`notificationRoute: (r)=>null`; `vi.mock('../lib/db/home-attention-data', …)` →
`loadFailedChecksForViewer: vi.fn().mockResolvedValue([])`; `vi.mock('../components/signals/signal-feed', …)`
→ `SignalFeed: () => <div data-testid="signal-feed" />`. With no stored order, render Home; assert the
`#attention-brief` region node appears **before** the `data-testid="personal-canvas"` region in DOM order
(compare `compareDocumentPosition`).
**Impl:** edit `mos-app/src/pages/home-page.tsx`: import `resolveRegionOrder`/`setRegionOrder`, the attention
selectors, `wibToday`, `listNotifications`, `loadFailedChecksForViewer`, `AttentionBrief`, `SignalFeed`. Add
`notifications`/`failedChecks` fetch effects (guard on `personId`, `cancelled` flag — mirror the existing tasks
effect). Derive `today = wibToday()` once. Build `lanes`. Wrap the existing personal tiles + `<SignalFeed/>` in
`<section data-testid="personal-canvas">` and `<AttentionBrief lanes={lanes}/>` in the attention slot; render the
two in `order` sequence. Default `order` from `resolveRegionOrder(personId)`.
**Verify:** `cd mos-app && npm test -- src/pages/home-page.test.tsx`.

### H2 — Personal-first reorders + header summary survives (**AC-513**)
**Test first:** extend `home-page.test.tsx`, title `AC-513`. In `beforeEach`-adjacent setup call
`setRegionOrder(financeViewer person id,'personal-first')` (import the real region-order lib — it uses jsdom
localStorage). Render Home; assert `data-testid="personal-canvas"` precedes `#attention-brief`, AND a header
element with text matching `/needs attention · \d+/i` exists with a link whose `href` ends `#attention-brief`.
**Impl:** in `home-page.tsx`, when `order==='personal-first'` render the `PageHead` summary
(`t('home.attention.summary', { n })` with a `<a href="#attention-brief">`), `n = attentionCount(lanes)`.
**Verify:** `cd mos-app && npm test -- src/pages/home-page.test.tsx`.

### H3 — Order toggle persists (**AC-514**)
**Test first:** extend `home-page.test.tsx`, title `AC-514`. Start default; render Home; `userEvent.click` the
order toggle's "My canvas first" control; assert the regions reorder (personal precedes attention) AND
`resolveRegionOrder(personId)` now returns `'personal-first'`.
**Impl:** in `home-page.tsx`, render a compact toggle (button group, `aria-label` from `home.order.toggle`) with
two options (`home.order.attentionFirst` / `home.order.personalFirst`); on change set local `order` state and
call `setRegionOrder(personId, next)`. Only rendered for an authenticated viewer with a `personId` (user-only —
FR-508).
**Verify:** `cd mos-app && npm test -- src/pages/home-page.test.tsx`.

### H4 — Region order is width-independent (no CSS reflow) (**AC-515**)
**Test first:** extend `home-page.test.tsx`, title `AC-515`. With `personal-first` set, render Home once inside a
`style={{ width: 390 }}` container and once at default width; in both, assert `personal-canvas` precedes
`#attention-brief` in DOM order, AND assert the region container element does not set inline/computed CSS `order`
that contradicts DOM order (assert the wrapper has `data-region-order="personal-first"` and no `order` style is
applied to either region node — the ordering is DOM-driven, not flex-`order`-driven).
**Impl:** ensure the two regions are emitted in DOM in the chosen order (not via CSS `order`); tag the wrapper
`data-region-order={order}`. No media-query reordering in `home-page.css` (S2).
**Verify:** `cd mos-app && npm test -- src/pages/home-page.test.tsx`.

---

## Track S — strings, styles, gates

### S1 — i18n keys (both locales)
**File:** `mos-app/src/i18n/messages.ts` (edit). Add under the `home.*` block for **both** `en` and `id`:
```
'home.attention.title': 'Needs attention',           // id: 'Perlu perhatian'
'home.attention.allClear': "You're all caught up",    // id: 'Semua beres'
'home.attention.lane.overdue': 'Overdue',             // id: 'Terlambat'
'home.attention.lane.dueToday': 'Due today',          // id: 'Jatuh tempo hari ini'
'home.attention.lane.mentions': 'Mentions',           // id: 'Sebutan'
'home.attention.lane.failedChecks': 'Failed checks',  // id: 'Pemeriksaan gagal'
'home.attention.laneError': "Couldn't load this list. Refresh to try again.", // id: 'Gagal memuat. Muat ulang untuk mencoba lagi.'
'home.attention.summary': 'Needs attention · ${n}',   // id: 'Perlu perhatian · ${n}'
'home.order.toggle': 'Home order',                    // id: 'Urutan Beranda'
'home.order.attentionFirst': 'Attention first',       // id: 'Perhatian dulu'
'home.order.personalFirst': 'My canvas first',        // id: 'Kanvas saya dulu'
```
No test (typecheck asserts both locales carry every key).
**Verify:** `cd mos-app && npm run typecheck`.

### S2 — Styles (presentation only, zero behavior)
**Files:** `mos-app/src/components/home/attention-brief.css` (create) + `mos-app/src/pages/home-page.css`
(edit — add the two-region wrapper class). Use `--e7-*`/existing tokens (Rule 2). Attention lanes as the shared
card/list primitives; ≥44px tap targets on item links (Rule 8). **Do NOT** use CSS `order`/`flex-direction`
media queries to reflow the two regions (AC-515). No test (visual; covered by the Step-5 design review + the
before/after 1280/390 matrix in the ledger).
**Verify:** `cd mos-app && npm run build` (CSS compiles) and `npm run lint -- --max-warnings=0`.

### S3 — Review-ledger scope card
**File:** `docs/reviews/<branch>.md` (create/append). Record the Step-5 **scope card** (owner-directed,
anti-pedantry): IN = attention brief (overdue/due-today/mentions/failed-checks lanes) + OD-18 region order +
header summary + Home two-region recomposition; DEFERRED = Signal composer/feed/archive/record (Step 4), generic
Check/Exception + occurrence roll-ups (Step 6), café retrofit (Step 7), server-side region-order persistence +
Profile-homed toggle (Admin/OD-52), extra attention lanes (later); KNOWN-ACCEPTED = failed-checks sourced from
café rejected logs (RATIFY-3), region order in `localStorage` (RATIFY-1), inline order toggle on Home (RATIFY-2).
Also record the four Contract-rule focuses for this step: Rule 1 (Home job), Rule 8/9 (capture-first + order
parity), Rule 11 (feed/tiles reused), Rule 12 (barista reads "Opening prep · date", not "Rejected kitchen_log").
(Doc only; no verify command.)

### S4 — Final gates (blocking; the whole slice)
Run and confirm green:
- `cd mos-app && npm run typecheck` — zero errors.
- `cd mos-app && npm run lint -- --max-warnings=0` — zero.
- `cd mos-app && npm test` — full Vitest suite green; coverage ≥80% on changed lines
  (`npm test -- --coverage` over `src/lib/home-attention.ts`, `src/lib/home-region-order.ts`,
  `src/lib/db/home-attention-data.ts`, `src/components/home/attention-brief.tsx`, and the changed
  `src/pages/home-page.tsx` lines).
- `cd mos-app && npx playwright test` — curated journeys green; **F3 (find-overdue-work) must not regress** (it
  now also surfaces on Home).
- `bash scripts/pre-merge-check.sh` — exit 0 (review ledger present; four-lens design review + cross-family code
  review recorded; before/after 1280/390 screenshot matrix in the ledger).
**Verify:** all commands above exit 0.

---

## Task count & AC coverage

**19 tasks:** Track P = P1–P6 (6) · Track D = D1 (1) · Track C = C1–C4 (4) · Track H = H1–H4 (4) · Track S =
S1–S4 (4).

**AC → task map (each AC owned by exactly one test):**
- AC-501 → P1 · AC-502 → P2 · AC-503 → P3 · AC-504 → P4
- AC-505 → P5 · AC-506 → P6
- AC-507 → D1
- AC-508 → C1 · AC-509 → C2 · AC-510 → C3 · AC-511 → C4
- AC-512 → H1 · AC-513 → H2 · AC-514 → H3 · AC-515 → H4

**FR → task map:** FR-501/506 → C1+H1 · FR-502/512 → P1 · FR-503 → P2 · FR-504 → P3 · FR-505 → D1 ·
FR-507 → C3 · FR-508/510 → P5/P6/H3 · FR-509 → P4/H2 · FR-511 → H4. NFR-501 → P1–P6 · NFR-502 → D1 ·
NFR-504 → C1/H1 (reuse `SignalFeed`/tiles/`raciOwner`/`notificationRoute`) · NFR-505 → C4 · NFR-503 → S4.

**Non-behavior tasks (no AC — pure plumbing/config):** S1 (i18n), S2 (CSS), S3 (ledger), S4 (gates).

**Parallelizable:** P and D run concurrently from the start (two lanes inside P: P1–P4 vs P5–P6). C starts once
P4 freezes the lane/item types. H is the integration seam (after P/C/D + Step-4 `SignalFeed`). S1 anytime;
S2 after C1; S3–S4 last.
</content>
