import type { EligibleTeam, TeamContextResolution, TeamMembershipRow } from './types'

// The honest Team-context resolver (V3 Issue 8, AC-809 / master AC-V3-007). It replaces two
// first-row heuristics that this issue explicitly owns as bugs:
//   - Café's cafe-opening-page.tsx `due[0]` then `myTeams[0]`, and
//   - Work's implicit "the Task's BU is its owner" assumption.
// Both silently pick a single Team when several are valid. Here, more-than-one is a `choice` the
// caller MUST surface; the resolver never auto-selects, never uses is_primary as a tiebreak, and
// never infers a Team from a BU.

/**
 * Keep only memberships whose effective-dated window is open on `today`.
 *
 * This is the correction the plan calls out: the current `listAuthorTeams` query filters on
 * `effective_to IS NULL` only, which both (a) admits not-yet-started memberships and (b) is not the
 * date rule the DB RLS uses. The real rule (mirrors mos.can_post_signal_for_team and the process
 * helpers) is `effective_from <= today AND (effective_to IS NULL OR effective_to >= today)`.
 *
 * @param today ISO `YYYY-MM-DD`. ISO dates sort lexicographically, so string compare is a date compare.
 */
export function filterEffectiveMemberships(
  rows: readonly TeamMembershipRow[],
  today: string,
): TeamMembershipRow[] {
  return rows.filter(
    (r) => r.effective_from <= today && (r.effective_to === null || r.effective_to >= today),
  )
}

/**
 * Resolve a set of candidate Teams to an honest zero/one/multiple context.
 *
 * - Archived Teams are dropped before counting (never eligible for new execution).
 * - Duplicate Team ids collapse to one (a viewer can hold two membership rows for one Team).
 * - Zero  -> `{ kind: 'none' }`   (caller shows an honest no-eligible-Team state; never a BU guess).
 * - One   -> `{ kind: 'single' }` (deterministic; caller may proceed).
 * - >One  -> `{ kind: 'choice' }` (caller MUST require an explicit pick; order is *display only*).
 */
export function resolveTeamContext(teams: readonly EligibleTeam[]): TeamContextResolution {
  const byId = new Map<string, EligibleTeam>()
  for (const t of teams) {
    if (t.archived) continue
    if (!byId.has(t.id)) byId.set(t.id, t)
  }
  const eligible = [...byId.values()]
  if (eligible.length === 0) return { kind: 'none' }
  if (eligible.length === 1) return { kind: 'single', team: eligible[0] }
  return { kind: 'choice', teams: eligible }
}
