import { describe, it, expect } from 'vitest'
import { filterEffectiveMemberships, resolveTeamContext } from './eligible-teams'
import type { EligibleTeam, TeamMembershipRow } from './types'

// AC-809 / AC-V3-007: "Given a multi-Team viewer entering Café, when more than one valid Team
// exists, then the system requires an explicit context choice and never silently chooses the first
// Team." These are the pure-logic proofs for that goal (the honest zero/one/multiple resolution)
// and for the effective-membership-date correction the plan requires (effective_from <= today AND
// (effective_to is null OR effective_to >= today) — not the current effective_to-is-null-only query).

const membership = (over: Partial<TeamMembershipRow> & { team_id: string }): TeamMembershipRow => ({
  effective_from: '2020-01-01',
  effective_to: null,
  is_primary: false,
  ...over,
})

const team = (over: Partial<EligibleTeam> & { id: string }): EligibleTeam => ({
  name: `Team ${over.id}`,
  businessUnitId: 'bu-1',
  siteId: null,
  orgId: 'org-1',
  ...over,
})

describe('filterEffectiveMemberships (effective-dated correction)', () => {
  const today = '2026-07-20'

  it('keeps a membership whose window is open today (effective_to null)', () => {
    const rows = [membership({ team_id: 't1', effective_from: '2026-01-01', effective_to: null })]
    expect(filterEffectiveMemberships(rows, today).map((r) => r.team_id)).toEqual(['t1'])
  })

  it('keeps a membership whose effective_to is today or later (boundary inclusive)', () => {
    const rows = [membership({ team_id: 't1', effective_to: '2026-07-20' })]
    expect(filterEffectiveMemberships(rows, today)).toHaveLength(1)
  })

  it('drops a membership that has not started yet (effective_from in the future)', () => {
    const rows = [membership({ team_id: 't1', effective_from: '2026-08-01' })]
    expect(filterEffectiveMemberships(rows, today)).toHaveLength(0)
  })

  it('drops a membership that has already ended (effective_to before today)', () => {
    const rows = [membership({ team_id: 't1', effective_to: '2026-07-19' })]
    expect(filterEffectiveMemberships(rows, today)).toHaveLength(0)
  })
})

describe('resolveTeamContext (honest zero/one/multiple)', () => {
  it('resolves zero eligible Teams to an honest none (never infers from BU)', () => {
    expect(resolveTeamContext([])).toEqual({ kind: 'none' })
  })

  it('resolves exactly one eligible Team deterministically to single', () => {
    const t = team({ id: 't1' })
    expect(resolveTeamContext([t])).toEqual({ kind: 'single', team: t })
  })

  it('requires an explicit choice for multiple eligible Teams — never auto-selects the first', () => {
    const teams = [team({ id: 't1', isPrimary: true }), team({ id: 't2' })]
    const result = resolveTeamContext(teams)
    expect(result.kind).toBe('choice')
    if (result.kind === 'choice') {
      expect(result.teams.map((x) => x.id).sort()).toEqual(['t1', 't2'])
    }
  })

  it('does not let is_primary collapse a multi-Team viewer to a single silent selection', () => {
    // The exact AC-V3-007 bug: a "primary" flag must not stand in for an explicit choice.
    const teams = [team({ id: 't-primary', isPrimary: true }), team({ id: 't-other' })]
    expect(resolveTeamContext(teams).kind).toBe('choice')
  })

  it('de-duplicates the same Team appearing twice down to a single deterministic resolution', () => {
    const t = team({ id: 't1' })
    expect(resolveTeamContext([t, { ...t }])).toEqual({ kind: 'single', team: t })
  })

  it('excludes archived Teams from eligibility before resolving', () => {
    const active = team({ id: 't1' })
    const archived = team({ id: 't2', archived: true })
    expect(resolveTeamContext([active, archived])).toEqual({ kind: 'single', team: active })
  })
})
