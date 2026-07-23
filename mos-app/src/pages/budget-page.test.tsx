// BudgetPage tests — TDD (AC-tagged). Route /mos/plan/budget (finance/admin-gated at the router; this
// suite proves the page's OWN behavior once mounted): the linked BOM × cost lines -> budgeted COGS,
// the drill to the linked cost line (link-never-copy — AC-PB-007), the capture write shape
// (AC-PB-008), and the fail-loud badge on a stale cost basis.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PeopleRow } from '@/lib/database.types'

vi.mock('@/lib/db/plan-budget', () => ({
  listIngredientCostLines: vi.fn(),
  listBomLines: vi.fn(),
  listBudgets: vi.fn(),
  getCertifiedMetric: vi.fn(),
  captureBudget: vi.fn(),
}))
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn() }))

import {
  listIngredientCostLines,
  listBomLines,
  listBudgets,
  getCertifiedMetric,
  captureBudget,
} from '@/lib/db/plan-budget'
import { getBusinessUnits } from '@/lib/db/directory'
import { BudgetPage } from './budget-page'

const PERSON_ID = 'person-1'
const FRESH = '2026-07-01T00:00:00Z'
const STALE = '2026-01-01T00:00:00Z'

const viewerPerson: PeopleRow = {
  id: PERSON_ID,
  org_id: 'org-1',
  user_id: 'user-1',
  full_name: 'Fitri Finance',
  email: 'fitri@example.test',
  archived_at: null,
  created_at: '2026-07-06T00:00:00Z',
  updated_at: '2026-07-06T00:00:00Z',
}
const authed: AuthState = {
  status: 'authenticated',
  viewer: { person: viewerPerson, roles: [], isManager: false, accessRoles: ['finance'] },
  signOut: async () => {},
}

function renderPage() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authed}>
        <BudgetPage />
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCertifiedMetric).mockResolvedValue({ key: 'cogs.budgeted', name: 'Budgeted COGS', certified: true })
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Finance' }])
  vi.mocked(listBudgets).mockResolvedValue([])
})

describe('BudgetPage — phone table reflow (r5 F-7)', () => {
  it('r5 F-7: every bp-table sits in a .bp-table-scroll wrapper + the phone overflow rule is pinned — the page body never scrolls sideways', async () => {
    vi.mocked(listBomLines).mockResolvedValue([
      { menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-MILK', recipe_qty: 0.18, qty_unit: 'L' },
    ])
    vi.mocked(listIngredientCostLines).mockResolvedValue([
      { ingredient_esb_code: 'ING-MILK', name: 'Fresh Milk', unit_cost: 18000, unit: 'L', as_of: FRESH },
    ])
    renderPage()
    await screen.findAllByText(/Rp 3.240/)
    const tables = Array.from(document.querySelectorAll('.bp-table'))
    expect(tables.length).toBeGreaterThanOrEqual(2)
    for (const table of tables) {
      expect(table.parentElement?.classList.contains('bp-table-scroll')).toBe(true)
    }
    // Structural pin (jsdom computes no overflow layout — the stylesheet is the oracle).
    const css = readFileSync(resolve(process.cwd(), 'src/pages/budget-page.css'), 'utf8')
    const phone = css.split('@media (max-width: 767px)')[1] ?? ''
    expect(phone).toMatch(/\.bp-table-scroll\s*\{[^}]*overflow-x:\s*auto/)
  })
})

describe('BudgetPage — head (r5 F-9)', () => {
  it('r5 F-9: the head speaks the Budget-specific job sentence — never the shared job.money', async () => {
    vi.mocked(listBomLines).mockResolvedValue([])
    vi.mocked(listIngredientCostLines).mockResolvedValue([])
    renderPage()
    await screen.findByText(/no bom snapshot data/i)
    const head = screen.getByTestId('page-head')
    expect(head.textContent).toContain('Capture certified-cost budget scenarios pricing can trust.')
    expect(head.textContent).not.toContain('Trust the financial figures')
  })
})

describe('BudgetPage — states', () => {
  it('loading: shows a busy skeleton before data resolves', () => {
    vi.mocked(listBomLines).mockReturnValue(new Promise(() => {}))
    vi.mocked(listIngredientCostLines).mockResolvedValue([])
    renderPage()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: names the snapshot source without leaking internal schema strings', async () => {
    vi.mocked(listBomLines).mockResolvedValue([])
    vi.mocked(listIngredientCostLines).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/no bom snapshot data/i)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/reporting\.bom_lines/i)
  })

  it('error: retryable, non-secret', async () => {
    vi.mocked(listBomLines).mockRejectedValue(new Error('permission denied for table'))
    vi.mocked(listIngredientCostLines).mockResolvedValue([])
    renderPage()
    expect(await screen.findByRole('button', { name: /retry|try again/i })).toBeInTheDocument()
  })
})

describe('BudgetPage — populated (fresh + certified)', () => {
  beforeEach(() => {
    vi.mocked(listBomLines).mockResolvedValue([
      { menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-MILK', recipe_qty: 0.18, qty_unit: 'L' },
      { menu_item_esb_code: 'MENU-CAPPUC', ingredient_esb_code: 'ING-ESP', recipe_qty: 0.018, qty_unit: 'kg' },
    ])
    vi.mocked(listIngredientCostLines).mockResolvedValue([
      { ingredient_esb_code: 'ING-MILK', name: 'Fresh Milk', unit_cost: 18000, unit: 'L', as_of: FRESH },
      { ingredient_esb_code: 'ING-ESP', name: 'Espresso Beans', unit_cost: 320000, unit: 'kg', as_of: FRESH },
    ])
  })

  it('renders the budgeted COGS total (Σ qty × linked cost)', async () => {
    renderPage()
    // 0.18×18000 + 0.018×320000 = 3240 + 5760 = 9000
    // Cohesion-debt 2026-07-19, item #1: money now renders id-ID DOTS (Rp 9.000),
    // not en-US commas — the one canonical formatIDR (lib/format/money).
    expect(await screen.findByText(/Rp 9.000/)).toBeInTheDocument()
  })

  it('AC-PB-007: each BOM line shows a drill link to the linked cost line (link-never-copy)', async () => {
    renderPage()
    await screen.findByText(/Rp 9.000/)
    const drills = screen.getAllByTestId('drill-cost-line')
    expect(drills).toHaveLength(2)
    // The drill anchor resolves to the linked cost-line record by ingredient code.
    expect(drills[0].getAttribute('href')).toBe('#cost-line-ING-MILK')
  })

  it('AC-PB-007: the linked cost-line rows are present (the consumer reads the linked record, not a copy)', async () => {
    renderPage()
    await screen.findByText(/Rp 9.000/)
    const costRows = screen.getAllByTestId('cost-line-row')
    expect(costRows).toHaveLength(2)
    // The linked record's name renders in BOTH the BOM preview (resolved from the link) and the
    // cost-line table (the record itself) — both prove the consumer reads the linked record.
    expect(screen.getAllByText('Fresh Milk').length).toBeGreaterThanOrEqual(1)
  })

  it('AC-PB-006: a fresh + certified basis renders the healthy badge (no warning)', async () => {
    renderPage()
    await screen.findByText(/Rp 9.000/)
    expect(screen.getByText(/certified · fresh/i)).toBeInTheDocument()
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument()
  })

  it('uses the shared E7 text-field primitive for the scenario label', async () => {
    renderPage()
    const input = await screen.findByLabelText(/scenario label/i)
    expect(input).toHaveClass('mk-textinput__field')
    expect(input.closest('.mk-textinput')).toHaveClass('mk-textinput--full')
  })

  it('AC-PB-008: capture submits a budget with the linked shape (no unit cost on lines)', async () => {
    vi.mocked(captureBudget).mockResolvedValue('NEW-BUDGET')
    renderPage()
    await screen.findByText(/Rp 9.000/)
    fireEvent.click(screen.getByRole('button', { name: /capture budget/i }))
    await waitFor(() => expect(captureBudget).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(captureBudget).mock.calls[0][0]
    expect(arg.menuItemEsbCode).toBe('MENU-CAPPUC')
    // A5: the client no longer sends a computed COGS total — capture_budget recomputes it
    // server-side from the linked cost lines (link-never-copy). No totalBudgetedCogs on the input.
    expect('totalBudgetedCogs' in arg).toBe(false)
    expect(arg.isComplete).toBe(true)
    // link-never-copy: the lines carry ingredient + qty only — NO unit_cost field.
    for (const line of arg.lines) {
      expect(line).toHaveProperty('ingredient_esb_code')
      expect(line).toHaveProperty('recipe_qty')
      expect(Object.keys(line)).not.toContain('unit_cost')
    }
    expect(await screen.findByText(/saved scenario/i)).toBeInTheDocument()
  })
})

describe('BudgetPage — fail-loud freshness (AC-PB-006)', () => {
  it('renders a stale warning when a linked cost line is old', async () => {
    vi.mocked(listBomLines).mockResolvedValue([
      { menu_item_esb_code: 'MENU-CROISS', ingredient_esb_code: 'ING-BUTTER', recipe_qty: 0.04, qty_unit: 'kg' },
    ])
    vi.mocked(listIngredientCostLines).mockResolvedValue([
      { ingredient_esb_code: 'ING-BUTTER', name: 'Butter', unit_cost: 95000, unit: 'kg', as_of: STALE },
    ])
    renderPage()
    // The fail-loud badge surfaces the stale reason.
    expect(await screen.findByText(/stale/i)).toBeInTheDocument()
  })
})
