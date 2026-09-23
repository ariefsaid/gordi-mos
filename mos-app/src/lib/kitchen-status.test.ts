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

  // cafe-4 (#196): the em-dash label was replaced in kitchen-status.ts itself — a naked "—" reads
  // as a rendering failure at a glance, especially when a whole day's table is off-plan/unlogged.
  // This assertion is stale against that same change, not the other way around: kitchen-status.ts's
  // own comment documents the reason, and the i18n catalog (`kitchen.status.notLogged`: 'Not
  // logged' / 'Belum dicatat') and kitchen-log-page.tsx's statusLabel() wrapper both already agree
  // with 'Not logged'. Updating the assertion here to match, rather than reverting the app.
  it('none: plan===0, made===0 → neutral dot:false "Not logged" (cafe-4)', () => {
    expect(kitchenStatus({ made: 0, plan: 0, isOffPlan: true })).toEqual({
      tone: 'neutral',
      dot: false,
      label: 'Not logged',
    })
  })
})
