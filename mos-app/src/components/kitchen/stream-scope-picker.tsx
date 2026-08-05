// StreamScopePicker — the branch + activity pair of <Select>s that scopes a surface to
// ONE (branch, activity) production stream (FR-003 — switchable default, never a wall).
// Same affordance family as the capture surface's scope block (kitchen-log-page's
// kl-scope): two kit Selects in the KitchenToolbar's LEADING slot, because which books
// the list is read against decides what every row means.
//
// NEW component (not lifted from the capture page): the capture surface is being
// reworked on its own branch (#233), so this file is consumed only by the stock page
// for now — consolidating the capture page onto it is a follow-up, noted in the PR.
// Branch names here are the CANONICAL catalog names (OD-WAY-39) — never "HQ"/"Stok HQ" for the
// central kitchen (FR-061, CONTEXT.md trap: that label collides with the GHQ branch), and since
// #238's owner ruling, never the 'Bungur' display alias either.
//
// THE RULE (CONTEXT.md, Production stream): a stream is named by its branch's canonical catalog
// name everywhere it is named AS A STREAM; the 'Bungur' alias names a transfer DESTINATION and
// the derived action label, which is where the incumbent used it and where parity lives.
// This picker names the stream a person is LOOKING AT, so it takes the canonical name — the same
// line the capture page's stream picker already held. #237 shipped the alias here and pinned it
// with a test; #238's authenticated render found the two surfaces disagreeing about one stream,
// and the ruling settled it in favour of the capture page. The test was inverted, not deleted:
// it now pins BOTH halves, so the distinction is asserted rather than merely removed.

import { Select } from '@/components/ui/select'
import { activityLabel } from '@/lib/kitchen-action-label'
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
          <option key={branch.id} value={branch.id}>{branch.name}</option>
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
