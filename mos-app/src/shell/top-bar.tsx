import { GordiLogoMark } from './logo-mark'
import { Breadcrumb } from './breadcrumb'
import { useNavLayout } from './use-nav'
import { SHOW_ASSISTANT } from '@/config/features'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useT } from '@/i18n/use-t'
import { Link, useNavigate } from 'react-router-dom'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { useIsDesktop } from './use-is-desktop'
import { useOptionalOverlayHost } from './overlay-host'
import { InboxTriageConnected } from '@/components/inbox/inbox-triage-connected'
import { setTopBarBackSlot } from './top-bar-back-slot'
import './top-bar.css'

type TopBarProps = {
  /** Opens the ⌘K command menu (wired in AppShell). */
  onOpenSearch?: () => void
  /** Attached to the visible search button so the palette can return focus to it. */
  searchTriggerRef?: React.Ref<HTMLButtonElement>
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
      width={20}
      height={20}
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
      width={20}
      height={20}
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

// Deputy spark icon — 20px, stroke-2, aria-hidden (T28 desktop top-bar button)
export function DeputyIcon() {
  return (
    <svg
      width={20}
      height={20}
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
      className="top-bar__icon-btn"
      onClick={openPanel}
    >
      <DeputyIcon />
    </button>
  )
}

// The notification bell (T16) — the Inbox door with an unread badge (ADR-0019 D9). It stays in
// the compact header as well as desktop; on a phone it is the Inbox's door (no tab; Inbox is also in More). With a mounted overlay host it quick-opens the SAME InboxTriage surface as an ephemeral
// root (no URL mutation), so a manager triages in context and the host returns focus to the bell
// on close; without a host (e.g. isolated tests) it falls back to the full `/inbox` route. Uses
// the dedicated useUnreadCount hook (CQ#2) so the badge is backed by the unread-only index, not
// the full list.
function NotificationBell() {
  const navigate = useNavigate()
  const t = useT()
  const host = useOptionalOverlayHost()
  const isPhone = !useIsDesktop()
  const { unreadCount } = useUnreadCount()
  const label = unreadCount > 0 ? t('topBar.inboxUnread', { count: unreadCount }) : t('dest.inbox')

  const bellContent = (
    <>
      <BellIcon />
      {unreadCount > 0 ? (
        <span aria-hidden="true" className="top-bar__badge tabular-nums">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </>
  )

  if (isPhone) {
    return (
      <Link
        to="/inbox"
        aria-label={label}
        title={label}
        className="top-bar__icon-btn"
      >
        {bellContent}
      </Link>
    )
  }

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
        // One header row: the title, "Open Inbox" and close (no second "Quick triage" row under it).
        actions: <Link to="/inbox" className="btn btn-outline">{t('shell.openInbox')}</Link>,
        content: (
          <div className="top-bar__quick-inbox">
            <InboxTriageConnected mode="quick" />
          </div>
        ),
      },
      'ephemeral',
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="top-bar__icon-btn"
      onClick={openInbox}
    >
      {bellContent}
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
export function TopBar({ onOpenSearch, searchTriggerRef }: TopBarProps) {
  const t = useT()
  // The brand cell is as wide as the nav's first column: the whole 240px sidebar, or the 64px rail (mark only),
  // so the header divider lands on the nav boundary.
  const { isNarrow, brandWide } = useNavLayout()

  return (
    <header
      data-anatomy="header"
      className="top-bar"
      style={{ gridArea: 'topbar' }}
    >
      {/* Phone back control: PageBackLink portals the page's back button here below 768px. */}
      <div className="top-bar__back" ref={setTopBarBackSlot} />

      {/* Brand lockup — width = --rail-w so the right divider coincides with the rail boundary (ADR-0013 D1).
          At <920px the rail is gone (drawer-nav), so the brand shrinks to content width (no 224px reserve)
          and drops the divider — otherwise it forces horizontal overflow on phones. */}
      <div
        className={`top-bar__brand${isNarrow ? ' top-bar__brand--narrow' : ''}${!brandWide && !isNarrow ? ' top-bar__brand--compact' : ''}`}
      >
        <GordiLogoMark />
        {!isNarrow && brandWide && (
          <span className="top-bar__wordmark" title="Gordi MOS">
            Gordi MOS
          </span>
        )}
      </div>

      {/* Breadcrumb track — min-w-0 so a long crumb ellipsizes and cannot shove the brand (AC-S02/S03).
          v4 shell rebuild (Task 2): now ALSO rendered at <920px, in the space freed by deleting
          the hamburger — it's the phone's only current-location signal once the page's own H1
          scrolls out of view, and it lives in this fixed header row so it survives scrolling. */}
      <div className="top-bar__breadcrumb-track">
        <div className="top-bar__location">
          <nav className="top-bar__breadcrumb" aria-label="Breadcrumb">
            <Breadcrumb />
          </nav>
          {import.meta.env.DEV ? <span className="shell-environment-notice">{t('work.localSampleData')}</span> : null}
        </div>
      </div>

      {/* One utility track follows the location track; the breadcrumb takes remaining width. */}
      <div className="top-bar__utilities">
        {/* ⌘K search trigger — opens the command menu (AC-K02). Below 920px it shrinks to an
            icon-only button (DESIGN.md Navigation·Mobile: "cmdk shrinks to an icon") so the header
            fits a phone width without horizontal overflow. */}
        {isNarrow ? (
          <button
            type="button"
            ref={searchTriggerRef}
            aria-label={t('topBar.search')}
            className="top-bar__icon-btn"
            onClick={onOpenSearch}
          >
            <SearchIcon />
          </button>
        ) : (
          <button
            type="button"
            ref={searchTriggerRef}
            className="top-bar__search"
            onClick={onOpenSearch}
          >
            <SearchIcon />
            <span className="top-bar__search-text">
              {t('topBar.searchPlaceholder')}
            </span>
            <kbd className="top-bar__kbd">
              ⌘K
            </kbd>
          </button>
        )}

        {/* Inbox bell — shared desktop/phone door with the unread count (the phone has no Inbox tab). */}
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
