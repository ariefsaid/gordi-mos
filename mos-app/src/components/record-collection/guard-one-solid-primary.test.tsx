/**
 * MECH-GUARD — at most ONE solid/filled primary button per toolbar surface (structural layer).
 *
 * Owner catch: "Save view" rendered as a SOLID primary inside the toolbar, competing with the
 * page's one real primary CTA ("+ New task") — two filled blue buttons on one surface.
 * Skill rule mechanized: impeccable distill "Clear hierarchy: ONE primary action, few secondary
 * actions, everything else tertiary or hidden" (.claude/skills/impeccable/reference/distill.md);
 * impeccable critique "one primary element … everything else muted".
 *
 * Structure asserted (jsdom, class counts — the rendered-pixel version lives in
 * e2e/guards.geometry.spec.ts GUARD-PRIMARY): across every disclosure state of the one shared
 * CollectionToolbar grammar, the toolbar itself contributes ZERO resting `.btn-primary`
 * elements; only the transient save-confirm row may show one, and never more than one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { CollectionToolbar } from './collection-toolbar'
import type { AuthState } from '@/auth/context'
import type { ReviewLogRow } from '@/lib/db/kitchen-logs.types'

// ── Enumeration (census DEFECT-2): the Kitchen Review surface ──────────────────
// The guard's "one solid primary per surface" law is enumerated onto Review, whose
// resting queue previously rendered a solid-blue Approve on EVERY row (10+ competing
// primaries). Only the bulk "Approve all (N)" may be the solid primary; each row's
// Approve is a quiet outline. (The transient inline note-confirm — one open at a time —
// keeps its primary, exactly like the toolbar's transient save-confirm exception.)
vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return {
    ...actual,
    listSubmittedKitchenLogs: vi.fn(),
    fetchPlanMap: vi.fn(),
    approveKitchenLog: vi.fn(),
    rejectKitchenLog: vi.fn(),
  }
})
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
import { useAuth } from '@/auth/use-auth'
import { listSubmittedKitchenLogs, fetchPlanMap } from '@/lib/db/kitchen-logs'
import { getPeople } from '@/lib/db/directory'
import { KitchenReviewPage } from '@/pages/kitchen-review-page'

function stubDesktopMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('768'), // desktop; the in-toolbar "View & filters" trigger renders
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

function renderToolbar() {
  return render(
    <I18nProvider>
      <CollectionToolbar
        presentation={{
          label: 'View', value: 'table',
          options: [{ value: 'table', label: 'Table' }, { value: 'card', label: 'Card' }],
          onChange: () => {},
        }}
        views={{
          label: 'Saved views', value: 'all',
          options: [{ value: 'all', label: 'All work' }, { value: 'my-work', label: 'My work' }],
          onChange: () => {},
        }}
        search={{ label: 'Search', placeholder: 'Search…', value: '', onChange: () => {} }}
        filters={[{
          id: 'status', label: 'Status', value: '',
          options: [{ value: '', label: 'Any' }, { value: 'Open', label: 'Open' }],
          onChange: () => {},
        }]}
        savedViews={{
          label: 'Saved views', selectedId: null, operation: 'idle',
          items: [{ id: 'v1', name: 'My weekly' }],
          onApply: () => {}, onSave: vi.fn(async () => {}),
        }}
      />
    </I18nProvider>,
  )
}

const solidPrimaries = () => document.querySelectorAll('.btn-primary')

beforeEach(() => {
  stubDesktopMatchMedia()
})

describe('GUARD-PRIMARY: the collection toolbar never grows a resting solid-primary button', () => {
  it('GUARD-PRIMARY: collapsed toolbar renders ZERO .btn-primary', () => {
    renderToolbar()
    expect(solidPrimaries()).toHaveLength(0)
  })

  it('GUARD-PRIMARY: the disclosed "View & filters" row renders ZERO .btn-primary — "Save view" stays ghost (the incident)', () => {
    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: /view & filters/i }))
    expect(solidPrimaries()).toHaveLength(0)
    // The exact regression: the Save-view TRIGGER must not be the solid primary variant.
    const saveTrigger = screen.getByRole('button', { name: /save view/i })
    expect(saveTrigger.className).not.toContain('btn-primary')
  })

  it('GUARD-PRIMARY: even the transient save-confirm row shows AT MOST one .btn-primary', () => {
    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: /view & filters/i }))
    fireEvent.click(screen.getByRole('button', { name: /save view/i }))
    expect(solidPrimaries().length).toBeLessThanOrEqual(1)
  })
})

function leadViewer(): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-lead', org_id: 'org-1', user_id: 'auth-1', full_name: 'Lead Viewer',
        email: 'viewer@example.test', archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles: ['ops_lead'],
    },
    signOut: vi.fn(),
  } as AuthState
}

function submittedLog(id: string, name: string): ReviewLogRow {
  return {
    id, log_date: '2026-06-20', action_type: 'Production',
    wip_item_id: id, wip_item_name: name, qty_porsi: 8, notes: null,
    status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb',
    created_at: '2026-06-20T09:12:00Z',
  }
}

describe('GUARD-PRIMARY (enumerated): the Kitchen Review queue keeps ONE solid primary', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(leadViewer())
    vi.mocked(fetchPlanMap).mockResolvedValue({})
    vi.mocked(getPeople).mockResolvedValue([{ id: 'p1', full_name: 'Budi Santoso' }])
  })

  it('a resting queue of many rows renders exactly one solid primary (the bulk "Approve all")', async () => {
    // Three Submitted Production rows → three row-level Approves + one group "Approve all".
    vi.mocked(listSubmittedKitchenLogs).mockResolvedValue([
      submittedLog('w1', 'Nasi Goreng'),
      submittedLog('w2', 'Ayam Bakar'),
      submittedLog('w3', 'Sate'),
    ])
    render(
      <I18nProvider>
        <MemoryRouter basename="/mos" initialEntries={['/mos/cafe/review']}>
          <KitchenReviewPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    // wait for the queue to paint (the three rows + the bulk button)
    await screen.findByText('Nasi Goreng')
    // exactly one solid primary: the bulk "Approve all"; every row Approve is an outline.
    await waitFor(() => expect(solidPrimaries().length).toBe(1))
    expect(screen.getByRole('button', { name: /approve all/i }).className).toContain('btn-primary')
    // the per-row Approve exists but is NOT a solid primary
    const rowApprove = screen.getByRole('button', { name: /approve nasi goreng/i })
    expect(rowApprove.className).not.toContain('btn-primary')
    expect(rowApprove.className).toContain('btn-outline')
  })
})
