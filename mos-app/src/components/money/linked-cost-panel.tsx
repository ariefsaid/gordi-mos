import { RecordPanelHost } from '@/shell/record-panel-host'
import type { IngredientCostLine } from '@/lib/plan-budget-logic'
import { formatIDR } from '@/lib/plan-budget-logic'
import { formatDayMonthYear } from '@/lib/format/date'
import { useI18n } from '@/i18n/I18nProvider'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import './linked-cost-panel.css'

type Props = { cost: IngredientCostLine; onClose: () => void }

export function LinkedCostPanel({ cost, onClose }: Props) {
  const t = useT()
  const { locale } = useI18n()
  const title = t('moneyB.linkedCost.title' as MessageKey)
  return (
    <RecordPanelHost label={`${title}: ${cost.name}`} title={title} closeLabel={t('record.close')} focusKey={cost.ingredient_esb_code} onClose={onClose}>
      <section className="linked-cost-panel" aria-label={title}>
        <h2>{cost.name}</h2>
        <dl>
          <div><dt>{t('moneyB.linkedCost.code' as MessageKey)}</dt><dd><code>{cost.ingredient_esb_code}</code></dd></div>
          <div><dt>{t('moneyB.linkedCost.unitCost' as MessageKey)}</dt><dd className="tabular">{formatIDR(cost.unit_cost)}/{cost.unit}</dd></div>
          <div><dt>{t('moneyB.linkedCost.asOf' as MessageKey)}</dt><dd>{formatDayMonthYear(cost.as_of, locale)}</dd></div>
        </dl>
        <p>{t('moneyB.linkedCost.readOnly' as MessageKey)}</p>
      </section>
    </RecordPanelHost>
  )
}
