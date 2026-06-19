import type React from 'react'
import { MyWeekIcon, TasksIcon, UpdatesIcon, OpsIcon } from './icons'
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

/**
 * Returns the Section whose path matches the given pathname, or null.
 * '/' matches exactly; other paths match exactly or by prefix.
 */
export function sectionForPath(pathname: string): Section | null {
  for (const section of SECTIONS) {
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
