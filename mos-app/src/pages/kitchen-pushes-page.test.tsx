// KitchenPushesPage tests — TDD, AC-tagged.
// S5 Pushes view (/cafe/pushes) — read-only ESB push monitoring surface.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S5.
//
// Proves:
//   FR-074 / AC-007 — ops_lead/admin may read their org's push rows; member → forbidden
//   Design §S5 — status tags, target_env tags, dead-letter row treatment
//   All states: loading, empty, error+retry, populated, forbidden
//   Read-only: NO retry/resend/mutation actions exist (dead-letter retry is DEFERRED)
//   a11y: semantic table, tabular numbers on counts/dates, status as text not color-only

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'
import { APP_ROUTER_BASENAME, appUrl } from '@/config/app-build-settings'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-pushes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-pushes')>(
    '@/lib/db/kitchen-pushes',
  )
  return { ...actual, listEsbPushes: vi.fn() }
})
import { ESB_PUSHES_WINDOW_MAX_ROWS, listEsbPushes } from '@/lib/db/kitchen-pushes'

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
      affiliated: [],
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

function renderPage() {
  return render(<MemoryRouter><KitchenPushesPage /></MemoryRouter>)
}

/** Choose a batch in the list; its posting details open beside (or over) it. */
async function openPush(ref: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(ref) }))
  return screen.findByRole('region', { name: 'Diagnostic details' })
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
    renderPage()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(mockListPushes).not.toHaveBeenCalled()
  })

  it('unauthenticated: prompts sign-in, never reads pushes', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' } as AuthState)
    render(
      <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe/pushes')]}>
        <KitchenPushesPage />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router under the configured app base path.
    expect(link).toHaveAttribute('href', appUrl('/login'))
    expect(mockListPushes).not.toHaveBeenCalled()
  })
})

// ── Role gate (FR-074 / AC-007) ───────────────────────────────────────────────

describe('KitchenPushesPage — role gate (AC-007)', () => {
  it('member → forbidden panel, no read call', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    render(
      <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe/pushes')]}>
        <KitchenPushesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('region', { name: /access restricted/i })).toBeInTheDocument()
    expect(screen.getByText(/available to ops leads/i)).toBeInTheDocument()
    expect(screen.getByRole('region')).not.toHaveTextContent(/\bESB\b/i)
    expect(mockListPushes).not.toHaveBeenCalled()
  })

  it('ops_lead → allowed, triggers the read', async () => {
    mockUseAuth.mockReturnValue(viewer(['ops_lead']))
    renderPage()
    await waitFor(() => expect(mockListPushes).toHaveBeenCalled())
    expect(screen.queryByText(/available to ops leads/i)).not.toBeInTheDocument()
  })

  it('admin → allowed, triggers the read', async () => {
    mockUseAuth.mockReturnValue(viewer(['admin']))
    renderPage()
    await waitFor(() => expect(mockListPushes).toHaveBeenCalled())
    expect(screen.queryByText(/available to ops leads/i)).not.toBeInTheDocument()
  })

  it('forbidden panel has a back-to-log link', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    render(
      <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe/pushes')]}>
        <KitchenPushesPage />
      </MemoryRouter>,
    )
    const backLink = await screen.findByRole('link', { name: /back to log/i })
    // Link must resolve via the SPA router (basename applied) — not a full-reload raw anchor
    // Café's canonical Log route (#196 rename) — not the retired /kitchen/log, which
    // only still resolves via a redirect hop.
    expect(backLink).toHaveAttribute('href', appUrl('/cafe'))
  })
})

// ── Load states ──────────────────────────────────────────────────────────────

const IN_FLIGHT_ROW: EsbPushRow = {
  ...PENDING_ROW,
  id: 'push-6',
  source_ref: 'TR-20260621-002',
  status: 'in_flight',
  target_env: 'gkid',
}

// #440: every Café surface says which production stream it is showing. The outbox is the one
// that has none of its own — an integrations.esb_push row carries a source module and a batch
// reference, no branch and no activity — so it states the scope it ACTUALLY has. Naming a
// single stream here would be a claim about the rows on screen that is not true.
describe('KitchenPushesPage — the head states its scope (#440)', () => {
  it('states "All streams" in the page head, and offers no stream picker it could not honour', async () => {
    mockListPushes.mockResolvedValue([])
    renderPage()
    await screen.findByText(/nothing sent yet/i)
    const head = screen.getByTestId('page-head')
    expect(head.textContent).toMatch(/stream/i)
    expect(within(head).getByText(/all streams/i)).toBeInTheDocument()
    expect(within(head).queryByRole('combobox')).toBeNull()
  })
})

describe('KitchenPushesPage — states', () => {
  it('loading: shows a busy skeleton while pushes load', () => {
    mockListPushes.mockReturnValue(new Promise(() => {})) // never resolves
    renderPage()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: says nothing has been sent yet and offers one refresh', async () => {
    mockListPushes.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/nothing sent yet/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /refresh/i })).toHaveLength(1)
    expect(screen.getByText(/entries appear here once they are sent/i)).toBeInTheDocument()
    expect(screen.queryByText(/push(es)? · .*queued|push(es)? · .*menunggu/i)).toBeNull()
    expect(screen.queryByText(/pull again/i)).toBeNull()
  })

  it('error: shows error message + retry button', async () => {
    mockListPushes.mockRejectedValue(new Error('DB error'))
    renderPage()
    // `.` matches either the straight or curly apostrophe — the i18n catalog uses ’ (U+2019).
    const errorMsg = await screen.findByText(/couldn.t load pushes/i)
    expect(errorMsg).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('error + retry: retry re-fetches successfully', async () => {
    mockListPushes.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([POSTED_ROW])
    renderPage()
    const retry = await screen.findByRole('button', { name: /try again/i })
    fireEvent.click(retry)
    expect(await screen.findByRole('button', { name: /PR-20260621-001/ })).toBeInTheDocument()
  })
})

// ── Populated state — list and details ────────────────────────────────────────

describe('KitchenPushesPage — populated (FR-074)', () => {
  it('populated state shows the push tally orientation line above the list', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW, PENDING_ROW, IN_FLIGHT_ROW, HELD_ROW])
    renderPage()
    await screen.findByRole('button', { name: /PR-20260621-001/ })

    expect(screen.getByText('4 pushes · 1 queued')).toBeInTheDocument()
  })

  it('pluralizes each tally count independently', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    renderPage()
    expect(await screen.findByText('1 push · 0 queued')).toBeInTheDocument()
  })

  it('discloses when more rows exist than the 100-push window', async () => {
    const pushes = Array.from({ length: ESB_PUSHES_WINDOW_MAX_ROWS + 1 }, (_, index) => ({
      ...POSTED_ROW,
      id: `push-window-${index}`,
      source_ref: `PR-WINDOW-${String(index).padStart(3, '0')}`,
    }))
    mockListPushes.mockResolvedValue(pushes)
    renderPage()

    expect(await screen.findByRole('button', { name: /PR-WINDOW-000/ })).toBeInTheDocument()
    expect(mockListPushes).toHaveBeenCalledWith(undefined, ESB_PUSHES_WINDOW_MAX_ROWS + 1)
    expect(screen.getByText(`Showing the first ${ESB_PUSHES_WINDOW_MAX_ROWS} pushes — more may exist.`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: new RegExp(`PR-WINDOW-${ESB_PUSHES_WINDOW_MAX_ROWS}`) })).toBeNull()
    expect(screen.getAllByRole('button', { name: /PR-WINDOW-/ })).toHaveLength(ESB_PUSHES_WINDOW_MAX_ROWS)
  })

  it('a chosen batch shows every field it was sent with, in floor language', async () => {
    setViewport(true)
    mockListPushes.mockResolvedValue([POSTED_ROW])
    const { container } = renderPage()
    const details = await openPush('PR-20260621-001')

    // Rule 12: the whole rendered screen uses floor language, not the integration acronym.
    expect(container).not.toHaveTextContent(/\bESB\b/i)
    for (const label of ['Batch', 'Status', 'Endpoint', 'Target', 'Retries', 'Created', 'Posted']) {
      expect(within(details).getByText(label, { selector: 'dt' })).toBeInTheDocument()
    }
  })

  it('posted row: shows esb_doc_num and posted_at time', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    renderPage()
    const details = await openPush('PR-20260621-001')
    expect(within(details).getByText('SMA-2026-0001')).toBeInTheDocument()
    // posted_at is displayed in some time format (exact hour depends on TZ in jsdom;
    // assert the time is not empty / not "—")
    const posted = within(details).getByText('Posted', { selector: 'dt' }).nextElementSibling
    expect(posted?.textContent).not.toBe('—')
    expect(posted?.textContent?.trim()).not.toBe('')
  })

  it('dead_letter row: shows last_error + retry_count', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW])
    renderPage()
    const details = await openPush('PR-20260621-002')
    expect(within(details).getByText(/ESB timeout after 30s/i)).toBeInTheDocument()
    expect(within(details).getByText('Retries', { selector: 'dt' }).nextElementSibling).toHaveTextContent('5')
  })

  it('failed row: shows last_error + retry_count', async () => {
    mockListPushes.mockResolvedValue([FAILED_ROW])
    renderPage()
    const details = await openPush('TB-20260621-001')
    expect(within(details).getByText(/Connection refused/i)).toBeInTheDocument()
    expect(within(details).getByText('Retries', { selector: 'dt' }).nextElementSibling).toHaveTextContent('2')
  })

  it('target_env displayed for each row (dry_run vs goo/gkid)', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW, DEAD_LETTER_ROW])
    renderPage()
    const posted = await screen.findByRole('button', { name: /PR-20260621-001/ })
    const dead = screen.getByRole('button', { name: /PR-20260621-002/ })
    expect(posted).toHaveTextContent('GOO')
    expect(dead).toHaveTextContent('Dry run')
  })
})

// ── Needs-attention batches ───────────────────────────────────────────────────

describe('KitchenPushesPage — dead-letter batches', () => {
  it('dead_letter row shows the escalate hint (read-only, no retry action)', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW])
    renderPage()
    const details = await openPush('PR-20260621-002')
    expect(within(details).getByText(/escalate/i)).toBeInTheDocument()
  })

  it('a healthy batch shows no escalate hint', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    renderPage()
    const details = await openPush('PR-20260621-001')
    expect(within(details).queryByText(/escalate/i)).toBeNull()
  })
})

// ── Read-only — NO mutation affordances ───────────────────────────────────────

describe('KitchenPushesPage — read-only (no mutations, v1 deferred retry)', () => {
  it('populated: NO retry/resend/reset buttons exist', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW, POSTED_ROW])
    renderPage()
    await openPush('PR-20260621-002')
    // Only the page-level "Retry" on error state is allowed; no row-level mutation
    expect(screen.queryByRole('button', { name: /resend|reset|retry push|retry row|re-?send/i })).toBeNull()
  })

  it('no input/form elements exist — this surface is read-only', async () => {
    mockListPushes.mockResolvedValue([DEAD_LETTER_ROW])
    renderPage()
    await openPush('PR-20260621-002')
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
    renderPage()
    await screen.findByRole('button', { name: /PR-20260621-001/ })

    // Each status appears as visible text (not color-only — WCAG 1.4.1).
    const rowText = screen.getAllByRole('button', { name: /-20260621-/ }).map(row => row.textContent ?? '')
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

describe('KitchenPushesPage — held vs posted (FR-052)', () => {
  it('FR-052: a held (intra-branch) row reads "held", not "pending"', async () => {
    mockListPushes.mockResolvedValue([HELD_ROW])
    renderPage()
    const row = await screen.findByRole('button', { name: /TB-20260621-002/ })

    expect(row).toHaveTextContent(/held/i)
    expect(row).not.toHaveTextContent(/pending/i)
  })

  it('FR-052: held and posted are distinguishable in the same list', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW, HELD_ROW])
    renderPage()
    const held = await screen.findByRole('button', { name: /TB-20260621-002/ })
    expect(screen.getByRole('button', { name: /PR-20260621-001/ })).toHaveTextContent('Posted')
    expect(held).toHaveTextContent(/held/i)

    // And the document field says which of the two HAS a document: the posted row's number,
    // and for the held row a statement rather than an em dash, which reads as "not yet".
    const posted = await openPush('PR-20260621-001')
    expect(within(posted).getByText('SMA-2026-0001')).toBeInTheDocument()
    const heldDetails = await openPush('TB-20260621-002')
    expect(within(heldDetails).getByText(/no esb document/i)).toBeInTheDocument()
  })

  it('FR-052: a no-op row that genuinely FAILED still reads as failed', async () => {
    // FAILED_ROW is endpoint 'noop' + status 'failed'. "Held" describes having nothing to post;
    // it must never swallow a dispatch that went wrong, which is the one thing on this screen
    // that actually wants a human.
    mockListPushes.mockResolvedValue([FAILED_ROW])
    renderPage()
    const row = await screen.findByRole('button', { name: /TB-20260621-001/ })

    expect(row).toHaveTextContent('Failed · retrying')
    expect(row).not.toHaveTextContent(/held/i)
  })
})

// ── #402 — human words, severity-first order ──────────────────────────────────

describe('KitchenPushesPage — #402 AC-1: no raw database enum reaches the screen', () => {
  it('every state reads as a word a person would say (status, target_env, endpoint)', async () => {
    mockListPushes.mockResolvedValue([
      POSTED_ROW, DEAD_LETTER_ROW, FAILED_ROW, PENDING_ROW, IN_FLIGHT_ROW, HELD_ROW,
    ])
    renderPage()
    await screen.findByRole('button', { name: /PR-20260621-001/ })

    // The database's words are gone from the screen (exact-match: 'Posted' ≠ 'posted').
    for (const raw of [
      'dead_letter', 'in_flight', 'dry_run',
      'assembly-actual', 'simple-transfer', 'noop',
    ]) {
      expect(screen.queryByText(raw), `raw enum "${raw}" must not reach the screen`).toBeNull()
    }
    // What a person would say is there instead.
    const rowText = screen.getAllByRole('button', { name: /-20260621-/ }).map(row => row.textContent ?? '')
    for (const word of [
      'Posted', 'Failed · stopped', 'Failed · retrying', 'Queued', 'Sending', 'held',
      'Dry run', 'GOO', 'GKID',
    ]) {
      expect(rowText.some(text => text.includes(word)), `person word "${word}" must be visible`).toBe(true)
    }
    // The endpoint is named in the batch's details.
    for (const [ref, endpoint] of [
      ['PR-20260621-001', 'Assembly actuals'], ['TR-20260621-001', 'Stock transfer'], ['TB-20260621-002', 'None'],
    ] as const) {
      const details = await openPush(ref)
      expect(within(details).getByText(endpoint)).toBeInTheDocument()
    }
  })

  it('AC-1 id locale (#402): the outbox speaks Indonesian', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW, DEAD_LETTER_ROW, FAILED_ROW, PENDING_ROW])
    render(
      <MemoryRouter>
        <I18nProvider initialLocale="id">
          <KitchenPushesPage />
        </I18nProvider>
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: /PR-20260621-001/ })

    const rowText = screen.getAllByRole('button', { name: /-20260621-/ }).map(row => row.textContent ?? '')
    for (const word of ['Terkirim', 'Gagal · berhenti', 'Gagal · mengirim ulang', 'Menunggu']) {
      expect(rowText.some(text => text.includes(word)), `"${word}" must be visible`).toBe(true)
    }
    expect(screen.getByText('4 push · 1 menunggu')).toBeInTheDocument()
    expect(screen.queryByText('dead_letter')).toBeNull()
  })

  it('AC-1 id locale: the whole Pushes screen avoids the integration acronym', async () => {
    mockListPushes.mockResolvedValue([POSTED_ROW])
    const { container } = render(
      <MemoryRouter>
        <I18nProvider initialLocale="id">
          <KitchenPushesPage />
        </I18nProvider>
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: /PR-20260621-001/ })
    expect(container).not.toHaveTextContent(/\bESB\b/i)
  })
})

describe('KitchenPushesPage — #402 AC-3: rows needing attention sort above healthy ones', () => {
  it('a dead_letter batch sorts above newer healthy rows (severity outranks recency)', async () => {
    // API returns newest-first: POSTED_ROW (05:00) is NEWER than DEAD_LETTER_ROW (04:00).
    mockListPushes.mockResolvedValue([POSTED_ROW, PENDING_ROW, DEAD_LETTER_ROW])
    renderPage()
    await screen.findByRole('button', { name: /PR-20260621-002/ })

    const refs = screen.getAllByRole('button', { name: /-20260621-/ }).map(row => /\w{2}-20260621-\d{3}/.exec(row.textContent ?? '')?.[0])
    const idx = (ref: string) => refs.indexOf(ref)
    expect(idx('PR-20260621-002')).toBeLessThan(idx('PR-20260621-001')) // above newer posted
    expect(idx('PR-20260621-002')).toBeLessThan(idx('TR-20260621-001')) // above newer pending
  })
})

// ── #422: stuck batches are counted in the page head ─────────────────────────
describe('KitchenPushesPage — phone (#422)', () => {
  it('a dead-letter batch shows the error + escalate hint when chosen; the page head counts it', async () => {
    setViewport(false)
    mockListPushes.mockResolvedValue([
      { ...DEAD_LETTER_ROW, id: 'p1', source_ref: 'PR2606210001', last_error: 'EC031 rejected' },
      { ...FAILED_ROW, id: 'p2', source_ref: 'PR2606210002' },
      { ...POSTED_ROW, id: 'p3', source_ref: 'PR2606210003', esb_doc_num: 'SMF002' },
    ])
    renderPage()
    const details = await openPush('PR2606210001')
    expect(within(details).getByText('EC031 rejected')).toBeInTheDocument()
    expect(within(details).getByText(/escalate/i)).toBeInTheDocument()
    // the head meta answers "what is stuck", not only "how many"
    expect(screen.getByText('1 dead-lettered')).toBeInTheDocument()
    expect(screen.getByText('1 failed, retrying')).toBeInTheDocument()
  })

  it('a healthy outbox renders NO head meta line at all', async () => {
    setViewport(false)
    mockListPushes.mockResolvedValue([{ ...POSTED_ROW, id: 'p1', source_ref: 'PR2606210001' }])
    renderPage()
    await screen.findByRole('button', { name: /PR2606210001/ })
    expect(screen.queryByText(/dead-lettered|failed, retrying/)).toBeNull()
  })
})

// ── issue 455: the browser tab names the same module the rail and breadcrumb do ──────────
// Asserted against the CATALOG, not a literal: pinning "Log · Café — Gordi MOS" here would
// pass just as happily with the retired `nav.kitchen.*` strings copied into it.
import { messages } from '@/i18n/messages'
import { interpolate } from '@/i18n/use-t'

function cafeDocTitle(leaf: keyof typeof messages.en): string {
  return interpolate(messages.en['common.docTitle'], {
    page: `${messages.en[leaf]} · ${messages.en['nav.cafe']}`,
  })
}

describe('issue 455: document title', () => {
  it('titles the tab from the Café nav label, not the retired kitchen one', async () => {
    mockListPushes.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(document.title).toBe(cafeDocTitle('cafe.pageTitle.pushes')))
  })
})
