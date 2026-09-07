// GlobalToolbar — the one toolbar above both tabs (design-plan §2.8, FR-011/AC-011).
// Composes CutToggle + WindowSelector into a single rail so a change re-filters
// BOTH panes (single source of truth — no per-tab duplication, OD-DASH-6).
// r5 F-6 (redundancy law): the toolbar carries NO freshness stamp — the page head
// meta and the chart frame own "as of"; a third copy on the same viewport was noise.
// Desktop: single flex row (window group · divider · cut group). Phone (#804): TWO
// full-width rows — the window presets and Range above `CUT Branch · Channel · Activity`
// — so every label is legible without a horizontal scroller. Range there opens a
// From · To · Apply sheet: the pair is too wide for the row, and deferring the commit
// to Apply means a half-typed range never re-queries the page.
import { useState } from 'react'
import type { WindowSpec } from '@/lib/dashboard'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'
import { CutToggle } from './cut-toggle'
import { WindowSelector, WindowRangeFields } from './window-selector'
import { isoDaysBefore } from '@/lib/trailing-window'
import './global-toolbar.css'

export interface GlobalToolbarProps {
  cut: 'Branch' | 'Channel' | 'Activity'
  onCutChange: (cut: 'Branch' | 'Channel' | 'Activity') => void
  window: WindowSpec
  onWindowChange: (w: WindowSpec) => void
  bounds: { earliest: string; latest: string } | null
}

const CUT_OPTIONS: Array<'Branch' | 'Channel' | 'Activity'> = ['Branch', 'Channel', 'Activity']

/** The range the sheet opens on: the live custom window, else the tail of the snapshot window. */
function seedRange(
  value: WindowSpec,
  bounds: { earliest: string; latest: string } | null,
): { from: string; to: string } {
  if (value.kind === 'custom') return { from: value.from, to: value.to }
  const to = bounds?.latest ?? ''
  return { from: to ? isoDaysBefore(to, 29) : '', to }
}

export function GlobalToolbar({
  cut,
  onCutChange,
  window: windowSpec,
  onWindowChange,
  bounds,
}: GlobalToolbarProps) {
  const isDesktop = useIsDesktop()
  const t = useT()
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null)
  const sheetOpen = draft !== null

  return (
    <div className="global-toolbar" role="toolbar" aria-label={t('money.toolbar.ariaLabel')}>
      <div className="global-toolbar-rail">
        <div className="global-toolbar-group global-toolbar-group--window">
          <WindowSelector
            value={windowSpec}
            onChange={onWindowChange}
            bounds={bounds}
            hideRange={!isDesktop}
            onRangeOpen={isDesktop ? undefined : () => setDraft(seedRange(windowSpec, bounds))}
          />
        </div>
        <span className="global-toolbar-divider" aria-hidden="true" />
        <div className="global-toolbar-group global-toolbar-group--cut">
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

      {sheetOpen && (
        <ModalShell
          open
          onClose={() => setDraft(null)}
          surface="sheet"
          closeOnBackdrop
          ariaLabel={t('money.window.rangeSheet')}
        >
          <div className="global-toolbar-range-sheet">
            <WindowRangeFields
              value={{ kind: 'custom', from: draft.from, to: draft.to }}
              onChange={spec => {
                if (spec.kind === 'custom') setDraft({ from: spec.from, to: spec.to })
              }}
              bounds={bounds}
            />
            <Button
              onClick={() => {
                onWindowChange({ kind: 'custom', from: draft.from, to: draft.to })
                setDraft(null)
              }}
            >
              {t('money.window.apply')}
            </Button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
