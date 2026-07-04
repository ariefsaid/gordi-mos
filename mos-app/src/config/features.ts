// Feature flags — temporarily hide sections that aren't ready for the first rollout
// (owner-directed 2026-06-17). Each flag gates EVERYTHING for its section: the rail nav
// entry, the route (redirects to My Week when off), and any My Week surfaces that reference
// it. Flip a flag to `true` to fully restore the section — no other change needed.
export const SHOW_WEEKLY_UPDATES = false
export const SHOW_DAILY_LOG = false

// ADR-0018 P1 — view-composition substrate (user views). Hide-first (ADR-0017 D6): the dev harness
// route redirects to / when off. Flip true to enable /dev/views for a rollout cohort.
export const SHOW_USER_VIEWS = false

// ADR-0018 P2 — the deputy assistant panel + runtime (FR-P2-CF-003). Hide-first: the panel, FAB,
// top-bar button, and AgentRuntimeProvider all short-circuit to null/no-op when this is false.
// Flip true (local/staging only) to enable the deputy for a rollout cohort.
export const SHOW_ASSISTANT = false
