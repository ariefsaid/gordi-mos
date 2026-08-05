import { useState, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { Rail } from './rail'
import { TopBar } from './top-bar'
import { ContextRow } from './context-row'
import { MobileDrawer } from './mobile-drawer'
import { BottomTabBar } from './bottom-tab-bar'
import { useIsNarrow } from './use-is-narrow'
import { useIsSplitWidth } from './use-is-split-width'
import { CommandMenu } from '@/components/command/command-menu'
import { useCommandMenu } from '@/components/command/use-command-menu'
import { BreadcrumbTitleProvider } from './breadcrumb-title'
import { SHOW_ASSISTANT } from '@/config/features'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'

// DEFERRED TO #190 (the overlay and record hosts). v4's AppShell also mounts the shared overlay
// host (its react-router history driver + the `__mosOverlay` deep-link resolver), the Signal
// composer host, and the Deputy/overlay coexistence hook. None of those modules exist on this
// branch yet, so the chrome ports without them; #190 restores the `OverlayHostRoot` wrapper, the
// single `<OverlayHostSlot owner="shell" />` grid child, `<SignalComposerHost>` and
// `useDeputyOverlayCoexistence()`. Nothing in the chrome below depends on them.

// v4 shell rebuild (Task 7 a11y): the skip link — the FIRST focusable element in the app, so a
// keyboard/screen-reader user can bypass the header (and, on phone, any opened drawer) chrome and
// land directly on the content region (id="main-content" below). Visually hidden until focused.
//
// NOT Tailwind's `sr-only`/`focus:not-sr-only` combo: several component CSS files in this repo
// (TaskSurface.css, TasksWorkspace.css, kitchen-plan-page.css, kitchen-review-page.css) define
// their OWN global (unscoped) `.sr-only` class, and whichever stylesheet Vite happens to inject
// last wins the cascade — verified live: the `focus:` variant utilities were silently overridden,
// so the link stayed clipped to 1×1px even while focused. Toggling the visible/hidden styles via
// React state sidesteps that CSS ordering hazard entirely.
function SkipLink() {
  const [focused, setFocused] = useState(false)
  return (
    <a
      href="#main-content"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={
        focused
          ? {
              position: 'fixed',
              left: 8,
              top: 8,
              zIndex: 'var(--z-toast)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: 'var(--font-size-body-lg)',
              boxShadow: 'var(--shadow-overlay)',
            }
          : {
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }
      }
    >
      Skip to main content
    </a>
  )
}

function ShellContent() {
  const isNarrow = useIsNarrow()
  // OD-REDESIGN-84.2 (P1-1): the intermediate 920–1099.98px regime — desktop rail still
  // mounted (isNarrow is false) but too tight for the full 232px labelled rail — collapses
  // to the ~72px icon-only rail. Reuses the existing split-width breakpoint family (the same
  // 1100px threshold `task-drawer` and `tasks-layout` already key their own regime off — v4 adds
  // `record-panel-host` to that list, which lands with #190) rather than inventing a new query,
  // so the rail's compact boundary tracks the app's one documented "narrow vs split" breakpoint.
  const isSplit = useIsSplitWidth()
  const railCompact = !isNarrow && !isSplit
  // v4 shell rebuild (Task 1): the header hamburger is gone — the bottom-tab More button is
  // the drawer's sole opener now, so there's only ever one opener to track focus-return for.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { open: searchOpen, setOpen: setSearchOpen } = useCommandMenu()
  const focusMoreRef = useRef<(() => void) | undefined>(undefined)

  return (
    // BreadcrumbTitleProvider wraps the full shell so both TopBar (Breadcrumb reader)
    // and the Outlet (TaskSurface writer) share the dynamic-title channel (ADR-0013 D1 / OD-P4-9).
    <BreadcrumbTitleProvider>
      <SkipLink />
      {/* R6-P2 (owner review r2): dvh, not vh, so the mobile browser's collapsing URL bar can't
          crop the bottom tab bar / content. h-dvh (dynamic HEIGHT), NOT min-h-dvh: the shell is a
          fixed-height grid whose content row (minmax(0,1fr)) scrolls INTERNALLY — min-height would
          unbind that row and let the whole shell grow (the "grows" case), breaking the internal
          scroll. h-dvh keeps the exact grid behaviour, only swapping vh → dvh. */}
      <div
        className="h-dvh bg-secondary/35"
        style={{
          display: 'grid',
          width: '100%',
          maxWidth: '100vw',
          minWidth: 0,
          overflowX: 'hidden',
          overflowY: 'hidden',
          // minmax(0, 1fr) (not bare 1fr) so the content column can shrink below its
          // min-content — bare 1fr's implicit min-width:auto lets wide content (a dense
          // table/cards) stretch the track past the viewport → app-wide horizontal scroll.
          gridTemplateColumns: isNarrow
            ? 'minmax(0, 1fr)'
            : `${railCompact ? 'var(--rail-w-compact)' : 'var(--rail-w)'} minmax(0, 1fr)`,
          gridTemplateRows: isNarrow
            ? 'var(--header-h) minmax(0, 1fr) var(--tabbar-h)'
            : 'var(--header-h) minmax(0, 1fr)',
          gridTemplateAreas: isNarrow
            ? '"topbar" "main" "tabbar"'
            : '"topbar topbar" "rail main"',
        }}
      >
        {/* TopBar — grid-area: topbar, spans full width across both columns (ADR-0013 D1) */}
        <TopBar onOpenSearch={() => setSearchOpen(true)} />

        {/* Rail — grid-area: rail, row 2 col 1; hidden at <920px (drawer is the nav);
            icon-only compact regime at 920–1099.98px (OD-REDESIGN-84.2 / P1-1). */}
        {!isNarrow && <Rail compact={railCompact} />}

        {/* Main — grid-area: main, row 2 col 2; owns scroll; each page provides its own <main> */}
        <div
          className="flex min-w-0 flex-col min-h-0"
          style={{ gridArea: 'main', overflow: 'hidden' }}
        >
          {/* Region 2 — context row (scope + route job sentence). Above the content Outlet. */}
          <ContextRow />
          {/* Region 3 — content (the page <Outlet>; the page's own PageHead H1 lives here).
              id="main-content" is the skip link's jump target (Task 7 a11y) — this wrapper exists
              on every route regardless of what the page itself renders inside; tabIndex={-1} lets
              it take programmatic focus without joining the normal Tab order. */}
          <div
            id="main-content"
            tabIndex={-1}
            data-anatomy="content"
            className="min-w-0 flex-1 min-h-0 overflow-hidden flex flex-col focus:outline-none"
          >
            <Outlet />
          </div>
        </div>

        {/* BottomTabBar — grid-area: tabbar, phone-first primary nav (ADR-0019 D8, plan §4.4).
            `onOpenActionLauncher` is NOT yet the reduced create-set: v4's `useCommandMenu` carries
            a 'launcher' mode whose palette shows only the universal create actions, and this
            branch's CommandMenu has no Actions group at all to reduce to. So the phone `+` opens
            the same full palette the search trigger opens; porting the mode without the create-set
            would be a prop that changes nothing. Recorded on the map, not left silent. */}
        {isNarrow && (
          <BottomTabBar
            onOpenMore={() => setDrawerOpen(true)}
            onOpenActionLauncher={() => setSearchOpen(true)}
            onRegisterMoreFocus={(focus) => { focusMoreRef.current = focus }}
            moreOpen={drawerOpen}
          />
        )}
      </div>

      {/* Mobile drawer — rendered outside the grid so it can be fixed/overlaid.
          The drawer stays the "more" surface (Admin, locale, secondary routes) even
          on phone where BottomTabBar is the primary nav — plan §1.7. */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        focusOpener={() => focusMoreRef.current?.()}
      />

      {/* Command palette (⌘K) — mounted outside the grid as an overlay (ADR-0013 D4). v4 also
          passes `mode` and an `onShareSignal` that dispatches to the shared Signal composer host;
          both wait on #190 (the composer host) and on the palette's own create-set. */}
      <CommandMenu open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Deputy assistant (ADR-0018 P2) — the state/content owner is mounted once at the shell root,
          behind SHOW_ASSISTANT; OverlayCompanionSlot/RecordPanelHost own its physical chrome. The launcher is a neutral
          header icon in the top-bar on every viewport (DESIGN.md No-FAB Rule — no floating FAB).
          Absent entirely when the flag is off (FR-P2-CF-003). */}
      {SHOW_ASSISTANT && <AssistantPanel />}
    </BreadcrumbTitleProvider>
  )
}

export function AppShell() {
  // Wrap the shell in the runtime provider ONLY when the deputy capability is on (FR-P2-CF-003).
  // Flag-off skips the provider entirely so no assistant context/state mounts.
  //
  // v4 additionally wraps this in `<SignalComposerHost>` and `<OverlayHostRoot>` — both land with
  // #190. The nesting order they require is recorded there: OverlayHostProvider sits INSIDE
  // SignalComposerHost/AgentRuntimeProvider so those providers are available to overlay content.
  if (!SHOW_ASSISTANT) return <ShellContent />
  return (
    <AgentRuntimeProvider>
      <ShellContent />
    </AgentRuntimeProvider>
  )
}
