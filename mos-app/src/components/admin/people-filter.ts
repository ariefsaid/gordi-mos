// The People list's view state, shared by the list and the page head so both count the same rows.

import type { MessageKey } from '@/i18n/messages'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import { matchesTokens } from '@/lib/token-search'

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
  const isActiveAdmin = (p: AdminPersonRow) => p.access_roles.includes('admin') && p.login === 'active' && !p.archived_at
  return isActiveAdmin(person) && people.filter(isActiveAdmin).length === 1
}
