import { useState, useRef, useMemo, type ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Rail } from './rail'
import { TopBar } from './top-bar'
import { ContextRow } from './context-row'
import { MobileDrawer } from './mobile-drawer'
import { BottomTabBar } from './bottom-tab-bar'
import { useIsNarrow } from './use-is-narrow'
import { CommandMenu } from '@/components/command/command-menu'
import { useCommandMenu } from '@/components/command/use-command-menu'
import { BreadcrumbTitleProvider } from './breadcrumb-title'
import { SHOW_ASSISTANT } from '@/config/features'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'
import { SignalComposerHost, useSignalComposer } from './signal-composer-host'
import { OverlayHostSlot, type OverlayHistoryDriver, OverlayHostProvider } from './overlay-host'
import { useDeputyOverlayCoexistence } from './deputy-overlay-coexistence'

/**
 * Wires the shared overlay host to react-router (V3 Issue 4 route seam): the history driver
 * reads the browser history index from `window.history.state.idx` and routes relative
 * `go(delta)` through react-router's `navigate(delta)`. URL markers (`__mosOverlay`) are
 * pushed/synced by the controller via `withOverlayMarker`; a hard load carrying a marker is
 * restored through a tenant-supplied deep-link resolver (the shell wires the driver only —
 * record content is owned by the Task/Signal slots, deferred to their own slices).
 */
function OverlayHostRoot({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const historyDriver = useMemo<OverlayHistoryDriver>(
    () => ({
      index: () => {
        if (typeof window === 'undefined' || !window.history?.state) return null
        const idx = (window.history.state as { idx?: unknown }).idx
        return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 ? idx : null
      },
      go: (delta: number) => navigate(delta),
    }),
    [navigate],
  )
  return <OverlayHostProvider historyDriver={historyDriver}>{children}</OverlayHostProvider>
}

function ShellContent() {
  const isNarrow = useIsNarrow()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerOpener, setDrawerOpener] = useState<'hamburger' | 'more'>('hamburger')
  const { open: searchOpen, setOpen: setSearchOpen } = useCommandMenu()
  const { open: openSignalComposer } = useSignalComposer()
  const focusHamburgerRef = useRef<(() => void) | undefined>(undefined)
  const focusMoreRef = useRef<(() => void) | undefined>(undefined)

  // Lane B2 — reconcile Deputy (right-floating slide-over) with any shell-owner overlay (Inbox
  // quick-triage), which share the same right-edge z-drawer track. Mounted here because
  // ShellContent sits inside both AgentRuntimeProvider and OverlayHostProvider, so the hook can
  // see both controllers. Collection-owner records remain mounted in the page grid; AssistantPanel
  // reads that same host session and switches to its compact record-safe desktop regime. This hook
  // only acts on the truly conflicting owner==='shell' track.
  useDeputyOverlayCoexistence()

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
          onOpenDrawer={() => { setDrawerOpener('hamburger'); setDrawerOpen(true) }}
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
          {/* Region 2 — context row (scope + route job sentence). Above the content Outlet. */}
          <ContextRow />
          {/* Region 3 — content (the page <Outlet>; the page's own PageHead H1 lives here). */}
          <div data-anatomy="content" className="min-w-0 flex-1 min-h-0">
            <Outlet />
          </div>
        </div>

        {/* BottomTabBar — grid-area: tabbar, phone-first primary nav (ADR-0019 D8, plan §4.4) */}
        {isNarrow && (
          <BottomTabBar
            onOpenMore={() => { setDrawerOpener('more'); setDrawerOpen(true) }}
            onOpenActionLauncher={() => setSearchOpen(true)}
            onRegisterMoreFocus={(focus) => { focusMoreRef.current = focus }}
          />
        )}

        {/*
          The single physical OverlayHostSlot owned by the shell (V3 Issue 4 / FR-V3-007).
          It is a direct child of the shell grid so the test can verify its presence and
          parentage. It renders no children (the shell UI is already rendered as grid siblings);
          it only conditionally renders the RecordPanelHost when the active overlay session's
          top frame has owner="shell". Collection-owned entries (tasks, signals, deputy) use
          the SAME shell slot — the OverlayHostSlot's owner filter ensures only one physical
          host exists at a time. The slot uses display:contents so it doesn't create a grid item.
        */}
        <OverlayHostSlot owner="shell" />
      </div>

      {/* Mobile drawer — rendered outside the grid so it can be fixed/overlaid.
          The drawer stays the "more" surface (Admin, locale, secondary routes) even
          on phone where BottomTabBar is the primary nav — plan §1.7. */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        focusOpener={() => {
          if (drawerOpener === 'more') focusMoreRef.current?.()
          else focusHamburgerRef.current?.()
        }}
      />

      {/* Command palette (⌘K) — mounted outside the grid as an overlay (ADR-0013 D4). Share
          Signal (AC-428/FR-417) dispatches to the shared composer host (C1), never a route. */}
      <CommandMenu open={searchOpen} onClose={() => setSearchOpen(false)} onShareSignal={openSignalComposer} />

      {/* Deputy assistant (ADR-0018 P2) — the panel is mounted once at the shell root, behind
          SHOW_ASSISTANT (keep-mounted; self-gates visibility on `open`). The launcher is a neutral
          header icon in the top-bar on every viewport (DESIGN.md No-FAB Rule — no floating FAB).
          Absent entirely when the flag is off (FR-P2-CF-003). */}
      {SHOW_ASSISTANT && <AssistantPanel />}
    </BreadcrumbTitleProvider>
  )
}

export function AppShell() {
  // SignalComposerHost mounts once at the shell root (C1 — "one command, many entry points"):
  // ⌘K, the mobile Action Launcher (which itself opens ⌘K), and the Home feed's Share-a-Signal
  // row all consume the SAME useSignalComposer().open() (AC-428/FR-417).
  //
  // Wrap the shell in the runtime provider ONLY when the deputy capability is on (FR-P2-CF-003).
  // Flag-off skips the provider entirely so no assistant context/state mounts.
  //
  // The OverlayHostProvider wraps the narrowest shell boundary that covers TopBar, Outlet
  // collections, Inbox/Deputy, command/composer, and the physical host slot (V3 Issue 4).
  // It sits INSIDE SignalComposerHost/AgentRuntimeProvider so those providers are available
  // to any overlay content (tasks, signals, deputy).
  const shellWithOverlay = (
    <OverlayHostRoot>
      <ShellContent />
    </OverlayHostRoot>
  )

  if (!SHOW_ASSISTANT) {
    return (
      <SignalComposerHost>
        {shellWithOverlay}
      </SignalComposerHost>
    )
  }
  return (
    <AgentRuntimeProvider>
      <SignalComposerHost>
        {shellWithOverlay}
      </SignalComposerHost>
    </AgentRuntimeProvider>
  )
}
