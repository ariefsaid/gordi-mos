// PricingPage — /mos/plan/pricing (ADR-0022 D5). The pre-flight margin check: a candidate price × the
// LINKED certified budgeted COGS -> projected gross margin + margin-%. Read-only — MOS NEVER writes a
// price (the price still lands in ecommerce/POS). Fail-loud freshness/certification warning when the
// cost basis is stale or uncertified (anchor A7). Warn-only margin floor (D5/OQ-3).
//
// Design authority: docs/specs/plan-budget.spec.md + docs/plans/2026-07-07-plan-budget.md.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { PageFamilyFrame } from '@/shell/page-family-frame'
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
import { KPITile } from '@/components/dashboard/kpi-tile'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import { TextInput } from '@/components/ui/text-input'
import './pricing-page.css'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

// r5 F-1 (GUARD-R2 class, mirrors the Money head): while the count is unknown the
// head shows a quiet placeholder — never a stale bare digit or a '0' pill.
const HEAD_META_PLACEHOLDER = <span className="ch-meta-line tabular-nums">—</span>

export function PricingPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('nav.planPricing') }))

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
          title="No budgets captured yet"
          copy="Capture a budget scenario first (Plan → Budget creation), then run the pricing pre-flight against it."
        />
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
          {budgets.length} {budgets.length === 1 ? 'check' : 'checks'}
        </span>
      }
      state="read-only"
    >

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
            <TextInput
              id="pricing-candidate-price"
              label="Candidate price (Rp)"
              fullWidth
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
          // Metric summary rule (DESIGN.md, v4): one dense line, label:value pairs
          // (label at label size in muted-foreground, value at body-lg/600 tabular),
          // closed by a hairline — not the mono-text key:value strip this replaces.
          <div className="pp-meta">
            <span className="pp-meta-item">
              <span className="pp-meta-label">Budgeted COGS</span>
              <span className="pp-meta-value tabular">{formatIDR(budget.total_budgeted_cogs)}</span>
            </span>
            <span className="pp-meta-item">
              <span className="pp-meta-label">Basis as of</span>
              <span className="pp-meta-value tabular">{shortDate(budget.cost_basis_as_of)}</span>
            </span>
            {status && <FailLoudBadge status={status} />}
          </div>
        )}

        {status && !status.fresh && (
          // The specific reasons already surface in the FailLoudBadge above — this line
          // states the instruction only, so the reasons aren't printed twice on screen.
          <p className="pp-warn" role="alert" data-testid="pricing-freshness-warning">
            Do not price against this basis.
          </p>
        )}

        {margin && (
          // KPITile — the DESIGN.md "KPI Tile (signature)" primitive: this is a Money
          // surface's read-the-result moment (the pre-flight's computed answer), the
          // stated exception to the summary-rule/no-tiles-on-capture-surfaces default.
          <div className="pp-result" data-testid="pricing-result">
            <KPITile className="pp-result-tile" label="Gross margin" value={formatIDR(margin.margin)} />
            <KPITile
              className="pp-result-tile"
              label="Margin %"
              value={formatPct(margin.margin_pct)}
              delta={
                margin.below_floor
                  ? { text: `Below ${formatPct(MARGIN_FLOOR_PCT)} floor`, tone: 'destructive' }
                  : undefined
              }
              sub={margin.below_floor ? 'Warn-only — you set the price.' : undefined}
            />
          </div>
        )}
      </section>
    </PageFamilyFrame>
  )
}

// Cohesion-debt 2026-07-19, item #1: the basis date routes through the ONE
// canonical locale-aware date module — no per-page en-GB copy.
const shortDate = formatDayMonthYear
