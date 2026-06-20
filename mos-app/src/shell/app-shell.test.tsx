import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'

const mockUseAuth = vi.mocked(useAuth)

import { AppShell } from './app-shell'

function renderShell(path = '/') {
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

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div role="main">page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// RI-shell-1 / AC-S02: AppShell grid structure — topbar spans full width, rail+main are siblings
describe('RI-shell-1 (AC-S02): AppShell grid structure', () => {
  it('AC-S02: TopBar is NOT nested inside the main column — it is a direct child of the shell grid', () => {
    const { container } = renderShell()
    // The shell grid is the outermost div with display:grid
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement | null
    expect(shellGrid).not.toBeNull()
    // TopBar renders a <header>; it must be a direct child of the shell grid
    const header = shellGrid!.querySelector(':scope > header')
    expect(header).not.toBeNull()
    // The <header> must NOT be nested inside another div that is a child of the shell grid
    const directDivChildren = Array.from(shellGrid!.querySelectorAll(':scope > div'))
    const headerInsideDiv = directDivChildren.some((div) => div.querySelector('header') !== null)
    expect(headerInsideDiv).toBe(false)
  })

  it('AC-S02: shell grid uses grid-template-areas placing topbar across both columns at wide width', () => {
    const { container } = renderShell()
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement | null
    expect(shellGrid).not.toBeNull()
    const areas = shellGrid!.style.gridTemplateAreas
    // At wide viewport (useIsNarrow defaults to false in these tests — no mock, real hook returns false)
    // The areas string must contain "topbar topbar" (topbar spans both cols)
    expect(areas).toContain('topbar topbar')
    expect(areas).toContain('rail')
    expect(areas).toContain('main')
  })

  it('AC-S02: brand column width token matches rail width token (--rail-w, not a literal)', () => {
    const { container } = renderShell()
    // The brand column div inside TopBar must reference --rail-w, not a raw pixel literal
    // We detect this by checking the inline style uses the CSS variable reference
    const brandCol = container.querySelector('[style*="--rail-w"]') as HTMLElement | null
    expect(brandCol).not.toBeNull()
  })

  it('AC-S02: Rail and outlet-wrapper are grid-area siblings (both direct children of shell grid)', () => {
    const { container } = renderShell()
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement | null
    expect(shellGrid).not.toBeNull()
    // Rail renders as <aside>; outlet wrapper is the div with grid-area: main
    const aside = shellGrid!.querySelector(':scope > aside')
    expect(aside).not.toBeNull()
    const mainWrapper = shellGrid!.querySelector(':scope > [style*="grid-area"]') as HTMLElement | null
    // The outlet wrapper div must have grid-area: main
    expect(mainWrapper).not.toBeNull()
  })
})

// AC-015: exactly one nav landmark named "Primary", one banner, one main
describe('AC-015: Shell landmarks', () => {
  it('has exactly one navigation landmark named "Primary"', () => {
    renderShell()
    const navs = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(navs).toHaveLength(1)
  })

  it('has exactly one banner landmark', () => {
    renderShell()
    const banners = screen.getAllByRole('banner')
    expect(banners).toHaveLength(1)
  })

  it('has exactly one main landmark (owned by the page/outlet, not the shell)', () => {
    renderShell()
    const mains = screen.getAllByRole('main')
    expect(mains).toHaveLength(1)
  })

  it('renders outlet content', () => {
    renderShell()
    expect(screen.getByText('page')).toBeInTheDocument()
  })
})

// AC-K02: the command menu mounts at the shell level and opens via the trigger + ⌘K hotkey
describe('AC-K02: AppShell mounts the command menu', () => {
  it('AC-K02: the menu is closed by default (no dialog named "Command menu")', () => {
    renderShell()
    expect(screen.queryByRole('dialog', { name: 'Command menu' })).toBeNull()
  })

  it('AC-K02: clicking the Search trigger opens the command menu', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Search/i }))
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeInTheDocument()
  })

  it('AC-K02: ⌘K opens the command menu globally', () => {
    renderShell()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeInTheDocument()
  })
})
