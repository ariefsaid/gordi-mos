import type React from 'react'
import { MyWeekIcon, TasksIcon, UpdatesIcon, OpsIcon } from './icons'

export interface Section {
  path: string
  label: string
  Icon: React.FC
}

export const SECTIONS: Section[] = [
  { path: '/', label: 'My Week', Icon: MyWeekIcon },
  { path: '/tasks', label: 'Tasks', Icon: TasksIcon },
  { path: '/updates', label: 'Updates', Icon: UpdatesIcon },
  { path: '/ops', label: 'Ops', Icon: OpsIcon },
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
