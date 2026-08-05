// Shared, DB-free types for the Team-context seam (V3 Issue 8 — Café canonical records +
// executing-Team re-home). These model the *logic* of the re-home and the honest zero/one/
// multiple Team-context resolution; they deliberately do NOT import Supabase so every rule is
// unit-testable in isolation. The persistence columns (business_unit_id, responsible_person_id,
// accountable_person_id) keep their legacy storage names here — PIC/Supervisor are presentation
// labels only, and BU/Site are *derived* from the executing Team (CONTEXT.md: a Task carries one
// executing Team; BU and optional Site derive from Team).

/** An org-scoped Team the app can execute Tasks against. BU/Site are the Team's own columns; a
 *  Task's BU/Site are read *through* this relation, never stored independently on the Task. */
export interface EligibleTeam {
  id: string
  name: string
  /** shared.teams.business_unit_id — the source of truth for a Task's derived BU. */
  businessUnitId: string
  /** shared.teams.site_id — null for central/site-less Teams. Derived Site, read-only on Tasks. */
  siteId: string | null
  /** shared.teams.org_id — used to fail closed on any cross-org relation. */
  orgId: string
  /** Whether the Team is archived; archived Teams are never eligible for new execution. */
  archived?: boolean
  /** shared.team_memberships.is_primary — a *display ordering* hint only. NEVER a silent selector
   *  when more than one Team is eligible (that is the exact AC-V3-007 ambiguity bug). */
  isPrimary?: boolean
}

/** The minimum identity needed to resolve an execution context. Consumers that only have a Team
 * id and display name (such as Café's due-run feed) must still surface a multiple-Team choice;
 * BU, Site, and org details are not a valid selector. */
export interface TeamContextCandidate {
  id: string
  name: string
  archived?: boolean
}

/** A raw effective-dated membership row (shared.team_memberships). Dates are ISO `YYYY-MM-DD`
 *  strings, which sort lexicographically, so plain string comparison is a valid date comparison. */
export interface TeamMembershipRow {
  team_id: string
  effective_from: string
  effective_to: string | null
  is_primary: boolean
}

/** The honest outcome of resolving a viewer's (or process's) eligible Teams. This is the seam that
 *  replaces Café's `due[0]` / `myTeams[0]` first-row heuristic and Work's implicit BU ownership.
 *  `choice` means the caller MUST present an explicit picker — it may never auto-select. */
export type TeamContextResolution<T extends TeamContextCandidate = EligibleTeam> =
  | { kind: 'none' }
  | { kind: 'single'; team: T }
  | { kind: 'choice'; teams: T[] }
