// StatePill — the weekly-update lifecycle pill (VIS-4, PR-2). Re-skinned onto the
// shared <Pill> primitive. Distinct vocabulary from the task StatusPill: a weekly
// update's own filed-state (Filed / Draft / Not started), not a task's status.
// Filed→success, Draft→warning, Not started→neutral.
import type { TeamUpdateRow } from '@/lib/db/weeklyUpdates.types'
import { Pill } from './Pill'

type UpdateState = TeamUpdateRow['state']

const STATE_TONE: Record<UpdateState, import('./Pill').PillTone> = {
  filed: 'success',
  draft: 'warning',
  not_started: 'neutral',
}

const STATE_LABEL: Record<UpdateState, string> = {
  filed: 'Filed',
  draft: 'Draft',
  not_started: 'Not started',
}

export function StatePill({ state }: { state: UpdateState }) {
  return (
    <Pill tone={STATE_TONE[state]} aria-label={`Update: ${STATE_LABEL[state]}`}>
      {STATE_LABEL[state]}
    </Pill>
  )
}
