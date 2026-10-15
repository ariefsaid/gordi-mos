import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { UserChip } from './user-chip'
import { CloseIcon } from './icons'
import { AreaLink, PageLinks } from './nav-parts'
import {
  FIXED_AREAS, INBOX_AREA, admittedModules, currentPagePath, footerAreas, pageCount, pageGroupsFor, destinationForPath, rowState,
  type Destination,
} from './module-registry'
import { useNavBadges } from './use-nav'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { focusableWithin } from '@/lib/focusable'
import { OverlayPortal } from '@/components/ui/overlay-portal'
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

const HOME = FIXED_AREAS[0]
const WORK = FIXED_AREAS[1]

function landingOf(destination: Destination): string {
  return destination.primaryPath ?? destination.links[0].path
}

function rootOf(destination: Destination): string {
  return `/${landingOf(destination).split('/')[1] ?? ''}`
}

/**
 * MobileDrawer — the phone's More: a drawer, not a page. It is derived from the SAME module registry as the
 * desktop nav: Home, Work, Inbox, the admitted Modules (only the module you are in expands, with its grouped
 * pages), then Admin settings, Personal profile and the account chip (language, appearance, sign out) in a
 * foot that stays on screen while the navigation scrolls. Every close path — Esc, backdrop click, the ✕, and
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
  const modules = admittedModules(accessRoles)
  const footer = footerAreas(accessRoles)
  const admin = footer.find((d) => d.id === 'admin')
  const profile = footer.find((d) => d.id === 'profile')
  const workGroups = pageGroupsFor(WORK, accessRoles)
  const adminGroups = admin ? pageGroupsFor(admin, accessRoles) : []
  const state = (destination: Destination, groups: ReturnType<typeof pageGroupsFor>) =>
    rowState(pathname, landingOf(destination), destination.id === 'home' ? '/' : rootOf(destination), currentPagePath(groups, pathname))

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
            <AreaLink destination={HOME} to="/" state={state(HOME, [])} onNavigate={closeAndReturn} />
            <div>
              <AreaLink destination={WORK} to={landingOf(WORK)} state={state(WORK, workGroups)} onNavigate={closeAndReturn} />
              {area?.id === 'work' && (
                <div className="nav-children">
                  <PageLinks groups={workGroups} pathname={pathname} forPath={badges.forPath} onNavigate={closeAndReturn} />
                </div>
              )}
            </div>
            {/* Inbox has no desktop menu row (it is the bell); on a phone the bell is on the top bar and here. */}
            <AreaLink destination={INBOX_AREA} to={landingOf(INBOX_AREA)} state={state(INBOX_AREA, [])} onNavigate={closeAndReturn} />
          </div>

          {modules.length > 0 && (
            <>
              <div className="nav-group-heading nav-group-heading--top">{t('shell.nav.modules')}</div>
              <div className="nav-list">
                {modules.map((module) => {
                  const groups = pageGroupsFor(module, accessRoles)
                  const here = area?.id === module.id && pageCount(groups) >= 2
                  return (
                    <div key={module.id}>
                      <AreaLink destination={module} to={landingOf(module)} state={state(module, here ? groups : [])} onNavigate={closeAndReturn} badge={here ? undefined : badges.forDestination(module.id)} />
                      {here && (
                        <div className="nav-children">
                          <PageLinks groups={groups} pathname={pathname} forPath={badges.forPath} onNavigate={closeAndReturn} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

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
            {admin && <AreaLink destination={admin} to={landingOf(admin)} state={state(admin, adminGroups)} onNavigate={closeAndReturn} />}
            {profile && <AreaLink destination={profile} to="/profile" state={rowState(pathname, '/profile', '/profile', undefined)} onNavigate={closeAndReturn} />}
          </div>
          {viewer && <UserChip variant="drawer" />}
        </div>
      </div>
      </>
    </OverlayPortal>
  )
}
