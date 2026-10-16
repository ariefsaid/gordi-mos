// Locations catalog view model. No IO. A location is a physical place, never a branch (whose books),
// a Site (org structure) or a stream.
import type { LocationUse } from '@/lib/db/cafe-locations'

export type { LocationUse }

export type LocationRow = {
  id: string
  name: string
  use: LocationUse
  parentId: string | null
  /** Branches this place is available to (physical availability only). */
  branchIds: string[]
  archived: boolean
  rowVersion: number
}

export const NEW_LOCATION = 'new'

export interface LocationFilters {
  /** `all` or a branch id */
  branch: string
  use: 'all' | LocationUse
  status: 'active' | 'archived'
  q: string
  sort: 'name' | 'use' | 'status'
  dir: 'asc' | 'desc'
}

const USES: readonly LocationUse[] = ['production', 'storage', 'both']

export function parseLocationFilters(params: URLSearchParams): LocationFilters {
  const use = params.get('use')
  const sort = params.get('sort')
  return {
    branch: params.get('branch') || 'all',
    use: USES.includes(use as LocationUse) ? (use as LocationUse) : 'all',
    status: params.get('status') === 'archived' ? 'archived' : 'active',
    q: params.get('q') ?? '',
    sort: sort === 'use' || sort === 'status' ? sort : 'name',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  }
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const USE_ORDER: Record<LocationUse, number> = { production: 0, storage: 1, both: 2 }

/** Filter, then sort (default name A–Z). `text` is the searchable text of a row in the viewer's language. */
export function applyLocationFilters(rows: readonly LocationRow[], f: LocationFilters, text: (row: LocationRow) => string): LocationRow[] {
  const needle = f.q.trim().toLowerCase()
  const filtered = rows.filter((row) =>
    (f.branch === 'all' || row.branchIds.includes(f.branch)) &&
    (f.use === 'all' || row.use === f.use) &&
    (f.status === 'archived' ? row.archived : !row.archived) &&
    (!needle || text(row).toLowerCase().includes(needle)))
  const dir = f.dir === 'desc' ? -1 : 1
  const primary = (a: LocationRow, b: LocationRow) =>
    f.sort === 'use' ? USE_ORDER[a.use] - USE_ORDER[b.use]
      : f.sort === 'status' ? Number(a.archived) - Number(b.archived)
        : collator.compare(a.name, b.name)
  return [...filtered].sort((a, b) => dir * primary(a, b) || collator.compare(a.name, b.name) || collator.compare(a.id, b.id))
}

export interface LocationDraft {
  name: string
  use: LocationUse
  parentId: string | null
  branchIds: string[]
}

export type LocationProblem = 'nameBlank' | 'duplicate' | 'cycle' | 'branchesOutsideParent'

const normalise = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

/** The location ids at or below `id` (itself and every descendant). */
export function descendantsOf(id: string, rows: readonly LocationRow[]): Set<string> {
  const out = new Set<string>([id])
  for (let grew = true; grew;) {
    grew = false
    for (const row of rows) if (row.parentId && out.has(row.parentId) && !out.has(row.id)) { out.add(row.id); grew = true }
  }
  return out
}

/** Parents a location may take: never itself or one of its own descendants (no cycles), never an archived one. */
export function parentChoices(selfId: string | null, rows: readonly LocationRow[]): LocationRow[] {
  const blocked = selfId ? descendantsOf(selfId, rows) : new Set<string>()
  return rows.filter((row) => !blocked.has(row.id) && !row.archived)
}

/** The same checks the connected form makes server-side, run locally for immediate feedback. */
export function validateDraft(draft: LocationDraft, rows: readonly LocationRow[], selfId: string | null): LocationProblem[] {
  const problems: LocationProblem[] = []
  if (!draft.name.trim()) problems.push('nameBlank')
  else if (rows.some((row) => row.id !== selfId && !row.archived && row.parentId === draft.parentId && normalise(row.name) === normalise(draft.name))) problems.push('duplicate')
  if (draft.parentId && selfId && descendantsOf(selfId, rows).has(draft.parentId)) problems.push('cycle')
  const parent = draft.parentId ? rows.find((row) => row.id === draft.parentId) : undefined
  if (parent && draft.branchIds.some((id) => !parent.branchIds.includes(id))) problems.push('branchesOutsideParent')
  return problems
}

export const draftOf = (row: LocationRow | null): LocationDraft =>
  row ? { name: row.name, use: row.use, parentId: row.parentId, branchIds: [...row.branchIds] } : { name: '', use: 'both', parentId: null, branchIds: [] }

export const draftIsDirty = (draft: LocationDraft, initial: LocationDraft) =>
  draft.name !== initial.name || draft.use !== initial.use || draft.parentId !== initial.parentId ||
  draft.branchIds.length !== initial.branchIds.length || draft.branchIds.some((id) => !initial.branchIds.includes(id))
