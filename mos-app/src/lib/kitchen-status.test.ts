// kitchenStatus — pure status mapper (plan §6.1). 6 cases → Pill tone + label.
// AC-tagged at the row level (KitchenLogRow); this is the pure core.

import { describe, it, expect } from 'vitest'
import { kitchenStatus } from './kitchen-status'

describe('kitchenStatus — plan §6.1 mapping (on/over/under/not-started/logged/none)', () => {
  it('on-plan: plan>0, made===plan → success "On plan"', () => {
    expect(kitchenStatus({ made: 50, plan: 50, isOffPlan: false })).toEqual({
      tone: 'success',
      label: 'On plan',
    })
  })

  it('over: plan>0, made>plan → warning "Over +n"', () => {
    expect(kitchenStatus({ made: 36, plan: 30, isOffPlan: false })).toEqual({
      tone: 'warning',
      label: 'Over +6',
    })
  })

  it('under: plan>0, 0<made<plan → destructive "Under −n"', () => {
    expect(kitchenStatus({ made: 48, plan: 50, isOffPlan: false })).toEqual({
      tone: 'destructive',
      label: 'Under −2',
    })
  })

  it('not-started (OQ-2 adopted): plan>0, made===0 → destructive "Under −plan"', () => {
    expect(kitchenStatus({ made: 0, plan: 20, isOffPlan: false })).toEqual({
      tone: 'destructive',
      label: 'Under −20',
    })
  })

  it('logged: plan===0, made>0 → neutral "Logged"', () => {
    expect(kitchenStatus({ made: 12, plan: 0, isOffPlan: true })).toEqual({
      tone: 'neutral',
      label: 'Logged',
    })
  })

  it('none: plan===0, made===0 → neutral dot:false "—" (dotless em-dash)', () => {
    expect(kitchenStatus({ made: 0, plan: 0, isOffPlan: true })).toEqual({
      tone: 'neutral',
      dot: false,
      label: '—',
    })
  })
})
