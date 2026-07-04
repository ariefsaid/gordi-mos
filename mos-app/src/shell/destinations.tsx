import type React from 'react'
import type { Section } from './sections'
import { KITCHEN_SECTIONS } from './sections'
import { HomeIcon, TasksIcon, KitchenIcon, PlanIcon, InboxIcon } from './icons'

/**
 * DESTINATIONS — the single source of truth for both chromes (plan §1.5).
 * The desktop rail and the phone bottom-tab bar both render from this list
 * so the grouping never drifts between the two surfaces (ADR-0019 D2/D8).
 */
export type DestinationId = 'home' | 'work' | 'operate' | 'plan' | 'inbox'

export interface Destination {
  id: DestinationId
  labelKey: 'dest.home' | 'dest.work' | 'dest.operate' | 'dest.plan' | 'dest.inbox'
  Icon: React.FC
  /** live links under this destination; [] = destination not yet rolled in */
  links: Section[]
  /** optional access gate applied to ALL links (rail/bottom-bar hide when unsatisfied) */
  anyOf?: string[]
  /** primary route a bottom-tab taps (defaults to links[0].path) */
  primaryPath?: string
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'home',
    labelKey: 'dest.home',
    Icon: HomeIcon,
    links: [{ path: '/', label: 'Home', Icon: HomeIcon }],
    primaryPath: '/',
  },
  {
    id: 'work',
    labelKey: 'dest.work',
    Icon: TasksIcon,
    links: [{ path: '/tasks', label: 'Tasks', Icon: TasksIcon }],
  },
  {
    id: 'operate',
    labelKey: 'dest.operate',
    Icon: KitchenIcon,
    links: KITCHEN_SECTIONS,
  },
  {
    id: 'plan',
    labelKey: 'dest.plan',
    Icon: PlanIcon,
    links: [],
  },
  {
    id: 'inbox',
    labelKey: 'dest.inbox',
    Icon: InboxIcon,
    links: [],
  },
]

/**
 * A destination renders (rail group / bottom tab) iff it has >=1 live link
 * AND (no anyOf gate, or the viewer holds one of the gated roles).
 */
export function isLive(d: Destination, accessRoles: string[]): boolean {
  if (d.anyOf && !d.anyOf.some((r) => accessRoles.includes(r))) return false
  return d.links.length > 0
}
