import type React from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { Chevron } from './icons'
import { CountBadge } from './count-badge'
import { currentPagePath, type Destination, type PageGroup, type RowState } from './module-registry'
import type { NavBadge } from './use-nav'
import type { Section } from './sections'

/** One nav row: the link plus an optional separately-operable disclosure, one hover/active surface. */
export function NavRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`nav-row${className ? ` ${className}` : ''}`}>{children}</div>
}

/**
 * An area row (Home, Work, a module, Admin settings, Personal profile): icon + label, opening the area's
 * landing. The area that holds the current page takes the accent colour; the page itself takes aria-current.
 */
export function AreaLink({ destination, to, state, onNavigate, trailing, badge, label: labelOverride }: {
  destination: Destination
  to: string
  state?: RowState
  onNavigate?: () => void
  trailing?: React.ReactNode
  badge?: NavBadge
  label?: string
}) {
  const t = useT()
  const label = labelOverride ?? t(destination.labelKey)
  const Icon = destination.Icon
  return (
    <NavRow className={state === 'page' ? 'nav-row--active' : undefined}>
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={state}
        className={`nav-item nav-item--section iconrow iconrow--md${state === 'page' ? ' nav-item--active' : ''}${state === 'location' ? ' nav-item--parent' : ''}`}
      >
        <span className="iconrow__icon"><Icon /></span>
        <span className="nav-item__label">{label}</span>
        <CountBadge count={badge?.count} bounded={badge?.bounded} unavailable={badge?.unavailable} label={badge ? badge.label : undefined} />
      </Link>
      {trailing}
    </NavRow>
  )
}

/** The disclosure beside a row: its own button with a fixed 16px chevron column, never a toggle laid over the link. */
export function Disclosure({ id, label, expanded, onToggle }: { id: string; label: string; expanded: boolean; onToggle: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={id}
      aria-label={t(expanded ? 'rail.group.hidePages' : 'rail.group.showPages', { group: label })}
      className="nav-toggle"
      onClick={onToggle}
    >
      <Chevron className={`nav-toggle__chevron${expanded ? ' nav-toggle__chevron--open' : ''}`} size={16} />
    </button>
  )
}

/** One page row. The longest-matching page is current (aria-current="page"); a count shows on the trailing edge. */
function PageLink({ section, current, badge, onNavigate }: { section: Section; current: boolean; badge?: NavBadge; onNavigate?: () => void }) {
  const t = useT()
  const label = section.labelKey ? t(section.labelKey) : section.label
  return (
    <NavRow className={current ? 'nav-row--active' : undefined}>
      <Link
        to={section.path}
        onClick={onNavigate}
        aria-current={current ? 'page' : undefined}
        className={`nav-item nav-item--child${current ? ' nav-item--active' : ''}`}
      >
        <span className="nav-item__label">{label}</span>
        <CountBadge count={badge?.count} bounded={badge?.bounded} unavailable={badge?.unavailable} label={badge ? badge.label : undefined} />
      </Link>
    </NavRow>
  )
}

/**
 * The pages of one area, grouped: the SAME rendering in the sidebar branch, the pages panel, the flyouts and the
 * phone drawer, so identical content is a property of the code, not of care. Group headings are 14/600 ink,
 * unboxed; a nested page (Receipt issues) follows its parent at the same indent.
 */
export function PageLinks({ groups, pathname, forPath, onNavigate }: {
  groups: readonly PageGroup[]
  pathname: string
  forPath: (path: string) => NavBadge | undefined
  onNavigate?: () => void
}) {
  const t = useT()
  const current = currentPagePath(groups, pathname)
  return (
    <>
      {groups.map((group) => {
        const rows = group.items.map((section) => (
          <PageLink key={section.path} section={section} current={section.path === current} badge={forPath(section.path)} onNavigate={onNavigate} />
        ))
        if (!group.headingKey) return <div key={group.key} className="nav-list">{rows}</div>
        const headingId = `nav-group-${group.key.replace(/\W/g, '-')}`
        return (
          <div key={group.key} className="nav-group" role="group" aria-labelledby={headingId}>
            <div id={headingId} className="nav-group-heading">{t(group.headingKey as MessageKey)}</div>
            <div className="nav-list">{rows}</div>
          </div>
        )
      })}
    </>
  )
}
