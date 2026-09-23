import { describe, it, expect } from 'vitest'
import { deriveTaskTeamView, toViewerTeam } from './task-team-view'
import type { EligibleTeam } from './types'

// AC-804/805 regression slice (FR-V3-003 / NFR-V3-008), read side: a Task's BU and Site are
// DERIVED from its executing Team at read time — never stored independently and never allowed to
// diverge. This is the integration seam that feeds Issue 5's createTaskRecordAdapter `team?` input
// (TaskTeamView = { id, label }); Issue 8 is the only issue permitted to populate it from a real
// task.team_id. A missing Team stays honest ("not assigned yet / data migration"), and a Team
// whose BU disagrees with the Task's compatibility column is flagged, not silently displayed.

const team = (over: Partial<EligibleTeam> & { id: string }): EligibleTeam => ({
  name: `Team ${over.id}`,
  businessUnitId: 'bu-1',
  siteId: null,
  orgId: 'org-1',
  ...over,
})

const task = { id: 'task-1', org_id: 'org-1', business_unit_id: 'bu-1' }

describe('deriveTaskTeamView', () => {
  it('returns an honest "unassigned" view when the Task has no Team (repair state)', () => {
    const view = deriveTaskTeamView(task, null)
    expect(view.status).toBe('unassigned')
  })

  it('derives BU and Site from a valid same-org Team whose BU matches the compat column', () => {
    const view = deriveTaskTeamView(task, team({ id: 't1', businessUnitId: 'bu-1', siteId: 'site-9' }))
    expect(view).toEqual({
      status: 'valid',
      teamId: 't1',
      teamName: 'Team t1',
      businessUnitId: 'bu-1',
      siteId: 'site-9',
    })
  })

  it('derives a null Site for a central/site-less Team without inventing one', () => {
    const view = deriveTaskTeamView(task, team({ id: 't1', siteId: null }))
    if (view.status === 'valid') expect(view.siteId).toBeNull()
  })

  it('flags a Team whose BU diverges from the Task compat column instead of silently displaying it', () => {
    const view = deriveTaskTeamView(task, team({ id: 't1', businessUnitId: 'bu-OTHER' }))
    expect(view.status).toBe('bu-mismatch')
  })

  it('flags a cross-org Team instead of trusting the join', () => {
    const view = deriveTaskTeamView(task, team({ id: 't1', orgId: 'org-2' }))
    expect(view.status).toBe('cross-org')
  })
})

describe('toViewerTeam (Issue 5 RecordViewer integration point)', () => {
  it('maps a valid derived view to the minimal { id, label } TaskTeamView the adapter accepts', () => {
    const view = deriveTaskTeamView(task, team({ id: 't1', name: 'Bandung Café' }))
    expect(toViewerTeam(view)).toEqual({ id: 't1', label: 'Bandung Café' })
  })

  it('maps any non-valid view to null so the viewer shows honest "Team not assigned yet"', () => {
    expect(toViewerTeam(deriveTaskTeamView(task, null))).toBeNull()
    expect(toViewerTeam(deriveTaskTeamView(task, team({ id: 't1', businessUnitId: 'bu-x' })))).toBeNull()
  })
})
