// The two pieces every Money page head carries: the period control and the one freshness sentence.
import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { formatWeekdayDayMonth, formatWibWeekdayTime } from '@/lib/format/date'
import { DateField } from '@/components/ui/date-field'
import { Select } from '@/components/ui/select'
import { isValidMoneyRange, MONEY_PERIODS, type MoneyPeriod, type MoneyRange } from '@/lib/money-branch-table'
import { isoDaysBefore } from '@/lib/trailing-window'
import './money-freshness.css'

/** The nightly sync runs once a day; a snapshot older than this missed at least one run. */
const STALE_AFTER_MS = 30 * 3600_000

export function PeriodControl({ period, range, latestDate, onChange, onRangeChange, disabled }: {
  period: MoneyPeriod; range: MoneyRange | null; latestDate: string | null
  onChange: (p: MoneyPeriod) => void; onRangeChange: (range: MoneyRange) => void; disabled?: boolean
}) {
  const t = useT()
  const fallback = latestDate ? { from: isoDaysBefore(latestDate, period - 1), to: latestDate } : { from: '', to: '' }
  const [draft, setDraft] = useState(range ?? fallback)
  const [customOpen, setCustomOpen] = useState(Boolean(range))
  const [invalid, setInvalid] = useState(false)
  const rangeFrom = range?.from
  const rangeTo = range?.to
  useEffect(() => {
    setDraft({ from: rangeFrom ?? fallback.from, to: rangeTo ?? fallback.to })
    setInvalid(false)
    if (rangeFrom && rangeTo) setCustomOpen(true)
  }, [fallback.from, fallback.to, rangeFrom, rangeTo])
  const edit = (field: 'from' | 'to', value: string) => {
    const next = { ...draft, [field]: value }
    setDraft(next)
    if (isValidMoneyRange(next.from, next.to, latestDate ?? undefined)) { setInvalid(false); onRangeChange(next) }
    else if (next.from && next.to) setInvalid(true)
  }
  const chosen = range || customOpen ? 'custom' : String(period)
  const choose = (value: string) => {
    if (value === 'custom') {
      setCustomOpen(true)
      if (!range && isValidMoneyRange(draft.from, draft.to, latestDate ?? undefined)) onRangeChange(draft)
    } else {
      setCustomOpen(false)
      onChange(Number(value) as MoneyPeriod)
    }
  }
  const options: { value: string; label: string; disabled?: boolean }[] = [
    ...MONEY_PERIODS.map((p) => ({ value: String(p), label: t('money.period.days', { days: String(p) }) })),
    { value: 'custom', label: t('money.period.custom'), disabled: !latestDate },
  ]
  return (
    <div className="money-period-control">
      <div className="money-period__select">
        <Select label={t('money.period.label')} value={chosen} disabled={disabled} onChange={(event) => choose(event.target.value)} fullWidth>
          {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
        </Select>
      </div>
      {customOpen && <div className="money-period__range">
        <DateField compact required label={t('money.period.from')} value={draft.from} max={latestDate ?? undefined} disabled={disabled || !latestDate} onChange={(value) => edit('from', value)} />
        <DateField compact required label={t('money.period.to')} value={draft.to} max={latestDate ?? undefined} disabled={disabled || !latestDate} onChange={(value) => edit('to', value)} />
        {invalid && <p className="money-period__error" role="alert">{t('money.period.invalid')}</p>}
      </div>}
    </div>
  )
}

/** "Sales through Mon 5 Oct · synced Tue 6 Oct, 02:05"; in the warning tint, saying "last synced",
 *  once the snapshot has missed a nightly run. */
export function MoneyFreshness({ latestDate, syncedAt, freshMessage, staleMessage }: {
  latestDate: string
  syncedAt: string | null
  freshMessage?: ReactNode
  staleMessage?: ReactNode
}) {
  const t = useT()
  const { locale } = useI18n()
  const stale = syncedAt !== null && Date.now() - new Date(syncedAt).getTime() > STALE_AFTER_MS
  return (
    <span className="money-freshness" data-stale={stale ? 'true' : undefined}>
      {stale
        ? staleMessage ?? t('money.freshness.stale', {
          through: formatWeekdayDayMonth(latestDate, locale),
          synced: syncedAt ? formatWibWeekdayTime(syncedAt, locale) : '',
        })
        : freshMessage ?? t('money.freshness', {
          through: formatWeekdayDayMonth(latestDate, locale),
          synced: syncedAt ? formatWibWeekdayTime(syncedAt, locale) : '',
        })}
    </span>
  )
}
