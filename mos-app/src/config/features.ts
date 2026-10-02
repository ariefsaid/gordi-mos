import { APP_RELEASE_PROFILE } from './app-build-settings'
import { isProfileFeatureAvailable } from './build-settings'

// Feature flags — temporarily hide sections that aren't ready for the first rollout
// (owner-directed 2026-06-17). Each flag gates EVERYTHING for its section: the rail nav
// entry, the route (redirects to My Week when off), and any My Week surfaces that reference
// it. Flip a flag to `true` to fully restore the section — no other change needed.
// ADR-0018 P1 — view-composition substrate (user views). Hide-first (ADR-0017 D6): the dev harness
// route redirects to / when off. Flip true to enable /dev/views for a rollout cohort.
export const SHOW_USER_VIEWS = true

// The profile switch changes visibility only. Task/Process authorization and the server's access
// rules are intentionally unchanged; Cafe keeps the capabilities its workflows depend on.
export const SHOW_WORK_COLLECTIONS = isProfileFeatureAvailable('workCollections', APP_RELEASE_PROFILE)

// ADR-0018 P2 — the deputy assistant panel + runtime (FR-P2-CF-003). Hide-first: the panel, FAB,
// top-bar button, and AgentRuntimeProvider all short-circuit to null/no-op when this is false.
// Cafe builds omit Deputy while the full build keeps its existing default.
export const SHOW_ASSISTANT = isProfileFeatureAvailable('deputy', APP_RELEASE_PROFILE)

// ADR-0019 D9 / ADR-0044 — the Inbox destination (notifications). RETIRED: Inbox is
// unconditionally live. #188 made the rail entry, the bottom tab and the header bell
// unconditional; #189 did the same for the /inbox route, which was the flag's last reader.

export const SHOW_FOLLOWUPS = false
// ADR-0022 (Issue D) — the Plan destination's budget/COGS capture + pricing pre-flight surfaces
// (/plan/budget, /plan/pricing) and their Plan-destination nav links. Hide-first (default false):
// the routes redirect to / and the nav links are absent when false. Flip true for a rollout cohort;
// the unit/pgTAP layers prove correctness regardless (the e2e is authored runnable when true).
export const SHOW_PLAN_BUDGET =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SHOW_PLAN_BUDGET === 'true'
