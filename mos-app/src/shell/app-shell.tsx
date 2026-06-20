import { useState, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { Rail } from './rail'
import { TopBar } from './top-bar'
import { MobileDrawer } from './mobile-drawer'
import { useIsNarrow } from './use-is-narrow'
import { CommandMenu } from '@/components/command/command-menu'
import { useCommandMenu } from '@/components/command/use-command-menu'

export function AppShell() {
  const isNarrow = useIsNarrow()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { open: searchOpen, setOpen: setSearchOpen } = useCommandMenu()
  const focusHamburgerRef = useRef<(() => void) | undefined>(undefined)

  return (
    <>
      <div
        className="min-h-screen bg-secondary/35"
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : 'var(--rail-w) 1fr',
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
    </>
  )
}
