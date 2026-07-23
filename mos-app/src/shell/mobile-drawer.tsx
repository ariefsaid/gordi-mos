import { useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { DESTINATIONS, UTILITY, isLive, modulesForRoles, primaryModuleForViewer, type Destination } from './destinations'
import { UserChip } from './user-chip'
import { CloseIcon } from './icons'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  /** Called to return focus to the opener (More button / hamburger) on close. */
  focusOpener?: () => void
}

// The bottom-nav owns the primary slots; the More menu owns every authorized NON-primary
// destination (Events, Money, Ecommerce, Roastery, Admin, Profile) so exactly-one
// aria-current holds on phone for every route (Rule 5/9). The primary slots are Home ·
// Work · Inbox plus the viewer's role-scoped module (OD-REDESIGN-68) — so the module the
// bottom-nav promotes is NOT also listed in More.
const FIXED_PRIMARY_IDS = ['home', 'work', 'inbox']

function moreDestinations(accessRoles: string[], roleNames: string[]): Destination[] {
  // OD-REDESIGN-68: modules appear only when they're the viewer's work (same rule as the
  // rail) — the More menu stops carrying the org chart for unaffiliated roles. The one
  // module promoted to the bottom-nav slot is excluded here so it lives on exactly one
  // surface (any additional modules still surface in More).
  const primaryModule = primaryModuleForViewer(roleNames, accessRoles)
  const primaryIds = new Set(primaryModule ? [...FIXED_PRIMARY_IDS, primaryModule.id] : FIXED_PRIMARY_IDS)
  const all = [
    ...DESTINATIONS,
    ...modulesForRoles(roleNames, accessRoles),
    ...UTILITY,
  ]
  return all.filter((d) => !primaryIds.has(d.id) && isLive(d, accessRoles))
}

/**
 * MobileDrawer — Redesign Step 2 (T15). The phone "More" menu: a focus-trapped
 * dialog listing every authorized non-primary destination as plain links (no
 * aria-current — the bottom-nav owns the single `page`). Every close path — Esc,
 * backdrop click, the ✕, and clicking a destination link — routes through the
 * SAME `closeAndReturn` so focus always returns to the launcher (interaction-
 * contract I2), never left dangling on a link about to unmount.
 */
export function MobileDrawer({ open, onClose, focusOpener }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const auth = useAuth()
  const t = useT()

  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  const closeAndReturn = useCallback(() => {
    focusOpener?.()
    onClose()
  }, [onClose, focusOpener])

  const getFocusables = useCallback((): HTMLElement[] => {
    if (!panelRef.current) return []
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    )
  }, [])

  useEffect(() => {
    if (!open) return
    const focusables = getFocusables()
    if (focusables.length > 0) focusables[0].focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndReturn()
        return
      }
      if (e.key === 'Tab') {
        const focusables = getFocusables()
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, closeAndReturn, getFocusables])

  if (!open) return null

  const roleNames = auth.status === 'authenticated' ? auth.viewer.roles.map((r) => r.name) : []
  const items = moreDestinations(accessRoles, roleNames)

  return (
    <>
      <div className="scrim fixed inset-0" style={{ zIndex: 'var(--z-drawer)' }} aria-hidden="true" onClick={closeAndReturn} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="fixed inset-y-0 right-0 bg-secondary flex flex-col overflow-auto"
        style={{ width: 'min(320px, 80vw)', zIndex: 'var(--z-drawer)' }}
      >
        <div className="flex items-center justify-between px-4" style={{ height: 'var(--header-h)' }}>
          <span className="font-semibold text-foreground">{t('nav.more')}</span>
          <button
            type="button"
            aria-label="Close"
            className="tap-target-phone tap-target-phone--icon flex items-center justify-center rounded-sm hover:bg-accent"
            style={{ width: 32, height: 32 }}
            onClick={closeAndReturn}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Identity + sign-out row (security audit HIGH-1, 2026-07-17). Phone has no rail, so the
            drawer is the only place a viewer can see who is signed in and end the session — the
            'drawer' variant reuses UserChip (Rule 11) with a downward-opening menu (there is no
            room above the drawer's fixed top edge, unlike the desktop rail footer). */}
        {viewer && (
          <div className="px-2 pt-2">
            <UserChip variant="drawer" />
          </div>
        )}

        <nav aria-label="More destinations" className="flex flex-col gap-[2px] p-2">
          {items.map((d) => {
            const href = d.primaryPath ?? d.links[0].path
            return (
              <Link
                key={d.id}
                to={href}
                onClick={closeAndReturn}
                // SYS-2: the More drawer is a phone-only surface, so its 36px rows fall below the
                // 44px touch floor. The shared tap-target-phone marker (Button.css) raises them.
                className="tap-target-phone flex items-center gap-[10px] rounded-sm px-2 text-sm text-muted-foreground hover:bg-accent/60"
                style={{ height: 36 }}
              >
                <span className="text-muted-foreground">
                  <d.Icon />
                </span>
                <span className="text-foreground">{t(d.labelKey)}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
