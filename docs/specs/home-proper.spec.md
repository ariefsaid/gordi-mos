# Spec — Home proper (redesign buildout Step 5)

**Status:** DRAFT for the Step-5 build (`docs/plans/2026-07-14-redesign-buildout.md` row 5). No owner grill
gate on this step (row 5: Drill = No, Owner gate = no) — but **Q1 (Signal-on-Home) is only *provisionally*
approved** (OD-REDESIGN-59); the Home feed this step sits above is `RATIFY-BEFORE-MERGE` until the Step-4
walkthrough ratifies it (§7 R-1). Domain law is CLOSED (OD-REDESIGN-1..67); this spec *derives* and never
reopens it. Every genuinely-ambiguous point is resolved to the most conservative option and tagged
`RATIFY-BEFORE-MERGE:` inline (collected in §7).

**Authority chain:** `docs/experience-contract.md` Rules 1 (Home job), 6 (page anatomy), 8/9 (capture-first +
responsive parity), 11 (component reuse), 12 (cold-start) → `docs/decisions.md` **OD-REDESIGN-18** (Home region
order = user profile preference), **OD-REDESIGN-59** (ambient Signal feed below the non-removable attention
brief), **OD-REDESIGN-64** (attention-Home is Step 5) → `docs/jtbd.md` (Home = "Orient") → `SALVAGE-INVENTORY.md`
(e7 owns the visual system; convergence owns the frame; the Home *attention* surface has no dedicated mockup —
compose from the shared kit, do not invent). Reuse targets: `mos-app/src/lib/db/tasks.ts`,
`mos-app/src/lib/db/notifications.ts`, `mos-app/src/lib/raci-member.ts`, `mos-app/src/lib/home-kpis.ts`
(`openTaskCount` pattern), the Step-4 `SignalFeed`, `KPITile`/`PageFrame`/`PageHead`.

---

## 1. Overview

Step 5 turns Home from a KPI-tile page into the **attention brief** the rail promises: *"What needs my
attention right now?"* (Rule 1). Above the ambient Signal feed (Step 4 / OD-59), Home surfaces the viewer's
real, actionable exceptions from live queries — **overdue** owned tasks, **due-today** owned tasks, **failed
checks**, and **unread mentions** — each item a drill-target to its canonical record. It also implements
**OD-REDESIGN-18**: a per-user top-level region order (*attention-first* default | *personal-first*), where
choosing personal-first never removes the system brief — a **"Needs attention · N"** header summary + jump
target always survives.

**No new schema or RLS (master plan row 5 — DB/RLS = no).** Every source is an existing RLS-governed table:
`mos.tasks`, `mos.notifications`, `ops.kitchen_logs`. Nothing that asked for the viewer is fabricated; empty
lanes are absent, never a misleading zero (the same RLS-empty discipline Home already uses for the finance row).

### In scope
- An **AttentionBrief** surface (four lanes) composed from pure selectors over existing DAL reads.
- Pure attention selectors (`overdueTasks` · `dueTodayTasks` · `unreadMentions` · `attentionCount`) with an
  **injected WIB clock** (never scattered `Date.now()`).
- A **failed-checks** adapter (`loadFailedChecksForViewer`) sourced v1 from the viewer's rejected kitchen logs
  (RATIFY-3), behind a boundary Step-6's Check/Exception object slots into without re-architecture.
- **OD-18 region order**: a per-user preference (`resolveRegionOrder`/`setRegionOrder`), an inline Home order
  toggle (Personal-Profile home for it is deferred — RATIFY-2), the reordered layout, and the persistent
  **"Needs attention · N"** header summary + jump target when personal-first.
- Home re-composition into **two top-level regions** (Attention · Personal canvas) around the existing personal
  tiles (finance KPI row, tasks tile, MyWeekPanel) **and** the Step-4 `SignalFeed` — all reused, none rebuilt.

### Non-goals (explicitly deferred — do NOT fail these in review)
- **The Signal composer / feed / archive / record** → Step 4 (this step only *positions* the already-mounted
  `SignalFeed`; it does not touch feed internals).
- **A generic Check/Exception domain object** and **Process-occurrence roll-ups** → **Step 6** (OD-58; Rule 2
  places Check/Exception under Process occurrence). v1 failed-checks source is the café rejected-log adapter only.
- **Server-side / cross-device persistence** of the region-order preference → the Admin/Personal-Profile step
  (OD-52). v1 persists per-user in `localStorage` (RATIFY-1).
- **Deputy-arranged widgets inside the personal canvas** (OD-18 mentions them) → deputy stack.
- **New attention lanes** (approvals, AR exceptions, etc.) → later; the lane model is extensible (Rule 10) but
  v1 ships exactly the four named in row 5.
- **Occurrence-as-tasks café retrofit** → Step 7.

---

## 2. Reuse & data flow (no schema change — Rule 11 / NFR-502)

| Lane | Source query (existing, RLS-governed) | Selector (pure, new) | Item drills to |
|---|---|---|---|
| Overdue | `listTasks({})` (`db/tasks.ts`) | `overdueTasks(tasks, viewerId, today)` | `/work/tasks/<id>` (canonical task page — Step 3) |
| Due today | `listTasks({})` (same fetch, reused) | `dueTodayTasks(tasks, viewerId, today)` | `/work/tasks/<id>` |
| Mentions | `listNotifications()` (`db/notifications.ts`) | `unreadMentions(notifications)` | `notificationRoute(row)` (safe app-relative), else `/inbox` |
| Failed checks | `loadFailedChecksForViewer()` (`db/home-attention-data.ts`, new DAL read over `ops.kitchen_logs`) | n/a (adapter returns items) | `/cafe/log` (re-log the rejected check) |

- Overdue + due-today share **one** `listTasks` fetch (no duplicate read); ownership = `raciOwner` (reuse
  `home-kpis.ts`'s exact R/A predicate). "today"/"overdue" compare against a single WIB `today` string derived
  from `wibToday(now)` — one clock, injected, so selectors are deterministic under test (mirrors
  `home-kpis.ts`/`trailing-window.ts` "never `Date.now()` in the math").
- Mentions = the Inbox's own "what asked for me" set (unread `mos.notifications`), reused verbatim so Home and
  Inbox never drift; route safety reuses the existing `notificationRoute` allow-list (defense-in-depth kept).
- The DAL layer never sends `org_id` (RLS is the authority — the app's standing rule); a non-café viewer's
  failed-checks query simply returns zero rows (fail-closed), never an error.

**Scaling note (Performance lens):** all three reads are bounded (tasks org-set ~dozens; notifications capped
at `INBOX_PAGE_LIMIT`; failed-checks `limit 20`) — fine at ~30 people. The failed-checks read hits
`ops.kitchen_logs` on every Home load for every viewer; at Gordi scale that is negligible, but the adapter
boundary (§4) is the seam where Step-6 replaces the café read with the indexed Check/Exception query, so Home
never grows a café dependency it can't shed.

---

## 3. Region model (OD-REDESIGN-18)

Home has **two top-level regions**, in a user-chosen order:

1. **Attention** — the system brief (the four lanes). **Non-removable** (OD-18): it can be moved below, never
   deleted or hidden.
2. **Personal canvas** — the ambient region: the existing personal tiles (finance KPI row [role-guarded],
   tasks tile, MyWeekPanel) **and** the Step-4 `SignalFeed`.

`HomeRegionOrder = 'attention-first' | 'personal-first'`. **Default `attention-first` for every role and new
user** (OD-18) — which is exactly OD-59's "feed below the attention brief". Only the user changes it (an inline
Home order toggle in v1 — RATIFY-2). When **personal-first**, the attention region renders lower on the page,
**and** the Home header keeps a visible **"Needs attention · N"** summary with a jump target (anchor to the
attention region) so awareness is never lost (OD-18 hard requirement). The chosen order is identical in DOM at
desktop and ≤390px — only density/disclosure changes, never the order (Rule 9); the layout MUST NOT use CSS
`order` to reflow the two regions against their DOM order.

Persistence is per-user, keyed by person id, in `localStorage` (`resolveRegionOrder`/`setRegionOrder`) — v1
stand-in for the deferred Personal-Profile column (RATIFY-1).

---

## 4. Attention surface (page anatomy · Rule 6 / capture-first · Rule 8)

`AttentionBrief` is presentation-only: it takes **lanes** as props (HomePage does the fetching), so it is
trivially unit-tested and the fetch/wiring is tested at HomePage. Each lane carries a state:

```
type LaneState = 'loading' | 'ready' | 'error'
interface AttentionLane { kind: AttentionLaneKind; state: LaneState; items: AttentionItem[] }
```

- **ready + items > 0** → a titled list; every item is a `<Link>` to its `route` with a one-line title + meta.
- **ready + 0 items** → the lane is **omitted** (no "0 overdue" tile — never a misleading zero).
- **error** → a compact per-lane error affordance ("Couldn't load this list. Refresh to try again.") that does
  **not** block sibling lanes or the feed (fail-soft — mirrors the finance-row degradation Home already ships).
- **loading** → a skeleton (`aria-busy`).
- **all lanes ready + all empty** → a single **"You're all caught up"** all-clear state (the region persists).

The brief is a single `role="region"` with an accessible name and a stable `id="attention-brief"` (the OD-18
jump target). At ≤390px the first viewport shows attention items or the all-clear state — never configuration
(the order toggle is a compact secondary control, not the lead; Rule 8/12). Failed-checks items use plain
language a barista says ("Opening prep · 2026-07-16", not "Rejected kitchen_log") — Rule 12.

---

## 5. Requirements

### Functional (EARS)
- **FR-501** Home SHALL render an **attention brief** region — sourced from live queries, not a placeholder —
  positioned above the ambient Signal feed by default (OD-64/OD-59, master row 5).
- **FR-502** The attention brief SHALL surface the viewer's **overdue** owned tasks: tasks where the viewer is
  Responsible or Accountable, `status ≠ Done`, and `due_date` is strictly before today (WIB).
- **FR-503** The attention brief SHALL surface the viewer's **due-today** owned tasks: viewer R/A, `status ≠
  Done`, `due_date` equal to today (WIB); a due-today task SHALL NOT also appear as overdue.
- **FR-504** The attention brief SHALL surface the viewer's **unread mentions** — unread `mos.notifications`
  (the Inbox "what asked for me" set) — each linking to its originating record via the safe notification route
  (`notificationRoute`), falling back to `/inbox` when no safe route is present.
- **FR-505** The attention brief SHALL surface **failed checks** for the viewer via a pluggable adapter
  (`loadFailedChecksForViewer`); v1 SHALL source them from the viewer's rejected `ops.kitchen_logs` (RATIFY-3),
  and the adapter boundary SHALL let Step-6's Check/Exception object replace/extend the source with no
  re-architecture (Rule 10).
- **FR-506** Every attention item SHALL be a drill-target link to its canonical record/surface; a lane with
  zero items SHALL be absent (never a "0" tile); when all lanes are empty the brief SHALL render an explicit
  **all-caught-up** state and SHALL NOT remove the region.
- **FR-507** WHERE a lane's query errors, the brief SHALL degrade **only that lane** to an error affordance and
  SHALL still render the other lanes, the all-clear logic, and the Signal feed (fail-soft).
- **FR-508** Home SHALL support a per-user top-level **region order** with values *attention-first* (default)
  and *personal-first*, persisted per user; only the user SHALL be able to change it (OD-18).
- **FR-509** WHEN region order is *personal-first*, Home SHALL render the personal canvas (incl. the Signal
  feed) before the attention region **and** SHALL keep a visible **"Needs attention · N"** summary with a jump
  target in the Home header, so the system brief is never lost (OD-18).
- **FR-510** The region-order preference SHALL default to *attention-first* for every role and new user and
  SHALL persist across reloads for the same user (OD-18).
- **FR-511** The layout SHALL preserve the chosen region order at ≤390px and desktop — adapting density only,
  never re-ordering the two regions, and never using CSS `order` to reflow them against DOM order (Rule 9).
- **FR-512** Overdue/due-today computation SHALL derive "today" from a single injected clock (`wibToday`) and
  SHALL NOT call `Date.now()` inside the selectors (testability + WIB correctness).

### Non-functional
- **NFR-501** Attention selectors and the region-order resolver SHALL be **pure** (no I/O; injected clock;
  `localStorage` access guarded against private-mode/quota throws) and unit-tested.
- **NFR-502** **No new schema/RLS.** All reads reuse existing RLS-governed tables; the DAL never sends `org_id`
  or `person_id` as trust input; a viewer with no rows reads zero (fail-closed), never an error.
- **NFR-503** Coverage ≥80% changed lines; `npm run typecheck` zero; `npm run lint -- --max-warnings=0` zero;
  the four-lens design review + cross-family code review + `pre-merge-check.sh` green before merge.
- **NFR-504** **Component reuse (Rule 11):** the feed is the Step-4 `SignalFeed` (positioned, not rebuilt); the
  personal tiles are the existing `KPITile`/tasks tile/`MyWeekPanel`; `PageFrame`/`PageHead` host the page; the
  ownership predicate is `raciOwner`; route safety is `notificationRoute`. No surface is re-implemented.
- **NFR-505** At ≤390px the attention brief's first viewport SHALL show attention items or the all-clear state,
  never configuration (Rule 8/12).

---

## 6. Acceptance layer (per-AC ownership)

No schema changes ⇒ **no pgTAP**. Every AC is owned by **one** unit test (Vitest/RTL, mocked DAL) at the lowest
sufficient layer. **No new e2e:** the real cross-stack "find-overdue-work" journey is the already-curated **F3**
(owned by Step 3) — Step 5 surfaces the same RLS-governed overdue read on Home, so F3 covers the cross-stack
path and must not regress; a duplicate Home e2e would not test anything F3 doesn't. (If the Step-5 design review
finds Home's attention read is not exercised end-to-end by F3, add a single assertion to F3, do not spawn a new
journey — RATIFY-4.)

## 7. RATIFY-BEFORE-MERGE

1. **Region-order persistence store.** OD-18 says the order is a *user profile preference*, but the
   Personal-Profile/Admin schema is deferred (OD-52) and this step allows **no DB change**. *Options:* (A) persist
   per-user in `localStorage` now, swap to a profile column when Admin lands; (B) add a `mos.user_preferences`
   table now (violates the no-schema scope); (C) overload `mos.user_views` (semantic mismatch). **Pick: A** —
   honours "persists per user" within the no-schema constraint; per-device not cross-device until the profile
   column lands (a clean one-line swap behind `resolveRegionOrder`/`setRegionOrder`).
2. **Where the order toggle lives.** OD-18 homes it in Personal Profile ("only the user may change this");
   Profile isn't built. *Options:* (A) inline Home order toggle now; (B) wait for Profile (ships no toggle this
   step — order is stuck at default, under-delivering OD-18). **Pick: A** — an inline, user-only toggle on Home;
   re-home it to Profile when that screen exists.
3. **Failed-checks v1 source.** No generic Check/Exception object exists until Step 6 (Rule 2 places it under
   Process occurrence). *Options:* (A) source from the viewer's rejected `ops.kitchen_logs` now (real existing
   query; café-scoped; a genuine "your check failed, redo it" for the least-technical persona); (B) ship the lane
   inert and defer all failed-checks data to Step 6 (under-delivers the row-5 named scope). **Pick: A**, behind
   the `loadFailedChecksForViewer` adapter so Step-6 broadens/replaces the source. Sub-question left open for the
   walkthrough: whether the lane should scope to logs the viewer *submitted* vs *all rejected logs they can read*
   (v1 = RLS-readable set; a reviewer thus sees logs they rejected). **Pick: RLS-readable set** (simplest,
   fail-closed).
4. **Home attention e2e.** *Options:* (A) rely on F3 (find-overdue-work, Step 3) for the cross-stack overdue read
   + unit-cover the Home composition; (B) add a new curated Home journey. **Pick: A** — lowest sufficient layer;
   add at most one assertion to F3 if the review shows a gap, never a new journey.
5. **Q1 dependency (inherited).** The ambient Signal feed this brief sits above is only provisionally approved
   (OD-REDESIGN-59); if the Step-4 walkthrough answers Q1 = **no**, the *personal-canvas* region simply loses the
   `SignalFeed` child (it keeps the personal tiles) and the region-order + attention brief stand unchanged. Flag
   at merge; do not block Step 5 on it.

## 8. Acceptance criteria (Given/When/Then — each owned by ONE unit test)

**Pure attention selectors — `mos-app/src/lib/home-attention.test.ts`:**
- **AC-501** (unit): Given tasks with mixed due dates/statuses where the viewer is R/A on some, when
  `overdueTasks(tasks, viewerId, today)` runs, then it returns exactly the owned, `status ≠ Done` tasks with
  `due_date < today` (WIB), each mapped to `/work/tasks/<id>`; non-owned, Done, null-due, and future-due tasks
  are excluded (FR-502/512).
- **AC-502** (unit): Given the same tasks, when `dueTodayTasks(tasks, viewerId, today)` runs, then it returns
  exactly the owned, non-Done tasks with `due_date === today`, and an overdue task is not included (FR-503).
- **AC-503** (unit): Given notifications with mixed read/unread and with/without a safe route, when
  `unreadMentions(notifications)` runs, then it returns only the unread rows, each with its safe
  `notificationRoute` (or `/inbox` fallback) (FR-504).
- **AC-504** (unit): Given four lanes of items, when `attentionCount(lanes)` runs, then it returns the summed
  item count across lanes (FR-509 header summary source).

**Region-order resolver — `mos-app/src/lib/home-region-order.test.ts`:**
- **AC-505** (unit): Given no stored preference for a person, when `resolveRegionOrder(personId)` runs, then it
  returns `'attention-first'` (FR-508/510).
- **AC-506** (unit): Given `setRegionOrder(personId, 'personal-first')`, when `resolveRegionOrder(personId)`
  runs, then it returns `'personal-first'`; and `resolveRegionOrder(otherPersonId)` still returns the default
  (per-user keying; FR-508/510).

**Failed-checks adapter — `mos-app/src/lib/db/home-attention-data.test.ts`:**
- **AC-507** (unit): Given a mocked `ops.kitchen_logs` returning rejected rows, when
  `loadFailedChecksForViewer()` runs, then it selects `status = 'Rejected'`, never sends `org_id`, maps rows to
  `AttentionItem`s routed to `/cafe/log`, and returns `[]` (no throw) when there are no rows (FR-505/NFR-502).

**AttentionBrief component — `mos-app/src/components/home/attention-brief.test.tsx`:**
- **AC-508** (unit): Given lanes with overdue + due-today + mention + failed-check items (state `ready`), when
  `AttentionBrief` renders, then each lane shows its items and every item is a link to its canonical `route`
  (FR-501/506).
- **AC-509** (unit): Given all lanes `ready` with zero items, when it renders, then the **all-caught-up** state
  shows and no lane renders a "0" tile (FR-506, no misleading zeros).
- **AC-510** (unit): Given the mentions lane in `error` state while the overdue lane is `ready` with items, when
  it renders, then the mentions lane shows the error affordance and the overdue lane still renders its items
  (FR-507 fail-soft).
- **AC-511** (unit): Given a ≤390px container, when `AttentionBrief` first paints (items present), then the
  first content is attention items, not the order toggle or any configuration control (FR-505/NFR-505/Rule 8).

**HomePage region order — `mos-app/src/pages/home-page.test.tsx` (extend):**
- **AC-512** (unit): Given a viewer with no stored order, when Home renders, then the attention brief
  (`#attention-brief`) appears **before** the personal-canvas region in the DOM (FR-501/508 default).
- **AC-513** (unit): Given the viewer's stored order is `personal-first`, when Home renders, then the
  personal-canvas region precedes the attention brief **and** a header **"Needs attention · N"** summary with a
  jump link to `#attention-brief` is present (FR-509).
- **AC-514** (unit): Given the viewer activates the Home order toggle to `personal-first`, when the toggle is
  used, then the regions reorder and `resolveRegionOrder(personId)` subsequently returns `'personal-first'`
  (persisted; FR-508/510).
- **AC-515** (unit): Given `personal-first` order, when Home renders at a ≤390px container and at desktop, then
  the two regions are in the **same DOM order** in both and the region container carries no CSS `order` that
  reflows them (FR-511/Rule 9).

## 9. Open follow-ups (tracked, not Step 5)
- Server-side (cross-device) region-order persistence + Personal-Profile home for the toggle → Admin/Profile
  step (OD-52; RATIFY-1/2).
- Generic Check/Exception object as the failed-checks source; Process-occurrence attention roll-ups → Step 6
  (OD-58; RATIFY-3).
- Additional attention lanes (approvals, AR/money exceptions, deputy nudges) → later (the lane model is
  extensible per Rule 10).
- Deputy-arranged widgets inside the personal canvas (OD-18) → deputy stack.
</content>
</invoke>
