import { Breadcrumb } from './breadcrumb'
import { useRailCompact } from './use-rail-compact'
import { SHOW_ASSISTANT } from '@/config/features'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useT } from '@/i18n/use-t'
import { useNavigate } from 'react-router-dom'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { useOptionalOverlayHost } from './overlay-host'
import { InboxTriageConnected } from '@/components/inbox/inbox-triage-connected'

type TopBarProps = {
  /** Opens the ⌘K command menu (wired in AppShell). */
  onOpenSearch?: () => void
  /**
   * @deprecated The header hamburger was removed (v4 shell rebuild) — the phone nav's sole
   * opener is now the bottom-tab-bar's More button. Kept optional so existing call sites/tests
   * compile unchanged; TopBar no longer reads it.
   */
  onOpenDrawer?: () => void
}

// Bell icon — 16px, stroke-2, aria-hidden (notification stub, ADR-0013 D1)
function BellIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

// Search icon — 15px, stroke-2, aria-hidden
function SearchIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

// Deputy spark icon — 16px, stroke-2, aria-hidden (T28 desktop top-bar button)
export function DeputyIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// Gordi logo mark — navy square + orange sprinkle dot (brand identity, ADR-0013 D1)
function GordiLogoMark() {
  return (
    <div className="relative flex-none" style={{ width: 26, height: 26 }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-sm bg-brand-navy font-bold text-primary-foreground"
        style={{ fontSize: 'var(--font-size-body-lg)' }}
      >
        G
      </div>
      <span
        className="absolute bottom-0 right-0 rounded-full bg-brand-orange"
        style={{ width: 5, height: 5, transform: 'translate(30%, 30%)' }}
        aria-hidden="true"
      />
    </div>
  )
}

// The deputy launcher (T28) — a neutral header icon on EVERY viewport (desktop + phone), the one
// launcher location app-wide (DESIGN.md Deputy-Launcher/No-FAB Rule, owner-agreed 2026-07-07;
// supersedes ADR-0019 D11's orange FAB). Gates on SHOW_ASSISTANT; opens the slide-over via the
// runtime context. Reads the context safely (null-runtime no-op default) so it never throws when
// the flag is off and no provider is mounted.
function AssistantTopBarButton() {
  const t = useT()
  const { openPanel } = useAgentRuntime()
  return (
    <button
      type="button"
      aria-label={t('assistant.open')}
      title={t('assistant.open')}
      className="tap-target-phone tap-target-phone--icon flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground flex-none"
      style={{ width: 32, height: 32 }}
      onClick={openPanel}
    >
      <DeputyIcon />
    </button>
  )
}

// The notification bell (T16) — the Inbox door with an unread badge (ADR-0019 D9). It stays in
// the compact header as well as desktop, while the bottom-tab Inbox entry remains available on
// phones. With a mounted overlay host it quick-opens the SAME InboxTriage surface as an ephemeral
// root (no URL mutation), so a manager triages in context and the host returns focus to the bell
// on close; without a host (e.g. isolated tests) it falls back to the full `/inbox` route. Uses
// the dedicated useUnreadCount hook (CQ#2) so the badge is backed by the unread-only index, not
// the full list.
function NotificationBell() {
  const navigate = useNavigate()
  const t = useT()
  const host = useOptionalOverlayHost()
  const { unreadCount } = useUnreadCount()
  const label = unreadCount > 0 ? t('topBar.inboxUnread', { count: unreadCount }) : t('dest.inbox')

  const openInbox = () => {
    // No host mounted → full route; desktop with a host → ephemeral quick triage in context.
    if (!host) {
      navigate('/inbox')
      return
    }
    void host.openRoot(
      {
        key: 'inbox-quick',
        owner: 'shell',
        tenant: 'quick',
        label: t('inbox.quickTitle'),
        title: t('inbox.quickTitle'),
        content: <InboxTriageConnected mode="quick" />,
      },
      'ephemeral',
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="tap-target-phone tap-target-phone--icon relative flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground flex-none"
      style={{ width: 32, height: 32 }}
      onClick={openInbox}
    >
      <BellIcon />
      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute rounded-full bg-primary text-primary-foreground"
          style={{
            top: 2,
            right: 2,
            minWidth: 15,
            height: 15,
            fontSize: 9,
            lineHeight: '15px',
            fontWeight: 600,
            textAlign: 'center',
            padding: '0 3px',
          }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </button>
  )
}

// Global top bar (ADR-0013 D1).
// Layout left→right: [brand --rail-w] | [breadcrumb flex-1 min-w-0] | [spacer] | [search · bell · deputy]
// The top-bar Create button was REMOVED app-wide (OD-REDESIGN-91 #16 / F1) — it enforces
// experience-contract Rule 7 verbatim ("live in the ⌘K palette, not as header buttons").
// Desktop creation is ⌘K + page-contextual CTAs; the phone keeps the bottom-tab + launcher.
// The header hamburger was removed (v4 shell rebuild, Task 1) — the phone nav's sole opener is
// the bottom-tab-bar's More button (aria-haspopup="dialog" + aria-expanded there).
// grid-area: topbar — spans full width (set by AppShell grid; no inline style needed here).
export function TopBar({ onOpenSearch }: TopBarProps) {
  const t = useT()
  // OD-REDESIGN-84.2 (P1-1): the brand column's width must track the rail's own compact
  // regime (920–1099.98px) so the divider still lands on the rail boundary; the wordmark
  // text is dropped at that width too (72px only has room for the mark).
  // #442: "the rail's own compact regime" now includes the user's collapse choice, so this
  // reads the SAME `useRailCompact` seam the shell grid does rather than recomputing it.
  const { isNarrow, compact: railCompact } = useRailCompact()

  return (
    <header
      data-anatomy="header"
      className="bg-background border-b border-border flex items-stretch flex-none"
      style={{ height: 'var(--header-h)', gridArea: 'topbar' }}
    >
      {/* Brand lockup — width = --rail-w so the right divider coincides with the rail boundary (ADR-0013 D1).
          At <920px the rail is gone (drawer-nav), so the brand shrinks to content width (no 224px reserve)
          and drops the divider — otherwise it forces horizontal overflow on phones. */}
      <div
        className={`flex items-center gap-2 px-3 flex-none${isNarrow ? '' : ' border-r border-border'}${railCompact ? ' justify-center px-0' : ''}`}
        style={{ width: isNarrow ? 'auto' : railCompact ? 'var(--rail-w-compact)' : 'var(--rail-w)' }}
      >
        <GordiLogoMark />
        {!isNarrow && !railCompact && (
          <span
            className="truncate font-semibold text-foreground"
            title="Gordi MOS"
            style={{ fontSize: 16, letterSpacing: '-0.01em' }}
          >
            Gordi MOS
          </span>
        )}
      </div>

      {/* Breadcrumb track — min-w-0 so a long crumb ellipsizes and cannot shove the brand (AC-S02/S03).
          v4 shell rebuild (Task 2): now ALSO rendered at <920px, in the space freed by deleting
          the hamburger — it's the phone's only current-location signal once the page's own H1
          scrolls out of view, and it lives in this fixed header row so it survives scrolling. */}
      <div className={`flex items-center flex-1 min-w-0${isNarrow ? ' px-2' : ' px-4'}`}>
        <nav aria-label="Breadcrumb">
          <Breadcrumb />
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster — search · bell · deputy */}
      <div className="flex items-center gap-2 px-3 flex-none">
        {/* ⌘K search trigger — opens the command menu (AC-K02). Below 920px it shrinks to an
            icon-only button (DESIGN.md Navigation·Mobile: "cmdk shrinks to an icon") so the header
            fits a phone width without horizontal overflow. */}
        {isNarrow ? (
          <button
            type="button"
            aria-label={t('topBar.search')}
            className="tap-target-phone tap-target-phone--icon flex items-center justify-center rounded-sm border border-border bg-secondary text-muted-foreground hover:border-muted-foreground/50 flex-none"
            style={{ width: 32, height: 32 }}
            onClick={onOpenSearch}
          >
            <SearchIcon />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('topBar.search')}
            className="flex items-center gap-2 rounded-sm border border-border bg-secondary px-2 text-muted-foreground hover:border-muted-foreground/50 cursor-text"
            style={{ height: 34, width: 200 }}
            onClick={onOpenSearch}
          >
            <SearchIcon />
            <span className="flex-1 text-left" style={{ fontSize: 'var(--font-size-body-lg)' }}>
              {t('topBar.searchPlaceholder')}
            </span>
            <kbd
              className="rounded-xs border border-border px-1 font-medium text-muted-foreground"
              style={{ fontSize: 11, lineHeight: '16px' }}
            >
              ⌘K
            </kbd>
          </button>
        )}

        {/* Inbox bell — shared desktop/phone door. The bottom-tab Inbox entry stays as a second
            phone entry point; both use the same unread-only count seam. */}
        <NotificationBell />

        {/* Deputy launcher (T28) — neutral header icon on every viewport (No-FAB Rule).
            Absent when SHOW_ASSISTANT=false. */}
        {SHOW_ASSISTANT && <AssistantTopBarButton />}

        {/* No top-bar Create button (OD-REDESIGN-91 #16 / F1) — desktop creation is ⌘K +
            page CTAs; the phone launcher lives in the bottom tab bar. */}
      </div>
    </header>
  )
}
