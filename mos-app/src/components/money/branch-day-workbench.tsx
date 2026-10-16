import { ViewTabs } from '@/components/ui/view-tabs'
import { useId, type ReactNode } from 'react'
import { DayRevenueChart } from './day-revenue-chart'
import type { BranchPage } from '@/lib/money-branch-page'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { formatIDR } from '@/lib/format/money'
import { formatIDRCompact } from '@/lib/sales-dashboard'
import { formatPercent, formatSignedPoints } from '@/lib/format/percent'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import { Button } from '@/components/ui/button'
import { CogsMeter } from '@/components/money/money-figures'
import { MoneyDelta, MoneyPoints } from '@/components/money/money-delta'
import './branch-day-workbench.css'

function StepIcon({ dir }: { dir: 'prev' | 'next' }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={dir === 'prev' ? 'M12.5 4 6.5 10l6 6' : 'M7.5 4l6 6-6 6'} /></svg>
}

export function BranchDayWorkbench({ page, selected, onSelect, missingDays, findingsLink, plotView, onPlotViewChange }: {
  page: BranchPage
  selected: string
  onSelect: (day: string) => void
  missingDays: number
  findingsLink?: ReactNode
  /** The chart tab lives in the URL (the page owns it), so a reload keeps the view. */
  plotView: 'revenue' | 'margin'
  onPlotViewChange: (view: 'revenue' | 'margin') => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const view = plotView
  const tabsId = useId()
  const index = Math.max(0, page.days.findIndex((day) => day.date === selected))
  const day = page.days[index]
  const margin = page.margin && view === 'margin'
  const basis = page.margin?.budgetBasis ?? null
  const gapPoints = page.margin?.cogsVsBudget ?? null
  const gapWord = gapPoints === null ? '' : formatSignedPoints(gapPoints) === formatSignedPoints(0) ? t('money.cogs.on') : gapPoints > 0 ? t('money.cogs.over') : t('money.cogs.under')
  const atFirst = index <= 0
  const atLatest = index >= page.days.length - 1
  const noteId = `${tabsId}-step-note`
  const dayChange = day && day.value !== null && day.compare ? day.value / day.compare - 1 : null
  return <section className="branch-day-workbench" aria-labelledby="branch-day-title">
    <div className="branch-day-workbench__plot">
      <h2 id="branch-day-title">{t('money.branch.chart.title')}</h2>
      <p className="branch-day-workbench__total tabular">{missingDays === 0 ? t('money.branch.total', { value: formatIDRCompact(page.total), days: String(page.daysCount) }) : t(missingDays === 1 ? 'money.branch.total.missingOne' : 'money.branch.total.missingOther', { value: formatIDRCompact(page.total), days: String(page.daysCount), count: String(missingDays) })}</p>
      {page.margin && <ViewTabs
        ariaLabel={t('money.branch.plotViews')}
        tabs={[{ id: 'revenue', label: t('money.chart.legend.revenue') }, { id: 'margin', label: t('money.chart.legend.margin') }]}
        active={view}
        onChange={(id) => onPlotViewChange(id as 'revenue' | 'margin')}
        panelId={`${tabsId}-plot`}
      />}
      <div id={`${tabsId}-plot`} role="tabpanel" className="branch-day-workbench__chart">
        <DayRevenueChart days={page.days} selected={selected} onSelect={onSelect} label={t(margin ? 'money.chart.margin.label' : 'money.chart.label', { branch: page.name })} mode={margin ? 'margin' : 'revenue'} budget={margin && basis ? 1 - basis.budgetShare : null} />
      </div>
    </div>
    <aside className="branch-day-workbench__selected" aria-labelledby={`${tabsId}-selected`}>
      <h3 id={`${tabsId}-selected`}>{t('money.overview.selectedDay')}</h3>
      <div className="branch-day-workbench__day-nav">
        <Button variant="outline" className="branch-day-workbench__step" aria-label={t('money.branch.previousDay')} title={t('money.branch.previousDay')} aria-describedby={atFirst ? noteId : undefined} disabled={atFirst} onClick={() => onSelect(page.days[index - 1]?.date)}><StepIcon dir="prev" /></Button>
        <time dateTime={day?.date}>{day ? formatWeekdayDayMonth(day.date, locale) : ''}</time>
        <Button variant="outline" className="branch-day-workbench__step" aria-label={t('money.branch.nextDay')} title={t('money.branch.nextDay')} aria-describedby={atLatest ? noteId : undefined} disabled={atLatest} onClick={() => onSelect(page.days[index + 1]?.date)}><StepIcon dir="next" /></Button>
      </div>
      {(atFirst || atLatest) && <p id={noteId} className="branch-day-workbench__step-note">{t(atLatest ? 'money.branch.dayNote.latest' : 'money.branch.dayNote.first')}</p>}
      <dl className="branch-day-workbench__values">
        <div><dt>{t(margin ? 'money.chart.legend.margin' : 'money.chart.legend.revenue')}</dt><dd>{!day || (margin ? day.marginPct == null : day.value === null) ? t('money.table.notReceived') : margin ? formatPercent(day.marginPct!, 1) : formatIDR(day.value!)}</dd></div>
        <div><dt>{t(margin ? 'money.chart.legend.budget' : 'money.chart.legend.compare')}</dt><dd>{!day || (margin ? !basis : day.compare === null) ? t('money.table.notReceived') : margin ? formatPercent(1 - basis!.budgetShare, 1) : formatIDR(day.compare!)}</dd></div>
        {!margin && <div><dt>{t('money.table.col.vsWeekday')}</dt><dd><MoneyDelta value={dayChange} t={t} /></dd></div>}
      </dl>
      {page.margin && <div className="branch-day-workbench__basis">
        <div className="branch-day-workbench__basis-heading"><h3>{t('money.branch.margin.interimTitle')}</h3>{findingsLink}</div>
        {basis ? <>
          <dl className="branch-day-workbench__cost-facts">
            <div><dt>{t('money.branch.margin.stockShare')}</dt><dd>{formatPercent(basis.cogsShare, 1)}</dd></div>
            <div><dt>{t('money.branch.margin.recipeShare')}</dt><dd>{formatPercent(basis.budgetShare, 1)}</dd></div>
            <div><dt>{t('money.branch.margin.pointGap')}</dt><dd>{page.margin.cogsVsBudget === null ? t('money.table.notReceived') : <><MoneyPoints value={page.margin.cogsVsBudget} t={t} overIsBad /> <span className="branch-day-workbench__gap-word">{gapWord}</span></>}</dd></div>
            <div><dt>{t('money.table.col.coverage')}</dt><dd>{page.margin.coverage === null ? t('money.table.notReceived') : formatPercent(page.margin.coverage, 1)}</dd></div>
          </dl>
          <CogsMeter cogsShare={basis.cogsShare} budgetShare={basis.budgetShare} />
        </> : <p>{t('money.branch.margin.noBudget')}</p>}
        <p>{t('money.overview.posBasis')}</p>
      </div>}
    </aside>
  </section>
}
