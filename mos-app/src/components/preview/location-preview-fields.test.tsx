// @vitest-environment-options {"url": "http://localhost:4400/"}
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocationBalanceSection, LocationLineField, LocationLineOverride, LocationPanelFields, LocationRecordFields, LocationRecordsFilter } from './location-preview-fields'

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'p1' }, accessRoles: ['admin'], roles: [], isManager: false, affiliated: [] }, signOut: vi.fn() }),
}))

const ui = () => (
  <MemoryRouter>
    <LocationPanelFields kind="production" />
    <LocationPanelFields kind="transfer" />
    <LocationPanelFields kind="receive" />
    <LocationLineOverride />
    <LocationLineField kind="waste" />
    <LocationLineField kind="count" />
    <LocationRecordsFilter />
    <dl><LocationRecordFields keys={['production', 'storeOutput', 'from', 'to', 'storage', 'storeIn']} /></dl>
    <LocationBalanceSection />
  </MemoryRouter>
)
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('location fields on released pages', () => {
  it('render nothing at all without the preview opt-in (the released pages are unchanged)', () => {
    const { container } = render(ui())
    expect(container.querySelector('[data-location-preview]')).toBeNull()
    expect(screen.queryByText(/location/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Change location')).not.toBeInTheDocument()
    expect(container.querySelector('a, button, select, input, details')).toBeNull()
  })

  it('with the opt-in, show every field disabled and "Not recorded", and link to Locations for an admin', () => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('VITE_FUTURE_PREVIEW', '1')
    const { container } = render(ui())
    for (const label of ['Production location', 'Store output in', 'From storage', 'To storage', 'Storage location', 'Store in']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText('— · Not recorded').length).toBeGreaterThan(5)
    // Each decision sits at its own step: panel fields beside Submit / Lock, a line's own storage on the line; no header block.
    expect(container.querySelector('[data-location-preview="receive-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-location-preview="receive-line"] summary')).toHaveTextContent('Store this line somewhere else')
    expect(container.querySelector('[data-location-preview="waste-line"]')).not.toBeNull()
    expect(container.querySelector('[data-location-preview="production"], [data-location-preview="transfer"]')).toBeNull()
    expect(container.querySelectorAll('button[role=combobox]:not([disabled])').length).toBe(0)
    expect(screen.getAllByRole('link', { name: 'Manage locations' })[0]).toHaveAttribute('href', '/cafe/locations')
    expect(screen.getByRole('link', { name: 'Change location' })).toHaveAttribute('href', '/cafe/locations/change-location')
    expect(screen.getByText(/Quantities by location are not available/)).toBeInTheDocument()
  })
})
