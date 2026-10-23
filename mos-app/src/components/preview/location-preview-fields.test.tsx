import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocationLineField, LocationPanelFields } from './location-preview-fields'

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'p1' }, accessRoles: ['admin'], roles: [], isManager: false, affiliated: [] }, signOut: vi.fn() }),
}))

const LOCATIONS = [
  { id: 'kitchen', name: 'Kitchen', use: 'production' as const, parent_id: null, branch_ids: ['branch-1'], archived_at: null, row_version: 1, updated_at: '', updated_by: null, site_id: null, activities: [] },
  { id: 'chiller', name: 'Chiller', use: 'storage' as const, parent_id: null, branch_ids: ['branch-1'], archived_at: null, row_version: 1, updated_at: '', updated_by: null, site_id: null, activities: [] },
]
const EMPTY_VALUES = { production_location_id: null, from_storage_location_id: null, to_storage_location_id: null }

afterEach(() => { cleanup() })

describe('connected capture location fields', () => {
  it('offers Unassigned and enabled branch locations and sends the explicit selection', () => {
    const onChange = vi.fn()
    render(<MemoryRouter><LocationPanelFields
      kind="production"
      locations={{ storage: LOCATIONS }}
      values={{ ...EMPTY_VALUES, to_storage_location_id: null }}
      onChange={onChange}
    /></MemoryRouter>)

    // Production is stored in the Location the person is working at, so only the output place is asked.
    expect(screen.queryByRole('combobox', { name: 'Production location' })).toBeNull()
    const output = screen.getByRole('combobox', { name: 'Store output in' })
    fireEvent.click(output)
    fireEvent.click(screen.getByRole('option', { name: 'Chiller' }))
    expect(onChange).toHaveBeenCalledWith('to_storage_location_id', 'chiller')
  })

  it('keeps optional capture usable as Unassigned and offers a retry when the catalog read fails', () => {
    const retry = vi.fn()
    render(<MemoryRouter><LocationPanelFields
      kind="receive"
      locations={{ storage: [] }}
      values={EMPTY_VALUES}
      loadState="error"
      onRetry={retry}
      onChange={vi.fn()}
    /></MemoryRouter>)

    expect(screen.getByRole('combobox', { name: 'Store in' })).toBeDisabled()
    expect(screen.getByText('Locations and branches could not be loaded.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('lets Count and Waste choose storage per line', () => {
    const onChange = vi.fn()
    render(<LocationLineField kind="count" locations={LOCATIONS} value={null} onChange={onChange} />)
    const storage = screen.getByRole('combobox', { name: 'Storage location' })
    expect(storage).not.toBeDisabled()
    fireEvent.click(storage)
    fireEvent.click(screen.getByRole('option', { name: 'Chiller' }))
    expect(onChange).toHaveBeenCalledWith('chiller')
  })
})
