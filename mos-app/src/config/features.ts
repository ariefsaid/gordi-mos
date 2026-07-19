// Feature flags — temporarily hide sections that aren't ready for the first rollout
// (owner-directed 2026-06-17). Each flag gates EVERYTHING for its section: the rail nav
// entry, the route (redirects to My Week when off), and any My Week surfaces that reference
// it. Flip a flag to `true` to fully restore the section — no other change needed.
export const SHOW_WEEKLY_UPDATES = false
export const SHOW_DAILY_LOG = true

// ADR-0018 P1 — view-composition substrate (user views). Hide-first (ADR-0017 D6): the dev harness
// route redirects to / when off. Flip true to enable /dev/views for a rollout cohort.
export const SHOW_USER_VIEWS = true

// ADR-0018 P2 — the deputy assistant panel + runtime (FR-P2-CF-003). Hide-first: the panel, FAB,
// top-bar button, and AgentRuntimeProvider all short-circuit to null/no-op when this is false.
// Flip true (local/staging only) to enable the deputy for a rollout cohort.
export const SHOW_ASSISTANT = true

// ADR-0019 D9 / ADR-0044 — the Inbox destination (notifications). Retired in Redesign Step 2
// (D-PLN-1/D-1): Inbox is always live now; the route, nav destination, and bell are unconditional.
// (The SHOW_INBOX flag was removed — no conditional remains.)

// Issue E — Home stacked-union cockpit (docs/specs/home-stacked-union.spec.md). Hide-first: when
// false, the `/` route renders Home v1 (HomePage) unchanged; when true, it renders the stacked-union
// Home (StackedUnionHome). Both compositions coexist behind the flag — Home v1 stays the default
// until the owner flips this during rollout. A DEV-only preview route (`/__home-stacked`) renders the
// stacked home regardless of the flag, for e2e + visual verification.
export const SHOW_HOME_STACKED = false
// Follow-up settlement bridge v1 ships dark until the owner backup/restore go-live gate.
export const SHOW_FOLLOWUPS = false
// ADR-0022 (Issue D) — the Plan destination's budget/COGS capture + pricing pre-flight surfaces
// (/plan/budget, /plan/pricing) and their Plan-destination nav links. Hide-first (default false):
// the routes redirect to / and the nav links are absent when false. Flip true for a rollout cohort;
// the unit/pgTAP layers prove correctness regardless (the e2e is authored runnable when true).
export const SHOW_PLAN_BUDGET =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SHOW_PLAN_BUDGET === 'true'
