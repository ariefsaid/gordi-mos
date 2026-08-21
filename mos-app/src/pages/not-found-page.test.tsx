import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { NotFoundPage } from './not-found-page'

// #400 (v4 port): the 404 is fully localized, names the failed path, and offers BOTH
// recoveries — go back (one segment is usually all that's wrong) and Home.

// Reads the router's live location so a navigation claim can actually be checked. The
// value is prefixed so it can never collide with the page's own `note={pathname}` render.
function LocationProbe() {
  const { pathname } = useLocation()
  return <span data-testid="loc">{`at ${pathname}`}</span>
}

/**
 * Two history entries with the 404 on top, so `navigate(-1)` has somewhere to go. The
 * previous shape (a single entry) made the back button a guaranteed no-op — which is
 * how a test named for the navigation ended up unable to observe it.
 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/mos/work/tasks', '/mos/no/such/path']} initialIndex={1}>
      <I18nProvider>
        <NotFoundPage />
        <LocationProbe />
      </I18nProvider>
    </MemoryRouter>,
  )
}

describe('NotFoundPage — English (default)', () => {
  afterEach(() => localStorage.clear())

  it('shows the localized heading, the failed path, and both recovery controls', () => {
    renderPage()
    expect(screen.getByText('That page isn’t here')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/')
    // names WHICH path failed, so the user can see which link was wrong
    expect(screen.getByText('/mos/no/such/path')).toBeInTheDocument()
  })

  it('sets the document title through the catalog', async () => {
    renderPage()
    await waitFor(() => expect(document.title).toBe('Page not found — Gordi MOS'))
  })
})

describe('NotFoundPage — locale id (#400)', () => {
  beforeEach(() => localStorage.setItem('mos.locale', 'id'))
  afterEach(() => localStorage.clear())

  it('renders Indonesian, including the document title', async () => {
    renderPage()
    expect(screen.getByText('Halaman ini tidak ada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kembali' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ke Beranda' })).toBeInTheDocument()
    expect(screen.queryByText(/page not found/i)).toBeNull()
    await waitFor(() => expect(document.title).toBe('Halaman tidak ditemukan — Gordi MOS'))
  })

  it('Go back navigates history backwards', () => {
    renderPage()
    expect(screen.getByTestId('loc')).toHaveTextContent('at /mos/no/such/path')
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }))
    expect(screen.getByTestId('loc')).toHaveTextContent('at /mos/work/tasks')
  })
})

// #411 review: DESIGN.md § Accessibility, "Heading levels (v4)" — "The page frame owns the
// page's only <h1>." The v4 port replaced the hand-rolled h1 with an EmptyState h2 and added
// no PageHead, so the route's heading tree started at level 2 with nothing above it.
describe('NotFoundPage — heading contract (#411)', () => {
  afterEach(() => localStorage.clear())

  it('the route has exactly one h1, and it names the surface', () => {
    renderPage()
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent('Page not found')
  })

  it('the h1 is localized with the rest of the surface', () => {
    localStorage.setItem('mos.locale', 'id')
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Halaman tidak ditemukan')
  })
})
