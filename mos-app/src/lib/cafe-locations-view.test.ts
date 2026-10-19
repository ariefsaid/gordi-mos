import { describe, expect, it } from 'vitest'
import {
  applyLocationFilters, descendantsOf, draftIsDirty, draftOf, parentChoices, parseLocationFilters, validateDraft,
  type LocationRow,
} from './cafe-locations-view'

const rows: LocationRow[] = [
  { id: 'kitchen', name: 'Kitchen', use: 'production', parentId: null, branchIds: ['a', 'b', 'c'], archived: false, rowVersion: 1 },
  { id: 'chiller', name: 'Chiller', use: 'storage', parentId: 'kitchen', branchIds: ['a', 'b'], archived: false, rowVersion: 1 },
  { id: 'store-room', name: 'Store room', use: 'storage', parentId: 'kitchen', branchIds: ['a'], archived: false, rowVersion: 1 },
  { id: 'bar-fridge', name: 'Bar fridge', use: 'both', parentId: null, branchIds: ['b'], archived: false, rowVersion: 1 },
  { id: 'dry-store', name: 'Dry store', use: 'storage', parentId: null, branchIds: [], archived: true, rowVersion: 2 },
]
const text = (row: LocationRow) => row.name

describe('Locations catalog view model', () => {
  it('filters actual catalog rows by branch, use, status and search without inferring availability', () => {
    const filters = parseLocationFilters(new URLSearchParams(''))
    expect(filters).toMatchObject({ branch: 'all', use: 'all', status: 'active', sort: 'name', dir: 'asc' })
    expect(applyLocationFilters(rows, filters, text).map((row) => row.id)).toEqual(['bar-fridge', 'chiller', 'kitchen', 'store-room'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('status=archived')), text).map((row) => row.id)).toEqual(['dry-store'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('use=storage')), text).map((row) => row.id)).toEqual(['chiller', 'store-room'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('branch=c')), text).map((row) => row.id)).toEqual(['kitchen'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('q=chill')), text).map((row) => row.id)).toEqual(['chiller'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('dir=desc')), text)[0].id).toBe('store-room')
  })

  it('treats unknown URL values as the defaults', () => {
    expect(parseLocationFilters(new URLSearchParams('use=nope&status=x&sort=y&dir=z'))).toMatchObject({ use: 'all', status: 'active', sort: 'name', dir: 'asc' })
  })

  it('keeps a place out of its own subtree when choosing a parent', () => {
    expect(descendantsOf('kitchen', rows)).toEqual(new Set(['kitchen', 'chiller', 'store-room']))
    expect(parentChoices('kitchen', rows).map((row) => row.id)).toEqual(['bar-fridge'])
    expect(parentChoices(null, rows).map((row) => row.id)).not.toContain('dry-store')
  })

  it('validates blank, duplicate (same parent), cycle and branches outside the parent', () => {
    const draft = (over: object) => ({ ...draftOf(null), ...over })
    expect(validateDraft(draft({ name: '  ' }), rows, null)).toContain('nameBlank')
    expect(validateDraft(draft({ name: ' kitchen ' }), rows, null)).toContain('duplicate')
    expect(validateDraft(draft({ name: 'Kitchen' }), rows, 'kitchen')).not.toContain('duplicate')
    expect(validateDraft(draft({ name: 'Chiller', parentId: 'bar-fridge' }), rows, null)).not.toContain('duplicate')
    expect(validateDraft(draft({ name: 'x', parentId: 'chiller' }), rows, 'kitchen')).toContain('cycle')
    expect(validateDraft(draft({ name: 'x', parentId: 'chiller', branchIds: ['c'] }), rows, null)).toContain('branchesOutsideParent')
    expect(validateDraft(draft({ name: 'x', parentId: 'chiller', branchIds: ['a'] }), rows, null)).toEqual([])
  })

  it('knows when a draft differs from where it started', () => {
    const start = draftOf(rows[0])
    expect(draftIsDirty({ ...start, branchIds: [...start.branchIds] }, start)).toBe(false)
    expect(draftIsDirty({ ...start, name: 'Other' }, start)).toBe(true)
    expect(draftIsDirty({ ...start, branchIds: [] }, start)).toBe(true)
  })
})
