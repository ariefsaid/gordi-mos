import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SliceStubPage } from './slice-stub-page'

function renderStub(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>{ui}</I18nProvider>
    </MemoryRouter>,
  )
}

describe('SliceStubPage — the placeholder for a route whose surface is not built yet', () => {
  it('names the destination and states its job, so the route is not a blank page', () => {
    renderStub(<SliceStubPage jobKey="job.roastery" nameKey="dest.roastery" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Roastery' })).toBeInTheDocument()
    expect(screen.getByText(/record today.s roasts/i)).toBeInTheDocument()
  })

  it('says the slice is not built — never that the page does not exist', () => {
    // The distinction the component exists for. A 404 tells a viewer the rail lied to them; this
    // tells them the destination is real and the work is queued.
    renderStub(<SliceStubPage jobKey="job.ecommerce" nameKey="dest.ecommerce" />)

    const empty = screen.getByTestId('empty-state')
    expect(empty).toHaveAttribute('data-empty-variant', 'blank')
    expect(screen.getByRole('heading', { level: 2, name: /not in this slice yet/i })).toBeInTheDocument()
    expect(screen.getByText(/ecommerce lands in a later build step/i)).toBeInTheDocument()
    expect(screen.queryByText(/does not exist|not found/i)).not.toBeInTheDocument()
  })

  it('sets the document title from the destination name', () => {
    renderStub(<SliceStubPage jobKey="job.events" nameKey="dest.events" />)
    expect(document.title).toBe('Events — Gordi MOS')
  })

  it('renders in the record family when the route is a record door', () => {
    const { container } = renderStub(
      <SliceStubPage jobKey="job.signals" nameKey="nav.work.signals" family="focused-record" />,
    )
    expect(container.querySelector('[data-page-family="focused-record"]')).not.toBeNull()
  })
})
