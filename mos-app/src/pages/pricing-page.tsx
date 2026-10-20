// PricingPage — /plan/pricing (ADR-0022 D5). The pre-flight margin check: a candidate price × the
// LINKED certified budgeted COGS -> projected gross margin + margin-%. Read-only — MOS NEVER writes a
// price (the price still lands in ecommerce/POS). Fail-loud freshness/certification warning when the
// cost basis is stale or uncertified (anchor A7). Warn-only margin floor (D5/OQ-3).
//
// Design authority: docs/specs/plan-budget.spec.md + docs/plans/2026-07-07-plan-budget.md.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useBudgetPages } from '@/hooks/use-budget-pages'
import { useT } from '@/i18n/use-t'
import { formatDayMonthYear } from '@/lib/format/date'
import { listBudgetsPage, getCertifiedMetric } from '@/lib/db/plan-budget'
import {
  projectMargin,
  assessCostStatus,
  formatIDR,
  formatPct,
  MARGIN_FLOOR_PCT,
  type CertifiedMetric,
} from '@/lib/plan-budget-logic'
import { FailLoudBadge } from '@/components/plan/fail-loud-badge'
import { KPITile } from '@/components/dashboard/kpi-tile'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { ListPaging } from '@/components/ui/list-paging'
import { Select } from '@/components/ui/select'
import { TextInput } from '@/components/ui/text-input'
import type { MessageKey } from '@/i18n/messages'
import './pricing-page.css'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

// r5 F-1 (GUARD-R2 class, mirrors the Money head): while the count is unknown the
// head shows a quiet placeholder — never a stale bare digit or a '0' pill.
const HEAD_META_PLACEHOLDER = <span className="ch-meta-line tabular-nums">—</span>

export function PricingPage() {
  const t = useT()
  const tx = (key: string) => t(key as MessageKey)
  useDocumentTitle(t('common.docTitle', { page: t('nav.planPricing') }))

  const {
    rows: budgets,
    hasMore: budgetsHasMore,
    loadingMore: loadingMoreBudgets,
    moreError: budgetsMoreError,
    invalidate: invalidateBudgetPages,
    replacePage: replaceBudgetPage,
    loadMore: loadMoreBudgetPage,
  } = useBudgetPages()
  const readGeneration = useRef(0)
  const [metric, setMetric] = useState<CertifiedMetric | null>(null)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('')
  const [priceText, setPriceText] = useState<string>('')

  const fetchAll = useCallback(async () => {
    const generation = ++readGeneration.current
    invalidateBudgetPages()
    setLoad({ kind: 'loading' })
    try {
      const [page, m] = await Promise.all([listBudgetsPage(), getCertifiedMetric('cogs.budgeted')])
      if (generation !== readGeneration.current) return
      replaceBudgetPage(page)
      setMetric(m)
      setSelectedBudgetId((prev) => (prev && page.rows.some((x) => x.id === prev) ? prev : page.rows[0]?.id ?? ''))
      setLoad({ kind: 'ready' })
    } catch {
      if (generation === readGeneration.current) setLoad({ kind: 'error' })
    }
  }, [invalidateBudgetPages, replaceBudgetPage])

  useEffect(() => {
    fetchAll()
  }, [fetchAll, retryKey])

  const budget = useMemo(
    () => budgets.find((b) => b.id === selectedBudgetId) ?? null,
    [budgets, selectedBudgetId],
  )
  const price = Number(priceText)
  const margin = useMemo(
    () => (budget && priceText !== '' && Number.isFinite(price) ? projectMargin(price, budget.total_budgeted_cogs) : null),
    [budget, price, priceText],
  )
  const status = useMemo(
    () =>
      budget
        ? assessCostStatus({
            costAsOf: budget.cost_basis_as_of,
            certified: metric?.certified ?? false,
            metricKey: metric?.key ?? null,
          })
        : null,
    [budget, metric],
  )

  if (load.kind === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={t('plan.pricing.title')} jobSentence={t('job.plan.pricing')} meta={HEAD_META_PLACEHOLDER} state="loading">
        <div role="status" aria-label="Loading" aria-busy="true">
          <SkeletonRows count={3} />
        </div>
      </PageFamilyFrame>
    )
  }
  if (load.kind === 'error') {
    return (
      <PageFamilyFrame family="workspace" title={t('plan.pricing.title')} jobSentence={t('job.plan.pricing')} meta={HEAD_META_PLACEHOLDER} state="error">
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.budgets') })}
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      </PageFamilyFrame>
    )
  }
  if (budgets.length === 0) {
    return (
      <PageFamilyFrame family="workspace" title={t('plan.pricing.title')} jobSentence={t('job.plan.pricing')} meta={HEAD_META_PLACEHOLDER} state="empty">
        <EmptyState
          title={tx('moneyB.pricing.noBudgetTitle')}
          copy={tx('moneyB.pricing.noBudget')}
        ><Link className="pp-budget-link" to="/money/budget">{tx('moneyB.pricing.createBudget')}</Link></EmptyState>
      </PageFamilyFrame>
    )
  }

  return (
    <PageFamilyFrame
      family="workspace"
      title={t('plan.pricing.title')}
      jobSentence={t('job.plan.pricing')}
     
      meta={
        // r5 F-1 (GUARD-R2 class): a labeled sentence, never a naked count pill.
        <span className="ch-meta-line tabular-nums">
          {t((budgets.length === 1 ? 'moneyB.pricing.count.one' : 'moneyB.pricing.count.other') as MessageKey, { count: String(budgets.length) })}
        </span>
      }
      // The pre-flight computes and never writes (ADR-0022 D5) — the family's read-only
      // state is the honest one, and it is what keeps a Save affordance from ever appearing.
      state="read-only"
    >

      <section className="pp-section" aria-label={tx('moneyB.pricing.title')}>
        <div className="pp-scope">
          <label className="pp-label" htmlFor="pricing-budget-scenario">{tx('moneyB.pricing.budgetScenario')}</label>
          <Select id="pricing-budget-scenario" fullWidth value={selectedBudgetId} onChange={(e) => setSelectedBudgetId(e.target.value)}>
            {budgets.map((b) => <option key={b.id} value={b.id}>{b.menu_item_name} — {b.scenario_label} ({tx(`moneyB.budget.type.${b.scenario_type === 'new_branch' ? 'newBranch' : b.scenario_type}`)})</option>)}
          </Select>
          <ListPaging count={budgets.length} hasMore={budgetsHasMore} loading={loadingMoreBudgets} error={budgetsMoreError}
            onLoadMore={() => { void loadMoreBudgetPage((cursor) => listBudgetsPage(undefined, cursor)) }} />
          {budget && <span className="pp-available">{t('moneyB.pricing.count.other' as MessageKey, { count: String(budgets.length) })}</span>}
        </div>

        {budget && status && <section className="pp-basis" aria-label={tx('moneyB.pricing.linkedBasis')}>
          <div className="pp-basis-values">
            <div><span>{tx('moneyB.pricing.budgetedCogs')}</span><strong className="tabular">{formatIDR(budget.total_budgeted_cogs)}</strong></div>
            <div><span>{tx('moneyB.pricing.basisDate')}</span><strong className="tabular">{budget.cost_basis_as_of ? shortDate(budget.cost_basis_as_of) : '—'}</strong></div>
            <FailLoudBadge status={status} />
          </div>
          {!status.fresh && <p className="pp-warn" role="alert" data-testid="pricing-freshness-warning">{tx('moneyB.pricing.staleWarning')}</p>}
          <Link className="pp-budget-link" to={`/money/budget?menu=${encodeURIComponent(budget.menu_item_esb_code)}&scenario=${encodeURIComponent(budget.id)}#captured-scenarios`}>{tx('moneyB.pricing.openBudgetContext')}</Link>
          <p className="pp-basis-trace">{t('moneyB.pricing.basisTrace' as MessageKey, { menu: budget.menu_item_name, scenario: budget.scenario_label, date: budget.cost_basis_as_of ? shortDate(budget.cost_basis_as_of) : '—' })}</p>
        </section>}

        <div className="pp-workspace">
          <div className="pp-candidate">
            <TextInput id="pricing-candidate-price" label={tx('moneyB.pricing.candidatePrice')} fullWidth inputMode="decimal" type="number" min={0} step="1000" placeholder="e.g. 45000" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
            <p className="pp-readonly">{tx('moneyB.pricing.readOnlyBoundary')}</p>
          </div>
          <section className="pp-result-region" aria-label={tx('moneyB.pricing.projectedResult')}>
            <h2>{tx('moneyB.pricing.projectedResult')}</h2>
            {margin && budget ? <div className="pp-result" data-testid="pricing-result">
              <KPITile className="pp-result-tile" label={tx('moneyB.pricing.grossMargin')} value={formatIDR(margin.margin)} asOf={budget.cost_basis_as_of ?? undefined} asOfPrefix={tx('moneyB.pricing.basisDate')} />
              <KPITile className="pp-result-tile" label={tx('moneyB.pricing.marginPct')} value={formatPct(margin.margin_pct)} delta={margin.below_floor ? { text: t('moneyB.pricing.belowFloor' as MessageKey, { floor: formatPct(MARGIN_FLOOR_PCT) }), tone: 'destructive' } : undefined} sub={margin.below_floor ? tx('moneyB.pricing.warnOnly') : tx('moneyB.pricing.formula')} asOf={budget.cost_basis_as_of ?? undefined} asOfPrefix={tx('moneyB.pricing.basisDate')} />
            </div> : <p className="pp-result-empty">{tx('moneyB.pricing.noCandidate')}</p>}
          </section>
        </div>
      </section>
    </PageFamilyFrame>
  )
}

// Cohesion-debt 2026-07-19, item #1: the basis date routes through the ONE
// canonical locale-aware date module — no per-page en-GB copy.
const shortDate = formatDayMonthYear
