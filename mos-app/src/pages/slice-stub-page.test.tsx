/**
 * SliceStubPage — Redesign Step 2 (T8, NEW per spec §3.1). One parameterized
 * placeholder for not-in-this-slice routes (/work/signals, /events, /ecommerce,
 * /roastery, /profile). Renders the route's job sentence + a labelled "not in
 * this slice" body. Distinct from not-found-page.tsx (a 404): this is a real
 * route placeholder, never a 404.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { MessageKey } from '@/i18n/messages'
import { SliceStubPage } from './slice-stub-page'

function renderStub(jobKey: MessageKey, nameKey: MessageKey, locale: 'en' | 'id' = 'en') {
  localStorage.setItem('mos.locale', locale)
  return render(
    <I18nProvider>
      <MemoryRouter>
        <SliceStubPage jobKey={jobKey} nameKey={nameKey} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AC-013/FR-013 (T8): SliceStubPage — labelled stub, never a 404', () => {
  it('renders the resolved title key as the H1', () => {
    renderStub('job.events', 'dest.events')
    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
  })

  it('renders the route job sentence (via i18n jobKey)', () => {
    renderStub('job.signals', 'nav.signals')
    expect(
      screen.getByText('Search and revisit the Signals your Teams have shared.'),
    ).toBeInTheDocument()
  })

  it('renders the "not in this slice" copy with the name', () => {
    const { container } = renderStub('job.ecommerce', 'dest.ecommerce')
    // §3.7 renders both in one <p>; assert the combined copy is present.
    expect(container.textContent).toContain('Not in this slice')
    expect(container.textContent).toContain('Ecommerce lands in a later build step.')
  })

  it('is never a 404 — renders a main region with content (not NotFoundPage)', () => {
    const { container } = renderStub('job.profile', 'dest.profile')
    expect(screen.getByRole('main')).toBeInTheDocument()
    // The stub copy is present, confirming it is a placeholder, not a 404 page.
    expect(container.textContent).toContain('Not in this slice')
  })

  it('resolves the H1 and document title through i18n for Indonesian', () => {
    renderStub('job.events', 'dest.events', 'id')
    expect(screen.getByRole('heading', { level: 1, name: 'Acara' })).toBeInTheDocument()
    expect(document.title).toBe('Acara — Gordi MOS')
  })
})
