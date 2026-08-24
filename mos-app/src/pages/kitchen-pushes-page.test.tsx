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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
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
        email: 'dina@example.test',
        must_change_password: false,
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
  setViewport(true)
  mockUseAuth.mockReturnValue(viewer(['ops_lead']))
  mockListPushes.mockResolvedValue([])
})

function setViewport(isDesktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: isDesktop && query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

afterEach(() => {
  setViewport(false)
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
    // Café's canonical Log route (#196 rename) — not the retired /kitchen/log, which
    // only still resolves via a redirect hop.
    expect(backLink).toHaveAttribute('href', '/mos/cafe/log')
  })
})

// ── Load states ──────────────────────────────────────────────────────────────

describe('KitchenPushesPage — states', () => {
  it('loading: shows a busy skeleton while pushes load', () => {
    mockListPushes.mockReturnValue(new Promise(() => {})) // never resolves
    render(<KitchenPushesPage />)
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: renders the shared awaiting EmptyState when no rows', async () => {
    mockListPushes.mockResolvedValue([])
    render(<KitchenPushesPage />)
    expect(await screen.findByText(/no pushes yet/i)).toBeInTheDocument()

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'awaiting')
    expect(emptyState.querySelector('.empty-state-icon')).not.toBeNull()
    expect(emptyState.querySelector('.empty-title')).not.toBeNull()
    expect(emptyState.querySelector('.empty-copy')).not.toBeNull()
    expect(emptyState.querySelector('.empty-note')).not.toBeNull()
  })

  it('W4-4: empty state routes through EmptyState with exactly one refresh action', async () => {
    mockListPushes.mockResolvedValue([])
    render(<KitchenPushesPage />)
    await screen.findByText(/no pushes yet/i)

    const emptyState = screen.getByTestId('empty-state')
    const emptyActions = emptyState.querySelector('.empty-actions')
    expect(emptyActions).not.toBeNull()
    expect(emptyActions!.querySelectorAll('button, a')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })

  it('error: shows error message + retry button', async () => {
    mockListPushes.mockRejectedValue(new Error('DB error'))
    render(<KitchenPushesPage />)
    // `.` matches either the straight or curly apostrophe — the i18n catalog uses ’ (U+2019).
    const errorMsg = await screen.findByText(/couldn.t load pushes/i)
    expect(errorMsg).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('error + retry: retry re-fetches successfully', async () => {
    mockListPushes.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([POSTED_ROW])
    render(<KitchenPushesPage />)
    const retry = await screen.findByRole('button', { name: /try again/i })
    fireEvent.click(retry)
    expect(await screen.findByText('PR-20260621-001')).toBeInTheDocument()
  })
})

// ── Populated state — columns and display ─────────────────────────────────────

describe('KitchenPushesPage — populated (FR-074)', () => {
  it('RI-IXD-6: desktop pushes uses the shared DataTable branch, not a kitchen-local table wrapper', async () => {
    setViewport(true)
    mockListPushes.mockResolvedValue([POSTED_ROW])
    const { container } = render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-001')

    expect(container.querySelector('.dt-table')).not.toBeNull()
    expect(container.querySelector('.kpu-tablewrap, .kpu-table')).toBeNull()
  })

  it('RI-IXD-6: phone pushes uses the shared DataTable card branch, not a horizontal table', async () => {
    setViewport(false)
    mockListPushes.mockResolvedValue([POSTED_ROW])
    const { container } = render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-001')

    expect(container.querySelector('.dt-cards')).not.toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.querySelector('.kpu-tablewrap, .kpu-table')).toBeNull()
  })

  it('renders a semantic table with the required column headers', async () => {
    setViewport(true)
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
    expect(rowText.some(t => t.includes('GOO'))).toBe(true)
    expect(rowText.some(t => t.includes('Dry run'))).toBe(true)
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

    // Each status appears as visible text (not color-only — WCAG 1.4.1); row-text
    // scanning because 'Posted' now also names the column header (#402).
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    const rowText = rows.map(r => r.textContent ?? '')
    expect(rowText.some(t => t.includes('Posted'))).toBe(true)
    expect(rowText.some(t => t.includes('Failed · stopped'))).toBe(true)
    expect(rowText.some(t => t.includes('Failed · retrying'))).toBe(true)
    expect(rowText.some(t => t.includes('Queued'))).toBe(true)
  })
})

// ── FR-052 (#235): held is not pending ────────────────────────────────────────
// An approved intra-branch movement — destination branch = origin branch — resolves to the
// no-op arm: logged, approved, and no ERP document for it, now or ever (FR-050/053 — the
// production master data has no per-activity locations to post to). The outbox still carries
// the row, because one row per batch is what the double-post guard is built on, so this screen
// is where the two outcomes have to be told apart.
//
// Read as a bare status that row says `pending`, and keeps saying it. Bar capture is what turns
// that into a real problem: intra-branch movements used to be one carried case of the
// incumbent's and are now capturable from every stream, so the lead's one question here — is
// anything stuck? — collects a growing pile of wrong answers unless held has its own word.
const HELD_ROW: EsbPushRow = {
  id: 'push-5',
  source_module: 'kitchen',
  source_ref: 'TB-20260621-002',
  endpoint: 'noop',
  target_env: 'goo',
  status: 'pending',
  retry_count: 0,
  last_error: null,
  esb_doc_num: null,
  created_at: '2026-06-21T01:00:00Z',
  posted_at: null,
}

describe('KitchenPushesPage — held vs posted (FR-052)', () => {
  it('FR-052: a held (intra-branch) row reads "held", not "pending"', async () => {
    mockListPushes.mockResolvedValue([HELD_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('TB-20260621-002')

    expect(screen.getByText('held')).toBeInTheDocument()
    expect(screen.queryByText('pending')).toBeNull()
  })

  it('FR-052: held and posted are distinguishable in the same table', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW, HELD_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('TB-20260621-002')

    // Both words present as text, not as tint alone (WCAG 1.4.1).
    expect(screen.getAllByText('Posted').length).toBeGreaterThan(0)
    expect(screen.getByText('held')).toBeInTheDocument()
    // And the document column says which of the two HAS a document: the posted row's number,
    // and for the held row a statement rather than an em dash, which reads as "not yet".
    expect(screen.getByText('SMA-2026-0001')).toBeInTheDocument()
    expect(screen.getByText(/no erp document/i)).toBeInTheDocument()
  })

  it('FR-052: a no-op row that genuinely FAILED still reads as failed', async () => {
    // FAILED_ROW is endpoint 'noop' + status 'failed'. "Held" describes having nothing to post;
    // it must never swallow a dispatch that went wrong, which is the one thing on this screen
    // that actually wants a human.
    mockListPushes.mockResolvedValue([FAILED_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('TB-20260621-001')

    expect(screen.getAllByText('Failed · retrying').length).toBeGreaterThan(0)
    expect(screen.queryByText('held')).toBeNull()
  })
})

// ── #402 — human words, red tag on amber row, severity-first order, one-line ids ──

const IN_FLIGHT_ROW: EsbPushRow = {
  ...PENDING_ROW,
  id: 'push-6',
  source_ref: 'TR-20260621-002',
  status: 'in_flight',
  target_env: 'gkid',
}

describe('KitchenPushesPage — #402 AC-1: no raw database enum reaches the screen', () => {
  it('every state reads as a word a person would say (status, target_env, endpoint)', async () => {
    mockListPushes.mockResolvedValue([
      POSTED_ROW, DEAD_LETTER_ROW, FAILED_ROW, PENDING_ROW, IN_FLIGHT_ROW, HELD_ROW,
    ])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-001')

    // The database's words are gone from the screen (exact-match: 'Posted' ≠ 'posted').
    for (const raw of [
      'dead_letter', 'in_flight', 'dry_run',
      'assembly-actual', 'simple-transfer', 'noop',
    ]) {
      expect(screen.queryByText(raw), `raw enum "${raw}" must not reach the screen`).toBeNull()
    }
    // What a person would say is there instead.
    for (const word of [
      'Posted', 'Failed · stopped', 'Failed · retrying', 'Queued', 'Sending', 'held',
      'Dry run', 'GOO', 'GKID',
      'Assembly actuals', 'Stock transfer', 'None',
    ]) {
      expect(screen.getAllByText(word).length, `person word "${word}" must be visible`).toBeGreaterThan(0)
    }
  })

  it('AC-1 id locale (#402): the outbox speaks Indonesian', async () => {
    localStorage.setItem('mos.locale', 'id')
    try {
      mockListPushes.mockResolvedValue([POSTED_ROW, DEAD_LETTER_ROW, FAILED_ROW, PENDING_ROW])
      render(
        <MemoryRouter>
          <I18nProvider>
            <KitchenPushesPage />
          </I18nProvider>
        </MemoryRouter>,
      )
      await screen.findByText('PR-20260621-001')

      expect(screen.getAllByText('Terkirim').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Gagal · berhenti').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Gagal · mengirim ulang').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Menunggu').length).toBeGreaterThan(0)
      expect(screen.queryByText('dead_letter')).toBeNull()
    } finally {
      localStorage.clear()
    }
  })
})

describe('KitchenPushesPage — #402 AC-2 (OD-WAY-74 #4): red tag, amber row', () => {
  it('dead_letter wears the RED tag on the AMBER row; retryable failed keeps amber', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW, FAILED_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-002')

    const rows = within(screen.getByRole('table')).getAllByRole('row')
    const deadRow = rows.find(r => r.textContent?.includes('PR-20260621-002'))!
    const failedRow = rows.find(r => r.textContent?.includes('TB-20260621-001'))!

    // Red on the TAG (color set via the palette token + AA-darkened text, StatusPill precedent)
    const deadTag = within(deadRow).getByText('Failed · stopped').closest('.mk-tag') as HTMLElement
    expect(deadTag.getAttribute('style') ?? '').toContain('--ds-tag-background-red')
    expect(deadTag).toHaveStyle({ color: 'var(--status-lost-text)' })
    // …amber on the ROW (the row is fine; its delivery failed — never red on the row)
    expect(deadRow.classList.contains('kpu-row-dead-letter')).toBe(true)

    const failedTag = within(failedRow).getByText('Failed · retrying').closest('.mk-tag') as HTMLElement
    expect(failedTag.getAttribute('style') ?? '').toContain('--ds-tag-background-amber')
    expect(failedRow.classList.contains('kpu-row-dead-letter')).toBe(false)
  })
})

describe('KitchenPushesPage — #402 AC-3: rows needing attention sort above healthy ones', () => {
  it('a dead_letter batch sorts above newer healthy rows (severity outranks recency)', async () => {
    // API returns newest-first: POSTED_ROW (05:00) is NEWER than DEAD_LETTER_ROW (04:00).
    mockListPushes.mockResolvedValue([POSTED_ROW, PENDING_ROW, DEAD_LETTER_ROW])
    render(<KitchenPushesPage />)
    await screen.findByText('PR-20260621-002')

    const rows = within(screen.getByRole('table')).getAllByRole('row')
    const idx = (ref: string) => rows.findIndex(r => r.textContent?.includes(ref))
    expect(idx('PR-20260621-002')).toBeLessThan(idx('PR-20260621-001')) // above newer posted
    expect(idx('PR-20260621-002')).toBeLessThan(idx('TR-20260621-001')) // above newer pending
  })
})

describe('KitchenPushesPage — #402 AC-4: the batch id is one paste-able string', () => {
  it('source_ref renders as code.kpu-ref.mono — one line, select-all', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    const batch = await screen.findByText('PR-20260621-001')
    expect(batch.tagName).toBe('CODE')
    expect(batch.classList.contains('kpu-ref')).toBe(true)
    expect(batch.classList.contains('mono')).toBe(true)
  })

  it('same treatment on the phone card branch', async () => {
    setViewport(false)
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    const batch = await screen.findByText('PR-20260621-001')
    expect(batch.tagName).toBe('CODE')
    expect(batch.classList.contains('kpu-ref')).toBe(true)
  })

  it('the CSS keeps the id on one line and makes the whole id one selection', () => {
    // Repo idiom for reading a sibling source file in a test (cohesion-chrome
    // regression tests do the same): resolve from cwd — vitest runs with cwd = mos-app.
    const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-pushes-page.css'), 'utf8')
    const rule = css.match(/\.kpu-ref\s*\{([^}]*)\}/)
    expect(rule, '.kpu-ref rule must exist in kitchen-pushes-page.css').toBeTruthy()
    expect(rule![1]).toContain('white-space: nowrap')
    expect(rule![1]).toContain('user-select: all')
  })
})

// ── #416: the one-line id must not widen the table out of its frame ───────────
// The nowrap id only stays on one line WITHOUT pushing columns off screen because the
// table is fixed-layout: in an auto-layout table `max-width: 100%` on cell content has no
// definite width to resolve against, so the id's overflow never fires and the column grows
// instead (measured: +93px, and 154px of whole-page horizontal scroll at an 820px
// viewport). jsdom has no layout, so these assert the two things that produce it — the
// class the page hands the table, and the rule that class carries.
describe('KitchenPushesPage — #416: the table stays inside its frame', () => {
  it('hands the table the fixed-layout class', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    render(<KitchenPushesPage />)
    const table = await screen.findByRole('table')
    expect(table.classList.contains('kpu-cols')).toBe(true)
  })

  it('and that class pins the column widths instead of letting content set them', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-pushes-page.css'), 'utf8')
    const rule = css.match(/\.kpu-cols\s*\{([^}]*)\}/)
    expect(rule, '.kpu-cols rule must exist in kitchen-pushes-page.css').toBeTruthy()
    expect(rule![1]).toContain('table-layout: fixed')
    // The Error column takes the slack, so no column can be squeezed to nothing.
    expect(css).toMatch(/nth-child\(6\)\s*\{\s*width:\s*auto/)
  })
})

// ── #422: the phone card ─────────────────────────────────────────────────────
// The generic <dl> fallback stacked all ten columns as labelled rows per push.
// These assert the card's OWN anatomy, so they FAIL against that fallback (proven
// by temporarily removing the renderCard prop): head = ref + status, ONE muted
// meta line, and the error block only when the row actually carries one.
describe('KitchenPushesPage — phone card (#422)', () => {
  it('renders the purpose-built card: ref+status head, one meta line, no <dl> fallback', async () => {
    setViewport(false)
    mockListPushes.mockResolvedValue([
      { ...POSTED_ROW, id: 'p1', source_ref: 'PR2606210001' },
    ])
    render(<KitchenPushesPage />)
    const card = (await screen.findByText('PR2606210001')).closest('.kpu-card')
    expect(card).not.toBeNull()
    expect(card!.querySelector('.kpu-card-head')).not.toBeNull()
    expect(card!.querySelector('.kpu-card-meta')).not.toBeNull()
    // a healthy row carries NO error block — this is what kills the 10-line stack
    expect(card!.querySelector('.kpu-card-error')).toBeNull()
    expect(document.querySelector('.dt-card-detail')).toBeNull()
  })

  it('a dead-letter card shows the error + escalate hint; the page head counts it', async () => {
    setViewport(false)
    mockListPushes.mockResolvedValue([
      { ...DEAD_LETTER_ROW, id: 'p1', source_ref: 'PR2606210001', last_error: 'EC031 rejected' },
      { ...FAILED_ROW, id: 'p2', source_ref: 'PR2606210002' },
      { ...POSTED_ROW, id: 'p3', source_ref: 'PR2606210003', esb_doc_num: 'SMF002' },
    ])
    render(<KitchenPushesPage />)
    const dead = (await screen.findByText('PR2606210001')).closest('.kpu-card')!
    expect(dead.querySelector('.kpu-card-error')).not.toBeNull()
    expect(dead.textContent).toContain('EC031 rejected')
    // the head meta answers "what is stuck", not only "how many"
    expect(document.querySelector('.kpu-meta-dead')?.textContent).toContain('1')
    expect(document.querySelector('.kpu-meta-failed')?.textContent).toContain('1')
    // the healthy card stays quiet
    const ok = (await screen.findByText('PR2606210003')).closest('.kpu-card')!
    expect(ok.querySelector('.kpu-card-error')).toBeNull()
  })

  it('a healthy outbox renders NO head meta line at all', async () => {
    setViewport(false)
    mockListPushes.mockResolvedValue([{ ...POSTED_ROW, id: 'p1', source_ref: 'PR2606210001' }])
    render(<KitchenPushesPage />)
    await screen.findByText('PR2606210001')
    expect(document.querySelector('.kpu-meta-line')).toBeNull()
  })
})
