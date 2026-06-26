// CatalogManager tests (OD-C-2 / spec cascade-catalog AC-004..007).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogManager, type CatalogItem } from './catalog-manager'

function setup(overrides: Partial<Parameters<typeof CatalogManager>[0]> = {}) {
  const load = vi.fn<() => Promise<CatalogItem[]>>().mockResolvedValue([])
  const create = vi.fn().mockResolvedValue({})
  const rename = vi.fn().mockResolvedValue(undefined)
  const setArchived = vi.fn().mockResolvedValue(undefined)
  const props = {
    title: 'Objectives', subtitle: 'sub', noun: 'objective',
    load, create, rename, setArchived, ...overrides,
  }
  render(<CatalogManager {...props} />)
  return { load, create, rename, setArchived }
}

beforeEach(() => vi.clearAllMocks())

describe('CatalogManager', () => {
  it('shows the empty state when there are no items', async () => {
    setup()
    expect(await screen.findByText('No objectives yet')).toBeInTheDocument()
  })

  it('shows an error state with retry when load fails', async () => {
    const load = vi.fn<() => Promise<CatalogItem[]>>().mockRejectedValue(new Error('x'))
    setup({ load })
    expect(await screen.findByText(/Couldn't load objectives/)).toBeInTheDocument()
  })

  it('AC-004: lists active items, then an Archived section with Unarchive', async () => {
    const load = vi.fn<() => Promise<CatalogItem[]>>().mockResolvedValue([
      { id: '1', name: 'Active One', archived_at: null },
      { id: '2', name: 'Old One', archived_at: '2026-06-01T00:00:00Z' },
    ])
    setup({ load })
    expect(await screen.findByText('Active One')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unarchive Old One' })).toBeInTheDocument()
    // active row has Rename + Archive
    expect(screen.getByRole('button', { name: 'Archive Active One' })).toBeInTheDocument()
  })

  it('AC-005: blank name shows "Name is required" and does not call create', async () => {
    const user = userEvent.setup()
    const { create } = setup()
    await screen.findByText('No objectives yet')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('creates an item with the trimmed name', async () => {
    const user = userEvent.setup()
    const { create, load } = setup()
    await screen.findByText('No objectives yet')
    await user.type(screen.getByLabelText('Name'), '  Q4 Push  ')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('Q4 Push', undefined))
    expect(load).toHaveBeenCalledTimes(2) // mount + after-create refresh
  })

  it('AC-006: rename success persists; failure surfaces an error and stays editing', async () => {
    const user = userEvent.setup()
    const load = vi.fn<() => Promise<CatalogItem[]>>().mockResolvedValue([
      { id: '1', name: 'Old Name', archived_at: null },
    ])
    const rename = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined)
    setup({ load, rename })
    await screen.findByText('Old Name')
    await user.click(screen.getByRole('button', { name: 'Rename Old Name' }))
    const field = screen.getByLabelText('Rename Old Name')
    await user.clear(field)
    await user.type(field, 'New Name')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    // first attempt fails → error shown, still in edit mode
    expect(await screen.findByText('denied')).toBeInTheDocument()
    expect(screen.getByLabelText('Rename Old Name')).toBeInTheDocument()
    // retry succeeds
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(rename).toHaveBeenCalledWith('1', 'New Name'))
  })

  it('archives an active item', async () => {
    const user = userEvent.setup()
    const load = vi.fn<() => Promise<CatalogItem[]>>().mockResolvedValue([
      { id: '1', name: 'Active One', archived_at: null },
    ])
    const { setArchived } = setup({ load })
    await screen.findByText('Active One')
    await user.click(screen.getByRole('button', { name: 'Archive Active One' }))
    await waitFor(() => expect(setArchived).toHaveBeenCalledWith('1', true))
  })

  it('AC-007: when a typeField is given, the add form offers exactly its options and create passes the type', async () => {
    const user = userEvent.setup()
    const { create } = setup({
      noun: 'project / process',
      nounPlural: 'projects & processes',
      typeField: { label: 'Type', options: [
        { value: 'project', label: 'Project' },
        { value: 'process', label: 'Process' },
      ] },
    })
    await screen.findByText('No projects & processes yet')
    const typeSelect = screen.getByLabelText('Type')
    const opts = within(typeSelect).getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual(['Project', 'Process'])
    await user.type(screen.getByLabelText('Name'), 'New Line')
    await user.selectOptions(typeSelect, 'process')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('New Line', 'process'))
  })
})
