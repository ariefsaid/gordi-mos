// PricingPage — /mos/plan/pricing (ADR-0022 D5). The pre-flight margin check: a candidate price × the
// LINKED certified budgeted COGS -> projected gross margin + margin-%. Read-only — MOS NEVER writes a
// price (the price still lands in ecommerce/POS). Fail-loud freshness/certification warning when the
// cost basis is stale or uncertified (anchor A7). Warn-only margin floor (D5/OQ-3).
//
// Design authority: docs/specs/plan-budget.spec.md + docs/plans/2026-07-07-plan-budget.md.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useT } from '@/i18n/use-t'
import { formatDayMonthYear } from '@/lib/format/date'
import { listBudgets, getCertifiedMetric } from '@/lib/db/plan-budget'
import {
  projectMargin,
  assessCostStatus,
  formatIDR,
  formatPct,
  MARGIN_FLOOR_PCT,
  type BudgetRow,
  type CertifiedMetric,
} from '@/lib/plan-budget-logic'
import { FailLoudBadge } from '@/components/plan/fail-loud-badge'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import './pricing-page.css'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

export function PricingPage() {
  useDocumentTitle('Pricing pre-flight — Gordi MOS')
  const t = useT()

  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [metric, setMetric] = useState<CertifiedMetric | null>(null)
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('')
  const [priceText, setPriceText] = useState<string>('')

  const fetchAll = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const [b, m] = await Promise.all([listBudgets(), getCertifiedMetric('cogs.budgeted')])
      setBudgets(b)
      setMetric(m)
      setSelectedBudgetId((prev) => (prev && b.some((x) => x.id === prev) ? prev : b[0]?.id ?? ''))
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [])

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
      <PageFrame variant="data">
        <div role="status" aria-label="Loading" aria-busy="true">
          <SkeletonRows count={3} />
        </div>
      </PageFrame>
    )
  }
  if (load.kind === 'error') {
    return (
      <PageFrame variant="data">
        <PageHead variant="content" title={t('plan.pricing.title')} count={null} />
        <ErrorState
          message="Couldn't load budgets. Try again."
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      </PageFrame>
    )
  }
  if (budgets.length === 0) {
    return (
      <PageFrame variant="data">
        <PageHead variant="content" title={t('plan.pricing.title')} count={0} />
        <EmptyState
          title="No budgets captured yet"
          copy="Capture a budget scenario first (Plan → Budget creation), then run the pricing pre-flight against it."
        />
      </PageFrame>
    )
  }

  return (
    <PageFrame variant="data">
      <PageHead variant="content" title={t('plan.pricing.title')} count={budgets.length} />

      <section className="pp-section" aria-label="Pricing pre-flight">
        <p className="pp-help">
          Candidate price × the <strong>linked certified budgeted COGS</strong> → projected gross margin.
          Read-only — the actual price still lands in ecommerce/POS; MOS never writes it.
        </p>

        <div className="pp-form">
          <div className="pp-field">
            <label className="pp-label" htmlFor="pricing-budget-scenario">Budget scenario</label>
            <Select
              id="pricing-budget-scenario"
              fullWidth
              value={selectedBudgetId}
              onChange={(e) => setSelectedBudgetId(e.target.value)}
            >
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.menu_item_name} — {b.scenario_label} ({b.scenario_type})
                </option>
              ))}
            </Select>
          </div>
          <div className="pp-field">
            <label className="pp-label" htmlFor="pricing-candidate-price">Candidate price (Rp)</label>
            <input
              id="pricing-candidate-price"
              className="pp-input"
              inputMode="decimal"
              type="number"
              min={0}
              step="1000"
              placeholder="e.g. 45000"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
            />
          </div>
        </div>

        {budget && (
          <div className="pp-meta">
            <span className="pp-meta-item">
              Budgeted COGS: <span className="tabular">{formatIDR(budget.total_budgeted_cogs)}</span>
            </span>
            <span className="pp-meta-item">
              Basis as of: <span className="tabular">{shortDate(budget.cost_basis_as_of)}</span>
            </span>
            {status && <FailLoudBadge status={status} />}
          </div>
        )}

        {status && !status.fresh && (
          <p className="pp-warn" role="alert" data-testid="pricing-freshness-warning">
            Do not price against this basis — {status.reasons.join(' ')}
          </p>
        )}

        {margin && (
          <div className="pp-result" data-testid="pricing-result">
            <div className="pp-result-tile">
              <span className="pp-result-label">Gross margin</span>
              <span className="pp-result-value tabular">{formatIDR(margin.margin)}</span>
            </div>
            <div className="pp-result-tile">
              <span className="pp-result-label">Margin %</span>
              <span className="pp-result-value tabular">{formatPct(margin.margin_pct)}</span>
            </div>
            {margin.below_floor && margin.margin_pct !== null && (
              <p className="pp-floor-warn" role="status">
                Below the {formatPct(MARGIN_FLOOR_PCT)} margin floor — warn-only; you set the price.
              </p>
            )}
          </div>
        )}
      </section>
    </PageFrame>
  )
}

// Cohesion-debt 2026-07-19, item #1: the basis date routes through the ONE
// canonical locale-aware date module — no per-page en-GB copy.
const shortDate = formatDayMonthYear
