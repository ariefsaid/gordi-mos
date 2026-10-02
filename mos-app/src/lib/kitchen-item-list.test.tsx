import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  KITCHEN_KIND_FILTER_OPTIONS,
  kitchenDataTableGroups,
  kitchenItemLabel,
  toKitchenListRows,
  useKitchenItemTable,
  type KitchenItemKindFilter,
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
  it('prefixes item names with their stable kind in either locale', () => {
    expect(kitchenItemLabel('RAW', 'Sea salt')).toBe('RAW - Sea salt')
    expect(kitchenItemLabel('WIP', 'Salted egg')).toBe('WIP - Salted egg')
  })

  it('keeps RAW unavailable until the single #1240 switch is enabled', () => {
    expect(KITCHEN_KIND_FILTER_OPTIONS).toEqual(['All', 'WIP'])
  })

  it('uses TanStack filtering and grouping together without changing source rows', () => {
    render(<FilterProbe />)
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Sea salt', 'Salted egg', 'Seaweed rice',
    ])
    expect(screen.getByLabelText('Groups')).toHaveTextContent('Seasoning:1|Prepared:2')

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'WIP' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Prepared' } })
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'seaweed' } })
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Seaweed rice'])
    expect(screen.getByLabelText('Groups')).toHaveTextContent('Prepared:1')
  })
})
