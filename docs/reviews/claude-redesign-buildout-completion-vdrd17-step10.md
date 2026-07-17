# Review ledger — Step 10 "Events stub" (branch `claude/redesign-buildout-completion-vdrd17`)

Diff scope: the Events-stub slice only — `mos-app/src/pages/events-page.tsx` (new),
`mos-app/src/pages/events-page.test.tsx` (new), `mos-app/src/i18n/messages.ts` (2 keys × en/id),
`mos-app/src/router.tsx` (1 route element swap + comment), `mos-app/src/router.test.tsx`
(1 test split into 2), `mos-app/src/shell/rail-nav.test.tsx` (1 new characterization `describe`).
Commits `feat(events): T1` through `feat(events): T5` on this branch. This branch carries other
concurrent steps (4/5/6/7/8 etc. — see other commits interleaved in `git log`); **this ledger
covers Step 10 only**. Full command: `git log --oneline --grep='(events):'`.

**Spec:** `docs/specs/events-stub.spec.md` (FR-1001..1005, AC-1001..1004).
**Plan:** `docs/plans/2026-07-17-events-stub.md` (T1 RED / T2 GREEN / T3 RED / T4 GREEN / T5
characterization).

## Scope card (Step 10)

**In scope (built, this step):**
- `EventsPage` (`mos-app/src/pages/events-page.tsx`) — `PageFrame` (data variant) + `PageHead`
  (content variant, `EventsIcon`, no count) + the sanctioned `EmptyState` (`state-kit.tsx`) at the
  `quiet` archetype, zero action buttons.
- Two i18n keys (`events.empty.title`, `events.empty.copy`) in both `en` and `id` catalogs.
- `router.tsx`: `/events` route element swapped from `<SliceStubPage jobKey="job.events"
  nameKey="dest.events" />` to `<EventsPage />`.
- Regression/characterization coverage: `router.test.tsx` AC-1001 case; `rail-nav.test.tsx` AC-1004
  case (exactly-one `aria-current="page"` at `/events`, targeting the Events link) — no production
  change required for the rail case (pre-existing path-generic logic).

**OUT OF SCOPE (per spec §2.2 — not built here):**
- Any `mos.*`/`ops.*` events schema, table, or RLS policy; any DAL module or live data fetch.
- Any calendar/list/collection view renderer.
- Any create-event action, composer, or ⌘K command (Rule 7 — no button with nothing to do yet).
- **`destinations.tsx` / `job-sentences.ts` / `breadcrumb.tsx` were NOT touched by this step** — this
  absence of change IS the Rule-10 proof (verified: `git diff <T1-base>..HEAD --stat -- <3 files>`
  is empty across all 5 task commits).

## Rules 1–12 checklist (unfilled — reviewers fill this in)

| Rule | Compliant? | Notes |
|---|---|---|
| 1 — one job per rail item | | |
| 2 — three-layer boundary (domain → UI family → destination) | | |
| 3 — rail/surface budget caps | | |
| 4 — canonical routes + URL state | | |
| 5 — exactly one `aria-current="page"` | | |
| 6 — one page anatomy per route (no second drawer host) | | |
| 7 — verb+object action grammar (no fake/inert CTA — zero buttons in the empty state) | | |
| 8 — capture-first disclosure (N/A — no composer/form in this step) | | |
| 9 — responsive disclosure order (mobile↔desktop parity) | | |
| 10 — extension test (Events gets a real page using only a new page component; no new rail root/anatomy/drawer host; `destinations.tsx`/`job-sentences.ts`/`breadcrumb.tsx` untouched) | | |
| 11 — component reuse (`PageFrame`/`PageHead`/`EmptyState` — same anatomy as `InboxPage`; no bespoke placeholder) | | |
| 12 — usable by a high-school graduate, no training | | |

## Verdicts

<!-- Fill one verdict line per REQUIRED review before running pre-merge-check.sh.
     Accepted: PASS SHIP FIX-THEN-SHIP   Blocking: REWORK FAIL STILL-FAILING
     Required always: spec, code-quality. Required (UI changed): design. Required (schema/RLS changed): security. -->

- spec: APPROVE — spec-reviewer (opus), 2026-07-17. AC-1001..1004 owned+green; Rule-10 proof verified (destinations/job-sentences/breadcrumb untouched per git history); i18n parity confirmed.
- code-quality: APPROVE — code-quality-reviewer (opus), 2026-07-17. Nothing material; InboxPage-anatomy fidelity confirmed.
- design: <!-- PASS|SHIP|FIX-THEN-SHIP|REWORK|FAIL --> — <reviewer, date, notes> (required — `.tsx` changed: `events-page.tsx`, `router.tsx`)
- security: N/A — no auth/RLS/schema path touched (NFR-1001: no new schema/table/RLS/DAL this step).

## Gates (fresh, this pass)

| Gate | Status |
|---|---|
| `npm run typecheck` | <!-- PASS / FAIL --> |
| `npm run lint -- --max-warnings=0` | <!-- PASS / FAIL --> |
| `npm test` (Vitest) + coverage ≥80% changed lines | <!-- PASS / FAIL --> |
| `bash scripts/pre-merge-check.sh` | <!-- expected FAIL until Verdicts above are filled --> |

No pgTAP required (no schema/RLS touched — NFR-1001). No Playwright required (placeholder screen,
not one of the ~6–8 curated e2e journeys — spec §5).

## Ratify before merge

1. **RATIFY-BEFORE-MERGE: exact placeholder copy.** No prior doc specified Events empty-state
   wording. Shipped (conservative, honest — no feature-date promise):
   - `events.empty.title` (en): "Nothing scheduled yet"
   - `events.empty.copy` (en): "Outlet events — cuppings, workshops, bookings — will show up here
     once this collection is connected."
   - `events.empty.title` (id): "Belum ada acara terjadwal"
   - `events.empty.copy` (id): "Acara outlet — cupping, workshop, booking — akan muncul di sini
     setelah koleksi ini terhubung."
   AC-1003's test asserts *a* title+copy pair renders via the sanctioned kit, not literalized as a
   design decision — a copy change is a one-line edit to both catalog entries, not a design change.

2. **RATIFY-BEFORE-MERGE: EmptyState archetype = `quiet` (not `next-step`).** `next-step` (with a
   `+` CTA) was rejected — there is no create-event flow to wire the button to yet (Rule 7 forbids
   an inert action). `awaiting` (retry-oriented) was rejected — nothing is pending/loading; Events
   genuinely has no data source yet. `quiet` (matches `InboxPage`'s zero-state: calm confirmation,
   no action) is the closest sanctioned fit. Reversible: a future step wanting a "+ Add event"
   placeholder that routes somewhere real is that step's call, not this one's.

## Deferred / tracked debt

None — this is deliberately the smallest step in the redesign buildout (spec §1); no debt beyond
the two RATIFY items above and the spec's own out-of-scope list (§2.2), all owned by later,
already-identified steps.
