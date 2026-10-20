// The People list's view state, shared by the list and the page head so both count the same rows.

import type { MessageKey } from '@/i18n/messages'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import type { SortDir } from './sort-button'
import { matchesTokens } from '@/lib/token-search'
import { hasAccessRole } from '@/lib/capabilities'

// ── Segment filter types ──────────────────────────────────────────────────────

export type StatusSegment = 'all' | 'active' | 'none' | 'disabled' | 'archived'

export const SEGMENT_OPTIONS: { value: StatusSegment; labelKey: MessageKey }[] = [
  { value: 'all', labelKey: 'admin.people.seg.all' },
  { value: 'active', labelKey: 'admin.people.seg.active' },
  { value: 'none', labelKey: 'admin.people.seg.none' },
  { value: 'disabled', labelKey: 'admin.people.seg.disabled' },
  { value: 'archived', labelKey: 'admin.people.seg.archived' },
]

// ── Filter logic ──────────────────────────────────────────────────────────────
// Design-plan §2.1:
//   All = every non-archived person; Archived = archived_at != null;
//   Active/No login/Disabled are non-archived subsets by login status.

function applySegment(people: AdminPersonRow[], segment: StatusSegment): AdminPersonRow[] {
  if (segment === 'archived') return people.filter((p) => p.archived_at != null)
  const nonArchived = people.filter((p) => p.archived_at == null)
  if (segment === 'all') return nonArchived
  return nonArchived.filter((p) => p.login === segment)
}

/** Name/email search: every typed word must match, in any order ("barista bayu" finds Bayu). */
function applySearch(people: AdminPersonRow[], query: string): AdminPersonRow[] {
  return people.filter((p) => matchesTokens(query, [p.full_name, p.email]))
}

export function toSegment(statusParam: string): StatusSegment {
  return SEGMENT_OPTIONS.some((o) => o.value === statusParam) ? (statusParam as StatusSegment) : 'all'
}

/**
 * The rows the list shows for the URL's `status` + `q`, and whether that view is filtered at all.
 * Exported so the page head can count the same rows the list draws.
 */
export function filterPeople(people: AdminPersonRow[], statusParam: string, query: string): { rows: AdminPersonRow[]; filtered: boolean } {
  const segment = toSegment(statusParam)
  return {
    rows: applySearch(applySegment(people, segment), query),
    filtered: segment !== 'all' || query.trim() !== '',
  }
}

/** True when this person is the only active, unarchived admin in the list. */
export function isLastActiveAdmin(person: AdminPersonRow, people: readonly AdminPersonRow[]): boolean {
  const isActiveAdmin = (p: AdminPersonRow) => hasAccessRole(p.access_roles, 'admin') && p.login === 'active' && !p.archived_at
  return isActiveAdmin(person) && people.filter(isActiveAdmin).length === 1
}

// ── Sort ──────────────────────────────────────────────────────────────────────
// Default is the job: find a person by name. Login sorts by how much attention it asks (active
// first); a person with no Team always sorts last, whichever way the list runs.

export type PeopleSort = 'name' | 'login' | 'team'

export const SORT_OPTIONS: { value: PeopleSort; labelKey: MessageKey }[] = [
  { value: 'name', labelKey: 'admin.people.sort.name' },
  { value: 'login', labelKey: 'admin.people.sort.login' },
  { value: 'team', labelKey: 'admin.people.sort.team' },
]

export function toSort(param: string): PeopleSort {
  return SORT_OPTIONS.some((o) => o.value === param) ? (param as PeopleSort) : 'name'
}

export function toDir(param: string): SortDir {
  return param === 'desc' ? 'desc' : 'asc'
}

const LOGIN_RANK = { active: 0, disabled: 1, none: 2 } as const

export function sortPeople(rows: AdminPersonRow[], sort: PeopleSort, dir: SortDir, teamName: (person: AdminPersonRow) => string | null): AdminPersonRow[] {
  const sign = dir === 'desc' ? -1 : 1
  const byName = (a: AdminPersonRow, b: AdminPersonRow) => a.full_name.localeCompare(b.full_name)
  return [...rows].sort((a, b) => {
    if (sort === 'login') return sign * (LOGIN_RANK[a.login] - LOGIN_RANK[b.login]) || byName(a, b)
    if (sort === 'team') {
      const [x, y] = [teamName(a), teamName(b)]
      if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1
      return sign * x.localeCompare(y) || byName(a, b)
    }
    return sign * byName(a, b)
  })
}

/** The People list's view (filters, search, sort): carried to a person's page so its Back link returns to it. */
export const LIST_PARAMS = ['status', 'q', 'sort'] as const
