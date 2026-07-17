# Redesign Step 9 — Money + Inbox alignment

**Status:** Proposed
**Buildout step:** `docs/plans/2026-07-14-redesign-buildout.md` step 9
**Primary rules:** Experience Contract Rules **2, 4, 6, 11**
**Primary decisions:** ADR-0025 D1/D9 (Money is a role-gated destination; Work's Cadence/queues include
Follow-ups) · `docs/experience-contract.md` Rule 2 ("Follow-up" contract row: *work item (money-shaped) +
record page* → *Money queue entry; Work Tasks saved-view*) · OD-REDESIGN-8/ADR-0025 D9 (Work collection
switcher includes Follow-ups as a Cadence/queue) · OD-IA-1 (MOS owns AR/pending-bill settlement grain;
"backup/restore drill gates the AR bridge")

## 1. Overview and user value

Step 3 (`docs/specs/redesign-tasks-rehome.spec.md`) shipped the `Follow-ups` saved-view chip at
`/work/tasks?view=followups` as a **reserved** shell (FR-311/AC-311): it deliberately shows placeholder
copy — "before Step 9 convergence" — rather than faking a Task filter, because the follow-up settlement
bridge is a separate domain model (`mos.follow_ups`, shipped 2026-07-09, migration
`20260709000001_mos_follow_ups.sql`) with its own canonical page (`FollowUpsPage`, gated by the
`SHOW_FOLLOWUPS` dark-launch flag).

This step is that convergence. Experience Contract Rule 2 names the target shape explicitly: **one
Follow-up domain contract, one "work item (money-shaped) + record page" UI family, reached from two
job-first destinations — "Money queue entry" and "Work Tasks saved-view."** This is "one record, two
doors" (ADR-0025 D9): the SAME canonical renderer (table + lifecycle actions + detail) is reachable
from **Door 1** (Work → Tasks → the `Follow-ups` chip, for whoever chases invoices day to day) and
**Door 2** (Money → a discoverable queue-entry link, for finance/admin's control view) — never a second
implementation of the follow-up table, and never a second canonical record URL.

User value:
- a chaser working `/work/tasks` never has to leave Work to see the settlement queue;
- finance/admin lands on the same live queue from Money, where they already work with revenue/margin;
- the follow-up record keeps exactly one canonical URL (`/work/follow-ups/:id`) regardless of which door
  found it — refreshing, copying, or opening in a new tab always resolves to the same page (Rule 4);
- Inbox is untouched — this step does not add, remove, or rewire any Inbox behavior.

This is a **rewire + reuse** step, not a new Follow-up implementation. **No schema, RLS, or migration
change** — `mos.follow_ups` / `mos.follow_up_events` / `mos.transition_follow_up` / the RLS policies
already shipped and are already pgTAP-proven (`supabase/tests/74_follow_ups_rls.sql`,
`supabase/tests/75_follow_up_transition_rpc.sql`).

## 2. Scope

### In scope
- Door 1: `/work/tasks?view=followups` renders the live Follow-up queue (table + lifecycle actions +
  detail) instead of the FR-311 reserved-state placeholder, **once `SHOW_FOLLOWUPS` is on**.
- Door 2: a new canonical Money route `/money/follow-ups` (finance/admin-gated, `SHOW_FOLLOWUPS`-gated,
  mirrors the existing `/money/budget` / `/money/pricing` pattern) plus a discoverable link to it from
  the Money `DashboardPage` chrome.
- Extracting the ONE follow-up record renderer (data hook + presentational table) so both doors and the
  existing canonical page (`/work/follow-ups`, `/work/follow-ups/:id`) compose the same components —
  zero duplicate implementations (Rule 11).
- Preserving the FR-311/AC-311 reserved-state placeholder as the exact behavior while `SHOW_FOLLOWUPS`
  stays off (the current default — see §10 on the dark-launch gate).

### Out of scope
- Any `mos.follow_ups` / `mos.follow_up_events` schema, RLS, or RPC change.
- Flipping `SHOW_FOLLOWUPS` to `true` (a separate owner-gated go-live decision — §10).
- Home's `data-money-ar-slot` (the reserved AR/Follow-up tile slot in
  `mos-app/src/components/home-stack/money-position-section.tsx`) — that slot belongs to a different,
  not-yet-scoped slice; this step's scope card is explicitly "Tasks saved view + Money queue entry," not
  Home.
- Any Inbox route, component, or behavior change ("Inbox unchanged" per the master-plan scope card).
- A live overdue-count badge on the Money door's entry link — the link is a navigational door, not a new
  KPI; a count badge would need its own data-fetch/loading-state design not yet ratified for this surface
  (§10).
- Any change to `/work/follow-ups` (redirect) or `/work/follow-ups/:id` (canonical record page)
  **behavior** — only their internal composition changes (still the same rendered output, proven by the
  existing test suite staying green unmodified, §8/§9).

## 3. Reverse-engineered current behavior (spec-miner baseline)

Verified from the shipped app (2026-07-17):

- `mos.follow_ups` / `mos.follow_up_events` / `mos.transition_follow_up` / `mos.can_work_lane` /
  `mos.follow_up_recon_summary` / `mos.follow_up_recon_drift` — the full settlement bridge — shipped in
  `supabase/migrations/20260709000001_mos_follow_ups.sql`. RLS: `select` for `admin` OR `finance` OR a
  lane-holder (`mos.can_work_lane(lane)`); all writes go through the single SECURITY DEFINER
  `mos.transition_follow_up` RPC. Already pgTAP-proven — no new SQL surface in this step.
- `mos-app/src/lib/db/follow-ups.ts` — the DAL (`listFollowUps`, `listFollowUpEvents`,
  `transitionFollowUp`, `listReconDrift`, `isOverdue`, `summarizeAging`). Reused as-is.
- `mos-app/src/lib/follow-up-lanes.ts` — `canWorkLane` / `canWorkAnyLane` (BU-code lane matching).
  Reused as-is.
- `mos-app/src/pages/follow-ups-page.tsx` (`FollowUpsPage`) — today a single ~260-line component owning
  auth/access state, `listFollowUps` fetch, lifecycle-action handlers, transition-form state, table
  columns, and the detail aside — all in one file. It is the canonical renderer mounted at
  `/work/follow-ups` and `/work/follow-ups/:id` (`route.id` selects the open detail row).
- `mos-app/src/router.tsx`:
  - `{ path: 'work/follow-ups', element: <Navigate to="/work/tasks?view=followups" replace /> }`
  - `{ path: 'work/follow-ups/:id', element: SHOW_FOLLOWUPS ? <FollowUpsPage /> : <Navigate to="/" replace /> }`
    (no `RequireAccessRole` wrapper — any authenticated lane-holder may reach it; RLS is the real gate).
  - Money routes (`money`, `money/detail`, `money/budget`, `money/pricing`) sit under one
    `RequireAccessRole anyOf={['finance','admin']}` group. `money/budget` / `money/pricing` are further
    gated by `SHOW_PLAN_BUDGET` and are **not** listed in `mos-app/src/shell/destinations.tsx`'s nav —
    they are reachable only by direct/contextual link, same shape this step's `money/follow-ups` route
    will take.
  - `mos-app/src/config/features.ts`: `export const SHOW_FOLLOWUPS = false` — comment: *"Follow-up
    settlement bridge v1 ships dark until the owner backup/restore go-live gate."* No document read in
    this survey records that drill as complete.
- `mos-app/src/components/tasks/use-tasks-saved-view.ts` — `?view=followups` already resolves to
  `{ activeChip: 'followups', reserved: 'followups', segment: 'all', overdueOnly: false }` (Step 3,
  shipped).
- `mos-app/src/components/tasks/tasks-workspace.tsx` (~line 674) — when `savedView?.reserved ===
  'followups'`, renders a fixed placeholder region (`role="region"` `aria-label={t('tasks.saved.followups')}`,
  `tasks.followups.title` / `tasks.followups.copy` copy) **unconditionally** — it does not check
  `SHOW_FOLLOWUPS` today, because there was nothing live to show before this step.
- `mos-app/src/components/tasks/tasks-workspace.test.tsx` — `AC-311: view=followups shows reserved-state
  copy instead of task rows` asserts exactly that placeholder, under the real (flag-off) default. This
  test's own docstring context (Step 3 spec) already frames it as "before Step 9 convergence."
- `mos-app/src/shell/destinations.tsx` / `job-sentences.ts` / `breadcrumb.tsx` all resolve **by path
  prefix**, generically: `destinationForPath('/money/follow-ups')` matches Money's `/money` link prefix;
  `jobKeyForPath('/money/follow-ups')` resolves `job.money` via the `money` root-segment lookup;
  `jobKeyForPath('/work/follow-ups/...')` falls back to `job.tasks` (no dedicated `follow-ups` job-key
  segment exists, and none is needed — Rule 2 already places this collection under Work/Tasks).
  `Breadcrumb`'s `destination.id === 'money'` branch only special-cases `/money/detail`; `/money/budget`,
  `/money/pricing`, and (after this step) `/money/follow-ups` all render the bare "Money" crumb — an
  existing, already-shipped precedent this step does not change.
- `mos-app/src/i18n/messages.ts` already carries every string this step needs: the full `followUps.*`
  family (title/overdue/error/empty/counterparty/amount/balance/state/due/actions/action.*/promiseDate/
  amountInput/cashInDate/evidence/submit) and `tasks.saved.followups` / `tasks.followups.title` /
  `tasks.followups.copy` / `nav.followUps`, in both `en` and `id`. **Zero new i18n keys are required.**
  `mos-app/src/pages/dashboard-page.tsx` is a pre-i18n-catalog file (every string, including its own
  `"Dashboard"` title, is a hardcoded literal) — this step's Door 2 link follows that file's own existing
  convention rather than retrofitting the whole page onto the i18n catalog (out of scope, unrelated
  refactor).

## 4. Reuse inventory (Rule 11)

| Path | Status | Exact seam |
|---|---|---|
| `mos-app/src/lib/db/follow-ups.ts` | **REUSE-AS-IS** | No new data API. |
| `mos-app/src/lib/follow-up-lanes.ts` | **REUSE-AS-IS** | No change. |
| `mos-app/src/pages/follow-ups-page.tsx` | **REWIRE** | Becomes a thin `PageFrame`/`PageHead` wrapper composing the extracted hook + table (§5). Rendered output for `/work/follow-ups` and `/work/follow-ups/:id` is unchanged — proven by the existing test suite passing unmodified. |
| `mos-app/src/components/follow-ups/use-follow-up-queue.ts` | **NEW (thin extraction)** | The ONE data/behavior hook (auth, fetch, lane check, transitions) — lifted verbatim from `FollowUpsPage`. Justified: no equivalent seam exists to share this logic between two doors without it. |
| `mos-app/src/components/follow-ups/follow-up-queue-table.tsx` | **NEW (thin extraction)** | The ONE presentational renderer (table columns, lifecycle actions, detail aside) — lifted verbatim from `FollowUpsPage`. Consumes `use-follow-up-queue`'s return shape; introduces no new markup/behavior. |
| `mos-app/src/components/follow-ups/follow-up-queue-embed.tsx` | **NEW (thin composition)** | Door 1's mount point: composes the SAME hook + table, no `PageFrame`/`PageHead` (Rule 6 — the region lives inside `TasksWorkspace`'s existing content region). |
| `mos-app/src/components/tasks/tasks-workspace.tsx` | **REWIRE** | The reserved-`followups` branch (~line 674) gains a `SHOW_FOLLOWUPS` check; flag-on mounts `FollowUpQueueEmbed`, flag-off keeps the existing placeholder markup byte-for-byte. |
| `mos-app/src/router.tsx` | **REWIRE (1 line)** | Add `money/follow-ups` inside the existing `RequireAccessRole anyOf={['finance','admin']}` Money group, mirroring `money/budget`/`money/pricing`'s `SHOW_FLAG ? <Page/> : <Navigate to="/" replace/>` shape. `FollowUpsPage` and `SHOW_FOLLOWUPS` are already imported. |
| `mos-app/src/pages/dashboard-page.tsx` | **REWIRE** | `DashboardChrome` (rendered identically across loading/error/empty/populated) gains one flag-gated `Link` to `/money/follow-ups` — a state-independent door, not tied to the sales-reporting load state. |
| `mos-app/src/shell/destinations.tsx`, `job-sentences.ts`, `breadcrumb.tsx`, `context-row.tsx` | **REUSE-AS-IS** | Verified (§3): all resolve `/money/follow-ups` and `/work/follow-ups*` correctly today via existing prefix-based logic. No edits. |
| `mos-app/src/i18n/messages.ts` | **REUSE-AS-IS** | Every string needed already exists (§3). No new keys. |
| `mos-app/src/pages/inbox-page.tsx`, `mos-app/src/router.tsx`'s `inbox` route | **REUSE-AS-IS / untouched** | "Inbox unchanged" — no edit; regression already covered by the existing `router.test.tsx` `AC-006: /inbox renders InboxPage (always live)` test. |

## 5. The one-record-two-doors composition

```
useFollowUpQueue(options)              — data/behavior (auth, fetch, lanes, transitions)
        │
        ▼
FollowUpQueueTable({ queue })          — the ONE presentational renderer (table + actions + detail aside)
        │                    │
        ▼                    ▼
FollowUpsPage                FollowUpQueueEmbed
(PageFrame+PageHead;         (no chrome; mounts inside
canonical /work/follow-ups   TasksWorkspace's own region)
and /work/follow-ups/:id)            │
        ▲                            ▼
        │                    Door 1: /work/tasks?view=followups
Door 2: /money/follow-ups    (Work → Tasks → Follow-ups chip)
(Money → queue-entry link)
```

- **Canonical record URL stays singular** (OD-REDESIGN-7 / Rule 4): every row's "read-only source" link
  in both doors points at `/work/follow-ups/:id` — the Money door never grows its own
  `/money/follow-ups/:id` record URL. Clicking a row from either door lands on the same page; refresh,
  new-tab, and copy-link all resolve identically.
- **One mutation path**: both doors call the same `transitionFollowUp` RPC wrapper through the same hook
  instance shape — there is no second lifecycle-action implementation to drift out of sync with the RLS
  contract.
- **Independent audiences, same record** (this is the point of "two doors," not a bug): Door 1
  (`/work/tasks?view=followups`) has no route-level access gate — any lane-holder can chase their own
  invoices from Work, exactly as RLS already allows (`mos.can_work_lane`). Door 2
  (`/money/follow-ups`) sits inside Money's existing `RequireAccessRole anyOf={['finance','admin']}`
  gate — the control view. Both doors still only ever see rows RLS returns for the caller; the route gate
  narrows Door 2's *audience*, not the *data*.

## 6. Functional requirements (EARS)

- **FR-900** When a viewer opens `/work/tasks?view=followups` and `SHOW_FOLLOWUPS` is `true`, the system
  shall render the live Follow-up queue (table, lifecycle actions, detail aside) in place of the
  FR-311 reserved-state placeholder.
- **FR-901** Where `SHOW_FOLLOWUPS` is `false`, the system shall continue to render the exact FR-311
  reserved-state placeholder at `/work/tasks?view=followups`, unchanged.
- **FR-902** When a finance/admin viewer navigates to `/money/follow-ups` and `SHOW_FOLLOWUPS` is `true`,
  the system shall render the same canonical Follow-up queue renderer used by `/work/follow-ups`.
- **FR-903** Where `SHOW_FOLLOWUPS` is `false`, the system shall redirect `/money/follow-ups` to `/`,
  mirroring the existing `/money/budget` and `/money/pricing` dark-launch contract.
- **FR-904** Where a viewer lacks both the `finance` and `admin` access roles, the system shall not permit
  `/money/follow-ups` to render (route-gated by the existing Money `RequireAccessRole` group), regardless
  of `SHOW_FOLLOWUPS`.
- **FR-905** The system shall implement the Follow-up queue's data/behavior and its table/detail rendering
  exactly once; `FollowUpsPage`, `FollowUpQueueEmbed`, and any future door shall compose that single
  hook and single presentational component rather than re-implementing table columns, lifecycle-action
  handlers, or the detail aside. *(Rule 11)*
- **FR-906** Every row's source link, in every door, shall resolve to the canonical
  `/work/follow-ups/:id` route; no door shall introduce a second canonical URL for a Follow-up record.
  *(Rule 4, OD-REDESIGN-7)*
- **FR-907** When a viewer opens the Money destination, the system shall expose a discoverable link to
  `/money/follow-ups` from the Money page chrome whenever `SHOW_FOLLOWUPS` is `true`; the link shall be
  absent when `SHOW_FOLLOWUPS` is `false`.
- **FR-908** The Money queue-entry link required by FR-907 shall render identically across the Money
  page's loading, error, empty, and populated states (it depends on `SHOW_FOLLOWUPS` only, never on the
  sales-reporting fetch state).
- **FR-909** The system shall not alter any Inbox route, component, or behavior in this step.
- **FR-910** The system shall not alter `mos.follow_ups`, `mos.follow_up_events`,
  `mos.transition_follow_up`, or their RLS policies in this step.

## 7. Non-functional requirements

- **NFR-900** The implementation shall be a **rewire/extraction-first** change: no new business logic,
  no new query shape, no new mutation path beyond the existing `transitionFollowUp` RPC call. *(Rule 11)*
- **NFR-901** No new Supabase migration, RLS policy, or pgTAP file is required — the existing
  `74_follow_ups_rls.sql` / `75_follow_up_transition_rpc.sql` suite already proves the RLS/RPC contract
  both doors rely on.
- **NFR-902** The extraction (§5) shall not change the rendered output of `/work/follow-ups` or
  `/work/follow-ups/:id` — proven by `follow-ups-page.test.tsx` passing unmodified.
- **NFR-903** Door 2's discoverability (FR-907) shall add no new network request to the Money page's
  existing data flow (`listSalesDailyRevenue` / `listSalesMarginDaily`) — it is a static, flag-gated
  link, not a live-count widget (see §10 open question on a future count badge).
- **OBS-900** The system shall not introduce new telemetry in this step; every lifecycle transition
  triggered from either door shall continue to be recorded in `mos.follow_up_events` (actor, transition,
  from/to state, amount/cash-in-date/evidence where applicable) via the existing RPC — auditable
  regardless of which door initiated it. *(Already proven by `75_follow_up_transition_rpc.sql`; no new
  test required.)*

## 8. Acceptance criteria and owning test layer

All Vitest (component/route-table) — this step reuses proven RLS/RPC and adds no new SQL surface, so no
new pgTAP is required (§3, NFR-901).

| ID | Acceptance criteria | Owner test |
|---|---|---|
| **AC-900** | Given `/money/follow-ups` in the route table, When `SHOW_FOLLOWUPS` is `true`, Then the route sits under `RequireAccessRole anyOf={['finance','admin']}` and renders `FollowUpsPage`; When `SHOW_FOLLOWUPS` is `false`, Then it renders `<Navigate to="/" replace />`. | component (`router.test.tsx`) |
| **AC-901** | Given a viewer without `finance`/`admin`, When they attempt `/money/follow-ups`, Then `RequireAccessRole` redirects home regardless of `SHOW_FOLLOWUPS`. | component (existing `RequireAccessRole` contract; proven structurally by AC-900's route-table assertion — no new component render test needed) |
| **AC-902** | Given `SHOW_FOLLOWUPS` is `true`, When a finance/admin viewer opens `/money`, Then a real `<a href="/money/follow-ups">` link labelled "Follow-up queue" is present in the page. | component (`dashboard-page.followups-door.test.tsx`) |
| **AC-903** | Given `SHOW_FOLLOWUPS` is `false` (the real default), When a finance/admin viewer opens `/money`, Then no "Follow-up queue" link is present. | component (`dashboard-page.test.tsx`) |
| **AC-904** | Given `SHOW_FOLLOWUPS` is `true`, When a viewer opens `/work/tasks?view=followups`, Then the live Follow-up queue renders (counterparty rows, lifecycle-action buttons) and the FR-311 reserved-state copy is absent. | component (`tasks-workspace-followups-door.test.tsx`) |
| **AC-905** | Given `SHOW_FOLLOWUPS` is `false` (the real default), When a viewer opens `/work/tasks?view=followups`, Then the exact FR-311 reserved-state copy still renders (regression proof — no behavior change to the flag-off path). | component (existing, unmodified `tasks-workspace.test.tsx` `AC-311` case) |
| **AC-906** | Given the `follow-ups-page.tsx` extraction (§5), When `/work/follow-ups` and `/work/follow-ups/:id` render, Then every existing assertion in `follow-ups-page.test.tsx` (queue rows, DataTable, mobile card list, detail panel, settle-form gating, confirm-hiding, loading/empty/error states) continues to pass **unmodified**. | component (existing, unmodified `follow-ups-page.test.tsx`) |
| **AC-907** | Given the Follow-up queue is open from either door (Money or Work), When a lifecycle action fires, Then it calls the same `transitionFollowUp(id, verb, options)` function — proven by construction (one hook, §5) and by a targeted assertion that the Door-1 embed exposes the same action buttons the canonical page does. | component (`tasks-workspace-followups-door.test.tsx`) |
| **AC-908** | Given a follow-up row rendered from either door, When its source link is inspected, Then it points at `/work/follow-ups/<id>` — never a `/money/follow-ups/<id>` or any second canonical shape. | component (`tasks-workspace-followups-door.test.tsx`, plus the existing `follow-ups-page.test.tsx` assertion for the canonical page) |
| **AC-909** | Given this step's full diff, When `router.test.tsx`'s existing `AC-006: /inbox renders InboxPage (always live)` test is run, Then it continues to pass unmodified — Inbox is untouched. | component (existing, unmodified `router.test.tsx`) |

## 9. Error-handling table

| Scenario | Required behavior |
|---|---|
| `SHOW_FOLLOWUPS` off, Door 1 (`?view=followups`) | Exact FR-311 placeholder, unchanged (AC-905). |
| `SHOW_FOLLOWUPS` off, Door 2 (`/money/follow-ups`) | Redirect to `/`, same shape as `/money/budget`/`/money/pricing` off (AC-900). |
| `SHOW_FOLLOWUPS` on, viewer not finance/admin, Door 2 | `RequireAccessRole` redirects to `/` before the page mounts (AC-901). |
| `SHOW_FOLLOWUPS` on, viewer not finance/admin, Door 1 | No route gate; RLS returns only rows the viewer's lane grants (existing `follow_ups_select` policy) — an ordinary lane-holder sees their lane, an unrelated member sees an empty queue (existing `EmptyState` — no new behavior). |
| `listFollowUps` fails (network/RLS/etc.) from either door | The existing `ErrorState` + retry renders in both doors (from the shared hook/table — no per-door error handling to keep in sync). |
| Follow-up not found via a stale `/work/follow-ups/:id` deep link | Existing behavior (`detailRow` resolves to `null`; the aside simply does not render) is unchanged — this step does not add a not-found panel, matching current scope. |
| Money page's own sales-reporting load fails/loads/is-empty | The FR-907 queue-entry link still renders (FR-908) — it is independent of that state machine. |

## 10. Deviations, explicit limits, and RATIFY-BEFORE-MERGE flags

1. **`SHOW_FOLLOWUPS` stays `false` in this step.** `docs/decisions.md` OD-IA-1 records "backup/restore
   drill gates the AR bridge," and no document surveyed for this spec records that drill as complete.
   **RATIFY-BEFORE-MERGE:** confirm the backup/restore go-live gate status before flipping
   `SHOW_FOLLOWUPS` to `true`. Conservative default taken: wire both doors fully so flipping the flag is
   a one-line change with zero further code, but leave it off. If the gate has in fact already been
   cleared, flipping the flag is a trivial one-line follow-up, not a re-open of this spec.
2. **Door 2's discoverability treatment is a plain text link, not a mockup-ratified surface.**
   `SALVAGE-INVENTORY.md` does not cover a Money/Follow-ups convergence screen. **RATIFY-BEFORE-MERGE:**
   the conservative default (a `Link` styled with the existing `.btn.btn-outline` classes, labelled
   "Follow-up queue," in `DashboardChrome`) is a minimal, reuse-only placement pending the mandatory
   4-lens design review for this step; a live overdue-count badge is explicitly deferred (§2/NFR-903), not
   rejected.
3. **Home's `data-money-ar-slot` is not filled by this step.** Its own comment ("a self-contained drop
   point for the parallel AR/Follow-up slice… NO invented AR figure this slice") pre-dates this spec and
   is not resolved here. **RATIFY-BEFORE-MERGE:** confirm this slot is intentionally a separate,
   not-yet-scoped follow-up and not silently expected to close with Step 9.
4. **Money's breadcrumb stays bare "Money" for `/money/follow-ups`**, matching the existing (also
   leaf-less) precedent for `/money/budget` and `/money/pricing` — not fixed here to avoid inconsistent,
   unscoped breadcrumb changes across three sibling routes in one step. Non-blocking; flagged for
   awareness only, not a RATIFY item.
5. **This spec re-wires and extracts, never rebuilds.** No new Follow-up table, detail renderer, or
   mutation path is permitted; the extraction in §5 must be provably behavior-preserving (AC-906).

## 11. Implementation TODO checklist

- [ ] Extract `useFollowUpQueue` (data/behavior hook) from `FollowUpsPage`.
- [ ] Extract `FollowUpQueueTable` (presentational renderer) from `FollowUpsPage`.
- [ ] Rewrite `FollowUpsPage` to compose both; verify `follow-ups-page.test.tsx` passes unmodified.
- [ ] Add `FollowUpQueueEmbed` (Door 1's mount point) + its test.
- [ ] Wire the `tasks-workspace.tsx` reserved-`followups` branch to `SHOW_FOLLOWUPS`.
- [ ] Add the `money/follow-ups` route to `router.tsx`.
- [ ] Add the Door 2 discoverable link to `dashboard-page.tsx`'s `DashboardChrome`.
- [ ] Confirm zero new i18n keys were needed (§3) — no `messages.ts` edit.
- [ ] Confirm zero `destinations.tsx` / `job-sentences.ts` / `breadcrumb.tsx` edits were needed (§3).
- [ ] Confirm zero Inbox edits (FR-909; AC-909 regression proof).
- [ ] Score Experience Contract Rules 2, 4, 6, and 11 in the review ledger.
- [ ] Record the three RATIFY-BEFORE-MERGE items (§10) in `docs/reviews/<branch>.md` § "Ratify before merge."

## 12. Verification

- Read and verified the current shipped behavior at every path cited in §3 (2026-07-17).
- Confirmed `mos.follow_ups` and its RLS/RPC are fully shipped and pgTAP-proven — no schema task in
  this spec.
- Confirmed every i18n string this step needs already exists in `messages.ts`.
- Confirmed `destinations.tsx` / `job-sentences.ts` / `breadcrumb.tsx` resolve `/money/follow-ups` and
  `/work/follow-ups*` correctly today via existing generic (prefix-based) logic — no shell edits required.
- Confirmed this is a rewire/extraction spec, not a rebuild spec, and that the extraction is provably
  behavior-preserving via the existing, unmodified `follow-ups-page.test.tsx` and the existing,
  unmodified `tasks-workspace.test.tsx` `AC-311` case.

SPEC-DONE
