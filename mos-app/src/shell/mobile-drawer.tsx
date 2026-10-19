import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { UserChip } from './user-chip'
import { CloseIcon } from './icons'
import { AreaLink, PageLinks } from './nav-parts'
import {
  currentPagePath, footerAreas, globalNavigationDestinations, pageCount, pageGroupsFor, destinationForPath, rowState,
  type Destination,
} from './module-registry'
import { useNavBadges } from './use-nav'
import { useAuth } from '@/auth/use-auth'
import { useModuleAvailability } from '@/lib/module-availability'
import { useT } from '@/i18n/use-t'
import { focusableWithin } from '@/lib/focusable'
import { OverlayPortal } from '@/components/ui/overlay-portal'
import { ReleaseStamp } from '@/components/release-stamp'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { useInertAppRoot } from '@/components/ui/use-inert-app-root'
import './mobile-drawer.css'
// The phone drawer wears the SAME grammar as the desktop nav (nav.css): one ladder, two surfaces — a
// destination must not read as a child just because the viewport shrank.
import './nav.css'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  /** Called to return focus to the opener (the bottom-tab More button) on close. */
  focusOpener?: () => void
}

function landingOf(destination: Destination): string {
  return destination.primaryPath ?? destination.links[0].path
}

function rootOf(destination: Destination): string {
  return `/${landingOf(destination).split('/')[1] ?? ''}`
}

/**
 * MobileDrawer — the phone's More: a drawer, not a page. It is derived from the SAME module registry as the
 * desktop nav: Home, Work, admitted destinations in the registry's shared order (only the current area's pages expand),
 * then Admin settings, Personal profile and the account chip (language, appearance, sign out) in a foot that stays on
 * screen while the navigation scrolls. Every close path — Esc, backdrop click, the ✕, and
 * selecting a destination — routes through the SAME `closeAndReturn` so focus always returns to the opener
 * (interaction-contract I2), never left dangling on a link about to unmount.
 */
export function MobileDrawer({ open, onClose, focusOpener }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const focusOpenerRef = useRef(focusOpener)
  focusOpenerRef.current = focusOpener
  useInertAppRoot(open)
  useFocusTrap(panelRef, open)
  const auth = useAuth()
  const { pathname } = useLocation()
  const t = useT()
  const badges = useNavBadges()
  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const { isOn } = useModuleAvailability()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  const closeAndReturn = useCallback(() => {
    onClose()
  }, [onClose])

  const wasOpenRef = useRef(open)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open
    if (wasOpen && !open) focusOpenerRef.current?.()
  }, [open])

  useEffect(() => {
    if (!open) return
    const [first] = focusableWithin(panelRef.current)
    first?.focus()
    // The page the viewer is on may sit below the fold of a long module menu: bring it into view.
    panelRef.current?.querySelector<HTMLElement>('nav [aria-current="page"]')?.scrollIntoView({ block: 'center' })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeAndReturn()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, closeAndReturn])

  if (!open) return null

  const area = destinationForPath(pathname)
  const destinations = globalNavigationDestinations(accessRoles, isOn)
  const footer = footerAreas(accessRoles)
  const admin = footer.find((d) => d.id === 'admin')
  const profile = footer.find((d) => d.id === 'profile')
  const adminGroups = admin ? pageGroupsFor(admin, accessRoles, isOn) : []

  return (
    <OverlayPortal>
      <>
        <div className="scrim fixed inset-0" style={{ zIndex: 'var(--z-drawer)' }} aria-hidden="true" onClick={closeAndReturn} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.more')}
        className="mobile-drawer-panel fixed inset-x-0 bottom-0 bg-background flex flex-col overflow-hidden"
        style={{ zIndex: 'var(--z-drawer)' }}
      >
        <div className="mobile-drawer-head">
          <span className="mobile-drawer-head__title">{t('nav.more')}</span>
          <button
            type="button"
            aria-label={t('record.close')}
            className="mk-iconbtn mk-iconbtn--tertiary"
            onClick={closeAndReturn}
          >
            <CloseIcon />
          </button>
        </div>

        <nav aria-label={t('nav.moreDestinations')} className="mobile-drawer-nav">
          <div className="nav-list">
            {destinations.map((destination) => {
              const groups = destination.id === 'work' || destination.zone === 'modules'
                ? pageGroupsFor(destination, accessRoles, isOn) : []
              const hasPages = pageCount(groups) >= 2
              const expanded = area?.id === destination.id && hasPages
              const activeGroups = destination.id === 'work' || area?.id === destination.id ? groups : []
              const state = rowState(pathname, landingOf(destination), rootOf(destination), currentPagePath(activeGroups, pathname))
              return (
                <div key={destination.id}>
                  <AreaLink
                    destination={destination}
                    to={landingOf(destination)}
                    state={state}
                    onNavigate={closeAndReturn}
                    badge={expanded ? undefined : badges.forDestination(destination.id)}
                  />
                  {expanded && (
                    <div className="nav-children">
                      <PageLinks groups={groups} pathname={pathname} forPath={badges.forPath} onNavigate={closeAndReturn} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {area?.id === 'admin' && adminGroups.length > 0 && (
            <>
              <div className="nav-group-heading nav-group-heading--top">{t('dest.admin')}</div>
              <PageLinks groups={adminGroups} pathname={pathname} forPath={badges.forPath} onNavigate={closeAndReturn} />
            </>
          )}
        </nav>

        {/* Foot: Admin settings and Personal profile, then the account (language, appearance, sign out). */}
        <div className="mobile-drawer-foot">
          <div className="nav-list">
            {admin && <AreaLink destination={admin} to={landingOf(admin)} state={rowState(pathname, landingOf(admin), rootOf(admin), currentPagePath(adminGroups, pathname))} onNavigate={closeAndReturn} />}
            {profile && <AreaLink destination={profile} to="/profile" state={rowState(pathname, '/profile', '/profile', undefined)} onNavigate={closeAndReturn} />}
          </div>
          {viewer && <UserChip variant="drawer" />}
          <ReleaseStamp />
        </div>
      </div>
      </>
    </OverlayPortal>
  )
}
