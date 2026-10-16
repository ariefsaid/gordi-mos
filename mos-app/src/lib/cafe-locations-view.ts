// Locations (preview) — the pure view model. No IO. Locations are not connected, so the only rows are
// the clearly labelled isolated SAMPLE set below, kept in memory; they never join real balances or records.
// A location is a physical place, never a branch (whose books), a Site (org structure) or a stream.
import type { LocationUse } from '@/lib/db/cafe-locations'

export type { LocationUse }

export interface LocationRow {
  id: string
  name: string
  use: LocationUse
  parentId: string | null
  /** Branches this place is available to (physical availability only). */
  branchIds: string[]
  archived: boolean
  /** Every row here is a sample while Locations are not connected. */
  sample: true
}

export const NEW_LOCATION = 'new'

/** The isolated sample catalogue. Branch ids come from the real branch list so availability can wrap; none are inferred from a Site or Team. */
export function sampleLocations(branchIds: readonly string[]): LocationRow[] {
  const some = (from: number, to: number) => branchIds.slice(from, to)
  return [
    { id: 'sample-kitchen', name: 'Example kitchen', use: 'production', parentId: null, branchIds: some(0, 3), archived: false, sample: true },
    { id: 'sample-chiller', name: 'Example chiller', use: 'storage', parentId: 'sample-kitchen', branchIds: some(0, 2), archived: false, sample: true },
    { id: 'sample-store-room', name: 'Example store room', use: 'storage', parentId: 'sample-kitchen', branchIds: some(0, 1), archived: false, sample: true },
    { id: 'sample-bar-fridge', name: 'Example bar fridge', use: 'both', parentId: null, branchIds: some(1, 2), archived: false, sample: true },
    { id: 'sample-dry-store', name: 'Example dry store', use: 'storage', parentId: null, branchIds: [], archived: true, sample: true },
  ]
}

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

/** Filter, then sort (default name A–Z). `text` is the searchable text of a row (name, use, parent, branches in the viewer's language). */
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

/** The same checks the connected form will make server-side, run on the in-memory draft. */
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
