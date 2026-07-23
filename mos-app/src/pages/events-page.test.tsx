import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ContextRow } from '@/shell/context-row'
import { EventsPage } from './events-page'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

function renderEvents(locale: 'en' | 'id' = 'en') {
  localStorage.setItem('mos.locale', locale)
  return render(
    <I18nProvider>
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AC-1001 (events-stub): EventsPage renders the Events destination', () => {
  it('renders the H1 "Events" inside the main landmark', () => {
    renderEvents()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
  })

  it('sets the document title to "Events — Gordi MOS"', () => {
    renderEvents()
    expect(document.title).toBe('Events — Gordi MOS')
  })

  it('resolves the H1 through i18n for Indonesian ("Acara")', () => {
    renderEvents('id')
    expect(screen.getByRole('heading', { level: 1, name: 'Acara' })).toBeInTheDocument()
    expect(document.title).toBe('Acara — Gordi MOS')
  })
})

describe('AC-1003 (events-stub): sanctioned quiet EmptyState, no fake action', () => {
  it('goal-oracle: an empty-BY-DESIGN surface signals neither success nor pending (step-10 semantics + Nielsen #1 — second-pass audit F3)', () => {
    renderEvents()
    const empty = screen.getByTestId('empty-state')
    // Step 10 rejected 'awaiting' (no data source = nothing is pending); the convention audit
    // rejected 'quiet' ✓ (false success). The kit's 'blank' archetype satisfies BOTH oracles.
    expect(empty).toHaveAttribute('data-empty-variant', 'blank')
    expect(empty.textContent).not.toContain('✓')
    expect(empty.textContent).not.toContain('↻')
    expect(empty).toHaveAttribute('role', 'region')
  })

  // Design fix wave item 8 (events copy nit) — the "collection…connected" phrase was
  // implementation jargon (Gordi people don't talk about a "collection"); the copy now names the
  // real job (cuppings, workshops, bookings) in plain product language. Wording is owner-ratify
  // (see docs/reviews ledger note) — the assertion covers the goal (plain-language empty copy,
  // no fake CTA), not a locked final string.
  it('shows the empty-state title + copy, and renders no action button (Rule 7 — no fake CTA)', () => {
    renderEvents()
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument()
    expect(
      screen.getByText(/cuppings, workshops, bookings.*will appear here once events are turned on/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/collection/i)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  // AUTH-1 (census DO-14): the empty state IS the first content region under the page h1, so its
  // title must be an h2 — the outline reads h1 → h2 with no skipped level (was h1 → h3).
  it('AUTH-1: the empty-state title is an h2, so the heading outline has no skipped level', () => {
    renderEvents()
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing scheduled yet' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })
})

// Post Issue-11: EventsPage is on the V3 Workspace PageFamilyFrame, so its own page head
// (region 3) owns the Rule-1 job sentence and ContextRow (region 2) suppresses the duplicate.
// The goal-oracle is unchanged: the job sentence is visible above the page exactly once.
describe('AC-1002 (events-stub): the Rule-1 job sentence renders above EventsPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: '40000000-0000-0000-0000-000000000001',
          org_id: '10000000-0000-0000-0000-000000000001',
          user_id: 'auth-user-001',
          full_name: 'Cahya Cafe',
          email: 'cahya@gordi.id',
          archived_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        roles: [],
        isManager: false,
        accessRoles: [],
      },
      signOut: vi.fn(),
    })
  })

  it('renders "See what\'s happening around our outlets and when." in the context row on /events', () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/events']}>
          <ContextRow />
          <EventsPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(
      screen.getByText("See what's happening around our outlets and when."),
    ).toBeInTheDocument()
  })
})
