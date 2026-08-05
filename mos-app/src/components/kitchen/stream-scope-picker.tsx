// StreamScopePicker — the branch + activity pair of <Select>s that scopes a surface to
// ONE (branch, activity) production stream (FR-003 — switchable default, never a wall).
// Same affordance family as the capture surface's scope block (kitchen-log-page's
// kl-scope): two kit Selects in the KitchenToolbar's LEADING slot, because which books
// the list is read against decides what every row means.
//
// NEW component (not lifted from the capture page): the capture surface is being
// reworked on its own branch (#233), so this file is consumed only by the stock page
// for now — consolidating the capture page onto it is a follow-up, noted in the PR.
// Branch names go through branchDisplayName, so the central kitchen's stream reads
// under the Rumah Rames display alias — never "HQ"/"Stok HQ" (FR-061, CONTEXT.md trap:
// that label collides with the GHQ branch).

import { Select } from '@/components/ui/select'
import { activityLabel, branchDisplayName } from '@/lib/kitchen-action-label'
import { PRODUCTION_ACTIVITIES } from '@/lib/db/kitchen-logs.types'
import type { BranchOption, ProductionActivity, ProductionStream } from '@/lib/db/kitchen-logs.types'
import { useT } from '@/i18n/use-t'
import './stream-scope-picker.css'

export interface StreamScopePickerProps {
  branches: readonly BranchOption[]
  /** null only while the catalog loads (or when it is empty) — both selects disable */
  stream: ProductionStream | null
  onChange: (next: ProductionStream) => void
  disabled?: boolean
  branchAriaLabel: string
  activityAriaLabel: string
}

export function StreamScopePicker({
  branches,
  stream,
  onChange,
  disabled = false,
  branchAriaLabel,
  activityAriaLabel,
}: StreamScopePickerProps) {
  const t = useT()
  return (
    <div className="ksp">
      <Select
        className="ksp-branch"
        aria-label={branchAriaLabel}
        value={stream?.branch.id ?? ''}
        disabled={disabled || branches.length === 0}
        onChange={e => {
          const branch = branches.find(b => b.id === e.target.value)
          if (branch && stream) onChange({ ...stream, branch })
        }}
      >
        {branches.map(branch => (
          <option key={branch.id} value={branch.id}>{branchDisplayName(branch)}</option>
        ))}
      </Select>
      <Select
        className="ksp-activity"
        aria-label={activityAriaLabel}
        value={stream?.activity ?? ''}
        disabled={disabled || !stream}
        onChange={e => {
          if (stream) onChange({ ...stream, activity: e.target.value as ProductionActivity })
        }}
      >
        {PRODUCTION_ACTIVITIES.map(activity => (
          <option key={activity} value={activity}>{activityLabel(t, activity)}</option>
        ))}
      </Select>
    </div>
  )
}
