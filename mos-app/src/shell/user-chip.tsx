import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { useMenuPopover } from '@/lib/use-menu-popover'
import { AppearanceControl } from './appearance-control'
import { Chevron } from './icons'

interface UserChipProps {
  /**
   * When true, hides name/role text: the header variant uses this at <920px per FR-020; the
   * rail/drawer variants use it in the OD-REDESIGN-84.2 (P1-1) 920–1099.98px icon-only rail,
   * where the chip collapses to the avatar alone.
   */
  compact?: boolean
  // 'header' = compact chip in the top bar; 'rail' = full-width row pinned to
  // the sidebar foot with an upward-opening menu; 'drawer' = full-width row at
  // the top of the phone "More" drawer — same layout as 'rail' but the menu
  // opens DOWNWARD (there is no space above the drawer's fixed top edge).
  /** Display variant. */
  variant?: 'header' | 'rail' | 'drawer'
  /**
   * Called after the menu's Personal Profile link navigates. The phone drawer passes its own
   * `closeAndReturn` here: without it the drawer stays open on top of the profile page the viewer
   * just asked for, which is what shipped the first time this link was rendered. Every other
   * drawer link already routes through the same handler (`DrawerRow`'s `onNavigate`).
   */
  onNavigate?: () => void
}

function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  const first = words[0]?.[0] ?? ''
  const second = words[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function UserChip({ compact = false, variant = 'header', onNavigate }: UserChipProps) {
  // 'rail' and 'drawer' both render the full-width identity row (name + role); only the
  // menu's open direction differs (rail opens up, drawer opens down — see menuOpensUp below).
  const isFullWidth = variant === 'rail' || variant === 'drawer'
  const menuOpensUp = variant === 'rail'
  const t = useT()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const chipRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const signOut = auth.status === 'authenticated' ? auth.signOut : undefined

  const close = useCallback(() => {
    setOpen(false)
    chipRef.current?.focus()
  }, [])

  // ONE popover contract (convention audit 2026-07-18): outside-click close +
  // Esc + WAI-ARIA menu keys (focus enters menu, arrows/Home/End cycle).
  useMenuPopover(open, close, menuRef, chipRef)

  if (!viewer) return null

  const initials = getInitials(viewer.person.full_name)
  const primaryRole = viewer.roles[0]?.name

  // Was `isFullWidth || !compact` — the rail/drawer variants always showed text regardless of
  // `compact`, so the prop was dead for them (P1-1: the compact icon rail needs the chip to
  // actually collapse to the avatar). `compact` alone now governs text visibility for every variant.
  const showText = !compact

  return (
    <div className={isFullWidth ? 'relative' : 'relative flex items-center gap-2'}>
      {/* Chip button */}
      <button
        ref={chipRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={viewer.person.full_name}
        title={isFullWidth && compact ? viewer.person.full_name : undefined}
        className={
          // SYS-2: the full-width chip (rail foot + phone More drawer) is 40px — the drawer
          // variant is phone-reachable and falls below the 44px touch floor. tap-target-phone
          // (Button.css) raises it on phone; the desktop rail is unaffected (>767px).
          isFullWidth
            ? `tap-target-phone flex w-full items-center gap-2 rounded-sm hover:bg-accent px-2 cursor-pointer${compact ? ' justify-center px-0' : ''}`
            : `tap-target-phone${compact ? ' tap-target-phone--icon' : ''} flex items-center gap-2 rounded-sm hover:bg-accent px-2 -mx-2 cursor-pointer`
        }
        style={{ height: isFullWidth ? 40 : 36 }}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Avatar: 28px rounded-full, navy→blue gradient (OD-P3-7 / Structural-Navy Rule) */}
        <div
          className="flex items-center justify-center rounded-full text-primary-foreground flex-none font-bold"
          style={{
            width: 28,
            height: 28,
            fontSize: 11,
            background: 'linear-gradient(135deg, var(--brand-navy), var(--primary))',
          }}
          aria-hidden="true"
        >
          {initials}
        </div>
        {showText && (
          <div className={isFullWidth ? 'flex-1 text-left min-w-0' : 'text-left'}>
            <div
              className="truncate font-semibold text-foreground"
              style={{ fontSize: 'var(--font-size-body-lg)', lineHeight: 1.1 }}
              title={viewer.person.full_name}
            >
              {viewer.person.full_name}
            </div>
            {primaryRole && (
              <div className="truncate text-muted-foreground" style={{ fontSize: 11 }}>
                {primaryRole}
              </div>
            )}
          </div>
        )}
        {/* v4 shell rebuild (Task 7 a11y): a visible disclosure cue on the drawer identity row —
            the row opens a menu and needs a static affordance beyond aria-haspopup/aria-expanded
            alone. Scoped to the phone drawer (the rail footer's affordance is already established
            chrome elsewhere in that surface). */}
        {variant === 'drawer' && showText && (
          <Chevron className="flex-none text-muted-foreground" size={14} />
        )}
      </button>

      {/* Popover menu */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={
            (isFullWidth ? 'absolute left-0 ' : 'absolute right-0 ') +
            (menuOpensUp ? 'bottom-full mb-1 ' : 'top-full mt-1 ') +
            'bg-popover border border-border rounded-lg p-[5px]'
          }
          style={{
            minWidth: isFullWidth ? 200 : 140,
            zIndex: 'var(--z-popover)',
            boxShadow:
              '0 10px 30px color-mix(in srgb, var(--ds-font-color-primary) 16%, transparent), 0 2px 6px color-mix(in srgb, var(--ds-font-color-primary) 8%, transparent)',
          }}
        >
          {/* Personal Profile (owner, 2026-08-26) — moved here from its own Utility rail row. The
              chip menu is the one identity surface that renders on EVERY viewport (rail footer on
              desktop, top of the More drawer on phone), so /profile keeps a rendered, one-click way
              in on all of them without spending a rail row. `nav-reachability.test.tsx` opens this
              menu and counts its links, so the move cannot decay into "no way in".

              A real <Link>, not a button + navigate(): the reachability guard reads `a[href]` out
              of the DOM, and — the point behind that — a viewer gets middle-click, ⌘-click and a
              status-bar preview, which a button never gives them. */}
          <Link
            role="menuitem"
            to="/profile"
            // SYS-2: same 32px desktop row as Sign out below, raised to the 44px touch floor on
            // phone (tap-target-phone, Button.css) because the drawer variant is phone-reachable.
            className="tap-target-phone flex w-full items-center px-3 rounded-sm hover:bg-accent text-foreground no-underline"
            style={{ height: 32, fontSize: 'var(--font-size-body-lg)' }}
            onClick={() => {
              close()
              onNavigate?.()
            }}
          >
            {t('nav.profile')}
          </Link>

          {/* Divider */}
          <div className="my-[5px] border-t border-border" role="separator" aria-hidden="true" />

          {/* Appearance switcher */}
          <AppearanceControl />

          {/* Divider */}
          <div className="my-[5px] border-t border-border" role="separator" aria-hidden="true" />

          {/* Sign out */}
          <button
            role="menuitem"
            type="button"
            // SYS-2: reachable on phone via the 'drawer' variant menu — raise the 32px row to the
            // 44px touch floor on phone (tap-target-phone, Button.css). Desktop rhythm unchanged.
            className="tap-target-phone w-full text-left px-3 rounded-sm hover:bg-accent text-foreground"
            style={{ height: 32, fontSize: 'var(--font-size-body-lg)' }}
            onClick={() => {
              close()
              signOut?.()
            }}
          >
            {t('account.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
