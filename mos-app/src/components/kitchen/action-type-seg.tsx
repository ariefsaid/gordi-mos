/* eslint-disable react-refresh/only-export-components -- `actionTypeLabel` is a plain
   translation-mapping function (not a component) shared with kitchen-plan-page's Pesanan
   column so the two surfaces don't invent two mappings for the same data value. Same
   pattern as src/i18n/I18nProvider.tsx. */
// ActionTypeSeg — segmented control for kitchen action_type selection.
// role="tablist" with role="tab" children; aria-selected for current selection.
// Three canonical values: Production · Transfer to Radiant · Transfer to Bungur.
// Styling: co-located action-type-seg.css (DESIGN.md tokens; no inline style).
//
// Nielsen sweep (Café·Log 24/40): the tab labels rendered the English `KitchenActionType`
// DATA VALUE directly, so "Production" stayed English on the `id` locale — the exact tab
// a floor worker taps every time they switch scope. `actionTypeLabel` is exported so
// Café·Plan's Pesanan "Action" column (which prints the same raw value) can share ONE
// mapping rather than inventing a second one (island i18n).

import type { KitchenActionType } from '@/lib/db/kitchen-logs.types'
import { useT, type Translate } from '@/i18n/use-t'
import './action-type-seg.css'

interface ActionTypeSegProps {
  value: KitchenActionType
  onChange: (value: KitchenActionType) => void
  disabled?: boolean
}

/** Translated full label for a KitchenActionType data value (shared with kitchen-plan-page's Pesanan). */
export function actionTypeLabel(t: Translate, value: KitchenActionType): string {
  switch (value) {
    case 'Production': return t('kitchen.actionType.production')
    case 'Transfer to Radiant': return t('kitchen.actionType.transferRadiant')
    case 'Transfer to Bungur': return t('kitchen.actionType.transferBungur')
    default: return value
  }
}

function actionTypeShortLabel(t: Translate, value: KitchenActionType): string {
  switch (value) {
    case 'Production': return t('kitchen.actionType.production')
    case 'Transfer to Radiant': return t('kitchen.actionType.transferRadiant.short')
    case 'Transfer to Bungur': return t('kitchen.actionType.transferBungur.short')
    default: return value
  }
}

const VALUES: KitchenActionType[] = ['Production', 'Transfer to Radiant', 'Transfer to Bungur']

export function ActionTypeSeg({ value, onChange, disabled = false }: ActionTypeSegProps) {
  const t = useT()
  return (
    <div role="tablist" aria-label={t('kitchen.actionType.aria')} className="kseg">
      {VALUES.map(optValue => {
        const isSelected = optValue === value
        return (
          <button
            key={optValue}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={disabled}
            className="kseg-tab"
            onClick={() => {
              if (!isSelected) onChange(optValue)
            }}
          >
            <span className="kseg-full">{actionTypeLabel(t, optValue)}</span>
            <span className="kseg-short" aria-hidden="true">{actionTypeShortLabel(t, optValue)}</span>
          </button>
        )
      })}
    </div>
  )
}
