import { TrendIcon } from '@/shell/icons'
// MoneyDelta — one change as a pill: arrow, signed figure, tone. The arrow and the sign carry the
// direction without colour. Percent changes are green up / red down; COGS against its recipe
// budget is amber when over and green when under.
import { Pill } from '@/components/ui/pill'
import type { Translate } from '@/i18n/use-t'
import { signedChange } from '@/lib/sales-dashboard'
import { formatSignedPoints } from '@/lib/format/percent'

const trend = (value: number): 'up' | 'down' | 'flat' => (value > 0 ? 'up' : value < 0 ? 'down' : 'flat')

export function MoneyDelta({ value, t, className }: { value: number | null; t: Translate; className?: string }) {
  if (value === null) return <span className="money-muted">{t('money.delta.noComparison')}</span>
  const { text, tone } = signedChange(value)
  return <Pill tone={tone} dot={false} className={`tabular${className ? ` ${className}` : ''}`}><TrendIcon direction={tone === 'neutral' ? 'flat' : trend(value)} /> {text}</Pill>
}

/** Points of revenue. `overIsBad`: a rise is an exception (COGS above budget), not good news. */
export function MoneyPoints({ value, t, overIsBad = false, className }: { value: number; t: Translate; overIsBad?: boolean; className?: string }) {
  const text = formatSignedPoints(value)
  const flat = text === formatSignedPoints(0)
  const tone = flat ? 'neutral' as const
    : overIsBad ? (value > 0 ? 'warning' as const : 'success' as const)
      : value > 0 ? 'success' as const : 'destructive' as const
  return <Pill tone={tone} dot={false} className={`tabular${className ? ` ${className}` : ''}`}><TrendIcon direction={flat ? 'flat' : trend(value)} /> {t('money.table.points', { value: text })}</Pill>
}
