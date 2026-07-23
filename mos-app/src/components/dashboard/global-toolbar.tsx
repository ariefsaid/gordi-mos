// GlobalToolbar — the one toolbar above both tabs (design-plan §2.8, FR-011/AC-011).
// Composes CutToggle + WindowSelector into a single rail so a change re-filters
// BOTH panes (single source of truth — no per-tab duplication, OD-DASH-6).
// r5 F-6 (redundancy law): the toolbar carries NO freshness stamp — the page head
// meta and the chart frame own "as of"; a third copy on the same viewport was noise.
// Desktop: single flex row (window group · divider · cut group). Mobile: the rail
// is a sticky horizontal scroller; the Custom From/To pair drops onto its OWN
// full-width row below the rail (DO-21, money F-4) so Branch/Channel/Activity stay
// reachable instead of being pushed off-canvas.
import type { WindowSpec } from '@/lib/dashboard'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { CutToggle } from './cut-toggle'
import { WindowSelector, WindowRangeFields } from './window-selector'
import './global-toolbar.css'

export interface GlobalToolbarProps {
  cut: 'Branch' | 'Channel' | 'Activity'
  onCutChange: (cut: 'Branch' | 'Channel' | 'Activity') => void
  window: WindowSpec
  onWindowChange: (w: WindowSpec) => void
  bounds: { earliest: string; latest: string } | null
}

const CUT_OPTIONS: Array<'Branch' | 'Channel' | 'Activity'> = ['Branch', 'Channel', 'Activity']

export function GlobalToolbar({
  cut,
  onCutChange,
  window: windowSpec,
  onWindowChange,
  bounds,
}: GlobalToolbarProps) {
  const isDesktop = useIsDesktop()
  const t = useT()
  const customOnPhone = !isDesktop && windowSpec.kind === 'custom'
  return (
    <div className="global-toolbar" role="toolbar" aria-label={t('money.toolbar.ariaLabel')}>
      <div className="global-toolbar-rail">
        <div className="global-toolbar-group">
          <WindowSelector
            value={windowSpec}
            onChange={onWindowChange}
            bounds={bounds}
            hideRange={customOnPhone}
          />
        </div>
        <span className="global-toolbar-divider" aria-hidden="true" />
        <div className="global-toolbar-group">
          <span className="global-toolbar-overline">{t('money.toolbar.cut')}</span>
          <CutToggle
            options={CUT_OPTIONS}
            value={cut}
            onChange={v => onCutChange(v as typeof cut)}
            ariaLabel={t('money.toolbar.cutDimension')}
            // I18N-1: value stays the English enum ('Branch'); only the label localizes.
            renderLabel={(o) => t(`money.cut.${o.toLowerCase()}` as MessageKey)}
          />
        </div>
      </div>
      {customOnPhone && (
        <div className="global-toolbar-range-row">
          <WindowRangeFields value={windowSpec} onChange={onWindowChange} bounds={bounds} />
        </div>
      )}
    </div>
  )
}
