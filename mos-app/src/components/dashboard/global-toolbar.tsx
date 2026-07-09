// GlobalToolbar — the one toolbar above both tabs (design-plan §2.8, FR-011/AC-011).
// Composes CutToggle + WindowSelector + FreshnessLabel into a single rail so a change
// re-filters BOTH panes (single source of truth — no per-tab duplication, OD-DASH-6).
// Desktop: single flex row (window group · divider · cut group); the freshness label
// rides the trailing edge. Mobile: the composition lays this out in a sticky rail.
import type { WindowSpec } from '@/lib/dashboard'
import { CutToggle } from './cut-toggle'
import { WindowSelector } from './window-selector'
import { FreshnessLabel } from './freshness-label'
import './global-toolbar.css'

export interface GlobalToolbarProps {
  cut: 'Branch' | 'Channel' | 'Activity'
  onCutChange: (cut: 'Branch' | 'Channel' | 'Activity') => void
  window: WindowSpec
  onWindowChange: (w: WindowSpec) => void
  bounds: { earliest: string; latest: string } | null
  snapshotAsOf: string | null
}

const CUT_OPTIONS: Array<'Branch' | 'Channel' | 'Activity'> = ['Branch', 'Channel', 'Activity']

export function GlobalToolbar({
  cut,
  onCutChange,
  window: windowSpec,
  onWindowChange,
  bounds,
  snapshotAsOf,
}: GlobalToolbarProps) {
  return (
    <div className="global-toolbar" role="toolbar" aria-label="Dashboard filters">
      <div className="global-toolbar-group">
        <WindowSelector value={windowSpec} onChange={onWindowChange} bounds={bounds} />
      </div>
      <span className="global-toolbar-divider" aria-hidden="true" />
      <div className="global-toolbar-group">
        <span className="global-toolbar-overline">Cut</span>
        <CutToggle
          options={CUT_OPTIONS}
          value={cut}
          onChange={v => onCutChange(v as typeof cut)}
          ariaLabel="Cut dimension"
        />
      </div>
      {snapshotAsOf && (
        <span className="global-toolbar-freshness">
          <FreshnessLabel asOf={snapshotAsOf} />
        </span>
      )}
    </div>
  )
}
