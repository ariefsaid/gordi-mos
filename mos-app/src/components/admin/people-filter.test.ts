import { describe, expect, it } from 'vitest'
import { filterPeople, sortPeople, toDir, toSort } from './people-filter'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'

const person = (full_name: string, login: AdminPersonRow['login'], archived_at: string | null = null): AdminPersonRow =>
  ({ id: full_name, full_name, email: `${full_name.toLowerCase()}@x.test`, archived_at, login, access_roles: [], jabatan: [], revenue_scope: [], teams: [] })

const rows = [person('Cahya', 'none'), person('Andi', 'disabled'), person('Bayu', 'active'), person('Dewi', 'active')]
const team = (p: AdminPersonRow) => ({ Cahya: 'Bar', Andi: null, Bayu: 'Kitchen', Dewi: 'Bar' } as Record<string, string | null>)[p.full_name]
const names = (list: AdminPersonRow[]) => list.map((p) => p.full_name)

describe('sortPeople', () => {
  it('sorts by name both ways', () => {
    expect(names(sortPeople(rows, 'name', 'asc', team))).toEqual(['Andi', 'Bayu', 'Cahya', 'Dewi'])
    expect(names(sortPeople(rows, 'name', 'desc', team))).toEqual(['Dewi', 'Cahya', 'Bayu', 'Andi'])
  })
  it('sorts login active first, then disabled, then no login, by name within a status', () => {
    expect(names(sortPeople(rows, 'login', 'asc', team))).toEqual(['Bayu', 'Dewi', 'Andi', 'Cahya'])
  })
  it('keeps people without a Team last whichever way the Team column runs', () => {
    expect(names(sortPeople(rows, 'team', 'asc', team))).toEqual(['Cahya', 'Dewi', 'Bayu', 'Andi'])
    expect(names(sortPeople(rows, 'team', 'desc', team))).toEqual(['Bayu', 'Cahya', 'Dewi', 'Andi'])
  })
  it('does not reorder the list it was given', () => {
    const before = names(rows)
    sortPeople(rows, 'login', 'desc', team)
    expect(names(rows)).toEqual(before)
  })
})

describe('sort and filter params', () => {
  it('falls back to name, ascending', () => {
    expect(toSort('bogus')).toBe('name')
    expect(toDir('sideways')).toBe('asc')
    expect(toSort('team')).toBe('team')
    expect(toDir('desc')).toBe('desc')
  })
  it('keeps archived people out of All and puts them in Archived', () => {
    const list = [person('Andi', 'active'), person('Bayu', 'active', '2026-01-01')]
    expect(filterPeople(list, 'all', '').rows.map((p) => p.full_name)).toEqual(['Andi'])
    expect(filterPeople(list, 'archived', '').rows.map((p) => p.full_name)).toEqual(['Bayu'])
    expect(filterPeople(list, 'all', 'andi').filtered).toBe(true)
  })
})
