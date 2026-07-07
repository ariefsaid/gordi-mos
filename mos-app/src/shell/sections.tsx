import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
import {
  MyWeekIcon, TasksIcon, UpdatesIcon, OpsIcon, KitchenIcon, PeopleIcon,
} from './icons'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG } from '@/config/features'

export interface Section {
  path: string
  label: string
  labelKey?: MessageKey
  Icon: React.FC
  /**
   * FR-424 (owner decision 2026-07-07, supersedes FR-420): a capability-gated link renders in the
   * rail ONLY for a viewer whose access-roles grant the named capability (via `can()`); it is
   * filtered out otherwise. The link stays in the destination's `links` regardless (so the
   * bottom-tab stays active + the breadcrumb reads "Work › …" if the viewer ever reaches the route —
   * RequireCapability is the real gate). Used to surface the Work catalog manage routes
   * (Objectives / Projects & Processes) to holders while keeping them out of a non-holder's rail.
   */
  capability?: string
}

// Rail + breadcrumb consume this. Weekly Updates / Daily Log are conditionally included via
// the feature flags (config/features.ts) — flip a flag to true to restore that nav entry.
export const SECTIONS: Section[] = [
  { path: '/', label: 'My Week', Icon: MyWeekIcon },
  { path: '/tasks', label: 'Tasks', Icon: TasksIcon },
  ...(SHOW_WEEKLY_UPDATES ? [{ path: '/updates', label: 'Weekly Updates', Icon: UpdatesIcon }] : []),
  ...(SHOW_DAILY_LOG ? [{ path: '/ops', label: 'Daily Log', Icon: OpsIcon }] : []),
]

// Kitchen module sections — 5 screens reachable from the "Operate" nav group (ADR-0019 D2/D3).
// Role visibility (Review + Pushes: ops_lead/admin only) is enforced in the rail; all 5 are in
// this list for breadcrumb resolution regardless of role. Every label flows through the i18n
// catalog (FR-440) via its labelKey.
export const KITCHEN_SECTIONS: Section[] = [
  { path: '/kitchen/log', label: 'Kitchen Log', labelKey: 'nav.kitchen.log', Icon: KitchenIcon },
  { path: '/kitchen/plan', label: 'Plan', labelKey: 'nav.kitchen.plan', Icon: KitchenIcon },
  { path: '/kitchen/stock', label: 'Stock', labelKey: 'nav.kitchen.stock', Icon: KitchenIcon },
  { path: '/kitchen/review', label: 'Review', labelKey: 'nav.kitchen.review', Icon: KitchenIcon },
  { path: '/kitchen/pushes', label: 'Pushes', labelKey: 'nav.kitchen.pushes', Icon: KitchenIcon },
]

// Admin module sections — admin-only; rendered conditionally in the rail.
export const ADMIN_SECTIONS: Section[] = [
  { path: '/admin/people', label: 'People', Icon: PeopleIcon },
]

// NOTE (nav-five-destinations FR-420): the standalone CATALOG_SECTIONS + SALES_SECTIONS nav groups
// are RETIRED. Objectives + Projects & Processes are now Work's manage-mode (relocated under
// /work/, reachable only from the cascade — see destinations.tsx + router.tsx); Sales is now a
// Plan destination link. Neither appears as a rail group for any role.

/**
 * Returns the Section whose path matches the given pathname, or null.
 * Scans SECTIONS, KITCHEN_SECTIONS, then ADMIN_SECTIONS. (Destination-owned routes — Tasks,
 * Cascade, Daily Log, Sales, the Work manage routes — are resolved in the Breadcrumb via the
 * DESTINATIONS model's own links, so they need no entry here; this registry is the fallback for
 * routes owned by no destination, e.g. /admin/*.) '/' matches exactly; other paths match exactly
 * or by prefix.
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
