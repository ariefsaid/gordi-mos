import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RailNav from './RailNav'

// Helper component to probe current location
function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderRailNav(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <RailNav />
              <LocationDisplay />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

// AC-002: brand block + 4 nav links + no badges + disabled Settings
describe('AC-002: Rail contents', () => {
  it('shows brand block with Gordi MOS and Management OS', () => {
    renderRailNav('/tasks')
    expect(screen.getByText('Gordi MOS')).toBeInTheDocument()
    expect(screen.getByText('Management OS')).toBeInTheDocument()
  })

  it('renders exactly four nav links in order: My Week / Tasks / Updates / Ops', () => {
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links[0]).toHaveAccessibleName('My Week')
    expect(links[1]).toHaveAccessibleName('Tasks')
    expect(links[2]).toHaveAccessibleName('Updates')
    expect(links[3]).toHaveAccessibleName('Ops')
  })

  it('has no badge-count elements', () => {
    const { container } = renderRailNav('/tasks')
    expect(container.querySelector('[data-badge]')).toBeNull()
  })

  it('Settings item has aria-disabled=true and coming-soon title', () => {
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings').closest('[aria-disabled]')
    expect(settings).toHaveAttribute('aria-disabled', 'true')
    expect(settings).toHaveAttribute('title', 'Settings — coming soon')
  })

  it('clicking Settings does not navigate away from /tasks', async () => {
    const user = userEvent.setup()
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings')
    await user.click(settings)
    expect(screen.getByTestId('location').textContent).toBe('/tasks')
  })
})

// AC-003: active nav per route
describe('AC-003: Active nav per route', () => {
  it('Tasks link has aria-current=page when at /tasks, others do not', () => {
    renderRailNav('/tasks')
    const links = screen.getAllByRole('link')
    const activeLinks = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]).toHaveAccessibleName('Tasks')
  })

  it('My Week link has aria-current=page when at /', () => {
    renderRailNav('/')
    const links = screen.getAllByRole('link')
    const activeLinks = links.filter((l) => l.getAttribute('aria-current') === 'page')
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]).toHaveAccessibleName('My Week')
  })
})

// FIX-5: Settings is reachable by AT — tabindex 0, aria-disabled, no-op on activation
describe('FIX-5: Settings reachable by assistive technology', () => {
  it('Settings element has tabIndex=0 so it is in tab order', () => {
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings').closest('[aria-disabled]') as HTMLElement | null
    expect(settings).toBeTruthy()
    expect(settings!.tabIndex).toBe(0)
  })

  it('Settings element has aria-label or accessible name that includes "Settings" and "coming soon"', () => {
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings').closest('[aria-disabled]') as HTMLElement | null
    expect(settings).toBeTruthy()
    // aria-label should mention "Settings — coming soon" for AT announcement
    const ariaLabel = settings!.getAttribute('aria-label') ?? settings!.getAttribute('title') ?? ''
    expect(ariaLabel.toLowerCase()).toMatch(/settings.*coming soon|coming soon.*settings/i)
  })

  it('pressing Enter on Settings does not navigate', async () => {
    const user = userEvent.setup()
    renderRailNav('/tasks')
    const settings = screen.getByText('Settings').closest('[aria-disabled]') as HTMLElement
    settings.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location').textContent).toBe('/tasks')
  })
})

// AC-015: every nav SVG is aria-hidden
describe('AC-015: Nav icon semantics', () => {
  it('all SVGs inside the nav have aria-hidden=true', () => {
    const { container } = renderRailNav('/tasks')
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
