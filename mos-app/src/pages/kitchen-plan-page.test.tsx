// KitchenPlanPage tests — TDD, AC-tagged.
// S2 — /mos/kitchen/plan — the plan EDITOR (ops_lead/admin) + the read-only
// 14-day "pesanan" HORIZON (member). Design authority: design-plan §S2.
// Proves (unit): AC-024 (member sees the 14-day forward horizon read-only — no
// logging/approve affordance), FR-030/031 (ops_lead edits a cell → upsert, the
// payload sends qty_porsi, never org_id/plan_by). Covers every state: loading,
// empty, error+retry, saving/saved, offline, member-read-only, unauthenticated.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return { ...actual, listActiveWipItems: vi.fn() }
})
import { listActiveWipItems } from '@/lib/db/kitchen-logs'

vi.mock('@/lib/db/kitchen-plans', () => ({
  listKitchenPlans: vi.fn(),
  listPesanan: vi.fn(),
  upsertKitchenPlan: vi.fn(),
}))
import { listKitchenPlans, listPesanan, upsertKitchenPlan } from '@/lib/db/kitchen-plans'

import { KitchenPlanPage } from './kitchen-plan-page'
import type { WipItemOption, PlanCell, PesananRow } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockItems = vi.mocked(listActiveWipItems)
const mockPlans = vi.mocked(listKitchenPlans)
const mockPesanan = vi.mocked(listPesanan)
const mockUpsert = vi.mocked(upsertKitchenPlan)

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Dina',
        email: 'dina@gordi.id', archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles,
    },
    signOut: vi.fn(),
  } as AuthState
}

const ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
  { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
]
const PLAN_CELLS: PlanCell[] = [
  { id: 'pl1', wip_item_id: 'w1', action_type: 'Production', qty_porsi: 12 },
]
const PESANAN: PesananRow[] = [
  { log_date: '2026-06-21', wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', action_type: 'Production', qty_porsi: 12 },
  { log_date: '2026-06-28', wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', action_type: 'Production', qty_porsi: 8 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(viewer(['ops_lead']))
  mockItems.mockResolvedValue(ITEMS)
  mockPlans.mockResolvedValue([])
  mockPesanan.mockResolvedValue([])
  mockUpsert.mockResolvedValue('new-id')
})

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('KitchenPlanPage — auth', () => {
  it('auth loading: shows a busy state', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as AuthState)
    render(<KitchenPlanPage />)
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('unauthenticated: prompts sign-in, never reads', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' } as AuthState)
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/plan']}>
        <KitchenPlanPage />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router (basename applied) — not a raw href that skips /mos
    expect(link).toHaveAttribute('href', '/mos/login')
    expect(mockPlans).not.toHaveBeenCalled()
    expect(mockPesanan).not.toHaveBeenCalled()
  })
})

// ── ops_lead → editor mode (FR-030/031) ───────────────────────────────────────
describe('KitchenPlanPage — ops_lead editor (FR-030/031)', () => {
  it('loads active items + the date plan; renders one editable qty per item', async () => {
    mockPlans.mockResolvedValue(PLAN_CELLS)
    render(<KitchenPlanPage />)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    await waitFor(() => expect(mockPlans).toHaveBeenCalled())
    // editable qty inputs exist (the editor affordance) — one per item
    expect(screen.getAllByRole('spinbutton').length).toBeGreaterThanOrEqual(2)
    // pre-filled with the existing plan qty for Ayam Bakar / Production
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue(12)
  })

  it('FR-031: editing a cell + save calls upsertKitchenPlan with qty_porsi (no org_id/plan_by)', async () => {
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled())
    const arg = mockUpsert.mock.calls[0][0]
    expect(arg.qty_porsi).toBe(15)
    expect(arg.wip_item_id).toBe('w1')
    expect(arg.action_type).toBe('Production')
    expect(Object.keys(arg)).not.toContain('org_id')
    expect(Object.keys(arg)).not.toContain('plan_by')
  })

  it('does not save when the value is unchanged (no needless write)', async () => {
    mockPlans.mockResolvedValue(PLAN_CELLS)
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.blur(input) // blur with the same value 12
    await new Promise(r => setTimeout(r, 0))
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('shows a quiet saved confirmation after a successful save (no view transition)', async () => {
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
    // still on the editor (Ayam Bakar still visible) — no navigation
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
  })

  it('save error: surfaces a message, keeps the edit on screen', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('denied'))
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledOnce()
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save|denied|try again/i)
    })
    // the edited row must still be on screen — no navigation on error
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
  })

  it('empty: ops_lead sees an editable blank grid (items, all qty 0) — not "no plan"', async () => {
    mockPlans.mockResolvedValue([])
    render(<KitchenPlanPage />)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue(0)
  })

  it('error + retry: surfaces a retry that re-fetches', async () => {
    mockItems.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(ITEMS)
    render(<KitchenPlanPage />)
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
  })

  it('offline: edits blocked + a banner (online-only writes, NFR-008)', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    expect(input).toBeDisabled()
    spy.mockRestore()
  })
})

// ── C5: editor new-behavior (KPI strip + reflow branch + category grouping) ─────
describe('KitchenPlanPage — editor redesign (OD-K-5 §4)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(viewer(['ops_lead']))
    mockPlans.mockResolvedValue(PLAN_CELLS)
  })
  // Restore the default phone matchMedia stub after any desktop override so test
  // order can't leak the branch (mirrors the log page test's afterEach).
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  it('renders the derived KPI strip with the planned total (Σ qty_porsi for the action)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query === '(min-width: 768px)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    // PLAN_CELLS has one Production cell: Ayam Bakar qty 12 → planned total = 12
    const region = screen.getByRole('region', { name: /plan vs actual summary/i })
    expect(region).toHaveTextContent('12')
  })

  it('groups dishes by category (F2 categories render as group headers)', async () => {
    const { container } = render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    // ITEMS both carry category 'Main' → one group header 'Main' (phone-default cards)
    const labels = Array.from(container.querySelectorAll('.kgh-label')).map(el => el.textContent)
    expect(labels).toContain('Main')
  })

  it('phone (default matchMedia): renders the cards branch, NOT the desktop table', async () => {
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    // the desktop table aria-label is absent on phone (one branch in the DOM — P-4)
    expect(screen.queryByRole('table', { name: /kitchen plan/i })).toBeNull()
  })

  it('desktop matchMedia: renders the table branch, NOT the cards', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query === '(min-width: 768px)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
    render(<KitchenPlanPage />)
    expect(await screen.findByRole('table', { name: /kitchen plan/i })).toBeInTheDocument()
  })
})

// ── member → read-only pesanan (AC-024) ───────────────────────────────────────
describe('KitchenPlanPage — member pesanan (AC-024)', () => {
  beforeEach(() => mockUseAuth.mockReturnValue(viewer(['member'])))

  it('AC-024: member sees the 14-day forward horizon read-only', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    await waitFor(() => expect(mockPesanan).toHaveBeenCalled())
    // 14-day horizon requested
    const [, days] = mockPesanan.mock.calls[0]
    expect(days).toBe(14)
  })

  it('AC-024: member NEVER gets edit/save affordances or calls the editor read/write', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('button', { name: /save|edit|approve|submit/i })).toBeNull()
    expect(mockPlans).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('member empty: a calm "nothing planned" — not a broken table', async () => {
    mockPesanan.mockResolvedValue([])
    render(<KitchenPlanPage />)
    expect(await screen.findByText(/nothing planned/i)).toBeInTheDocument()
  })

  it('member rows are grouped by date with the planned qty shown', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />)
    await screen.findByText('Ayam Bakar')
    // the planned qty renders (tabular)
    expect(screen.getByText('12')).toBeInTheDocument()
    // a date group header for the two distinct dates (grouped by date)
    expect(screen.getByText('2026-06-21')).toBeInTheDocument()
    expect(screen.getByText('2026-06-28')).toBeInTheDocument()
  })

  it('member error + retry: re-fetches the horizon', async () => {
    mockPesanan.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(PESANAN)
    render(<KitchenPlanPage />)
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
  })
})
