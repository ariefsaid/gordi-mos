# Spec — Events stub (redesign buildout Step 10)

**Status:** DRAFT for the Step-10 build (`docs/plans/2026-07-14-redesign-buildout.md` row 10: "`/events` page
with job sentence + placeholder; proves the Rule-10 extension path"). No owner grill gate on this step (row 10:
Drill = No, Owner gate = no). Domain law is CLOSED; this spec derives, never reopens it. The one genuinely
ambiguous point (exact placeholder copy) is resolved to a conservative, honest default and tagged
`RATIFY-BEFORE-MERGE:` inline (collected in §6).

**Authority chain:** `docs/experience-contract.md` Rule 1 (Events job sentence — "See what's happening around
our outlets and when.") · Rule 6 (one page anatomy: header → context row → content → drawer) · Rule 7 (verb+object
action grammar — no fake/inert action) · Rule 10 (the extension test — this step's whole reason to exist) · Rule 11
(component reuse — the house EmptyState system, never a bespoke placeholder) → `docs/decisions.md`
**OD-REDESIGN-57(iii)** (Events joins the rail as a destination root, RATIFIED, already shipped) →
`mos-app/src/shell/destinations.tsx` + `job-sentences.ts` (Events' rail entry + job sentence already live from
Step 2 — nothing there changes in this step).

**Read-first:** `mos-app/src/shell/destinations.tsx`, `mos-app/src/shell/job-sentences.ts`,
`mos-app/src/shell/context-row.tsx`, `mos-app/src/shell/breadcrumb.tsx`, `mos-app/src/router.tsx` (current
`/events` → `SliceStubPage`), `mos-app/src/pages/slice-stub-page.tsx` (the generic stub being replaced for this
one route), `mos-app/src/components/ui/state-kit.tsx` (the ONE sanctioned empty/error/skeleton kit — "quiet /
next-step / awaiting" archetypes), `mos-app/src/pages/inbox-page.tsx` (the pattern this step ports: `PageFrame` +
`PageHead` + `EmptyState`).

---

## 1. Overview & user value

Step 10 is deliberately the **smallest** step in the redesign buildout. Today `/events` renders the generic,
parameterized `SliceStubPage` (shared by five not-yet-built routes). This step gives Events its **own** page
component — still a placeholder (no schema, no DAL, no real calendar data) — built from the same reusable
anatomy every other destination uses: `PageFrame` → `PageHead` (job identity) → the house `EmptyState` (Rule 11).

The point of this step is not the feature — it is the **proof**. Events was promoted to a rail root by explicit
owner directive (OD-REDESIGN-57(iii)), amending Rule 3's cap outside the normal BU-grouped-Module earn-in path.
Rule 10 asks: can a *future* collection (a real calendar surface, a Standards-compliance calendar, etc.) be added
later using only **(i) a collection + (ii) a view renderer + (iii) feed posts/activity entries**, reusing the
existing UI families and the existing page anatomy — **without** a new rail root, new destination job, new page
anatomy, or new drawer host? This step demonstrates the *page-anatomy* half of that promise concretely: Events
gets a real page component today, and nothing in the rail (`destinations.tsx`), the job-sentence registry
(`job-sentences.ts`), the breadcrumb (`breadcrumb.tsx`), or the shell anatomy (`app-shell.tsx`/`context-row.tsx`)
needs to change to do it. Those all already resolved `/events` correctly when it was still `SliceStubPage`
(Step 2); swapping in a dedicated `EventsPage` is a pure content-region change.

## 2. Scope

### 2.1 IN SCOPE
- A new `EventsPage` component (`mos-app/src/pages/events-page.tsx`) rendered at the existing `/events` route.
- The page anatomy: `PageFrame` (content region) + `PageHead` (title identity, `content` variant, Events icon) +
  the sanctioned `EmptyState` (`state-kit.tsx`) at the **quiet** archetype — no action button (Rule 7: no
  fake/inert CTA; there is no create-event flow to wire yet).
- Two new i18n keys (`events.empty.title`, `events.empty.copy`) in both `en` and `id` catalogs.
- `router.tsx`: swap the `/events` route element from `<SliceStubPage jobKey="job.events" nameKey="dest.events" />`
  to `<EventsPage />`.
- Regression coverage that Rule 5 (exactly one `aria-current="page"`) and Rule 6's breadcrumb still hold for
  `/events` now that a real page, not the generic stub, is mounted there.

### 2.2 OUT OF SCOPE (later steps — do not build here)
- Any `mos.*` / `ops.*` events schema, table, or RLS policy.
- Any DAL module (`mos-app/src/lib/db/events.ts` or similar) or live data fetch.
- A calendar view, list view, or any collection/view renderer — Rule 10's "add a collection later" is the thing
  being *proven extensible*, not the thing being built now.
- Any create-event action, composer, or ⌘K command — there is nothing yet for such an action to do (Rule 7
  forbids a button that does nothing).
- Changes to `destinations.tsx`, `job-sentences.ts`, `breadcrumb.tsx`, `rail-nav.tsx`, or `app-shell.tsx` — all
  already resolve `/events` correctly (Step 2); this step's whole point is that none of them need to move.

### 2.3 CONFIRMATIONS — already aligned, MUST NOT change
- `DESTINATIONS` in `destinations.tsx` already carries the `events` entry (`primaryPath: '/events'`,
  `links: [{ path: '/events', ... }]`) — Step 2, shipped.
- `jobSentences.events` / `SEG_TO_JOB.events` in `job-sentences.ts` already resolve `/events` →
  `"See what's happening around our outlets and when."` — Step 2, shipped, tested
  (`job-sentences.test.ts` lines 15/27/55).
- `Breadcrumb()` in `breadcrumb.tsx` already renders the bare `destLabel` ("Events") for the `events` destination
  id (the `else` fallthrough at the bottom of the id-branch chain) — Step 2, shipped, tested
  (`breadcrumb.test.tsx`: `/events → "Events"`).

## 3. Requirements (EARS)

- **FR-1001** When an authenticated viewer navigates to `/events`, the system shall render `EventsPage` inside
  the shared `PageFrame`/`PageHead` anatomy with an H1 reading the localized "Events" label and shall set
  `document.title` to `"Events — Gordi MOS"`.
- **FR-1002** The system shall continue to resolve the Rule-1 job sentence for `/events` via the existing
  `jobKeyForPath`/`jobSentences` registry (unchanged by this step) and render it in the shell's `ContextRow`
  above the `EventsPage` content.
- **FR-1003** Where `/events` has no event collection wired yet, the system shall render the house `EmptyState`
  component (`state-kit.tsx`) at the `quiet` archetype with a title and copy, and shall render zero
  `role="button"` elements inside it (Rule 7 — no inert/fake action).
- **FR-1004** The system shall keep exactly one `aria-current="page"` element in the Primary rail nav when on
  `/events` (the Events rail link), and the breadcrumb shall read exactly `"Events"` — both via the existing,
  unmodified `destinations.tsx` / `rail-nav.tsx` / `breadcrumb.tsx` logic.
- **FR-1005 (Rule-10 proof)** The system shall implement the `/events` upgrade using only a new page component
  bound to the existing `events` route; it shall introduce no new rail root, no new destination job, no new page
  anatomy, and no new drawer host.
- **NFR-1001** The system shall not introduce any new database schema, table, RLS policy, or DAL module for
  Events in this step (master-plan row 10 boundary: DB/RLS = no, DAL = no).

## 4. Acceptance criteria (Given/When/Then) — all Vitest-owned

- **AC-1001 (FR-1001)** — Given an authenticated viewer, When they navigate to `/events`, Then the `main`
  landmark contains an `h1` reading "Events" (English) / "Acara" (Indonesian) and `document.title` equals
  `"Events — Gordi MOS"` / `"Acara — Gordi MOS"`.
  Owning test: `mos-app/src/pages/events-page.test.tsx` (new).

- **AC-1002 (FR-1002)** — Given the viewer is on `/events`, When the shell's `ContextRow` renders above
  `EventsPage`, Then it displays `"See what's happening around our outlets and when."` (the Rule-1 Events job
  sentence, resolved by the pre-existing, unmodified `job-sentences.ts` registry).
  Owning test: `mos-app/src/pages/events-page.test.tsx` (new composition case) — regression-anchored by the
  already-passing `mos-app/src/shell/job-sentences.test.ts`.

- **AC-1003 (FR-1003)** — Given `/events` has no data source, When `EventsPage` renders, Then it shows the
  sanctioned `EmptyState` at `data-empty-variant="quiet"` with a non-empty title and copy, and the rendered tree
  contains zero elements with `role="button"`.
  Owning test: `mos-app/src/pages/events-page.test.tsx` (new).

- **AC-1004 (FR-1004)** — Given the viewer is on `/events`, When the rail and breadcrumb render, Then the
  Events rail link is the sole element in the Primary nav carrying `aria-current="page"`, and the breadcrumb
  reads exactly `"Events"`.
  Owning tests: `mos-app/src/shell/rail-nav.test.tsx` (new `/events` aria-current case) +
  `mos-app/src/shell/breadcrumb.test.tsx` (pre-existing `/events → "Events"` case, unaffected by this step,
  reverified by the full suite run).

*(FR-1005 / NFR-1001 are structural scope guardrails, not independently testable behavior — they are verified by
inspection: the plan's task list touches only `events-page.tsx`, `events-page.test.tsx`, `router.tsx`,
`router.test.tsx`, `rail-nav.test.tsx`, and `messages.ts`; `destinations.tsx`, `job-sentences.ts`,
`breadcrumb.tsx`, and every `supabase/` path are untouched.)*

## 5. Test-ownership map

| AC | Layer | File |
|---|---|---|
| AC-1001 | Unit (Vitest/RTL) | `mos-app/src/pages/events-page.test.tsx` |
| AC-1002 | Unit (Vitest/RTL) | `mos-app/src/pages/events-page.test.tsx` (+ regression: `job-sentences.test.ts`) |
| AC-1003 | Unit (Vitest/RTL) | `mos-app/src/pages/events-page.test.tsx` |
| AC-1004 | Unit (Vitest/RTL) | `mos-app/src/shell/rail-nav.test.tsx` (+ regression: `breadcrumb.test.tsx`) |

No pgTAP (no schema/RLS touched — NFR-1001). No Playwright (this is a placeholder screen, not a curated
cross-stack journey — not one of the ~6–8 e2e slots).

## 6. RATIFY-BEFORE-MERGE — open judgment calls

1. **RATIFY-BEFORE-MERGE: exact placeholder copy.** No doc specifies Events empty-state wording. Proposed
   (conservative, honest — does not promise a feature date):
   - `events.empty.title` (en): "Nothing scheduled yet"
   - `events.empty.copy` (en): "Outlet events — cuppings, workshops, bookings — will show up here once this
     collection is connected."
   - `events.empty.title` (id): "Belum ada acara terjadwal"
   - `events.empty.copy` (id): "Acara outlet — cupping, workshop, booking — akan muncul di sini setelah koleksi
     ini terhubung."
   The Director/owner may substitute different copy at merge time — the AC-1003 test asserts *a* title+copy pair
   renders via the sanctioned kit, not this exact string (the plan's task 1 assertion literalizes today's proposed
   copy for now; a copy change is a one-line edit to both files, not a design change).

2. **RATIFY-BEFORE-MERGE: EmptyState archetype = `quiet` (not `next-step`).** `state-kit.tsx` offers three
   archetypes. `next-step` (with a `+` CTA) was rejected because there is no create-event flow to wire the button
   to yet (Rule 7 forbids an inert action); `awaiting` (retry-oriented) was rejected because there is nothing
   pending/loading — Events genuinely has no data source. `quiet` (matches `InboxPage`'s zero-state: calm
   confirmation, no action) is the closest sanctioned fit. Reversible: if a future step wants a "+ Add event"
   placeholder that routes somewhere real, that is a follow-up step's call, not this one's.
