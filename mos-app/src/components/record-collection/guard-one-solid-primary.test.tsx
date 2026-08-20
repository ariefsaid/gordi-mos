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
import { I18nProvider } from '@/i18n/I18nProvider'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { CollectionToolbar } from './collection-toolbar'
import { KitchenReviewPage } from '@/pages/kitchen-review-page'
import { useAuth } from '@/auth/use-auth'
import type { ReviewLogRow } from '@/lib/db/kitchen-logs.types'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/kitchen-logs', async () => ({
  ...(await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')),
  listSubmittedKitchenLogs: vi.fn(), fetchPlanMap: vi.fn(), listStreamPairs: vi.fn(),
  approveKitchenLog: vi.fn(), rejectKitchenLog: vi.fn(), fetchDefaultStream: vi.fn(),
}))
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
vi.mock('@/lib/db/stream-completeness', () => ({ listStreamCompleteness: vi.fn(), confirmStreamComplete: vi.fn() }))

import { listSubmittedKitchenLogs, fetchPlanMap, listStreamPairs } from '@/lib/db/kitchen-logs'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listActiveBranches } from '@/lib/db/branches'
import { getPeople } from '@/lib/db/directory'
import { listStreamCompleteness } from '@/lib/db/stream-completeness'

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

describe('GUARD-PRIMARY (enumerated): the Kitchen Review queue keeps ONE solid primary', () => {
  const viewer = {
    status: 'authenticated',
    viewer: {
      person: { id: 'p1', org_id: 'org', user_id: 'u1', full_name: 'Review lead', email: 'lead@example.test', must_change_password: false, archived_at: null, created_at: '', updated_at: '' },
      roles: [], isManager: false, accessRoles: ['ops_lead'],
    }, signOut: vi.fn(async () => {}),
  } as AuthState
  const logs: ReviewLogRow[] = ['Nasi Goreng', 'Ayam Bakar', 'Sate'].map((name, index) => ({
    id: `log-${index}`, log_date: '2026-06-20', action_type: 'Production', action: 'produce', destination_branch_id: null,
    branch_id: 'branch-1', activity: 'kitchen', wip_item_id: `wip-${index}`, wip_item_name: name,
    qty_porsi: 1, notes: null, status: 'Submitted', submitted_by: 'p1', business_unit_id: 'bu-1', created_at: '2026-06-20T09:12:00Z',
  }))

  it('uses the bulk approve as the only resting solid primary', async () => {
    vi.mocked(useAuth).mockReturnValue(viewer)
    vi.mocked(listSubmittedKitchenLogs).mockResolvedValue(logs)
    vi.mocked(fetchPlanMap).mockResolvedValue({})
    vi.mocked(listStreamPairs).mockResolvedValue([{ branch_id: 'branch-1', activity: 'kitchen' }])
    vi.mocked(fetchDefaultStream).mockResolvedValue(null)
    vi.mocked(listActiveBranches).mockResolvedValue([{ id: 'branch-1', code: 'main', name: 'Main' }])
    vi.mocked(getPeople).mockResolvedValue([{ id: 'p1', full_name: 'Review lead' }])
    vi.mocked(listStreamCompleteness).mockResolvedValue([])

    render(<MemoryRouter initialEntries={['/cafe/review']}><I18nProvider><KitchenReviewPage /></I18nProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Nasi Goreng')).toBeInTheDocument())

    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /approve all/i })).toHaveClass('btn-primary')
    expect(screen.getByRole('button', { name: 'Approve Nasi Goreng' })).toHaveClass('btn-outline')
  })
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
