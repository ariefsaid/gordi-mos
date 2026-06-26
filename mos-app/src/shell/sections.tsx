import type React from 'react'
import { MyWeekIcon, TasksIcon, UpdatesIcon, OpsIcon, KitchenIcon, PeopleIcon } from './icons'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG } from '@/config/features'

export interface Section {
  path: string
  label: string
  Icon: React.FC
}

// Rail + breadcrumb consume this. Weekly Updates / Daily Log are conditionally included via
// the feature flags (config/features.ts) — flip a flag to true to restore that nav entry.
export const SECTIONS: Section[] = [
  { path: '/', label: 'My Week', Icon: MyWeekIcon },
  { path: '/tasks', label: 'Tasks', Icon: TasksIcon },
  ...(SHOW_WEEKLY_UPDATES ? [{ path: '/updates', label: 'Weekly Updates', Icon: UpdatesIcon }] : []),
  ...(SHOW_DAILY_LOG ? [{ path: '/ops', label: 'Daily Log', Icon: OpsIcon }] : []),
]

// Kitchen module sections — 5 screens reachable from the "Kitchen" nav group.
// Role visibility (Review + Pushes: ops_lead/admin only) is enforced in the rail;
// all 5 are in this list for breadcrumb resolution regardless of role.
export const KITCHEN_SECTIONS: Section[] = [
  { path: '/kitchen/log', label: 'Log', Icon: KitchenIcon },
  { path: '/kitchen/plan', label: 'Plan', Icon: KitchenIcon },
  { path: '/kitchen/stock', label: 'Stock', Icon: KitchenIcon },
  { path: '/kitchen/review', label: 'Review', Icon: KitchenIcon },
  { path: '/kitchen/pushes', label: 'Pushes', Icon: KitchenIcon },
]

// Admin module sections — admin-only; rendered conditionally in the rail.
export const ADMIN_SECTIONS: Section[] = [
  { path: '/admin/users', label: 'People', Icon: PeopleIcon },
]

/**
 * Returns the Section whose path matches the given pathname, or null.
 * Checks SECTIONS, KITCHEN_SECTIONS, then ADMIN_SECTIONS.
 * '/' matches exactly; other paths match exactly or by prefix.
 */
export function sectionForPath(pathname: string): Section | null {
  const allSections = [...SECTIONS, ...KITCHEN_SECTIONS, ...ADMIN_SECTIONS]
  for (const section of allSections) {
    if (section.path === '/') {
      if (pathname === '/') return section
    } else {
      if (pathname === section.path || pathname.startsWith(section.path + '/')) {
        return section
      }
    }
  }
  return null
}
