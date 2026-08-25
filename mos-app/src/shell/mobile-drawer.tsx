import { useEffect, useRef, useCallback } from 'react'
import type React from 'react'
import { Link } from 'react-router-dom'
import {
  DESTINATIONS,
  UTILITY,
  isLive,
  modulesByBU,
  primaryModuleForViewer,
  type Destination,
} from './destinations'
import { visibleSections, type Section } from './sections'
import { UserChip } from './user-chip'
import { CloseIcon } from './icons'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import './mobile-drawer.css'
// DD-WAY-33 (#439): the phone drawer wears the SAME three-rung ladder as the desktop rail
// (rail-nav.css owns it). One ladder, two surfaces — a destination must not read as a child
// just because the viewport shrank. Imported explicitly rather than relied on from rail-nav.tsx:
// below 920px the rail does not mount, and a stylesheet that arrives only via someone else's
// import is exactly how a class ends up resolving to nothing.
import './rail-nav.css'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  /** Called to return focus to the opener (the bottom-tab More button) on close. */
  focusOpener?: () => void
}

// Work's four always-expanded children, capability-filtered exactly as the desktop rail
// filters them (rail-nav.tsx) — a capability-gated child (Projects & Processes, Objectives)
// renders only for a viewer whose access roles grant it.
function workChildren(d: Destination, accessRoles: string[]): Section[] {
  return visibleSections(d.children ?? [], accessRoles)
}

// One row renderer shared by both Destination and Work-child (Section) rows — same visual
// grammar, same touch-target floor, one place to change it. `rung` picks which step of the
// shared rail ladder (rail-nav.css) the row sits on: `dest` (13.5px/600, foreground, 17px icon)
// or `child` (13px/500, muted-foreground, 15px icon). Neither the icon nor the label carries a
// colour class of its own — both inherit the rung, so glyph and label move together.
function DrawerRow({ to, label, Icon, onNavigate, rung = 'dest' }: { to: string; label: string; Icon: React.FC; onNavigate: () => void; rung?: 'dest' | 'child' }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      // SYS-2: the More drawer is a phone-only surface, so its 36px rows fall below the
      // 44px touch floor. The shared tap-target-phone marker (Button.css) raises them.
      className={`rail-item rail-item--${rung} tap-target-phone flex items-center gap-[10px] rounded-sm px-2 hover:bg-accent/60`}
      style={{ height: 36 }}
    >
      <span>
        <Icon />
      </span>
      <span>{label}</span>
    </Link>
  )
}

// Overline group label — the ladder's quietest rung, shared with the rail (.rail-item-overline).
// aria-hidden visual divider, not a nav landmark; the group's rows stay directly reachable in
// document order.
function DrawerGroupLabel({ children }: { children: string }) {
  return (
    <div className="rail-item-overline px-2 pt-2.5 pb-1" aria-hidden="true">
      {children}
    </div>
  )
}

/**
 * MobileDrawer — v4 shell rebuild (Task 4). The real two-zone nav drawer, derived from the SAME
 * destinations.tsx registry the desktop rail reads (no second hand-maintained list): workspace
 * roots (+ Work's 4 always-expanded children) · Modules grouped by BU (modulesByBU,
 * viewer-scoped) · Utility. The viewer's promoted module is already a bottom-tab, so it's
 * excluded from the Modules zone here — it lives on exactly one nav surface. Links carry no
 * aria-current (the bottom-tab-bar / breadcrumb leaf own that; Rule 5 — see breadcrumb.tsx).
 * Every close path — Esc, backdrop click, the ✕, and clicking a destination link — routes
 * through the SAME `closeAndReturn` so focus always returns to the launcher (interaction-
 * contract I2), never left dangling on a link about to unmount.
 */
export function MobileDrawer({ open, onClose, focusOpener }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const auth = useAuth()
  const t = useT()

  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const roleNames = viewer ? viewer.roles.map((r) => r.name) : []

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

  // Zone 1 — workspace roots (Home · Work · Signals · Money[gated] · Inbox), same isLive gate
  // the rail applies. Zone 2 — modules grouped by BU, viewer-scoped, minus the one already
  // promoted to a bottom-tab. Zone 3 — utility (Admin[gated] · Profile).
  const liveWorkspace = DESTINATIONS.filter((d) => isLive(d, accessRoles))
  const promotedModule = primaryModuleForViewer(roleNames, accessRoles)
  // Zone 2 keeps every viewer-scoped module. The promoted one contributes only its CHILDREN — its
  // own row is already the bottom bar's module tab, so repeating it here would be the duplicate
  // the "exactly one surface owns the module" rule exists to prevent.
  //
  // It used to be dropped whole, children included (#242). Below 920px there is no rail, and the
  // bottom bar renders one link per module with no children — so for every viewer who HAS a
  // module (Café is always the promoted one for kitchen staff) that module's sub-screens had no
  // nav entry on a phone at all. Café's five screens are the ones kitchen staff use daily, on
  // their primary device.
  const moduleGroups = modulesByBU(accessRoles)
    .map((g) => ({
      bu: g.bu,
      items: g.items
        .map((m) => ({
          module: m,
          showParent: m.id !== promotedModule?.id,
          children: visibleSections(m.children ?? [], accessRoles),
        }))
        .filter((i) => i.showParent || i.children.length > 0),
    }))
    .filter((g) => g.items.length > 0)
  const liveUtility = UTILITY.filter((u) => isLive(u, accessRoles))

  return (
    <>
      <div className="scrim fixed inset-0" style={{ zIndex: 'var(--z-drawer)' }} aria-hidden="true" onClick={closeAndReturn} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="More"
        // OD-REDESIGN-91 #37: opens from the LEFT (left-0 + slide-in-from-left) to match the ☰
        // hamburger position (top-left) and the rail side — the prior right-slide was "not natural".
        className="mobile-drawer-panel fixed inset-y-0 left-0 bg-secondary flex flex-col overflow-auto"
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
            room above the drawer's fixed top edge, unlike the desktop rail footer) and a visible
            disclosure chevron (Task 7 a11y — a menu-opening row needs a visible affordance cue). */}
        {viewer && (
          <div className="px-2 pt-2">
            <UserChip variant="drawer" />
          </div>
        )}

        <nav aria-label="More destinations" className="flex flex-col gap-2 p-2 overflow-auto">
          <div>
            <DrawerGroupLabel>{t('rail.destinations')}</DrawerGroupLabel>
            <ul className="flex flex-col gap-[2px]">
              {liveWorkspace.map((d) => {
                if (d.id === 'work') {
                  const children = workChildren(d, accessRoles)
                  return (
                    <li key={d.id}>
                      <DrawerRow to={d.primaryPath ?? d.links[0].path} label={t(d.labelKey)} Icon={d.Icon} onNavigate={closeAndReturn} />
                      {children.length > 0 && (
                        <ul className="flex flex-col gap-[2px] rail-item-children">
                          {children.map((c) => (
                            <li key={c.path}>
                              <DrawerRow
                                to={c.path}
                                label={c.labelKey ? t(c.labelKey) : c.label}
                                Icon={c.Icon}
                                onNavigate={closeAndReturn}
                                rung="child"
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                }
                return (
                  <li key={d.id}>
                    <DrawerRow to={d.primaryPath ?? d.links[0].path} label={t(d.labelKey)} Icon={d.Icon} onNavigate={closeAndReturn} />
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Zone 2 — modules grouped by BU (OD-REDESIGN-1: "Modules grouped by Business
              Unit"), viewer-scoped exactly as the rail scopes them. Empty for an org-wide role. */}
          {moduleGroups.map((g) => (
            <div key={g.bu}>
              <DrawerGroupLabel>{t(g.bu)}</DrawerGroupLabel>
              <ul className="flex flex-col gap-[2px]">
                {g.items.map(({ module: m, showParent, children }) => (
                  <li key={m.id}>
                    {showParent && (
                      <DrawerRow to={m.primaryPath ?? m.links[0].path} label={t(m.labelKey)} Icon={m.Icon} onNavigate={closeAndReturn} />
                    )}
                    {/* A module's own screens. This drawer is the phone's ONLY route to them —
                        the bottom bar gives a module one tab and no children — so a module whose
                        children are not drawn here has no phone nav at all. Gated children
                        (Review · Pushes) are filtered by the same helper the rail uses, against
                        the same roles their route enforces. Indented under a parent row; flush
                        when the parent is the bottom tab and only the children render here. */}
                    {children.length > 0 && (
                      <ul className={`flex flex-col gap-[2px] ${showParent ? 'rail-item-children' : ''}`}>
                        {children.map((c) => (
                          <li key={c.path}>
                            <DrawerRow
                              to={c.path}
                              label={c.labelKey ? t(c.labelKey) : c.label}
                              Icon={c.Icon}
                              onNavigate={closeAndReturn}
                              rung="child"
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Zone 3 — utility (Admin Settings[gated] · Personal Profile). */}
          {liveUtility.length > 0 && (
            <ul className="flex flex-col gap-[2px]">
              {liveUtility.map((u) => (
                <li key={u.id}>
                  <DrawerRow to={u.primaryPath ?? u.links[0].path} label={t(u.labelKey)} Icon={u.Icon} onNavigate={closeAndReturn} />
                </li>
              ))}
            </ul>
          )}
        </nav>
      </div>
    </>
  )
}
