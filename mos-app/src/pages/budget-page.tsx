// BudgetPage — /plan/budget (ADR-0022 D1/D3/D6). Finance captures a budget scenario: the menu
// item's BOM (read from ESB) costed at the LINKED ingredient cost lines -> the certified budgeted COGS.
// Read-and-budget only (no recipe edit, no ESB write). Consumers drill to the LINKED cost line, never a
// copy (anchor A5). Fail-loud badge when the cost basis is stale or uncertified (anchor A7).
//
// Design authority: docs/specs/plan-budget.spec.md + docs/plans/2026-07-07-plan-budget.md.
// States: loading skeleton, empty (no BOM), error+retry (non-secret), populated.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsRecordSplit } from '@/shell/use-is-split-width'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { saveErrorMessage } from '@/lib/save-error'
import { formatDayMonthYear } from '@/lib/format/date'
import { getBusinessUnits, type BusinessUnitOption } from '@/lib/db/directory'
import {
  listIngredientCostLines,
  listBomLines,
  listBudgets,
  getCertifiedMetric,
  captureBudget,
} from '@/lib/db/plan-budget'
import {
  computeBudgetedCogs,
  assessCostStatus,
  formatIDR,
  type IngredientCostLine,
  type BomLine,
  type BudgetRow,
  type CertifiedMetric,
} from '@/lib/plan-budget-logic'
import { FailLoudBadge } from '@/components/plan/fail-loud-badge'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { TextInput } from '@/components/ui/text-input'
import { LinkedCostPanel } from '@/components/money/linked-cost-panel'
import type { MessageKey } from '@/i18n/messages'
import './budget-page.css'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

// r5 F-1 (GUARD-R2 class, mirrors the Money head): while the count is unknown the
// head shows a quiet placeholder — never a stale bare digit or a '0' pill.
const HEAD_META_PLACEHOLDER = <span className="ch-meta-line tabular-nums">—</span>

export function BudgetPage() {
  const t = useT()
  const isWide = useIsRecordSplit()
  const [searchParams] = useSearchParams()
  const requestedMenu = searchParams.get('menu') ?? ''
  const requestedScenario = searchParams.get('scenario') ?? ''
  const [selectedCost, setSelectedCost] = useState<IngredientCostLine | null>(null)
  const [costsOpen, setCostsOpen] = useState(false)
  const [focusedScenario, setFocusedScenario] = useState(false)
  const tx = (key: string) => t(key as MessageKey)
  useDocumentTitle(t('common.docTitle', { page: t('plan.budget.title') }))
  const auth = useAuth()
  const personId = auth.status === 'authenticated' ? auth.viewer.person.id : ''

  const [bom, setBom] = useState<BomLine[]>([])
  const [costs, setCosts] = useState<IngredientCostLine[]>([])
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [metric, setMetric] = useState<CertifiedMetric | null>(null)
  const [bus, setBus] = useState<BusinessUnitOption[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [selectedMenu, setSelectedMenu] = useState<string>(requestedMenu)
  const [scenarioLabel, setScenarioLabel] = useState('Baseline')
  const [scenarioType, setScenarioType] = useState<BudgetRow['scenario_type']>('baseline')
  const [owningBu, setOwningBu] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoad({ kind: 'loading' })
    setSaveError(null)
    try {
      const [b, c, m, unitList] = await Promise.all([
        listBomLines(),
        listIngredientCostLines(),
        getCertifiedMetric('cogs.budgeted'),
        getBusinessUnits(),
      ])
      setBom(b)
      setCosts(c)
      setMetric(m)
      setBus(unitList)
      const menuCodes = Array.from(new Set(b.map((x) => x.menu_item_esb_code))).sort()
      setSelectedMenu((prev) => (prev && menuCodes.includes(prev) ? prev : requestedMenu && menuCodes.includes(requestedMenu) ? requestedMenu : menuCodes[0] ?? ''))
      if (unitList.length > 0) setOwningBu((prev) => prev || unitList[0].id)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [requestedMenu])

  useEffect(() => {
    fetchAll()
  }, [fetchAll, retryKey])

  // Refresh the scenario list whenever the selected menu changes (or after a save).
  useEffect(() => {
    if (!selectedMenu) {
      setBudgets([])
      return
    }
    let active = true
    listBudgets(selectedMenu)
      .then((rows) => {
        if (active) setBudgets(rows)
      })
      .catch(() => {
        if (active) setBudgets([])
      })
    return () => {
      active = false
    }
  }, [selectedMenu, savedId])

  const menuCodes = useMemo(
    () => Array.from(new Set(bom.map((x) => x.menu_item_esb_code))).sort(),
    [bom],
  )
  const selectedBom = useMemo(
    () => bom.filter((b) => b.menu_item_esb_code === selectedMenu),
    [bom, selectedMenu],
  )
  const cogs = useMemo(
    () => computeBudgetedCogs(selectedBom, costs),
    [selectedBom, costs],
  )
  const status = useMemo(
    () =>
      assessCostStatus({
        costAsOf: cogs.basis_as_of,
        certified: metric?.certified ?? false,
        metricKey: metric?.key ?? null,
      }),
    [cogs.basis_as_of, metric],
  )

  useEffect(() => {
    if (load.kind !== 'ready') return
    const costCode = window.location.hash.startsWith('#cost-line-') ? window.location.hash.slice('#cost-line-'.length) : ''
    const linkedCost = costs.find((cost) => cost.ingredient_esb_code === costCode)
    if (linkedCost) {
      setCostsOpen(true)
      setSelectedCost(linkedCost)
      window.requestAnimationFrame(() => document.getElementById(`cost-line-${costCode}`)?.focus())
    }
  }, [costs, load.kind])

  useEffect(() => {
    if (!requestedScenario || budgets.length === 0 || focusedScenario) return
    const row = document.getElementById(`budget-scenario-${CSS.escape(requestedScenario)}`)
    if (!row) return
    setFocusedScenario(true)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#captured-scenarios`)
    window.requestAnimationFrame(() => row.scrollIntoView({ block: 'center' }))
  }, [budgets, focusedScenario, requestedScenario])

  const canCapture =
    !!selectedMenu &&
    cogs.total !== null &&
    cogs.complete &&
    !!owningBu &&
    !!personId &&
    !saving

  async function handleCapture() {
    if (!canCapture || cogs.total === null) return
    setSaving(true)
    setSaveError(null)
    setSavedId(null)
    try {
      const id = await captureBudget({
        menuItemEsbCode: selectedMenu,
        menuItemName: selectedMenu,
        scenarioLabel,
        scenarioType,
        owningBuId: owningBu,
        costBasisAsOf: cogs.basis_as_of ?? new Date().toISOString(),
        isComplete: cogs.complete,
        lines: selectedBom.map((b) => ({
          ingredient_esb_code: b.ingredient_esb_code,
          recipe_qty: b.recipe_qty,
          qty_unit: b.qty_unit,
        })),
      })
      setSavedId(id)
    } catch (e) {
      setSaveError(saveErrorMessage(e, t))
    } finally {
      setSaving(false)
    }
  }

  if (load.kind === 'loading') {
    return (
      <PageFamilyFrame family="workspace" title={t('plan.budget.title')} jobSentence={t('job.plan.budget')} meta={HEAD_META_PLACEHOLDER} state="loading">
        <div role="status" aria-label="Loading" aria-busy="true">
          <SkeletonRows count={4} />
        </div>
      </PageFamilyFrame>
    )
  }
  if (load.kind === 'error') {
    return (
      <PageFamilyFrame family="workspace" title={t('plan.budget.title')} jobSentence={t('job.plan.budget')} meta={HEAD_META_PLACEHOLDER} state="error">
        <ErrorState
          message={t('common.loadFailed', { what: t('common.what.costLines') })}
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      </PageFamilyFrame>
    )
  }
  if (bom.length === 0) {
    return (
      <PageFamilyFrame family="workspace" title={t('plan.budget.title')} jobSentence={t('job.plan.budget')} meta={HEAD_META_PLACEHOLDER} state="empty">
        <EmptyState
          title={tx('moneyB.budget.noBomTitle')}
          copy={tx('moneyB.budget.noBomCopy')}
        />
      </PageFamilyFrame>
    )
  }

  return (
    <PageFamilyFrame
      family="workspace"
      title={t('plan.budget.title')}
      jobSentence={t('job.plan.budget')}
     
      meta={
        // r5 F-1 (GUARD-R2 class): a labeled sentence, never a naked count pill.
        <span className="ch-meta-line tabular-nums">
          {t((budgets.length === 1 ? 'moneyB.budget.scenarioCount.one' : 'moneyB.budget.scenarioCount.other') as MessageKey, { count: String(budgets.length) })}
        </span>
      }
      state={saving ? 'saving' : savedId ? 'saved' : saveError ? 'validation' : 'default'}
    >
      <div className={`bp-page-layout${selectedCost && isWide ? ' record-split' : ''}`}>
      <div className="bp-page-main">
      <section className="bp-menu-scope">
        <label className="bp-label" htmlFor="budget-menu-item">{tx('moneyB.budget.menuItem')}</label>
        <Select id="budget-menu-item" fullWidth value={selectedMenu} onChange={(e) => setSelectedMenu(e.target.value)}>
          {menuCodes.map((code) => <option key={code} value={code}>{code}</option>)}
        </Select>
      </section>

      <div className="bp-workspace">
        <section className="bp-readiness" aria-label="Budgeted COGS preview">
          <div className="bp-cogs-head">
            <h2 className="bp-h2">{tx('moneyB.budget.readiness')}</h2>
            <FailLoudBadge status={status} />
          </div>
          <p className="bp-basis-date">{t('moneyB.budget.basisAsOf' as MessageKey, { date: cogs.basis_as_of ? shortDate(cogs.basis_as_of) : '—' })}</p>
          {cogs.total === null ? <p className="bp-muted">{tx('moneyB.budget.noLinkedCosts')}</p> : (
            <p className="bp-total tabular">{formatIDR(cogs.total)} {!cogs.complete && <span className="bp-incomplete">· {tx('moneyB.budget.incomplete')}</span>}</p>
          )}
        </section>

        <section className="bp-capture" aria-label="Capture budget scenario">
          <h2 className="bp-h2">{tx('moneyB.budget.captureHeading')}</h2>
          <p className="bp-help">{tx('moneyB.budget.captureHelp')}</p>
          <p className="bp-selected-menu">{t('moneyB.budget.selectedMenu' as MessageKey, { menu: selectedMenu })}</p>
          <div className="bp-form">
            <TextInput id="budget-scenario-label" label={tx('moneyB.budget.scenarioLabel')} fullWidth value={scenarioLabel} onChange={(e) => setScenarioLabel(e.target.value)} />
            <div className="bp-field">
              <label className="bp-label" htmlFor="budget-scenario-type">{tx('moneyB.budget.scenarioType')}</label>
              <Select id="budget-scenario-type" fullWidth value={scenarioType} onChange={(e) => setScenarioType(e.target.value as BudgetRow['scenario_type'])}>
                <option value="baseline">{tx('moneyB.budget.type.baseline')}</option><option value="promo">{tx('moneyB.budget.type.promo')}</option><option value="new_branch">{tx('moneyB.budget.type.newBranch')}</option><option value="menu">{tx('moneyB.budget.type.menu')}</option>
              </Select>
            </div>
            <div className="bp-field">
              <label className="bp-label" htmlFor="budget-owning-bu">{tx('moneyB.budget.owningBU')}</label>
              <Select id="budget-owning-bu" fullWidth value={owningBu} onChange={(e) => setOwningBu(e.target.value)}>
                {bus.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
            <div className="bp-field bp-actions">
              <Button onClick={handleCapture} disabled={!canCapture}>{saving ? tx('moneyB.budget.capturing') : tx('moneyB.budget.capture')}</Button>
              {savedId && <span className="bp-saved" role="status">{tx('moneyB.budget.saved')}</span>}
              {saveError && <span className="bp-error" role="alert">{saveError}</span>}
              {!canCapture && !saving && <p className="bp-muted">{tx('moneyB.budget.captureNeeds')}</p>}
            </div>
          </div>
        </section>

        <section className="bp-bom" aria-label="Linked BOM evidence">
          <h2 className="bp-h2">{tx('moneyB.budget.linkedBom')}</h2>
          <div className="bp-table-scroll">
            <table className="bp-table bp-table--bom">
              <caption>{tx('moneyB.budget.bomCaption')}</caption>
              <thead><tr><th scope="col">{tx('moneyB.budget.ingredient')}</th><th scope="col">{tx('moneyB.budget.quantity')}</th><th scope="col">{tx('moneyB.budget.unitCost')}</th><th scope="col">{tx('moneyB.linkedCost.asOf')}</th><th scope="col">{tx('moneyB.budget.lineTotal')}</th></tr></thead>
              <tbody>{cogs.lines.map((line) => {
                const cost = costs.find((entry) => entry.ingredient_esb_code === line.ingredient_esb_code)
                return <tr key={line.ingredient_esb_code} data-testid="budget-bom-line" data-ingredient={line.ingredient_esb_code}>
                  <th scope="row"><span className="bp-ing-name">{line.ingredient_name}</span><span className="bp-ing-code">{line.ingredient_esb_code}</span></th>
                  <td className="tabular"><span className="bp-mobile-label">{tx('moneyB.budget.quantity')}</span>{line.recipe_qty} {line.qty_unit}</td>
                  <td className="tabular"><span className="bp-mobile-label">{tx('moneyB.budget.unitCost')}</span>{cost ? <a className="bp-cost-link" href={`#cost-line-${line.ingredient_esb_code}`} aria-label={`Linked cost line for ${line.ingredient_name}`} data-testid="drill-cost-line" onClick={(event) => { event.preventDefault(); window.history.pushState(null, '', `#cost-line-${line.ingredient_esb_code}`); setCostsOpen(true); setSelectedCost(cost) }}>{formatIDR(line.unit_cost!)}</a> : <span className="bp-muted">{tx('moneyB.budget.noLinkedCost')}</span>}</td>
                  <td className="tabular"><span className="bp-mobile-label">{tx('moneyB.linkedCost.asOf')}</span>{line.cost_as_of ? shortDate(line.cost_as_of) : '—'}</td>
                  <td className="tabular"><span className="bp-mobile-label">{tx('moneyB.budget.lineTotal')}</span>{line.line_total !== null ? formatIDR(line.line_total) : '—'}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
        </section>
      </div>

      <section id="captured-scenarios" className="bp-section bp-scenarios" aria-label="Captured scenarios">
        <h2 className="bp-h2">{t('moneyB.budget.scenariosFor' as MessageKey, { menu: selectedMenu })}</h2>
        {budgets.length === 0 ? <p className="bp-muted">{tx('moneyB.budget.noScenarios')}</p> : (
          <div className="bp-table-scroll"><table className="bp-table">
            <caption>{tx('moneyB.budget.scenarioCaption')}</caption>
            <thead><tr><th scope="col">{tx('moneyB.budget.scenario')}</th><th scope="col">{tx('moneyB.budget.type')}</th><th scope="col">{tx('moneyB.budget.readiness')}</th><th scope="col">{tx('moneyB.budget.basisAsOfColumn')}</th></tr></thead>
            <tbody>{budgets.map((budget) => <tr key={budget.id} id={`budget-scenario-${budget.id}`} data-testid="budget-scenario-row">
              <th scope="row">{budget.scenario_label}</th><td>{budget.scenario_type}</td><td className="tabular">{formatIDR(budget.total_budgeted_cogs)}</td><td className="tabular">{shortDate(budget.cost_basis_as_of)}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="bp-section bp-costlines">
        <button className="bp-costlines-toggle" type="button" aria-expanded={costsOpen} aria-controls="budget-cost-catalogue" onClick={() => setCostsOpen((open) => !open)}>{tx('moneyB.budget.costCatalogue')} <span aria-hidden="true">{costsOpen ? '−' : '+'}</span></button>
        <p className="bp-help">{tx('moneyB.budget.costCatalogueHelp')}</p>
        {costsOpen && <div id="budget-cost-catalogue" className="bp-table-scroll">
          <table className="bp-table"><caption>{tx('moneyB.budget.costCatalogueCaption')}</caption>
            <thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Unit cost</th><th scope="col">As of</th></tr></thead>
            <tbody>{costs.map((cost) => <tr key={cost.ingredient_esb_code} id={`cost-line-${cost.ingredient_esb_code}`} tabIndex={-1} data-testid="cost-line-row">
              <th scope="row">{cost.ingredient_esb_code}</th><td>{cost.name}</td><td className="tabular">{formatIDR(cost.unit_cost)}/{cost.unit}</td><td className="tabular">{shortDate(cost.as_of)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      </div>
      {selectedCost && <LinkedCostPanel cost={selectedCost} onClose={() => setSelectedCost(null)} />}
      </div>
    </PageFamilyFrame>
  )
}

// Cohesion-debt 2026-07-19, item #1: the basis date routes through the ONE
// canonical locale-aware date module — no per-page en-GB copy.
const shortDate = formatDayMonthYear
