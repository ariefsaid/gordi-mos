import { useRef, useEffect } from 'react'
import Breadcrumb from './Breadcrumb'
import UserChip from './UserChip'
import { useIsNarrow } from './useIsNarrow'

interface HeaderProps {
  onOpenDrawer: () => void
  /** Optional callback to receive a focusOpener fn that focuses the hamburger */
  onRegisterHamburgerFocus?: (focusFn: () => void) => void
}

export default function Header({ onOpenDrawer, onRegisterHamburgerFocus }: HeaderProps) {
  const isNarrow = useIsNarrow()
  const hamburgerRef = useRef<HTMLButtonElement>(null)

  // Register focus function with parent so drawer can return focus on close.
  // Runs once on mount (and whenever the callback identity changes) — no render side-effect.
  useEffect(() => {
    onRegisterHamburgerFocus?.(() => hamburgerRef.current?.focus())
  }, [onRegisterHamburgerFocus])

  return (
    <header
      className="bg-background border-b border-border flex items-center gap-3 px-6 flex-none"
      style={{ height: 'var(--header-h)' }}
    >
      {/* Hamburger — shown only at <920px */}
      {isNarrow && (
        <button
          ref={hamburgerRef}
          type="button"
          aria-label="Open navigation"
          className="flex items-center justify-center rounded-sm hover:bg-accent flex-none"
          style={{ width: 32, height: 32 }}
          onClick={onOpenDrawer}
        >
          {/* Hamburger icon: stroke-2, 18px, aria-hidden */}
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
        </button>
      )}

      <Breadcrumb />

      {/* Spacer */}
      <div className="flex-1" />

      <UserChip compact={isNarrow} />
    </header>
  )
}
