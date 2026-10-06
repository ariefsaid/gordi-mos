// The two pieces every Money page head carries: the period control and the one freshness sentence.
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { formatWeekdayDayMonth, formatWibWeekdayTime } from '@/lib/format/date'
import { MONEY_PERIODS, type MoneyPeriod } from '@/lib/money-branch-table'

/** The nightly sync runs once a day; a snapshot older than this missed at least one run. */
const STALE_AFTER_MS = 30 * 3600_000

export function PeriodControl({ period, onChange, disabled }: { period: MoneyPeriod; onChange: (p: MoneyPeriod) => void; disabled?: boolean }) {
  const t = useT()
  return (
    <div className="money-period" role="group" aria-label={t('money.period.label')}>
      {MONEY_PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          className="money-period__option"
          aria-pressed={p === period}
          disabled={disabled}
          onClick={() => onChange(p)}
        >
          {t('money.period.days', { days: String(p) })}
        </button>
      ))}
    </div>
  )
}

/** "Sales through Mon 5 Oct · synced Tue 6 Oct, 02:05"; in the warning tint, saying "last synced",
 *  once the snapshot has missed a nightly run. */
export function MoneyFreshness({ latestDate, syncedAt }: { latestDate: string; syncedAt: string | null }) {
  const t = useT()
  const { locale } = useI18n()
  const stale = syncedAt !== null && Date.now() - new Date(syncedAt).getTime() > STALE_AFTER_MS
  return (
    <span className={`ch-meta-line money-freshness${stale ? ' money-freshness--stale' : ''}`}>
      {t(stale ? 'money.freshness.stale' : 'money.freshness', {
        through: formatWeekdayDayMonth(latestDate, locale),
        synced: syncedAt ? formatWibWeekdayTime(syncedAt, locale) : '',
      })}
    </span>
  )
}
