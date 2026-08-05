import type React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { primaryModuleForViewer } from './destinations'
import { HomeIcon, WorkIcon, InboxIcon, MoreIcon } from './icons'
import { useIsNarrow } from './use-is-narrow'
import { RailCountBadge } from './rail-nav'
import { useAuth } from '@/auth/use-auth'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import './bottom-tab-bar.css'

type PrimaryTab = {
  id: string
  labelKey: MessageKey
  href: string
  /** widens the active match to a whole section (Work + the role module) */
  sectionPrefix?: string
  Icon: React.FC
}

// The fixed phone primary tabs. Money is NOT a bottom-nav tab — it lives in the More drawer
// (gated). Work → /work/tasks; `sectionPrefix` widens the active match to the whole /work
// section so the tab carries aria-current="page" for EVERY /work/* child, mirroring the
// desktop rail's `to="/work"` NavLink semantics (Rule 5/9, F-B/OD-64). The 3rd slot is the
// role-scoped module (OD-REDESIGN-68) — resolved per viewer below.
const HOME: PrimaryTab = { id: 'home', labelKey: 'dest.home', href: '/', Icon: HomeIcon }
const WORK: PrimaryTab = { id: 'work', labelKey: 'dest.work', href: '/work/tasks', sectionPrefix: '/work', Icon: WorkIcon }
const INBOX: PrimaryTab = { id: 'inbox', labelKey: 'dest.inbox', href: '/inbox', Icon: InboxIcon }

// v4 shell rebuild (Task 6): the + Action Launcher yields the thumb zone on capture surfaces —
// Café's phone-optimized log/plan/stock/review screens — where the surface's own control is the
// primary action. Hidden there, and ONLY there; unchanged everywhere else (still bottom-right).
const CAPTURE_SURFACE_PATHS = ['/cafe/log', '/cafe/plan', '/cafe/stock', '/cafe/review']

function isCaptureSurface(pathname: string): boolean {
  return CAPTURE_SURFACE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

type BottomTabBarProps = {
  /** Opens the More menu (the mobile drawer) — its sole opener (v4 shell rebuild, Task 1). */
  onOpenMore?: () => void
  /** Opens the shared Action Launcher/command registry. */
  onOpenActionLauncher?: () => void
  /** Registers the More button as the focus return target for the mobile drawer. */
  onRegisterMoreFocus?: (focus: () => void) => void
  /** Whether the More drawer is currently open (aria-expanded on the More tab, Task 5). */
  moreOpen?: boolean
}

/**
 * BottomTabBar — v4 shell rebuild. Phone bottom-nav = Home · Work · [viewer's module] · Inbox ·
 * More (destinations only, Task 5). The first up-to-four are primary destinations; More opens
 * the two-zone nav drawer of every OTHER destination. Exactly-one aria-current="page": the
 * active primary tab carries it; when a non-primary destination is active, the breadcrumb LEAF
 * carries it instead (I7 — "rail owns it; breadcrumb leaf when the viewer has no rail entry" —
 * see breadcrumb.tsx), never the More button (Task 3 — More is a door, not a location). The 3rd
 * primary slot is role-scoped (OD-REDESIGN-68): the viewer's module, or omitted for an org-wide
 * role.
 */
export function BottomTabBar({ onOpenMore, onOpenActionLauncher, onRegisterMoreFocus, moreOpen = false }: BottomTabBarProps) {
  const isNarrow = useIsNarrow()
  const t = useT()
  const { pathname } = useLocation()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  // H1/H8 fix (design audit, 2026-07-27): the phone Inbox tab's unread badge — the same cheap
  // dedicated read the header bell and desktop rail already use (useUnreadCount), so the count
  // reads identically everywhere it's shown. Fetched once per shell mount; no polling.
  const { unreadCount } = useUnreadCount()

  // OD-REDESIGN-68: the module tab is the viewer's own work, not a hardcoded Café for
  // everyone. A barista sees Café, a roaster sees Roastery; an org-wide role sees no
  // module slot (the rail's rule, applied to the phone bottom-nav). Module routes stay
  // reachable via ⌘K / direct URL — this scopes the NAV, not authorization.
  const moduleDest = viewer ? primaryModuleForViewer(viewer.roles.map((r) => r.name), viewer.accessRoles) : null
  const moduleTab: PrimaryTab | null = moduleDest
    ? {
        id: moduleDest.id,
        labelKey: moduleDest.labelKey,
        href: moduleDest.primaryPath ?? moduleDest.links[0].path,
        sectionPrefix: moduleDest.primaryPath,
        Icon: moduleDest.Icon,
      }
    : null

  const primaryTabs: PrimaryTab[] = moduleTab ? [HOME, WORK, moduleTab, INBOX] : [HOME, WORK, INBOX]

  if (!isNarrow) return null

  const showLauncher = !isCaptureSurface(pathname)

  return (
    // FINDING 1 fix: the nav landmark now holds ONLY navigation (the tab list) — the +
    // Action Launcher is a sibling of <nav>, not a child, since it opens a create/action
    // sheet rather than a destination (a non-navigational action inside a nav landmark was
    // mis-announced as navigation). It keeps its fixed bottom-right position (position:fixed,
    // unaffected by DOM parent) and its existing capture-surface hide/gutter-reclaim behaviour.
    <>
      <nav
        aria-label="Primary"
        className={`bottom-tab-bar${showLauncher ? ' bottom-tab-bar--with-launcher' : ''}`}
        style={{ gridArea: 'tabbar' }}
      >
        <ul className="bottom-tab-list">
            {primaryTabs.map((tab) => {
              // Work (sectionPrefix) matches the whole /work section; other tabs match their href.
              // Home ('/') matches exactly. This keeps exactly one aria-current="page" on every
              // phone route, including /work/signals | /work/projects | /work/objectives (F-B).
              const section = tab.sectionPrefix ?? tab.href
              const active =
                tab.href === '/' ? pathname === '/' : pathname === section || pathname.startsWith(section + '/')
              // H1/H8 fix (design audit, 2026-07-27): Inbox is the only primary tab with a count
              // badge. Same DO-18(d) pattern as the rail — the accessible NAME is built on the
              // <Link> itself by joining the already-localized label + badge sentence, so AT
              // never concatenates the two with no separator ("Tugas12").
              const badgeLabel =
                tab.id === 'inbox' && unreadCount > 0 ? t('rail.badge.unreadInbox', { count: unreadCount }) : undefined
              const label = t(tab.labelKey)
              return (
                <li key={tab.id}>
                  <Link
                    to={tab.href}
                    aria-label={badgeLabel ? `${label}, ${badgeLabel}` : label}
                    aria-current={active ? 'page' : undefined}
                    className={`bottom-tab${active ? ' bottom-tab--active' : ''}`}
                  >
                    <span className="bottom-tab-icon" style={{ position: 'relative' }}>
                      <tab.Icon />
                      {tab.id === 'inbox' ? (
                        <RailCountBadge count={unreadCount} label={badgeLabel} compact />
                      ) : null}
                    </span>
                    <span className="bottom-tab-label">{label}</span>
                  </Link>
                </li>
              )
            })}
            <li>
              {/* Task 3/5: More is a door to the two-zone nav drawer, never a location — it carries
                  aria-haspopup/aria-expanded (dialog-disclosure semantics), never aria-current. */}
              <button
                type="button"
                ref={(node) => {
                  if (node) onRegisterMoreFocus?.(() => node.focus())
                }}
                aria-label={t('nav.more')}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                className="bottom-tab"
                onClick={onOpenMore}
              >
                <span className="bottom-tab-icon">
                  <MoreIcon />
                </span>
                <span className="bottom-tab-label">{t('nav.more')}</span>
              </button>
            </li>
        </ul>
      </nav>
      {/* FINDING 1: the launcher lives OUTSIDE <nav aria-label="Primary"> — it opens the shared
          Action Launcher sheet, not a destination, so it must not be announced as navigation.
          position:fixed keeps its exact bottom-right placement regardless of DOM parent.
          OD-61 / OD-REDESIGN-46: the plus only opens the shared command registry; it never
          guesses a default action. Task 6: yields on Café's capture surfaces. */}
      {showLauncher && (
        <button
          type="button"
          className="mobile-action-launcher"
          aria-label={t('actionLauncher.open')}
          aria-haspopup="dialog"
          onClick={onOpenActionLauncher}
        >
          <span aria-hidden="true">+</span>
        </button>
      )}
    </>
  )
}
