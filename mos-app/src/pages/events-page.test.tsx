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

describe('PORT-024 / AC-1001: EventsPage renders the Events destination', () => {
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

describe('AC-1003 (events): sanctioned quiet EmptyState, no fake action', () => {
  it('goal-oracle: an empty-BY-DESIGN surface signals neither success nor pending', () => {
    renderEvents()
    const empty = screen.getByTestId('empty-state')
    // 'awaiting' is wrong (no data source = nothing is pending); 'quiet' is wrong (a ✓ reads as
    // a false success). The kit's 'blank' archetype satisfies BOTH oracles.
    expect(empty).toHaveAttribute('data-empty-variant', 'blank')
    expect(empty.textContent).not.toContain('✓')
    expect(empty.textContent).not.toContain('↻')
    expect(empty).toHaveAttribute('role', 'region')
  })

  // The earlier "collection…connected" phrasing was implementation jargon — Gordi people do not
  // talk about a "collection". The copy names the real job (cuppings, workshops, bookings) in
  // plain product language. The assertion covers the goal (plain-language empty copy, no fake
  // CTA), not a locked final string.
  it('shows the empty-state title + copy, and renders no action button (no fake CTA)', () => {
    renderEvents()
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument()
    expect(
      screen.getByText(/cuppings, workshops, bookings.*will appear here once events are turned on/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/collection/i)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('AUTH-1: the empty-state title is an h2, so the heading outline has no skipped level', () => {
    renderEvents()
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing scheduled yet' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  // The empty state IS this surface's entire content, so an untranslated one leaves an Indonesian
  // viewer with an English page under an Indonesian heading. `useT` falls back to `en` silently
  // when a key is missing from `id`, so "it renders" proves nothing — these assert the Indonesian
  // strings themselves. (Found by mutation: replacing the `id` copy with its `en` twin left every
  // other assertion in this file green.)
  it('translates the empty state itself, not just the page chrome, under Indonesian', () => {
    renderEvents('id')
    expect(screen.getByRole('heading', { level: 2, name: 'Belum ada acara terjadwal' })).toBeInTheDocument()
    expect(
      screen.getByText(/cupping, workshop, pemesanan.*setelah fitur acara diaktifkan/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('Nothing scheduled yet')).not.toBeInTheDocument()
  })
})

// EventsPage is on the Workspace PageFamilyFrame, so its own page head (region 3) owns the job
// sentence and ContextRow (region 2) suppresses the duplicate. The goal-oracle is that the job
// sentence is visible above the page EXACTLY ONCE — `getByText` throws on a second match, which
// is what makes this a real check of the page-family-migration registry entry for `/events`.
describe('AC-1002 (events): the job sentence renders above EventsPage exactly once', () => {
  beforeEach(() => {
    // Pinned, not inherited: `renderEvents` writes the locale to localStorage and this block
    // renders without it, so leaving it unset makes the case depend on whichever locale the
    // previous test in the file happened to leave behind.
    localStorage.setItem('mos.locale', 'en')
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: '40000000-0000-0000-0000-000000000001',
          org_id: '10000000-0000-0000-0000-000000000001',
          user_id: 'auth-user-001',
          full_name: 'Cahya Cafe',
          email: 'cahya@gordi.id',
          must_change_password: false,
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

  it('renders "See what\'s happening around our outlets and when." once on /events', () => {
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
