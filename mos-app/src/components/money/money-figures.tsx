// MoneyFigures — the few numbers a Money page opens with: a label, one value, its change and the
// basis that change is measured against. Open ruled cells, no cards. CogsMeter shows COGS as a
// share of revenue against its recipe budget with both numbers written out: neutral ink, amber
// only for the part over budget.
import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { formatPercent } from '@/lib/format/percent'
import './money-figures.css'

export function MoneyFigures({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <dl className={`money-figures${className ? ` ${className}` : ''}`} aria-label={label}>{children}</dl>
}

export function MoneyFigure({ label, value, delta, basis, extra, lead }: {
  label: ReactNode
  value: ReactNode
  delta?: ReactNode
  basis?: ReactNode
  extra?: ReactNode
  lead?: boolean
}) {
  return (
    <div className={`money-figure${lead ? ' money-figure--lead' : ''}`}>
      <dt className="money-figure__label">{label}</dt>
      <dd className="money-figure__value tabular">{value}</dd>
      {(delta || basis) && <dd className="money-figure__change">{delta}{basis && <span className="money-figure__basis">{basis}</span>}</dd>}
      {extra && <dd className="money-figure__extra">{extra}</dd>}
    </div>
  )
}

/** `cogsShare` and `budgetShare` are fractions of revenue (0..1). */
export function CogsMeter({ cogsShare, budgetShare }: { cogsShare: number; budgetShare: number }) {
  const t = useT()
  const pct = (n: number) => Math.max(0, Math.min(100, n * 100))
  const within = pct(Math.min(cogsShare, budgetShare))
  const over = Math.max(0, pct(cogsShare) - pct(budgetShare))
  return (
    <span className="cogs-meter">
      <span className="cogs-meter__track" role="meter" aria-label={t('money.branch.bullet.label')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct(cogsShare))} aria-valuetext={t('money.cogs.meterText', { actual: formatPercent(cogsShare, 1), budget: formatPercent(budgetShare, 1) })}>
        <span className="cogs-meter__fill" style={{ width: `${within}%` }} />
        {over > 0 && <span className="cogs-meter__over" style={{ left: `${within}%`, width: `${over}%` }} />}
        <i className="cogs-meter__budget" aria-hidden="true" style={{ left: `${pct(budgetShare)}%` }} />
      </span>
      <span className="cogs-meter__text tabular">{t('money.cogs.meterText', { actual: formatPercent(cogsShare, 1), budget: formatPercent(budgetShare, 1) })}</span>
    </span>
  )
}
