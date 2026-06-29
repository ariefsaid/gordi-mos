// kitchenStatus — pure status mapper for the Kitchen Log row StatusPill (plan §6.1).
// Maps (made, plan) → { tone: PillTone, label } for the Tinted-Status dot+pill.
// No new hue/token: reuses the existing Pill tones (success/warning/destructive/neutral).
//
// Adopted defaults (plan §13, owner-flagged):
//  - OQ-1: over-plan = amber/warning (FR-022 fires on over AND under → "over" is a variance).
//  - OQ-2: not-started (made===0, plan>0) = red/destructive "Under −plan" (pure fn of made/plan).
// Pure + co-located so the row tests prove the mapping, not mocks.

import type { PillTone } from '@/components/ui/pill'

export interface KitchenStatus {
  tone: PillTone
  label: string
  /** Leading dot on the Pill. Default true; false for the dotless em-dash "none" case. */
  dot?: boolean
}

/**
 * The row StatusPill mapping (plan §6.1). Pure function of (made, plan).
 * `isOffPlan` is provided by the caller (it equals plan===0) for API fidelity;
 * the mapping keys off made/plan only (plan===0 ⟺ off-plan).
 */
export function kitchenStatus(input: {
  made: number
  plan: number
  isOffPlan: boolean
}): KitchenStatus {
  const { made, plan } = input

  // Off-plan (no plan row for this action_type)
  if (plan <= 0) {
    if (made > 0) return { tone: 'neutral', label: 'Logged' }
    return { tone: 'neutral', dot: false, label: '—' } // dotless em-dash
  }

  // Planned (plan > 0)
  if (made >= plan) {
    if (made === plan) return { tone: 'success', label: 'On plan' }
    return { tone: 'warning', label: `Over +${made - plan}` }
  }
  // 0 <= made < plan → "Under" (covers made===0 "not-started" too, OQ-2 adopted)
  return { tone: 'destructive', label: `Under −${plan - made}` }
}
