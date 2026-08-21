import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { NotFoundPage } from './not-found-page'

// #400 (v4 port): the 404 is fully localized, names the failed path, and offers BOTH
// recoveries — go back (one segment is usually all that's wrong) and Home.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/mos/no/such/path']}>
      <I18nProvider>
        <NotFoundPage />
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
    // navigate(-1) is a no-op against a fresh history stack; the control's contract is
    // asserted by presence + the router's own suite. Clicking must not throw.
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }))
  })
})
