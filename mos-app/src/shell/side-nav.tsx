import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { isShipGated } from '@/lib/ship-gate'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { Chevron } from './icons'
import { UserChip } from './user-chip'
import { CountBadge } from './count-badge'
import { AreaLink, Disclosure, NavRow, PageLinks } from './nav-parts'
import {
  FIXED_AREAS, admittedModules, currentPagePath, footerAreas, pageCount, pageGroupsFor, rowState,
  type Destination, type PageGroup,
} from './module-registry'
import { useNavBadges, useNavLayout, type NavBadge, type NavLayout } from './use-nav'
import { useRailCollapsePref } from './use-rail-collapse-pref'
import { useAuth } from '@/auth/use-auth'
import { focusableWithin } from '@/lib/focusable'
import './nav.css'

/**
 * The desktop navigation. ONE module registry feeds every form of it (module-registry.tsx):
 *
 *  - ONE admitted module  → `Sidebar`: a single 240px labelled sidebar (Home, Work, Modules with the open
 *    module's pages under it, Admin settings and Personal profile at the foot).
 *  - TWO OR MORE          → `Rail` (64px, labelled icons) + `PagesPanel` (240px, the selected area's pages).
 *  - under 1280px, or folded by the viewer → the same `Rail` alone, each area with pages opening a grouped flyout.
 *
 * The pages are `PageLinks` over `pageGroupsFor` in every form, so the panel, the sidebar branch and the
 * flyout list exactly the same pages in the same groups. Phone is separate (tab bar + More drawer).
 */
interface NavData {
  layout: NavLayout
  pathname: string
  modules: Destination[]
  footer: Destination[]
  badges: ReturnType<typeof useNavBadges>
}

const HOME = FIXED_AREAS[0]
const WORK = FIXED_AREAS[1]

function pagesOf(destination: Destination, roles: string[], isOn: NavLayout['isOn']): PageGroup[] {
  return pageGroupsFor(destination, roles, isOn)
}

/** An area is a branch (has a pages list) from two pages up; a single page is the area's own row. */
function branchGroups(destination: Destination, roles: string[], isOn: NavLayout['isOn']): PageGroup[] {
  const groups = pagesOf(destination, roles, isOn)
  return pageCount(groups) >= 2 ? groups : []
}

function landingOf(destination: Destination): string {
  return destination.primaryPath ?? destination.links[0].path
}

function rootOf(destination: Destination): string {
  return `/${landingOf(destination).split('/')[1] ?? ''}`
}

/** The fold-away control (#442): an ordinary button with aria-expanded for the nav it changes. */
function CollapseToggle({ compact }: { compact: boolean }) {
  const t = useT()
  const { toggle } = useRailCollapsePref()
  const label = compact ? t('rail.expand') : t('rail.collapse')
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!compact}
      aria-controls="rail-primary-nav"
      title={label}
      className="nav-collapse-toggle"
      data-rail-collapsed={compact ? 'true' : undefined}
    >
      <span className="icon-name">{label}</span>
      <Chevron className="nav-collapse-toggle__chevron" size={16} />
    </button>
  )
}

/* ───────────────────────────── one module: the single sidebar ───────────────────────────── */

function Sidebar({ data }: { data: NavData }) {
  const t = useT()
  const { layout, pathname, modules, footer, badges } = data
  const { roles, area } = layout
  const defaultModule = (): string | null =>
    area?.zone === 'modules' ? area.id
      : modules.length === 1 && area?.id !== 'work' && area?.id !== 'admin' ? modules[0].id : null
  const [openModule, setOpenModule] = useState<string | null>(defaultModule)
  const [workOpen, setWorkOpen] = useState(area?.id === 'work')
  // A route change reopens the branch that owns the route and closes the others; opening another branch by
  // hand closes the prior one without navigating.
  useEffect(() => {
    setOpenModule(defaultModule())
    setWorkOpen(area?.id === 'work')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derived from the route only
  }, [pathname])

  const workGroups = branchGroups(WORK, roles, layout.isOn)
  const workCurrent = currentPagePath(workGroups, pathname)
  const admin = footer.find((d) => d.id === 'admin')
  const profile = footer.find((d) => d.id === 'profile')
  const adminGroups = admin ? pagesOf(admin, roles, layout.isOn) : []

  return (
    <aside aria-label={t('nav.sidebar')} className="shell-nav shell-nav--sidebar">
      {layout.collapsible && <div className="nav-collapse-row"><CollapseToggle compact={false} /></div>}
      <nav id="rail-primary-nav" aria-label={t('nav.primary')} className="nav-primary">
        <div className="nav-fixed nav-list">
          {!isShipGated('/') && <AreaLink destination={HOME} to="/" state={rowState(pathname, '/', '/', undefined)} />}
          {!isShipGated('/work') && layout.isOn('work') && <div>
            <AreaLink
              destination={WORK}
              to={landingOf(WORK)}
              state={rowState(pathname, landingOf(WORK), '/work', workCurrent)}
              trailing={workGroups.length > 0 ? <Disclosure id="nav-children-work" label={t(WORK.labelKey)} expanded={workOpen} onToggle={() => setWorkOpen((open) => !open)} /> : undefined}
            />
            <div id="nav-children-work" hidden={!workOpen} className="nav-children">
              <PageLinks groups={workGroups} pathname={pathname} forPath={badges.forPath} />
            </div>
          </div>}
        </div>
        <div className="nav-scroll">
          {modules.length > 0 && <div className="nav-group-heading nav-group-heading--top">{t('shell.nav.modules')}</div>}
          <div className="nav-list">
            {modules.map((module) => {
              const groups = branchGroups(module, roles, layout.isOn)
              const open = openModule === module.id
              const current = currentPagePath(groups, pathname)
              const id = `nav-children-${module.id}`
              return (
                <div key={module.id}>
                  <AreaLink
                    destination={module}
                    to={landingOf(module)}
                    state={rowState(pathname, landingOf(module), rootOf(module), current)}
                    badge={open ? undefined : badges.forDestination(module.id)}
                    trailing={groups.length > 0 ? <Disclosure id={id} label={t(module.labelKey)} expanded={open} onToggle={() => setOpenModule(open ? null : module.id)} /> : undefined}
                  />
                  {groups.length > 0 && (
                    <div id={id} hidden={!open} className="nav-children">
                      <PageLinks groups={groups} pathname={pathname} forPath={badges.forPath} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {area?.id === 'admin' && adminGroups.length > 0 && (
            <div className="nav-admin-pages">
              <div className="nav-group-heading nav-group-heading--top">{t('dest.admin')}</div>
              <PageLinks groups={adminGroups} pathname={pathname} forPath={badges.forPath} />
            </div>
          )}
        </div>
        <div className="nav-foot-links nav-list">
          {admin && <AreaLink destination={admin} to={landingOf(admin)} state={rowState(pathname, landingOf(admin), '/admin', currentPagePath(adminGroups, pathname))} />}
          {profile && <AreaLink destination={profile} to="/profile" state={rowState(pathname, '/profile', '/profile', undefined)} />}
        </div>
      </nav>
      <div className="rail-foot"><UserChip variant="rail" /></div>
    </aside>
  )
}

/* ───────────────────────────── two or more: rail + pages panel ───────────────────────────── */

/** The rail's flyout: one area's grouped pages, portalled beside the rail. Escape or an outside press closes it and focus returns to the trigger. */
function RailFlyout({ destination, groups, pathname, forPath, anchor, onClose }: {
  destination: Destination
  groups: PageGroup[]
  pathname: string
  forPath: (path: string) => NavBadge | undefined
  anchor: HTMLElement
  onClose: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const [place, setPlace] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const landing = landingOf(destination)
  const landingListed = groups.some((group) => group.items.some((item) => item.path === landing))

  // Beside the rail from the trigger's row, kept inside the window and below the top bar.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const rect = anchor.getBoundingClientRect()
    const gap = 8
    const topBar = (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + gap
    const room = window.innerHeight - topBar - gap
    const height = Math.min(node.scrollHeight, room)
    const top = Math.max(topBar, Math.min(rect.top, window.innerHeight - gap - height))
    setPlace({ top, left: rect.right + gap, maxHeight: window.innerHeight - top - gap })
  }, [anchor, groups])

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('a[aria-current="page"], a')
    first?.focus()
  }, [place])

  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onPress)
    return () => document.removeEventListener('pointerdown', onPress)
  }, [anchor, onClose])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); anchor.focus(); return }
    const links = Array.from(ref.current?.querySelectorAll<HTMLElement>('a') ?? [])
    const index = links.indexOf(document.activeElement as HTMLElement)
    const move = (next: number) => { event.preventDefault(); links[(next + links.length) % links.length]?.focus() }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(links.length - 1)
    else if (event.key === 'Tab' && !event.shiftKey && index === links.length - 1) {
      // The flyout is portalled to the end of the page; Tab out of it continues where the rail left off.
      const order = focusableWithin(document.body).filter((node) => !ref.current?.contains(node))
      const next = order[order.indexOf(anchor) + 1]
      if (next) { event.preventDefault(); next.focus() }
      onClose()
    } else if (event.key === 'Tab' && event.shiftKey && index <= 0) { event.preventDefault(); anchor.focus(); onClose() }
  }

  return createPortal(
    <div
      ref={ref}
      id={`nav-flyout-${destination.id}`}
      role="group"
      aria-labelledby={labelId}
      className="nav-flyout"
      style={place ?? { visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      <div id={labelId} className="nav-flyout__title">{t(destination.labelKey)}</div>
      {!landingListed && (
        <NavRow className={pathname === landing ? 'nav-row--active' : undefined}>
          <Link to={landing} onClick={onClose} aria-current={pathname === landing ? 'page' : undefined} className={`nav-item nav-item--child${pathname === landing ? ' nav-item--active' : ''}`}>
            <span className="nav-item__label">{t(destination.labelKey)}</span>
          </Link>
        </NavRow>
      )}
      <PageLinks groups={groups} pathname={pathname} forPath={forPath} onNavigate={onClose} />
    </div>,
    document.body,
  )
}

/** One labelled icon on the 64px rail: a link, or — in the folded rail — a button that opens the area's flyout. */
function RailItem({ destination, to, state, groups, flyouts, badge, pathname, forPath, openId, onOpen }: {
  destination: Destination
  to: string
  state: ReturnType<typeof rowState>
  groups: PageGroup[]
  flyouts: boolean
  badge?: NavBadge
  pathname: string
  forPath: (path: string) => NavBadge | undefined
  openId: string | null
  onOpen: (id: string | null) => void
}) {
  const t = useT()
  const Icon = destination.Icon
  const full = t(destination.labelKey)
  const short = t(destination.railLabelKey ?? destination.labelKey)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const className = `rail-item${state ? ' rail-item--here' : ''}${state === 'page' ? ' rail-item--active' : ''}`
  const name = badge ? `${full}, ${badge.label}` : full
  const body = (
    <>
      <span className="rail-item__icon"><Icon /><CountBadge count={badge?.count} compact /></span>
      <span className="rail-item__label">{short}</span>
    </>
  )
  if (flyouts && groups.length > 0) {
    const open = openId === destination.id
    return (
      <div className="rail-item-wrap">
        <button
          ref={triggerRef}
          type="button"
          className={className}
          aria-current={state}
          aria-label={name}
          aria-expanded={open}
          aria-controls={`nav-flyout-${destination.id}`}
          title={full}
          onClick={() => onOpen(open ? null : destination.id)}
        >
          {body}
        </button>
        {open && triggerRef.current && (
          <RailFlyout destination={destination} groups={groups} pathname={pathname} forPath={forPath} anchor={triggerRef.current} onClose={() => onOpen(null)} />
        )}
      </div>
    )
  }
  return (
    <div className="rail-item-wrap">
      <Link to={to} className={className} aria-current={state} aria-label={name} title={full}>
        {body}
      </Link>
    </div>
  )
}

function Rail({ data, hasPanel }: { data: NavData; hasPanel: boolean }) {
  const t = useT()
  const { layout, pathname, modules, footer, badges } = data
  const { roles, isOn, compact } = layout
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => { setOpenId(null) }, [pathname])

  const item = (destination: Destination) => {
    const groups = destination.id === 'work' || destination.id === 'admin' || destination.zone === 'modules'
      ? branchGroups(destination, roles, isOn) : []
    // Folded: the pages sit behind a closed flyout, so only the area's own landing can be the current page here.
    const current = compact ? undefined : currentPagePath(groups, pathname)
    const landing = landingOf(destination)
    const state = rowState(pathname, landing, destination.id === 'home' ? '/' : rootOf(destination), current)
    return (
      <RailItem
        key={destination.id}
        destination={destination}
        to={landing}
        state={state}
        groups={groups}
        flyouts={compact}
        badge={badges.forDestination(destination.id)}
        pathname={pathname}
        forPath={badges.forPath}
        openId={openId}
        onOpen={setOpenId}
      />
    )
  }

  return (
    <aside aria-label={t('nav.sidebar')} className={`shell-nav shell-nav--rail${hasPanel ? ' shell-nav--with-panel' : ''}`} data-rail-compact="true">
      {compact && layout.collapsible && <div className="nav-collapse-row nav-collapse-row--compact"><CollapseToggle compact /></div>}
      <nav id="rail-primary-nav" aria-label={t('nav.primary')} className="rail-nav">
        <div className="rail-scroll nav-scroll">
          {!isShipGated('/') && item(HOME)}
          {!isShipGated('/work') && isOn('work') && item(WORK)}
          {modules.map(item)}
        </div>
        <div className="rail-foot-links">
          {footer.map(item)}
        </div>
      </nav>
      <div className="rail-foot"><UserChip variant="rail" compact /></div>
    </aside>
  )
}

/** The selected area's pages beside the rail: the same grouped list the single sidebar shows under a module. */
function PagesPanel({ data, area }: { data: NavData; area: Destination }) {
  const t = useT()
  const { layout, pathname, badges } = data
  const groups = pagesOf(area, layout.roles, layout.isOn)
  const name = t(area.labelKey)
  return (
    <nav className="nav-panel" aria-label={t('shell.nav.pagesOf', { area: name })}>
      <div className="nav-panel__head">
        <span className="nav-panel__title">{name}</span>
        {layout.collapsible && <CollapseToggle compact={false} />}
      </div>
      <div className="nav-scroll nav-panel__body">
        <PageLinks groups={groups} pathname={pathname} forPath={badges.forPath} />
      </div>
    </nav>
  )
}

export function SideNav() {
  const layout = useNavLayout()
  const auth = useAuth()
  const { pathname } = useLocation()
  const badges = useNavBadges()
  const rootRef = useRef<HTMLDivElement>(null)
  const roles = layout.roles
  const modules = admittedModules(roles, layout.isOn)
  const footer = footerAreas(roles)

  // NV1: the active page is always visible. A long menu (Café's grouped pages) scrolls inside its own region,
  // and a route change — not a count refresh — brings the active page into view.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      rootRef.current?.querySelectorAll<HTMLElement>('.nav-scroll').forEach((scroller) => {
        const active = scroller.querySelector<HTMLElement>('.nav-item--child.nav-item--active')
        if (!active) return
        const item = active.getBoundingClientRect()
        const box = scroller.getBoundingClientRect()
        const margin = 8
        if (item.bottom > box.bottom - margin) scroller.scrollTop += item.bottom - (box.bottom - margin)
        else if (item.top < box.top + margin) scroller.scrollTop -= box.top + margin - item.top
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname, layout.panelArea])

  if (auth.status !== 'authenticated' || layout.isNarrow) return null
  const data: NavData = { layout, pathname, modules, footer, badges }

  if (!layout.compact && layout.mode === 'sidebar') {
    return <div ref={rootRef} className="shell-nav-host"><Sidebar data={data} /></div>
  }
  return (
    <div ref={rootRef} className="shell-nav-host shell-nav-host--rail">
      <Rail data={data} hasPanel={layout.panelArea !== null} />
      {layout.panelArea && <PagesPanel data={data} area={layout.panelArea} />}
    </div>
  )
}

