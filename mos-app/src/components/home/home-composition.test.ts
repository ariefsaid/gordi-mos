// AC-080 — the composition selector (#759, OD-WAY-93 (3)).
//
// Home is composed per persona from the ONE region model. A member (no reports, no manage
// capability) gets the capture-first plan: `[cafe-door?, needs-you, signals-no-search]`; a lead+
// gets the cockpit plan: `[tabs(needs-you, my-work, failed-checks?), objectives-door, signals]`.
// The cafe-door in the member plan is present iff the viewer is Café-affiliated; the
// failed-checks tab in the lead plan is present iff the /cafe/log route admits the viewer
// (`#757 admits it`).
//
// This is a small pure module deliberately — no React, no i18n, no DAL — so the rule is unit-
// testable and the page can carry every persona through it without a second decision drift.

import { describe, it, expect } from 'vitest'
import { composeHome } from './home-composition'

const BASE = {
  isManager: false,
  canManageObjectives: false,
  canManageWorkLines: false,
  canCaptureCafe: false,
  seesCafeChecks: false,
} as const

describe('AC-080: composeHome picks the member plan for a viewer with no reports and no manage capability', () => {
  it('a plain member composes [needs-you, signals-no-search] (no cafe-door, no Objectives, no failed-checks)', () => {
    expect(composeHome({ ...BASE })).toEqual({
      kind: 'member', cafeDoor: false, failedChecksAdmitted: false, objectivesDoor: false, signalsSearch: false,
    })
  })

  it('a member Café-affiliated leads with the Café capture door', () => {
    expect(composeHome({ ...BASE, canCaptureCafe: true })).toEqual({
      kind: 'member', cafeDoor: true, failedChecksAdmitted: false, objectivesDoor: false, signalsSearch: false,
    })
  })

  it('a member never carries the failed-checks region, even where the /cafe/log route admits them', () => {
    // A member has no reports to review; the failed-checks queue belongs to the cockpit.
    const plan = composeHome({ ...BASE, canCaptureCafe: true, seesCafeChecks: true })
    expect(plan.kind).toBe('member')
    expect(plan.failedChecksAdmitted).toBe(false)
  })
})

describe('AC-080: composeHome picks the cockpit plan for a lead+', () => {
  it('a lead by REPORTS composes [tabs(needs-you, my-work), objectives-door, signals]', () => {
    const plan = composeHome({ ...BASE, isManager: true })
    expect(plan).toEqual({
      kind: 'lead', cafeDoor: false, failedChecksAdmitted: false, objectivesDoor: true, signalsSearch: true,
    })
  })

  it('a lead by objective.manage composes the cockpit', () => {
    expect(composeHome({ ...BASE, canManageObjectives: true }).kind).toBe('lead')
  })

  it('a lead by workline.manage composes the cockpit', () => {
    expect(composeHome({ ...BASE, canManageWorkLines: true }).kind).toBe('lead')
  })

  it('a lead café-admitted gets the failed-checks tab too', () => {
    const plan = composeHome({ ...BASE, isManager: true, seesCafeChecks: true })
    expect(plan.failedChecksAdmitted).toBe(true)
  })

  it('a lead NOT café-admitted has no failed-checks tab (two-tab cockpit)', () => {
    const plan = composeHome({ ...BASE, isManager: true, seesCafeChecks: false })
    expect(plan.failedChecksAdmitted).toBe(false)
  })

  it('a lead never carries the Café capture door — the door is a member composition lead', () => {
    // A lead café-affiliated is not offered the capture door here; the cockpit has an Objectives
    // door instead, and the Café door lives on the member plan by design (AC-080).
    const plan = composeHome({ ...BASE, isManager: true, canCaptureCafe: true })
    expect(plan.cafeDoor).toBe(false)
  })
})
