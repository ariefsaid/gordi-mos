// CatalogManager tests (OD-C-2 / spec cascade-catalog AC-004..007).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogManager, type CatalogItem } from './catalog-manager'
import { installDisabledBlur } from '@/test/browser-focus-fixup'

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

// A browser drops focus from a control that becomes disabled; jsdom does not.
let removeDisabledBlur = () => {}
beforeEach(() => { vi.clearAllMocks(); removeDisabledBlur = installDisabledBlur() })
afterEach(() => removeDisabledBlur())

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

  it('a failed add keeps the typed name and focus; a retry creates once', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({})
    setup({ create })
    await screen.findByText('No objectives yet')
    await user.type(screen.getByLabelText('Name'), 'Q4 Push')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('offline')).toBeInTheDocument()
    const field = screen.getByLabelText('Name')
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveValue('Q4 Push')
    expect(create).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(field).toHaveValue(''))
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(1, 'Q4 Push', undefined)
    expect(create).toHaveBeenNthCalledWith(2, 'Q4 Push', undefined)
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
    expect(rename).toHaveBeenCalledTimes(1)
    expect(rename).toHaveBeenLastCalledWith('1', 'New Name')
    // the text and the focus survive the failed attempt
    await waitFor(() => expect(screen.getByLabelText('Rename Old Name')).toHaveFocus())
    expect(screen.getByLabelText('Rename Old Name')).toHaveValue('New Name')
    // exactly one retry, and it succeeds
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Rename Old Name' })).toBeNull())
    expect(rename).toHaveBeenCalledTimes(2)
    expect(rename).toHaveBeenLastCalledWith('1', 'New Name')
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

  it('surfaces a failure and re-enables the button when archive fails', async () => {
    const user = userEvent.setup()
    const load = vi.fn<() => Promise<CatalogItem[]>>().mockResolvedValue([
      { id: '1', name: 'Active One', archived_at: null },
    ])
    const setArchived = vi.fn().mockRejectedValue(new Error('denied'))
    setup({ load, setArchived })
    await screen.findByText('Active One')
    const btn = screen.getByRole('button', { name: 'Archive Active One' })
    await user.click(btn)
    // live region announces the failure …
    expect(await screen.findByText("Couldn't archive Active One")).toBeInTheDocument()
    // … and the button is re-enabled (savingId cleared in finally, not left hanging)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive Active One' })).toBeEnabled())
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
    await user.type(screen.getByLabelText('Name'), 'New Line')
    await user.click(typeSelect)
    const listbox = screen.getByRole('listbox')
    const opts = within(listbox).getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual(['Project', 'Process'])
    await user.click(within(listbox).getByRole('option', { name: 'Process' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith('New Line', 'process'))
  })

  it('the type select uses the shared Select shell, not an off-system class (design regression guard)', async () => {
    setup({
      noun: 'project / process',
      nounPlural: 'projects & processes',
      typeField: { label: 'Type', options: [{ value: 'project', label: 'Project' }] },
    })
    await screen.findByText('No projects & processes yet')
    const typeSelect = screen.getByLabelText('Type')
    expect(typeSelect.closest('.mk-select')).toBeTruthy()
    expect(typeSelect.closest('.mk-select')?.querySelector('.mk-select__box')).toBeTruthy()
    expect(typeSelect.className).not.toMatch(/rounded-md/)
  })
})
