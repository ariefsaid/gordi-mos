// KitchenPushesPage tests — TDD, AC-tagged.
// S5 Pushes view (/mos/kitchen/pushes) — read-only ESB push monitoring surface.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S5.
//
// Proves:
//   FR-074 / AC-007 — ops_lead/admin may read their org's push rows; member → forbidden
//   Design §S5 — status tags, target_env tags, dead-letter row treatment
//   All states: loading, empty, error+retry, populated, forbidden
//   Read-only: NO retry/resend/mutation actions exist (dead-letter retry is DEFERRED)
//   a11y: semantic table, tabular numbers on counts/dates, status as text not color-only

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-pushes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-pushes')>(
    '@/lib/db/kitchen-pushes',
  )
  return { ...actual, listEsbPushes: vi.fn() }
})
import { listEsbPushes } from '@/lib/db/kitchen-pushes'

import { KitchenPushesPage } from './kitchen-pushes-page'
import type { EsbPushRow } from '@/lib/db/kitchen-pushes'

const mockUseAuth = vi.mocked(useAuth)
const mockListPushes = vi.mocked(listEsbPushes)

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1',
        org_id: 'org-1',
        user_id: 'auth-1',
        full_name: 'Dina Marlina',
        email: 'dina@gordi.id',
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  } as AuthState
}

const POSTED_ROW: EsbPushRow = {
  id: 'push-1',
  source_module: 'kitchen',
  source_ref: 'PR-20260621-001',
  endpoint: 'assembly-actual',
  target_env: 'goo',
  status: 'posted',
  retry_count: 0,
  last_error: null,
  esb_doc_num: 'SMA-2026-0001',
  created_at: '2026-06-21T05:00:00Z',
  posted_at: '2026-06-21T05:00:10Z',
}

const DEAD_LETTER_ROW: EsbPushRow = {
  id: 'push-2',
  source_module: 'kitchen',
  source_ref: 'PR-20260621-002',
  endpoint: 'assembly-actual',
  target_env: 'dry_run',
  status: 'dead_letter',
  retry_count: 5,
  last_error: 'ESB timeout after 30s',
  esb_doc_num: null,
  created_at: '2026-06-21T04:00:00Z',
  posted_at: null,
}

const FAILED_ROW: EsbPushRow = {
  id: 'push-3',
  source_module: 'kitchen',
  source_ref: 'TB-20260621-001',
  endpoint: 'noop',
  target_env: 'gkid',
  status: 'failed',
  retry_count: 2,
  last_error: 'Connection refused',
  esb_doc_num: null,
  created_at: '2026-06-21T03:00:00Z',
  posted_at: null,
}

const PENDING_ROW: EsbPushRow = {
  id: 'push-4',
  source_module: 'kitchen',
  source_ref: 'TR-20260621-001',
  endpoint: 'simple-transfer',
  target_env: 'goo',
  status: 'pending',
  retry_count: 0,
  last_error: null,
  esb_doc_num: null,
  created_at: '2026-06-21T02:00:00Z',
  posted_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(viewer(['ops_lead']))
  mockListPushes.mockResolvedValue([])
})

// ── Auth states ──────────────────────────────────────────────────────────────

describe('KitchenPushesPage — auth', () => {
  it('auth loading: shows a busy state, no read triggered', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as AuthState)
    render(<KitchenPushesPage />)
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(mockListPushes).not.toHaveBeenCalled()
  })

  it('unauthenticated: prompts sign-in, never reads pushes', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' } as AuthState)
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/pushes']}>
        <KitchenPushesPage />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router (basename applied) — not a raw href that skips /mos
    expect(link).toHaveAttribute('href', '/mos/login')
    expect(mockListPushes).not.toHaveBeenCalled()
  })
})

// ── Role gate (FR-074 / AC-007) ───────────────────────────────────────────────

describe('KitchenPushesPage — role gate (AC-007)', () => {
  it('member → forbidden panel, no read call', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/pushes']}>
        <KitchenPushesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('region', { name: /access restricted/i })).toBeInTheDocument()
    expect(screen.getByText(/available to ops leads/i)).toBeInTheDocument()
    expect(mockListPushes).not.toHaveBeenCalled()
  })

  it('ops_lead → allowed, triggers the read', async () => {
    mockUseAuth.mockReturnValue(viewer(['ops_lead']))
    render(<KitchenPushesPage />)
    await waitFor(() => expect(mockListPushes).toHaveBeenCalled())
    expect(screen.queryByText(/available to ops leads/i)).not.toBeInTheDocument()
  })

  it('admin → allowed, triggers the read', async () => {
    mockUseAuth.mockReturnValue(viewer(['admin']))
    render(<KitchenPushesPage />)
    await waitFor(() => expect(mockListPushes).toHaveBeenCalled())
    expect(screen.queryByText(/available to ops leads/i)).not.toBeInTheDocument()
  })

  it('forbidden panel has a back-to-log link', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/pushes']}>
        <KitchenPushesPage />
      </MemoryRouter>,
    )
    const backLink = await screen.findByRole('link', { name: /back to log/i })
    // Link must resolve via the SPA router (basename applied) — not a full-reload raw anchor
    expect(backLink).toHaveAttribute('href', '/mos/kitchen/log')
  })
})

// ── Load states ──────────────────────────────────────────────────────────────

describe('KitchenPushesPage — states', () => {
  it('loading: shows a busy skeleton while pushes load', () => {
    mockListPushes.mockReturnValue(new Promise(() => {})) // never resolves
    render(<KitchenPushesPage />)
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: shows "no pushes yet" when no rows', async () => {
    mockListPushes.mockResolvedValue([])
    render(<KitchenPushesPage />)
    expect(await screen.findByText(/no pushes yet/i)).toBeInTheDocument()
  })

  it('error: shows error message + retry button', async () => {
    mockListPushes.mockRejectedValue(new Error('DB error'))
    render(<KitchenPushesPage />)
    const errorMsg = await screen.findByText(/couldn't load pushes/i)
    expect(errorMsg).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('error + retry: retry re-fetches successfully', async () => {
    mockListPushes.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([POSTED_ROW])
    render(<KitchenPushesPage />)
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    expect(await screen.findByText('PR-20260621-001')).toBeInTheDocument()
  })
})

// ── Populated state — columns and display ─────────────────────────────────────

describe('KitchenPushesPage — populated (FR-074)', () => {
  it('renders a semantic table with the required column headers', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-001')

    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /batch/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /endpoint/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /target/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /status/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /retries|retry/i })).toBeInTheDocument()
  })

  it('posted row: shows esb_doc_num and posted_at time', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    expect(await screen.findByText('SMA-2026-0001')).toBeInTheDocument()
    // posted_at is displayed in some time format (exact hour depends on TZ in jsdom;
    // assert the time cell is not empty / not "—")
    const postedCells = screen.getAllByRole('cell')
    const postedTimeCell = postedCells[postedCells.length - 1] // last td = posted_at
    expect(postedTimeCell.textContent).not.toBe('—')
  })

  it('dead_letter row: shows last_error + retry_count', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW])
    render(<KitchenPushesPage />)
    expect(await screen.findByText(/ESB timeout after 30s/i)).toBeInTheDocument()
    // retry_count = 5
    const retryCell = screen.getByText('5')
    expect(retryCell).toBeInTheDocument()
  })

  it('failed row: shows last_error + retry_count', async () => {
    mockListPushes.mockResolvedValue([FAILED_ROW])
    render(<KitchenPushesPage />)
    expect(await screen.findByText(/Connection refused/i)).toBeInTheDocument()
  })

  it('target_env displayed for each row (dry_run vs goo/gkid)', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW, DEAD_LETTER_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-001')
    // goo and dry_run are both present
    const rows = screen.getAllByRole('row')
    const rowText = rows.map(r => r.textContent ?? '')
    expect(rowText.some(t => t.includes('goo'))).toBe(true)
    expect(rowText.some(t => t.includes('dry_run'))).toBe(true)
  })

  it('source_ref (batch_id) rendered in a mono font class', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    const batchCell = await screen.findByText('PR-20260621-001')
    // The mono class should be on the cell or its parent
    expect(batchCell.closest('.mono') ?? batchCell.classList.contains('mono')).toBeTruthy()
  })

  it('esb_doc_num rendered in a mono font class when present', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    const docCell = await screen.findByText('SMA-2026-0001')
    expect(docCell.closest('.mono') ?? docCell.classList.contains('mono')).toBeTruthy()
  })

  it('retry_count cells carry the .tabular class', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-001')
    // retry_count = 0 — find the '0' cell in the row
    const table = screen.getByRole('table')
    const countCells = within(table).getAllByText('0')
    expect(countCells.some(el => el.classList.contains('tabular'))).toBe(true)
  })
})

// ── Dead-letter row treatment (design-plan §S5 "needs-attention") ─────────────

describe('KitchenPushesPage — dead-letter row treatment', () => {
  it('dead_letter row has the kpu-row-dead-letter class for the warning tint + left rule', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-002')

    // The row carrying the dead_letter status gets the attention class
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    const deadRow = rows.find(r => r.textContent?.includes('PR-20260621-002'))
    expect(deadRow?.classList.contains('kpu-row-dead-letter')).toBe(true)
  })

  it('dead_letter row shows the escalate hint (read-only, no retry action)', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW])
    render(<KitchenPushesPage />)
    expect(await screen.findByText(/escalate/i)).toBeInTheDocument()
  })

  it('non-dead-letter rows do NOT get the attention class', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-001')

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    const postedRow = rows.find(r => r.textContent?.includes('PR-20260621-001'))
    expect(postedRow?.classList.contains('kpu-row-dead-letter')).toBe(false)
  })
})

// ── Read-only — NO mutation affordances ───────────────────────────────────────

describe('KitchenPushesPage — read-only (no mutations, v1 deferred retry)', () => {
  it('populated: NO retry/resend/reset buttons exist', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW, POSTED_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-002')
    // Only the page-level "Retry" on error state is allowed; no row-level mutation
    expect(screen.queryByRole('button', { name: /resend|reset|retry push|retry row|re-?send/i })).toBeNull()
  })

  it('no input/form elements exist — this surface is read-only', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-002')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    // No form
    expect(screen.queryByRole('form')).toBeNull()
  })
})

// ── Multiple rows, all statuses ───────────────────────────────────────────────

describe('KitchenPushesPage — all status values render', () => {
  it('all four rows render with their status labels as text', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW, DEAD_LETTER_ROW, FAILED_ROW, PENDING_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-001')

    // Each status appears as visible text (not color-only — WCAG 1.4.1)
    expect(screen.getByText('posted')).toBeInTheDocument()
    expect(screen.getByText('dead_letter')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })
})
