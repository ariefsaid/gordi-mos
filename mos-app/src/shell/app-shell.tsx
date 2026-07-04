import { useState, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { Rail } from './rail'
import { TopBar } from './top-bar'
import { MobileDrawer } from './mobile-drawer'
import { BottomTabBar } from './bottom-tab-bar'
import { useIsNarrow } from './use-is-narrow'
import { CommandMenu } from '@/components/command/command-menu'
import { useCommandMenu } from '@/components/command/use-command-menu'
import { BreadcrumbTitleProvider } from './breadcrumb-title'
import { SHOW_ASSISTANT } from '@/config/features'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'
import { AssistantFab } from '@/components/assistant/AssistantFab'

function ShellContent() {
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
          width: '100%',
          maxWidth: '100vw',
          minWidth: 0,
          overflowX: 'hidden',
          // minmax(0, 1fr) (not bare 1fr) so the content column can shrink below its
          // min-content — bare 1fr's implicit min-width:auto lets wide content (a dense
          // table/cards) stretch the track past the viewport → app-wide horizontal scroll.
          gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : 'var(--rail-w) minmax(0, 1fr)',
          gridTemplateRows: isNarrow
            ? 'var(--header-h) 1fr var(--tabbar-h)'
            : 'var(--header-h) 1fr',
          gridTemplateAreas: isNarrow
            ? '"topbar" "main" "tabbar"'
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
          className="flex min-w-0 flex-col min-h-0"
          style={{ gridArea: 'main' }}
        >
          <Outlet />
        </div>

        {/* BottomTabBar — grid-area: tabbar, phone-first primary nav (ADR-0019 D8, plan §4.4) */}
        {isNarrow && <BottomTabBar />}
      </div>

      {/* Mobile drawer — rendered outside the grid so it can be fixed/overlaid.
          The drawer stays the "more" surface (Admin, locale, secondary routes) even
          on phone where BottomTabBar is the primary nav — plan §1.7. */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        focusOpener={() => focusHamburgerRef.current?.()}
      />

      {/* Command palette (⌘K) — mounted outside the grid as an overlay (ADR-0013 D4) */}
      <CommandMenu open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Deputy assistant (ADR-0018 P2) — mounted once at the shell root, behind SHOW_ASSISTANT.
          The panel is keep-mounted (self-gates visibility on `open`); the FAB self-gates on
          narrow + flag. Absent entirely when the flag is off (FR-P2-CF-003). */}
      {SHOW_ASSISTANT && (
        <>
          <AssistantPanel />
          <AssistantFab />
        </>
      )}
    </BreadcrumbTitleProvider>
  )
}

export function AppShell() {
  // Wrap the shell in the runtime provider ONLY when the deputy capability is on (FR-P2-CF-003).
  // Flag-off skips the provider entirely so no assistant context/state mounts.
  if (!SHOW_ASSISTANT) return <ShellContent />
  return (
    <AgentRuntimeProvider>
      <ShellContent />
    </AgentRuntimeProvider>
  )
}
