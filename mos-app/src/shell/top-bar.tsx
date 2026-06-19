import { useRef, useEffect } from 'react'
import { Breadcrumb } from './breadcrumb'
import { UserChip } from './user-chip'
import { useIsNarrow } from './use-is-narrow'

type TopBarProps = {
  onOpenDrawer: () => void
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

// Gordi logo mark — navy square + orange sprinkle dot (brand identity, ADR-0013 D1)
function GordiLogoMark() {
  return (
    <div className="relative flex-none" style={{ width: 26, height: 26 }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-sm bg-brand-navy font-bold text-primary-foreground"
        style={{ fontSize: 13 }}
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

// Global top bar (ADR-0013 D1).
// Layout left→right: [brand 236px] | [breadcrumb flex-1 min-w-0] | [spacer] | [search · bell · user chip]
// At <920px the leading hamburger appears and calls onOpenDrawer.
export function TopBar({ onOpenDrawer, onRegisterHamburgerFocus }: TopBarProps) {
  const isNarrow = useIsNarrow()
  const hamburgerRef = useRef<HTMLButtonElement>(null)

  // Register focus-return function so the mobile drawer can refocus hamburger on close.
  useEffect(() => {
    onRegisterHamburgerFocus?.(() => hamburgerRef.current?.focus())
  }, [onRegisterHamburgerFocus])

  return (
    <header
      className="bg-background border-b border-border flex items-stretch flex-none"
      style={{ height: 'var(--header-h)' }}
    >
      {/* Hamburger — shown only at <920px, before the brand column */}
      {isNarrow && (
        <div className="flex items-center px-2">
          <button
            ref={hamburgerRef}
            type="button"
            aria-label="Open navigation"
            className="flex items-center justify-center rounded-sm hover:bg-accent flex-none"
            style={{ width: 32, height: 32 }}
            onClick={onOpenDrawer}
          >
            <HamburgerIcon />
          </button>
        </div>
      )}

      {/* Brand lockup — fixed 236px column sitting over the rail (ADR-0013 D1).
          Right divider aligns with the rail boundary. */}
      <div
        className="flex items-center gap-2 border-r border-border px-3 flex-none"
        style={{ width: 236 }}
      >
        <GordiLogoMark />
        <span
          className="truncate font-semibold text-foreground"
          title="Gordi MOS"
          style={{ fontSize: 14, letterSpacing: '-0.01em' }}
        >
          Gordi MOS
        </span>
      </div>

      {/* Breadcrumb track — min-w-0 so a long crumb ellipsizes and cannot shove the brand (AC-S02/S03) */}
      <div className="flex items-center px-4 flex-1 min-w-0">
        <nav aria-label="Breadcrumb">
          <Breadcrumb />
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster — search · bell · user chip */}
      <div className="flex items-center gap-2 px-3 flex-none">
        {/* ⌘K search trigger — onClick is a no-op TODO for PR-1; wired in PR-5 */}
        <button
          type="button"
          aria-label="Search"
          className="flex items-center gap-2 rounded-sm border border-border bg-secondary px-2 text-muted-foreground hover:border-muted-foreground/50 cursor-text"
          style={{ height: 32, width: 200 }}
        >
          <SearchIcon />
          <span className="flex-1 text-left" style={{ fontSize: 13 }}>
            Search
          </span>
          <kbd
            className="rounded-xs border border-border px-1 font-medium text-muted-foreground"
            style={{ fontSize: 11, lineHeight: '16px' }}
          >
            ⌘K
          </kbd>
        </button>

        {/* Notification bell — icon-only stub, non-functional (AC-S07, ADR-0013 D1) */}
        <button
          type="button"
          aria-label="Notifications"
          disabled
          className="flex items-center justify-center rounded-sm text-muted-foreground"
          style={{ width: 32, height: 32 }}
        >
          <BellIcon />
        </button>

        {/* User chip — name truncates, title attribute for no-bleed (AC-S08) */}
        <UserChip variant="header" />
      </div>
    </header>
  )
}
