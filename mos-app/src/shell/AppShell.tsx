import { useState, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import Rail from './Rail'
import Header from './Header'
import MobileDrawer from './MobileDrawer'
import { useIsNarrow } from './useIsNarrow'

export default function AppShell() {
  const isNarrow = useIsNarrow()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const focusHamburgerRef = useRef<(() => void) | undefined>(undefined)

  return (
    <>
      <div
        className="min-h-screen bg-secondary/35"
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : 'var(--rail-w) 1fr',
        }}
      >
        {/* Rail — hidden at <920px; drawer is the nav at narrow widths */}
        {!isNarrow && <Rail />}

        {/* Right column: header + page outlet */}
        <div className="flex flex-col min-h-screen">
          <Header
            onOpenDrawer={() => setDrawerOpen(true)}
            onRegisterHamburgerFocus={(fn) => { focusHamburgerRef.current = fn }}
          />
          {/* R3: no <main> wrapper here — each page provides its own */}
          <Outlet />
        </div>
      </div>

      {/* Mobile drawer — rendered outside the grid so it can be fixed/overlaid */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        focusOpener={() => focusHamburgerRef.current?.()}
      />
    </>
  )
}
