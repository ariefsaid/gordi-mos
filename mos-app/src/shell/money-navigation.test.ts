import { describe, expect, it } from 'vitest'
import { SHOW_FOLLOWUPS, SHOW_PLAN_BUDGET } from '@/config/features'
import type { ModuleId } from '@/lib/db/module-settings'
import { moneyDestinationForViewer, moneySectionsForViewer } from './module-registry'

const allModulesOn = (_moduleId: ModuleId, roleAdmitted = true) => roleAdmitted
const paths = (roles: string[]) => moneySectionsForViewer(roles, allModulesOn).map(({ path }) => path)

describe('Money sibling navigation mirrors admitted routes', () => {
  it('keeps the revenue view available to manager and supervisor without finance destinations', () => {
    for (const role of ['manager', 'supervisor']) {
      expect(paths([role])).toEqual(['/money'])
      expect(moneyDestinationForViewer([role], allModulesOn)?.primaryPath).toBe('/money')
    }
  })

  it('keeps pending bills finance-only and planning/legacy entries separately gated', () => {
    expect(paths(['finance'])).toContain('/money/pending-bills')
    expect(paths(['admin'])).not.toContain('/money')
    expect(paths(['admin'])).not.toContain('/money/pending-bills')
    expect(paths(['member'])).toEqual([])
    expect(paths(['finance']).includes('/money/budget')).toBe(SHOW_PLAN_BUDGET)
    expect(paths(['admin']).includes('/money/budget')).toBe(SHOW_PLAN_BUDGET)
    expect(paths(['finance']).includes('/money/pricing')).toBe(SHOW_PLAN_BUDGET)
    expect(paths(['admin']).includes('/money/pricing')).toBe(SHOW_PLAN_BUDGET)
    expect(paths(['finance']).includes('/money/follow-ups')).toBe(SHOW_FOLLOWUPS)
    expect(paths(['admin']).includes('/money/follow-ups')).toBe(SHOW_FOLLOWUPS)
  })

  it('chooses a reachable parent route for admin-only viewers without granting overview access', () => {
    const destination = moneyDestinationForViewer(['admin'], allModulesOn)
    if (SHOW_PLAN_BUDGET) expect(destination?.primaryPath).toBe('/money/budget')
    else if (SHOW_FOLLOWUPS) expect(destination?.primaryPath).toBe('/money/follow-ups')
    else expect(destination).toBeNull()
    expect(paths(['admin'])).not.toContain('/money')
  })
})
