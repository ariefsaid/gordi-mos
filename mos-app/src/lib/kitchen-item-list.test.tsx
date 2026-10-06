import { useState } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  KITCHEN_KIND_FILTER_OPTIONS,
  WIP_KIND_FILTER_OPTIONS,
  kitchenDataTableGroups,
  toKitchenListRows,
  useKitchenItemTable,
  type KitchenItemActiveFilter,
  type KitchenItemKindFilter,
  type KitchenItemNeedsUnitFilter,
} from './kitchen-item-list'

const metadata = {
  getId: (row: { id: string }) => row.id,
  getName: (row: { name: string }) => row.name,
  getCategory: (row: { category: string }) => row.category,
  getGroupKey: (row: { category: string }) => row.category,
}
const rows = [
  ...toKitchenListRows([{ id: 'raw-1', name: 'Sea salt', category: 'Seasoning' }], { ...metadata, kind: 'RAW' }),
  ...toKitchenListRows([
    { id: 'wip-1', name: 'Salted egg', category: 'Prepared' },
    { id: 'wip-2', name: 'Seaweed rice', category: 'Prepared' },
  ], { ...metadata, kind: 'WIP' }),
]

function FilterProbe() {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<KitchenItemKindFilter>('All')
  const [category, setCategory] = useState('All')
  const table = useKitchenItemTable({ data: rows, search, kind, category })
  const groups = kitchenDataTableGroups(table, key => key)
  return (
    <section>
      <input aria-label="Search" value={search} onChange={event => setSearch(event.target.value)} />
      <select aria-label="Kind" value={kind} onChange={event => setKind(event.target.value as KitchenItemKindFilter)}>
        {['All', 'WIP', 'RAW'].map(option => <option key={option}>{option}</option>)}
      </select>
      <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}>
        <option>All</option>
        <option>Seasoning</option>
        <option>Prepared</option>
      </select>
      <ul>{groups.flatMap(group => group.rows.map(row => <li key={row.rowId}>{row.itemName}</li>))}</ul>
      <output aria-label="Groups">{groups.map(group => `${group.label}:${group.count}`).join('|')}</output>
    </section>
  )
}

describe('Café kind-aware list model', () => {
  it('enables RAW for transfers and keeps planning WIP-only', () => {
    expect(KITCHEN_KIND_FILTER_OPTIONS).toEqual(['All', 'WIP', 'RAW'])
    expect(WIP_KIND_FILTER_OPTIONS).toEqual(['All', 'WIP'])
  })

  it('uses TanStack filtering and grouping together without changing source rows', async () => {
    render(<FilterProbe />)
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Sea salt', 'Salted egg', 'Seaweed rice',
    ])
    expect(screen.getByLabelText('Groups')).toHaveTextContent('Seasoning:1|Prepared:2')

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'WIP' } })
      fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Prepared' } })
      fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'seaweed' } })
    })
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Seaweed rice'])
    expect(screen.getByLabelText('Groups')).toHaveTextContent('Prepared:1')
  })

  it('sorts the grouped shared list by item name and kind', async () => {
    const sortableRows = [
      { rowId: 'zebra', kind: 'WIP', itemName: 'Zebra tea', category: null, groupKey: 'all' },
      { rowId: 'alpha', kind: 'RAW', itemName: 'Alpha tea', category: null, groupKey: 'all' },
      { rowId: 'beta', kind: 'WIP', itemName: 'Beta tea', category: null, groupKey: 'all' },
    ] as const

    function SortingProbe() {
      const [sorting, setSorting] = useState<SortingState>([])
      const table = useKitchenItemTable({
        data: [...sortableRows],
        search: '',
        kind: 'All',
        category: 'All',
        sorting,
        onSortingChange: setSorting,
      })
      const groups = kitchenDataTableGroups(table, () => null)
      const names = groups.flatMap(group => group.rows.map(row => row.itemName)).join(',')
      return (
        <section>
          <button onClick={() => table.setSorting([{ id: 'itemName', desc: true }])}>Sort names</button>
          <button onClick={() => table.setSorting([{ id: 'kind', desc: false }])}>Sort kinds</button>
          <output aria-label="Sorted names">{names}</output>
        </section>
      )
    }

    render(<SortingProbe />)
    fireEvent.click(screen.getByRole('button', { name: 'Sort names' }))
    await waitFor(() => expect(screen.getByLabelText('Sorted names')).toHaveTextContent('Zebra tea,Beta tea,Alpha tea'))
    fireEvent.click(screen.getByRole('button', { name: 'Sort kinds' }))
    await waitFor(() => expect(screen.getByLabelText('Sorted names')).toHaveTextContent('Alpha tea,Zebra tea,Beta tea'))
  })

  it('maps caller-provided active and unit-readiness state into shared row metadata', () => {
    const rows = toKitchenListRows([{
      id: 'tea',
      esbName: 'Tea leaves',
      mosName: 'Tea',
      kind: null as 'RAW' | 'WIP' | null,
      category: null as string | null,
      active: false,
      needsUnit: true,
    }], {
      kind: 'Unclassified',
      getId: row => row.id,
      getKind: row => row.kind ?? 'Unclassified',
      getName: row => `${row.esbName} ${row.mosName}`,
      getCategory: row => row.category,
      getGroupKey: () => 'all',
      getActive: row => row.active,
      getNeedsUnit: row => row.needsUnit,
    })
    expect(rows[0]).toMatchObject({
      rowId: 'tea',
      kind: 'Unclassified',
      itemName: 'Tea leaves Tea',
      category: null,
      groupKey: 'all',
      isActive: false,
      needsUnit: true,
    })
  })

  it('filters active status and missing units in the shared list model', () => {
    const settingsRows = [
      { rowId: 'needs-active', kind: 'Unclassified', itemName: 'Tea blend', category: 'Bar', groupKey: 'Bar', isActive: true, needsUnit: true },
      { rowId: 'needs-inactive', kind: 'RAW', itemName: 'Tea leaves', category: 'Bar', groupKey: 'Bar', isActive: false, needsUnit: true },
      { rowId: 'ready-active', kind: 'WIP', itemName: 'Tea syrup', category: 'Bar', groupKey: 'Bar', isActive: true, needsUnit: false },
    ] as const

    function SettingsFilterProbe() {
      const [kind, setKind] = useState<KitchenItemKindFilter>('All')
      const [active, setActive] = useState<KitchenItemActiveFilter>('All')
      const [needsUnit, setNeedsUnit] = useState<KitchenItemNeedsUnitFilter>('All')
      const table = useKitchenItemTable({
        data: [...settingsRows],
        search: '',
        kind,
        category: 'All',
        active,
        needsUnit,
      })
      const visible = table.getFilteredRowModel().rows.map(row => row.original)
      return (
        <section>
          <select aria-label="Kind" value={kind} onChange={event => setKind(event.target.value as KitchenItemKindFilter)}>
            {['All', 'WIP', 'RAW', 'Unclassified'].map(option => <option key={option}>{option}</option>)}
          </select>
          <select aria-label="Active status" value={active} onChange={event => setActive(event.target.value as KitchenItemActiveFilter)}>
            {['All', 'Active', 'Inactive'].map(option => <option key={option}>{option}</option>)}
          </select>
          <select aria-label="Needs unit" value={needsUnit} onChange={event => setNeedsUnit(event.target.value as KitchenItemNeedsUnitFilter)}>
            {['All', 'Needs unit'].map(option => <option key={option}>{option}</option>)}
          </select>
          <ul>{visible.map(row => <li key={row.rowId}>{row.itemName}</li>)}</ul>
        </section>
      )
    }

    render(<SettingsFilterProbe />)
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Tea blend', 'Tea leaves', 'Tea syrup',
    ])

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'Unclassified' } })
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Tea blend'])

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'All' } })
    fireEvent.change(screen.getByLabelText('Active status'), { target: { value: 'Inactive' } })
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Tea leaves'])

    fireEvent.change(screen.getByLabelText('Active status'), { target: { value: 'All' } })
    fireEvent.change(screen.getByLabelText('Needs unit'), { target: { value: 'Needs unit' } })
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Tea blend', 'Tea leaves'])
  })
})
