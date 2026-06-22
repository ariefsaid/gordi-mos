import { useState, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { Rail } from './rail'
import { TopBar } from './top-bar'
import { MobileDrawer } from './mobile-drawer'
import { useIsNarrow } from './use-is-narrow'
import { CommandMenu } from '@/components/command/command-menu'
import { useCommandMenu } from '@/components/command/use-command-menu'
import { BreadcrumbTitleProvider } from './breadcrumb-title'

export function AppShell() {
  const isNarrow = useIsNarrow()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { open: searchOpen, setOpen: setSearchOpen } = useCommandMenu()
  const focusHamburgerRef = useRef<(() => void) | undefined>(undefined)

  return (
    // BreadcrumbTitleProvider wraps the full shell so both TopBar (Breadcrumb reader)
    // and the Outlet (TaskSurface writer) share the dynamic-title channel (ADR-0013 D1 / OD-P4-9).
    <BreadcrumbTitleProvider>
      <div
        className="h-screen bg-secondary/35"
        style={{
          display: 'grid',
          // minmax(0, 1fr) (not bare 1fr) so the content column can shrink below its
          // min-content — bare 1fr's implicit min-width:auto lets wide content (a dense
          // table/cards) stretch the track past the viewport → app-wide horizontal scroll.
          gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : 'var(--rail-w) minmax(0, 1fr)',
          gridTemplateRows: 'var(--header-h) 1fr',
          gridTemplateAreas: isNarrow
            ? '"topbar" "main"'
            : '"topbar topbar" "rail main"',
        }}
      >
        {/* TopBar — grid-area: topbar, spans full width across both columns (ADR-0013 D1) */}
        <TopBar
          drawerOpen={drawerOpen}
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onRegisterHamburgerFocus={(fn) => { focusHamburgerRef.current = fn }}
        />

        {/* Rail — grid-area: rail, row 2 col 1; hidden at <920px (drawer is the nav) */}
        {!isNarrow && <Rail />}

        {/* Main — grid-area: main, row 2 col 2; owns scroll; each page provides its own <main> */}
        <div
          className="flex flex-col min-h-0"
          style={{ gridArea: 'main' }}
        >
          <Outlet />
        </div>
      </div>

      {/* Mobile drawer — rendered outside the grid so it can be fixed/overlaid */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        focusOpener={() => focusHamburgerRef.current?.()}
      />

      {/* Command palette (⌘K) — mounted outside the grid as an overlay (ADR-0013 D4) */}
      <CommandMenu open={searchOpen} onClose={() => setSearchOpen(false)} />
    </BreadcrumbTitleProvider>
  )
}
