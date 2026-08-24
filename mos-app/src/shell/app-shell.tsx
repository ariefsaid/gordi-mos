import { useState, useRef, useMemo, type ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
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
import { OverlayHostProvider, OverlayHostSlot, type OverlayHistoryDriver } from './overlay-host'
import { SignalComposerHost, useSignalComposer } from './signal-composer-host'
import { createRecordDeepLinkResolver, RECORD_KINDS } from './record-deep-link-resolver'
import { useDeputyOverlayCoexistence } from './deputy-overlay-coexistence'
import { useT } from '@/i18n/use-t'

// Mounted with the Signals surface, exactly as the deferral note here said it would be (#267).
// `SignalComposerHost` mounts `SignalComposer` and reads the mention rosters; `SignalsArchivePage`
// calls `useSignalComposer()`, which THROWS when the provider is absent. #193 built both the
// surface and this host and mounted neither, so routing the archive without this crashed the page
// into the error boundary — caught by rendering it, not by the suite, because the page's own test
// supplies the provider itself.

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

/**
 * Wires the shared overlay host to react-router (the route seam): the history driver reads the
 * browser history index from `window.history.state.idx` and routes relative `go(delta)` through
 * react-router's `navigate(delta)`. URL markers (`__mosOverlay`) are pushed/synced by the
 * controller; a load carrying a marker is restored through the record deep-link resolver.
 */
function OverlayHostRoot({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const t = useT()
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
  // D-A1 (item 4): a reload / Back-Forward onto a URL carrying a persisted `__mosOverlay` route
  // marker restores the record through the registry-backed resolver. Collections that keep the open
  // record in their OWN `?record=` query restore through their page effect first — a child effect
  // runs before this parent one, which then finds a session already open and no-ops. So this covers
  // the route sessions whose id lives ONLY in the marker. `RECORD_KINDS` carries the two shipped
  // kinds — the Home-feed Signal and the queue Follow-up (#424) — so a marker-only deep link reopens
  // them both (asserted, not assumed — record-deep-link-resolver.test.tsx).
  const deepLinkResolver = useMemo(() => createRecordDeepLinkResolver(t, RECORD_KINDS), [t])
  return (
    <OverlayHostProvider historyDriver={historyDriver} deepLinkResolver={deepLinkResolver}>
      {children}
    </OverlayHostProvider>
  )
}

function ShellContent() {
  const isNarrow = useIsNarrow()
  // OD-REDESIGN-84.2 (P1-1): the intermediate 920–1099.98px regime — desktop rail still
  // mounted (isNarrow is false) but too tight for the full 232px labelled rail — collapses
  // to the ~72px icon-only rail. Reuses the existing split-width breakpoint family (the same
  // 1100px threshold `task-drawer`, `tasks-layout` and `record-panel-host` already key their own
  // regime off) rather than inventing a new query,
  // so the rail's compact boundary tracks the app's one documented "narrow vs split" breakpoint.
  const isSplit = useIsSplitWidth()
  const railCompact = !isNarrow && !isSplit
  // v4 shell rebuild (Task 1): the header hamburger is gone — the bottom-tab More button is
  // the drawer's sole opener now, so there's only ever one opener to track focus-return for.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { open: searchOpen, mode: searchMode, setOpen: setSearchOpen, openWithMode } = useCommandMenu()
  // AC-428/FR-417: every Share Signal entry point — ⌘K, the phone action launcher (which opens
  // ⌘K), the Home feed row — dispatches the SAME useSignalComposer().open().
  const { open: openSignalComposer } = useSignalComposer()
  const focusMoreRef = useRef<(() => void) | undefined>(undefined)

  // Lane B2 — reconcile the Deputy companion with any shell-owner overlay. Both consume the shell's
  // right-edge surface track, so at most one may be open. Mounted here because ShellContent sits
  // inside both AgentRuntimeProvider and OverlayHostProvider, so the hook can see both controllers.
  // Collection-owner records live inside the page grid and are untouched by it.
  useDeputyOverlayCoexistence()

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
        <TopBar onOpenSearch={() => openWithMode('search')} />

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
            `onOpenActionLauncher` opens the palette in 'launcher' mode — the REDUCED create-set
            (the universal Actions only, no Recent and no Navigate), per OD-46/GAP-10. Typing still
            escalates to the shared record search, which is OD-46's "More opens the full palette". */}
        {isNarrow && (
          <BottomTabBar
            onOpenMore={() => setDrawerOpen(true)}
            onOpenActionLauncher={() => openWithMode('launcher')}
            onRegisterMoreFocus={(focus) => { focusMoreRef.current = focus }}
            moreOpen={drawerOpen}
          />
        )}

        {/*
          The single physical OverlayHostSlot owned by the shell. It is a direct child of the shell
          grid so its presence and parentage are checkable. It renders no children (the shell UI is
          already rendered as grid siblings); it only renders the RecordPanelHost when the active
          overlay session's top frame has owner="shell". Collection pages mount their OWN slot with
          their own owner, and the slot's owner filter is what keeps exactly one physical host on
          screen. `display: contents` keeps the slot from becoming a grid item.
        */}
        <OverlayHostSlot owner="shell" />
      </div>

      {/* Mobile drawer — rendered outside the grid so it can be fixed/overlaid.
          The drawer stays the "more" surface (Admin, locale, secondary routes) even
          on phone where BottomTabBar is the primary nav — plan §1.7. */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        focusOpener={() => focusMoreRef.current?.()}
      />

      {/* Command palette (⌘K) — mounted outside the grid as an overlay (ADR-0013 D4). */}
      <CommandMenu
        open={searchOpen}
        mode={searchMode}
        onClose={() => setSearchOpen(false)}
        onShareSignal={openSignalComposer}
      />

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
  // OverlayHostProvider sits INSIDE AgentRuntimeProvider, not outside it: overlay content is
  // ordinary app content and may reach for the runtime, and `useDeputyOverlayCoexistence` has to
  // see both controllers from one child. `SignalComposerHost` wraps the overlay root, matching
  // v4's nesting: the composer is a shell-level modal that must survive route changes, and route
  // content beneath it calls `useSignalComposer()`.
  const shellWithOverlay = (
    <SignalComposerHost>
      <OverlayHostRoot>
        <ShellContent />
      </OverlayHostRoot>
    </SignalComposerHost>
  )
  if (!SHOW_ASSISTANT) return shellWithOverlay
  return <AgentRuntimeProvider>{shellWithOverlay}</AgentRuntimeProvider>
}
