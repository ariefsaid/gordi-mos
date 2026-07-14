import { useRef, useEffect } from 'react'
import { Breadcrumb } from './breadcrumb'
import { UserChip } from './user-chip'
import { useIsNarrow } from './use-is-narrow'
import { SHOW_ASSISTANT } from '@/config/features'
import { useAgentRuntime } from '@/lib/agent/runtime/AgentRuntimeContext'
import { useT } from '@/i18n/use-t'
import { useNavigate } from 'react-router-dom'
import { useUnreadCount } from '@/hooks/useUnreadCount'

type TopBarProps = {
  /** Whether the mobile drawer is currently open (used for aria-expanded on the hamburger). */
  drawerOpen?: boolean
  onOpenDrawer: () => void
  /** Opens the ⌘K command menu (wired in AppShell). */
  onOpenSearch?: () => void
  /** Receives a function that focuses the hamburger; used by MobileDrawer to restore focus on close. */
  onRegisterHamburgerFocus?: (focusFn: () => void) => void
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

// Hamburger icon — 18px, stroke-2, aria-hidden
function HamburgerIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

// Deputy spark icon — 16px, stroke-2, aria-hidden (T28 desktop top-bar button)
function DeputyIcon() {
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
        style={{ fontSize: 15 }}
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

// The notification bell (T16) — a live Inbox link with an unread badge (ADR-0019 D9). Rendered only
// when SHOW_INBOX, so the fetch never fires while the feature is hidden. Uses the dedicated
// useUnreadCount hook (CQ#2) so the badge is backed by the unread-only index, not the full list.
function NotificationBell() {
  const navigate = useNavigate()
  const { unreadCount } = useUnreadCount()
  const label = unreadCount > 0 ? `Inbox, ${unreadCount} unread` : 'Inbox'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="tap-target-phone tap-target-phone--icon relative flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground flex-none"
      style={{ width: 32, height: 32 }}
      onClick={() => navigate('/inbox')}
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
// Layout left→right: [brand --rail-w] | [breadcrumb flex-1 min-w-0] | [spacer] | [search · bell · user chip]
// At <920px the leading hamburger appears and calls onOpenDrawer.
// grid-area: topbar — spans full width (set by AppShell grid; no inline style needed here).
export function TopBar({ drawerOpen = false, onOpenDrawer, onOpenSearch, onRegisterHamburgerFocus }: TopBarProps) {
  const isNarrow = useIsNarrow()
  const hamburgerRef = useRef<HTMLButtonElement>(null)

  // Register focus-return function so the mobile drawer can refocus hamburger on close.
  useEffect(() => {
    onRegisterHamburgerFocus?.(() => hamburgerRef.current?.focus())
  }, [onRegisterHamburgerFocus])

  return (
    <header
      className="bg-background border-b border-border flex items-stretch flex-none"
      style={{ height: 'var(--header-h)', gridArea: 'topbar' }}
    >
      {/* Hamburger — shown only at <920px, before the brand column */}
      {isNarrow && (
        <div className="flex items-center px-2">
          <button
            ref={hamburgerRef}
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="tap-target-phone tap-target-phone--icon flex items-center justify-center rounded-sm hover:bg-accent flex-none"
            style={{ width: 32, height: 32 }}
            onClick={onOpenDrawer}
          >
            <HamburgerIcon />
          </button>
        </div>
      )}

      {/* Brand lockup — width = --rail-w so the right divider coincides with the rail boundary (ADR-0013 D1).
          At <920px the rail is gone (drawer-nav), so the brand shrinks to content width (no 224px reserve)
          and drops the divider — otherwise it forces horizontal overflow on phones. */}
      <div
        className={`flex items-center gap-2 px-3 flex-none${isNarrow ? '' : ' border-r border-border'}`}
        style={{ width: isNarrow ? 'auto' : 'var(--rail-w)' }}
      >
        <GordiLogoMark />
        {!isNarrow && (
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
          Hidden at <920px: it's redundant with the page's own H1 there, and its min-content width
          otherwise forces header overflow on phones. */}
      {!isNarrow && (
        <div className="flex items-center px-4 flex-1 min-w-0">
          <nav aria-label="Breadcrumb">
            <Breadcrumb />
          </nav>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster — search · bell · user chip */}
      <div className="flex items-center gap-2 px-3 flex-none">
        {/* ⌘K search trigger — opens the command menu (AC-K02). Below 920px it shrinks to an
            icon-only button (DESIGN.md Navigation·Mobile: "cmdk shrinks to an icon") so the header
            fits a phone width without horizontal overflow. */}
        {isNarrow ? (
          <button
            type="button"
            aria-label="Search"
            className="tap-target-phone tap-target-phone--icon flex items-center justify-center rounded-sm border border-border bg-secondary text-muted-foreground hover:border-muted-foreground/50 flex-none"
            style={{ width: 32, height: 32 }}
            onClick={onOpenSearch}
          >
            <SearchIcon />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Search"
            className="flex items-center gap-2 rounded-sm border border-border bg-secondary px-2 text-muted-foreground hover:border-muted-foreground/50 cursor-text"
            style={{ height: 34, width: 200 }}
            onClick={onOpenSearch}
          >
            <SearchIcon />
            <span className="flex-1 text-left" style={{ fontSize: 15 }}>
              Search
            </span>
            <kbd
              className="rounded-xs border border-border px-1 font-medium text-muted-foreground"
              style={{ fontSize: 11, lineHeight: '16px' }}
            >
              ⌘K
            </kbd>
          </button>
        )}

        {/* Inbox bell — always live (SHOW_INBOX retired, D-1). A live Inbox link + unread badge. */}
        <NotificationBell />

        {/* Deputy launcher (T28) — neutral header icon on every viewport (No-FAB Rule).
            Absent when SHOW_ASSISTANT=false. */}
        {SHOW_ASSISTANT && <AssistantTopBarButton />}

        {/* User chip — avatar-only at <920px (FR-020); name/role show on wider viewports (AC-S08) */}
        <UserChip variant="header" compact={isNarrow} />
      </div>
    </header>
  )
}
