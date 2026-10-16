import { describe, expect, it } from 'vitest'
import {
  applyLocationFilters, descendantsOf, draftIsDirty, draftOf, parentChoices, parseLocationFilters, sampleLocations, validateDraft,
} from './cafe-locations-view'

const rows = sampleLocations(['a', 'b', 'c'])
const text = (row: { id: string }) => row.id

describe('Locations view model (sample catalogue)', () => {
  it('every sample is flagged and availability is only what the real branch list offered', () => {
    expect(rows.every((row) => row.sample)).toBe(true)
    expect(rows.flatMap((row) => row.branchIds).every((id) => ['a', 'b', 'c'].includes(id))).toBe(true)
    expect(sampleLocations([]).every((row) => row.branchIds.length === 0)).toBe(true)
  })

  it('defaults to active places, name A-Z, and filters by branch, use, status and search', () => {
    const f = parseLocationFilters(new URLSearchParams(''))
    expect(f).toMatchObject({ branch: 'all', use: 'all', status: 'active', sort: 'name', dir: 'asc' })
    const active = applyLocationFilters(rows, f, text)
    expect(active.map((r) => r.id)).toEqual(['sample-bar-fridge', 'sample-chiller', 'sample-kitchen', 'sample-store-room'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('status=archived')), text).map((r) => r.id)).toEqual(['sample-dry-store'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('use=storage')), text).map((r) => r.id)).toEqual(['sample-chiller', 'sample-store-room'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('branch=c')), text).map((r) => r.id)).toEqual(['sample-kitchen'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('q=chill')), text).map((r) => r.id)).toEqual(['sample-chiller'])
    expect(applyLocationFilters(rows, parseLocationFilters(new URLSearchParams('dir=desc')), text)[0].id).toBe('sample-store-room')
  })

  it('treats unknown URL values as the defaults', () => {
    expect(parseLocationFilters(new URLSearchParams('use=nope&status=x&sort=y&dir=z'))).toMatchObject({ use: 'all', status: 'active', sort: 'name', dir: 'asc' })
  })

  it('keeps a place out of its own subtree when choosing a parent (no cycles)', () => {
    expect(descendantsOf('sample-kitchen', rows)).toEqual(new Set(['sample-kitchen', 'sample-chiller', 'sample-store-room']))
    expect(parentChoices('sample-kitchen', rows).map((r) => r.id)).toEqual(['sample-bar-fridge'])
    expect(parentChoices(null, rows).map((r) => r.id)).not.toContain('sample-dry-store') // archived
  })

  it('validates blank, duplicate (same parent), cycle and branches outside the parent', () => {
    const draft = (over: object) => ({ ...draftOf(null), ...over })
    expect(validateDraft(draft({ name: '  ' }), rows, null)).toContain('nameBlank')
    expect(validateDraft(draft({ name: ' example   KITCHEN ' }), rows, null)).toContain('duplicate')
    expect(validateDraft(draft({ name: 'Example kitchen' }), rows, 'sample-kitchen')).not.toContain('duplicate')
    expect(validateDraft(draft({ name: 'Example chiller', parentId: 'sample-bar-fridge' }), rows, null)).not.toContain('duplicate')
    expect(validateDraft(draft({ name: 'x', parentId: 'sample-chiller' }), rows, 'sample-kitchen')).toContain('cycle')
    expect(validateDraft(draft({ name: 'x', parentId: 'sample-chiller', branchIds: ['c'] }), rows, null)).toContain('branchesOutsideParent')
    expect(validateDraft(draft({ name: 'x', parentId: 'sample-chiller', branchIds: ['a'] }), rows, null)).toEqual([])
  })

  it('knows when a draft differs from where it started', () => {
    const start = draftOf(rows[0])
    expect(draftIsDirty({ ...start, branchIds: [...start.branchIds] }, start)).toBe(false)
    expect(draftIsDirty({ ...start, name: 'Other' }, start)).toBe(true)
    expect(draftIsDirty({ ...start, branchIds: [] }, start)).toBe(true)
  })
})
