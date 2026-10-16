import { useEffect, useMemo, useRef } from 'react'
import { getCoreRowModel, getSortedRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table'
import { useSearchParams } from 'react-router-dom'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Notice } from '@/components/ui/notice'
import { FINDING_CLASSES, FINDING_RULES, FINDING_COLUMNS, FINDING_SORT, findingKey, findingComparison, filterRecipeFindings } from '@/lib/recipe-findings'
import type { RecipeFindingsData, RecipeFinding } from '@/lib/db/recipe-findings'
import { formatDayMonthYear, formatWeekdayDayMonth, formatWibWeekdayTime } from '@/lib/format/date'
import { formatIDR } from '@/lib/format/money'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { Pill } from '@/components/ui/pill'
import { MoneyFilterChips, type MoneyChip } from '@/components/money/money-filter-chips'
import { useId } from 'react'
import './recipe-findings-workspace.css'

export function RecipeFindingsWorkspace({ data, status, onRetry, start, end }: {
  data: RecipeFindingsData | null
  status: string
  onRetry: () => void
  start: string
  end: string
}) {
  const t = useT()
  const { locale } = useI18n()
  const [params, setParams] = useSearchParams()
  // The open finding lives in the URL (`rf`) with the filters, so a reload or Back keeps it.
  const selectedKey = params.get('rf')
  const setSelectedKey = (key: string | null) => {
    // Read the live URL, not this render's copy: a tab or filter changed a moment ago must survive.
    const next = new URLSearchParams(window.location.search)
    if (key) next.set('rf', key); else next.delete('rf')
    setParams(next, { replace: true })
  }
  const filterId = useId()
  const filterSignature = [params.get('rf_class'), params.get('rf_rule'), params.get('rf_day'), params.get('rf_all')].join('|')
  const filtersSeen = useRef(filterSignature)
  const rows = useMemo(() => filterRecipeFindings(data?.rows ?? [], params), [data, params])
  const table = useReactTable({ data: rows, columns: FINDING_COLUMNS, state: { sorting: FINDING_SORT }, initialState: { pagination: { pageSize: 25 } }, autoResetPageIndex: false, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel() })
  const pageRows = table.getRowModel().rows.map(({ original }) => original)
  const selected = pageRows.find((row) => findingId(row) === selectedKey) ?? null
  // A changed filter closes the open finding and returns to page 1; a restored `rf` survives the first run.
  useEffect(() => {
    if (filtersSeen.current === filterSignature) return
    filtersSeen.current = filterSignature
    table.setPageIndex(0)
    if (selectedKey) setSelectedKey(null)
  }, [filterSignature]) // eslint-disable-line react-hooks/exhaustive-deps
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (key === 'clear') for (const name of ['rf_class', 'rf_rule', 'rf_day', 'rf_all', 'rf']) next.delete(name)
    else if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }
  const chips: MoneyChip[] = []
  if (params.get('rf_all') === '1') chips.push({ id: 'scope', label: `${t('money.findings.scope')}: ${t('money.findings.all')}`, onRemove: () => setFilter('rf_all', '') })
  if (params.get('rf_class')) chips.push({ id: 'class', label: `${t('money.findings.class')}: ${t(findingKey('class', params.get('rf_class')!))}`, onRemove: () => setFilter('rf_class', '') })
  if (params.get('rf_rule')) chips.push({ id: 'rule', label: `${t('money.findings.rule')}: ${t(findingKey('rule', params.get('rf_rule')!))}`, onRemove: () => setFilter('rf_rule', '') })
  if (params.get('rf_day')) chips.push({ id: 'day', label: `${t('money.branch.days.col.day')}: ${formatWeekdayDayMonth(params.get('rf_day')!, locale)}`, onRemove: () => setFilter('rf_day', '') })
  const receipt = data?.receipts[0]
  const complete = Boolean(data && receipt && data.receipts.every((r) => r.complete && r.window_start <= start && r.window_end >= end))

  if (status === 'error') return <section id="recipe-findings" className="recipe-findings" aria-labelledby="recipe-findings-title"><h2 id="recipe-findings-title">{t('money.findings.title')}</h2><ErrorState message={t('money.findings.error')} onRetry={onRetry} /></section>
  if (!data) return <section id="recipe-findings" className="recipe-findings" aria-labelledby="recipe-findings-title"><h2 id="recipe-findings-title">{t('money.findings.title')}</h2><p className="recipe-findings__context">{t('money.findings.context')}</p><div role="status" aria-label={t('common.loading')}><SkeletonRows count={3} /></div></section>

  return <section id="recipe-findings" className="recipe-findings" aria-labelledby="recipe-findings-title">
    <div className="recipe-findings__head"><div><h2 id="recipe-findings-title">{t('money.findings.title')}</h2><p>{t('money.findings.context')}</p></div><span className="recipe-findings__received">{receipt ? t('money.findings.received', { date: formatWeekdayDayMonth(receipt.snapshot_as_of.slice(0, 10), locale) }) : t('money.findings.notReceived')}</span></div>
    {data.receipts.some((r) => !r.complete || r.window_start > start || r.window_end < end) && <Notice tone="attention">{t('money.findings.incomplete')}</Notice>}
    <div className="recipe-findings__filters" aria-label={t('money.findings.filters')}>
      <Select id={`${filterId}-scope`} label={t('money.findings.scope')} value={params.get('rf_all') ?? ''} onChange={(e) => setFilter('rf_all', e.target.value)}><option value="">{t('money.findings.needsHuman')}</option><option value="1">{t('money.findings.all')}</option></Select>
      <Select id={`${filterId}-class`} label={t('money.findings.class')} value={params.get('rf_class') ?? ''} onChange={(e) => setFilter('rf_class', e.target.value)}><option value="">{t('money.findings.all')}</option>{FINDING_CLASSES.map((c) => <option key={c} value={c}>{t(findingKey('class', c))}</option>)}</Select>
      <Select id={`${filterId}-rule`} label={t('money.findings.rule')} value={params.get('rf_rule') ?? ''} onChange={(e) => setFilter('rf_rule', e.target.value)}><option value="">{t('money.findings.all')}</option>{FINDING_RULES.map((r) => <option key={r} value={r}>{t(findingKey('rule', r))}</option>)}</Select>
      <Select id={`${filterId}-day`} label={t('money.branch.days.col.day')} value={params.get('rf_day') ?? ''} onChange={(e) => setFilter('rf_day', e.target.value)}><option value="">{t('money.findings.all')}</option>{[...new Set(data.rows.map((r) => r.day))].sort().reverse().map((day) => <option key={day} value={day}>{formatWeekdayDayMonth(day, locale)}</option>)}</Select>
      <Button variant="outline" onClick={() => setFilter('clear', '')}>{t('money.findings.clear')}</Button>
    </div>
    <MoneyFilterChips chips={chips} />
    {pageRows.length ? <>
      <p className="recipe-findings__count" role="status">{t('money.findings.count', { count: String(table.getFilteredRowModel().rows.length), page: String(table.getState().pagination.pageIndex + 1) })}</p>
      <div className="recipe-findings__workspace">
        <div className={`recipe-findings__list${selected ? ' is-detail-open' : ''}`} aria-label={t('money.findings.results')}>
          {pageRows.map((row) => <FindingRow key={findingId(row)} row={row} selected={findingId(row) === selectedKey} onSelect={() => setSelectedKey(findingId(row))} />)}
          {table.getPageCount() > 1 && <div className="recipe-findings__pagination"><Button variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => { table.previousPage(); setSelectedKey(null) }}>{t('money.findings.previous')}</Button><Button variant="outline" disabled={!table.getCanNextPage()} onClick={() => { table.nextPage(); setSelectedKey(null) }}>{t('money.findings.next')}</Button></div>}
        </div>
        {selected ? <FindingDetail row={selected} onBack={() => setSelectedKey(null)} /> : <aside className="recipe-findings__instruction">{t('money.findings.select')}</aside>}
      </div>
    </> : complete ? <EmptyState variant="awaiting" title={data.rows.length ? t('money.findings.filtered') : t('money.findings.empty')} copy={t('money.findings.noLossClaim')} /> : <p>{t('money.findings.incomplete')}</p>}
  </section>
}

function findingId(row: RecipeFinding) { return `${row.esb_code}:${row.finding_id}` }
function FindingRow({ row, selected, onSelect }: { row: RecipeFinding; selected: boolean; onSelect: () => void }) {
  const t = useT()
  const { locale } = useI18n()
  return <button type="button" className="recipe-findings__row" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
    <span className="recipe-findings__identity"><time dateTime={row.day}>{formatWeekdayDayMonth(row.day, locale)}</time><strong>{row.menu_name ?? t('money.findings.noMenu')}</strong><span>{row.expected_name ?? row.actual_name ?? t('money.findings.noIngredient')}</span></span>
    <span className="recipe-findings__impact">{row.impact_idr === null ? t('money.findings.notQuantified') : <>{formatIDR(row.impact_idr)} · {t(findingKey('basis', row.impact_basis))}</>}</span>
    <span className="recipe-findings__classification"><Pill tone="neutral" dot={false}>{t(findingKey('class', row.classification))}</Pill><span>{t(findingKey('rule', row.rule))}</span></span>
  </button>
}
function FindingDetail({ row, onBack }: { row: RecipeFinding; onBack: () => void }) {
  const t = useT()
  const { locale } = useI18n()
  // Evidence times are WIB, like every other time in MOS; a missing one says so.
  const stamp = (iso: string | null) => iso ? formatWibWeekdayTime(iso, locale) : t('money.findings.unknown')
  return <article className="recipe-findings__detail" aria-label={t('money.findings.detail')}>
    <button type="button" className="recipe-findings__back" onClick={onBack}>{t('money.findings.back')}</button>
    <h3>{row.menu_name ?? t('money.findings.noMenu')} · {row.expected_name ?? row.actual_name ?? t('money.findings.noIngredient')}</h3>
    <dl className="recipe-findings__facts">
      <div><dt>{t('money.branch.days.col.day')}</dt><dd>{formatDayMonthYear(row.day, locale)}</dd></div>
      <div><dt>{t('money.findings.class')}</dt><dd>{t(findingKey('class', row.classification))}</dd></div>
      <div><dt>{t('money.findings.rule')}</dt><dd>{t(findingKey('rule', row.rule))}</dd></div>
      <div><dt>{t('money.findings.f.quantity')}</dt><dd>{findingComparison(row, t, locale)}</dd></div>
      <div><dt>{t('money.findings.f.impact')}</dt><dd>{row.impact_idr === null ? t('money.findings.notQuantified') : `${formatIDR(row.impact_idr)} · ${t(findingKey('basis', row.impact_basis))}`}</dd></div>
      <div><dt>{t('money.findings.nextCheckTitle')}</dt><dd>{row.recommended_check}</dd></div>
      <div><dt>{t('money.findings.f.cause')}</dt><dd className="recipe-findings__cause">{t(findingKey('cause', row.rule))}</dd></div>
      <div><dt>{t('money.findings.f.confidence')}</dt><dd>{t(row.confidence === 'evidenced_warehouse_policy' ? 'money.findings.evidenced' : 'money.findings.candidate')}</dd></div>
    </dl>
    {row.replica_stale && <p>{t('money.findings.stale')}</p>}
    <details><summary>{t('money.findings.evidence')}</summary>
      <p>{row.recipe_versions ? t('money.findings.version', { version: String(row.recipe_versions.version), date: formatWeekdayDayMonth(row.recipe_versions.first_seen, locale) }) : t('money.findings.noHistory')}</p>
      <p>{t('money.findings.recipeTiming', { edited: stamp(row.recipe_edited_at), observed: stamp(row.recipe_observed_at) })}</p><p>{t('money.findings.source', { checked: stamp(row.source_checked_at) })}</p><p>{t('money.findings.previousObservation', { time: stamp(row.prior_recipe_observed_at), sale: stamp(row.first_sale_at) })}</p>
      <details><summary>{t('money.findings.unitEvidence')}</summary><pre>{row.recipe_version_hash}{'\n'}{JSON.stringify(row.conversion_evidence, null, 2)}</pre></details>
    </details>
  </article>
}
