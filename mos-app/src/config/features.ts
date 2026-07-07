// Feature flags — temporarily hide sections that aren't ready for the first rollout
// (owner-directed 2026-06-17). Each flag gates EVERYTHING for its section: the rail nav
// entry, the route (redirects to My Week when off), and any My Week surfaces that reference
// it. Flip a flag to `true` to fully restore the section — no other change needed.
export const SHOW_WEEKLY_UPDATES = true
export const SHOW_DAILY_LOG = true

// ADR-0018 P1 — view-composition substrate (user views). Hide-first (ADR-0017 D6): the dev harness
// route redirects to / when off. Flip true to enable /dev/views for a rollout cohort.
export const SHOW_USER_VIEWS = true

// ADR-0018 P2 — the deputy assistant panel + runtime (FR-P2-CF-003). Hide-first: the panel, FAB,
// top-bar button, and AgentRuntimeProvider all short-circuit to null/no-op when this is false.
// Flip true (local/staging only) to enable the deputy for a rollout cohort.
export const SHOW_ASSISTANT = true

// ADR-0019 D9 / ADR-0044 — the Inbox destination (notifications). Hide-first: the /inbox route, the
// nav destination, and the bell badge all short-circuit when false. Flip true once notification
// producers (@mentions, automations) are wired for a rollout cohort.
export const SHOW_INBOX = true

// Issue E — Home stacked-union cockpit (docs/specs/home-stacked-union.spec.md). Hide-first: when
// false, the `/` route renders Home v1 (HomePage) unchanged; when true, it renders the stacked-union
// Home (StackedUnionHome). Both compositions coexist behind the flag — Home v1 stays the default
// until the owner flips this during rollout. A DEV-only preview route (`/__home-stacked`) renders the
// stacked home regardless of the flag, for e2e + visual verification.
export const SHOW_HOME_STACKED = false
// Follow-up settlement bridge v1 ships dark until the owner backup/restore go-live gate.
export const SHOW_FOLLOWUPS = false
