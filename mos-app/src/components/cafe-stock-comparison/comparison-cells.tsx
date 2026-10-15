// The words and cells every part of Stock comparison shares: flag pills, the ESB expected / Last Count / Difference
// figures and their blank reasons. A missing figure is "—" with the reason for a screen reader, never a zero.
import type { ReactNode } from 'react'
import { Pill } from '@/components/ui/pill'
import { Tag } from '@/components/ui/tag'
import type { Translate } from '@/i18n/use-t'
import { formatDec } from '@/lib/cafe-records/decimal'
import { formatDayMonthYear } from '@/lib/format/date'
import { formatPercent, formatSigned, type ComparisonRow } from '@/lib/cafe-stock-comparison'
import type { Flag } from '@/lib/db/cafe-stock-comparison'
import { FLAG_TONE, flagLabel, missingReason, shownFlags, wibInstant } from './comparison-labels'
import type { Locale } from '@/i18n/messages'

export function FlagPills({ t, row, hide }: { t: Translate; row: ComparisonRow; hide?: readonly Flag[] }) {
  const flags = shownFlags(row, hide)
  if (flags.length === 0) return null
  return (
    <span className="scmp-flags">
      {flags.map((flag) => <Pill key={flag} tone={FLAG_TONE[flag] ?? 'neutral'}>{flagLabel(t, flag, row)}</Pill>)}
    </span>
  )
}

export function KindTag({ kind }: { kind: 'RAW' | 'WIP' }) {
  return <Tag color="gray">{kind}</Tag>
}

const dash = (reason: string) => <>–{reason ? <span className="sr-only"> ({reason})</span> : null}</>

export interface CellContext { t: Translate; locale: Locale; countsUnavailable: (row: ComparisonRow) => boolean }

/** ESB expected: the quantity and its absolute as-of time (and its own unit when that is not the row's). */
export function ExpectedCell({ ctx, row }: { ctx: CellContext; row: ComparisonRow }): ReactNode {
  const { t, locale } = ctx
  if (!row.expected) return dash(missingReason(t, row.missing === 'not_counted' ? null : row.missing))
  const e = row.expected
  const ownUnit = e.unitId !== row.unitId ? ` ${e.unitName}` : ''
  return (
    <>
      <span className="scmp-qty">{formatDec(e.quantity)}{ownUnit}</span>
      <span className="scmp-meta" title={t('cafe.cmp.asOf', { time: wibInstant(e.asOf, locale) })}><span className="sr-only">{t('cafe.cmp.asOf', { time: '' })}</span>{wibInstant(e.asOf, locale)}</span>
    </>
  )
}

/** Last Count: the quantity, its business date and its status (Pending confirmation when Submitted). */
export function CountCell({ ctx, row }: { ctx: CellContext; row: ComparisonRow }): ReactNode {
  const { t, locale } = ctx
  if (!row.count) return dash(ctx.countsUnavailable(row) ? t('cafe.cmp.countsError') : t('cafe.cmp.flag.not_counted'))
  const status = row.count.status === 'Submitted' ? t('cafe.cmp.status.pending') : t('cafe.cmp.status.Confirmed')
  return (
    <>
      <span className="scmp-qty">{formatDec(row.count.quantity)}</span>
      <span className="scmp-meta">{formatDayMonthYear(row.count.countDate, locale)} · {status}</span>
    </>
  )
}

/** Signed difference in the shared unit, or a blank with the reason. */
export function DifferenceCell({ t, row }: { t: Translate; row: ComparisonRow }): ReactNode {
  if (row.difference === null) return dash(missingReason(t, row.missing))
  return <span className="scmp-qty">{formatSigned(row.difference)}</span>
}

export function PercentCell({ t, row }: { t: Translate; row: ComparisonRow }): ReactNode {
  if (row.zeroExpected) return <>–<span className="scmp-meta">{t('cafe.cmp.flag.zero_expected')}</span></>
  if (row.percent === null) return dash(missingReason(t, row.missing))
  return <span className="scmp-qty">{formatPercent(row.percent)}</span>
}
