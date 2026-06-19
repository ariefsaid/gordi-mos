import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { RailNav } from './rail-nav'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG } from '@/config/features'

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

// AC-002: nav-only rail (ADR-0013 D1 — workspace switcher + search + user chip moved to top bar)
describe('AC-002: Rail contents', () => {
  it('shows the Workspace section label and nav links (no switcher/search/userchip)', () => {
    renderRailNav('/tasks')
    // Workspace section label still present
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    // Brand / switcher and search are now in the top bar — not in the rail
    expect(screen.queryByRole('button', { name: /Gordi MOS workspace/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
  })

  it('renders the visible nav links in order (My Week / Tasks always; Weekly Updates / Daily Log per feature flag)', () => {
    renderRailNav('/tasks')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = within(nav).getAllByRole('link')
    const expected = [
      'My Week',
      'Tasks',
      ...(SHOW_WEEKLY_UPDATES ? ['Weekly Updates'] : []),
      ...(SHOW_DAILY_LOG ? ['Daily Log'] : []),
    ]
    expect(links).toHaveLength(expected.length)
    expected.forEach((name, i) => expect(links[i]).toHaveAccessibleName(name))
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

// AC-S05: rail is nav-only after the top-bar revamp — no switcher, no search, no user chip
describe('AC-S05: rail is navigation-only', () => {
  it('AC-S05: rail has nav group + Settings only — no switcher/search/userchip', () => {
    renderRailNav('/tasks')
    // No workspace switcher button
    expect(screen.queryByRole('button', { name: /Gordi MOS workspace/ })).toBeNull()
    // No in-rail search button
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    // Nav group label still present
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    // Settings stub still present
    expect(screen.getByText('Settings')).toBeInTheDocument()
    // No user chip in the rail — the named button for the viewer should not exist
    expect(screen.queryByRole('button', { name: /Cahya Cafe/ })).toBeNull()
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
