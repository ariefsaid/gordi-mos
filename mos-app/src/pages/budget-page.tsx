// BudgetPage — /mos/plan/budget (ADR-0022 D1/D3/D6). Finance captures a budget scenario: the menu
// item's BOM (read from ESB) costed at the LINKED ingredient cost lines -> the certified budgeted COGS.
// Read-and-budget only (no recipe edit, no ESB write). Consumers drill to the LINKED cost line, never a
// copy (anchor A5). Fail-loud badge when the cost basis is stale or uncertified (anchor A7).
//
// Design authority: docs/specs/plan-budget.spec.md + docs/plans/2026-07-07-plan-budget.md.
// States: loading skeleton, empty (no BOM), error+retry (non-secret), populated.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
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
import './budget-page.css'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' }

export function BudgetPage() {
  useDocumentTitle('Budget — Gordi MOS')
  const t = useT()
  const auth = useAuth()
  const personId = auth.status === 'authenticated' ? auth.viewer.person.id : ''

  const [bom, setBom] = useState<BomLine[]>([])
  const [costs, setCosts] = useState<IngredientCostLine[]>([])
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [metric, setMetric] = useState<CertifiedMetric | null>(null)
  const [bus, setBus] = useState<BusinessUnitOption[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [selectedMenu, setSelectedMenu] = useState<string>('')
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
      setSelectedMenu((prev) => (prev && menuCodes.includes(prev) ? prev : menuCodes[0] ?? ''))
      if (unitList.length > 0) setOwningBu((prev) => prev || unitList[0].id)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'error' })
    }
  }, [])

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
      setSaveError(e instanceof Error ? e.message : 'Capture failed.')
    } finally {
      setSaving(false)
    }
  }

  if (load.kind === 'loading') {
    return (
      <PageFrame variant="data">
        <div role="status" aria-label="Loading" aria-busy="true">
          <SkeletonRows count={4} />
        </div>
      </PageFrame>
    )
  }
  if (load.kind === 'error') {
    return (
      <PageFrame variant="data">
        <PageHead title={t('plan.budget.title')} />
        <ErrorState
          message="Couldn't load the BOM + ingredient cost lines. Try again."
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      </PageFrame>
    )
  }
  if (bom.length === 0) {
    return (
      <PageFrame variant="data">
        <PageHead title={t('plan.budget.title')} />
        <EmptyState
          title="No BOM snapshot data yet"
          copy="No BOM rows are available yet from reporting.bom_lines."
        />
      </PageFrame>
    )
  }

  return (
    <PageFrame variant="data">
      <PageHead title={t('plan.budget.title')} subtitle={t('plan.budget.subtitle')} />
      <section className="bp-section" aria-label="Menu item">
        <label className="bp-field">
          <span className="bp-label">Menu item</span>
          <select
            className="bp-select"
            value={selectedMenu}
            onChange={(e) => setSelectedMenu(e.target.value)}
          >
            {menuCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="bp-section bp-cogs" aria-label="Budgeted COGS preview">
        <div className="bp-cogs-head">
          <h2 className="bp-h2">Budgeted COGS (linked BOM × ingredient cost lines)</h2>
          <FailLoudBadge status={status} />
        </div>
        {cogs.total === null ? (
          <p className="bp-muted">No linked cost lines for this BOM — capture is unavailable.</p>
        ) : (
          <p className="bp-total tabular">
            {formatIDR(cogs.total)}
            {!cogs.complete && <span className="bp-incomplete"> · incomplete (a BOM line has no linked cost)</span>}
          </p>
        )}

        <table className="bp-table">
          <caption>BOM × linked ingredient cost lines — the cost is resolved from the linked record, never copied</caption>
          <thead>
            <tr>
              <th scope="col">Ingredient</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit cost (linked)</th>
              <th scope="col">As of</th>
              <th scope="col">Line total</th>
            </tr>
          </thead>
          <tbody>
            {cogs.lines.map((l) => (
              <tr
                key={l.ingredient_esb_code}
                data-testid="budget-bom-line"
                data-ingredient={l.ingredient_esb_code}
              >
                <th scope="row">
                  <span className="bp-ing-name">{l.ingredient_name}</span>
                  <span className="bp-ing-code">{l.ingredient_esb_code}</span>
                </th>
                <td className="tabular">
                  {l.recipe_qty} {l.qty_unit}
                </td>
                <td className="tabular">
                  {l.unit_cost !== null ? (
                    <a
                      className="bp-cost-link"
                      href={`#cost-line-${l.ingredient_esb_code}`}
                      aria-label={`Linked cost line for ${l.ingredient_name}`}
                      data-testid="drill-cost-line"
                    >
                      {formatIDR(l.unit_cost)}
                    </a>
                  ) : (
                    <span className="bp-muted">no linked cost line</span>
                  )}
                </td>
                <td className="tabular">{l.cost_as_of ? shortDate(l.cost_as_of) : '—'}</td>
                <td className="tabular">{l.line_total !== null ? formatIDR(l.line_total) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bp-section bp-capture" aria-label="Capture budget scenario">
        <h2 className="bp-h2">Capture a budget scenario</h2>
        <p className="bp-help">
          MOS reads the BOM + cost lines and captures this as the certified budgeted COGS pricing links to
          (never a forked copy). The actual price still lands in ecommerce/POS — MOS never writes it.
        </p>
        <div className="bp-form">
          <label className="bp-field">
            <span className="bp-label">Scenario label</span>
            <input
              className="bp-input"
              value={scenarioLabel}
              onChange={(e) => setScenarioLabel(e.target.value)}
            />
          </label>
          <label className="bp-field">
            <span className="bp-label">Scenario type</span>
            <select
              className="bp-select"
              value={scenarioType}
              onChange={(e) => setScenarioType(e.target.value as BudgetRow['scenario_type'])}
            >
              <option value="baseline">Baseline</option>
              <option value="promo">Promo</option>
              <option value="new_branch">New branch</option>
              <option value="menu">Menu</option>
            </select>
          </label>
          <label className="bp-field">
            <span className="bp-label">Owning business unit</span>
            <select
              className="bp-select"
              value={owningBu}
              onChange={(e) => setOwningBu(e.target.value)}
            >
              {bus.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <div className="bp-field bp-actions">
            <Button onClick={handleCapture} disabled={!canCapture}>
              {saving ? 'Capturing…' : 'Capture budget'}
            </Button>
            {savedId && <span className="bp-saved">Saved scenario.</span>}
            {saveError && <span className="bp-error" role="alert">{saveError}</span>}
          </div>
        </div>
      </section>

      <section className="bp-section bp-scenarios" aria-label="Captured scenarios">
        <h2 className="bp-h2">Captured scenarios for {selectedMenu}</h2>
        {budgets.length === 0 ? (
          <p className="bp-muted">No scenarios captured yet for this menu item.</p>
        ) : (
          <table className="bp-table">
            <caption>Scenario comparison — the certified baseline plus what-if captures, one linked record each</caption>
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Type</th>
                <th scope="col">Budgeted COGS</th>
                <th scope="col">Basis as of</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id} data-testid="budget-scenario-row">
                  <th scope="row">{b.scenario_label}</th>
                  <td>{b.scenario_type}</td>
                  <td className="tabular">{formatIDR(b.total_budgeted_cogs)}</td>
                  <td className="tabular">{shortDate(b.cost_basis_as_of)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Drill targets — the linked ingredient cost lines (anchor A5: the consumer reads the linked
          record, not a copy). Anchored here so the drill link resolves to the live certified record. */}
      <section className="bp-section bp-costlines" aria-label="Linked ingredient cost lines">
        <h2 className="bp-h2">Linked ingredient cost lines</h2>
        <p className="bp-help">
          Finance + Procurement own these. A budget links them by esb code; the unit cost shown is read
          from this record, never copied. (Trend + Normal-market-variation alerts are a deferred layer.)
        </p>
        <table className="bp-table">
          <caption>Ingredient cost lines (basis ESB last_hpp)</caption>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Name</th>
              <th scope="col">Unit cost</th>
              <th scope="col">As of</th>
            </tr>
          </thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.ingredient_esb_code} id={`cost-line-${c.ingredient_esb_code}`} data-testid="cost-line-row">
                <th scope="row">{c.ingredient_esb_code}</th>
                <td>{c.name}</td>
                <td className="tabular">{formatIDR(c.unit_cost)}/{c.unit}</td>
                <td className="tabular">{shortDate(c.as_of)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PageFrame>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
