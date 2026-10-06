import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
const streamMocks = vi.hoisted(() => {
  const branch = { id: 'branch-1', code: 'cafe-branch', name: 'Cafe Branch' }
  const stream = { branch, activity: 'kitchen' as const }
  const catalog = {
    branches: [branch], options: [stream], destinations: [], locationOptions: [stream],
    stream, homeStream: stream, myStreamKeys: new Set(['branch-1|kitchen']), branchId: 'branch-1',
  }
  return { stream, catalog, resolve: vi.fn(async () => catalog), adopt: vi.fn(), setStream: vi.fn() }
})
vi.mock('@/lib/use-cafe-stream', () => ({
  useCafeStream: () => ({ ...streamMocks.catalog, resolve: streamMocks.resolve, adopt: streamMocks.adopt, setStream: streamMocks.setStream }),
}))
vi.mock('@/lib/db/cafe-opening', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-opening')>()
  return { ...actual, wibToday: () => '2026-10-06' }
})
const countMocks = vi.hoisted(() => ({ key: 0 }))
vi.mock('@/lib/db/cafe-count', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-count')>()
  return {
    ...actual,
    newCafeCountClientKey: () => `client-${++countMocks.key}`,
    listCafeCountableItems: vi.fn(),
    listCafeCountFloorLines: vi.fn(),
    recordCafeCountRecount: vi.fn(),
    recordCafeCountReason: vi.fn(),
    submitCafeCounts: vi.fn(),
  }
})

import { useAuth } from '@/auth/use-auth'
import {
  listCafeCountableItems,
  listCafeCountFloorLines,
  recordCafeCountReason,
  recordCafeCountRecount,
  submitCafeCounts,
} from '@/lib/db/cafe-count'
import type { CafeCountableItem } from '@/lib/db/cafe-count'
import { CafeCountPage } from './cafe-count-page'

const mockUseAuth = vi.mocked(useAuth)
const mockListItems = vi.mocked(listCafeCountableItems)
const mockListLines = vi.mocked(listCafeCountFloorLines)
const mockRecordRecount = vi.mocked(recordCafeCountRecount)
const mockRecordReason = vi.mocked(recordCafeCountReason)
const mockSubmit = vi.mocked(submitCafeCounts)
const VIEWER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Café member',
      email: 'member@example.test', archived_at: null, must_change_password: false,
      created_at: '', updated_at: '',
    },
    roles: [], isManager: false, accessRoles: ['member'], affiliated: ['cafe'],
  },
  signOut: vi.fn(),
}
const ITEMS: CafeCountableItem[] = [
  { id: 'raw-1', name: 'Raw flour', category: 'Pantry', kind: 'RAW', unitId: 'unit-kg', unitName: 'kg' },
  { id: 'wip-1', name: 'Prepared sauce', category: 'Kitchen', kind: 'WIP', unitId: 'unit-tray', unitName: 'tray' },
  { id: 'raw-2', name: 'Uncounted rice', category: 'Pantry', kind: 'RAW', unitId: 'unit-bag', unitName: 'bag' },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cafe/count']}>
      <I18nProvider><CafeCountPage /></I18nProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  countMocks.key = 0
  mockUseAuth.mockReturnValue(VIEWER)
  mockListItems.mockResolvedValue(ITEMS)
  mockListLines.mockResolvedValue([])
  mockRecordRecount.mockResolvedValue({ line_id: 'line-1', row_version: 3, reason_required: true })
  mockRecordReason.mockResolvedValue({ line_id: 'line-1', row_version: 4, reason_recorded: true })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('CafeCountPage', () => {
  it('AC-007 renders one blank fixed-unit input per item with a decimal keyboard and no prior figures', async () => {
    const { container } = renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Count for Raw flour' })
    const wipInput = screen.getByRole('textbox', { name: 'Count for Prepared sauce' })

    expect(rawInput).toHaveValue('')
    expect(wipInput).toHaveValue('')
    expect(rawInput).toHaveAttribute('inputmode', 'decimal')
    expect(rawInput).not.toHaveAttribute('placeholder')
    expect(container.querySelector('.cafe-count__unit')).toHaveTextContent('kg')
    const entry = container.querySelector('.cafe-count')?.textContent?.toLowerCase() ?? ''
    expect(entry).not.toContain('expected balance')
    expect(entry).not.toContain('variance')
    expect(entry).not.toContain('stock')
    expect(entry).not.toContain('plan')
  })

  it('AC-011 an invalid row does not block another valid Count from submitting', async () => {
    mockSubmit.mockResolvedValue([{ client_key: 'client-2', outcome: 'submitted', line_id: 'line-2' }])
    renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Count for Raw flour' })
    const wipInput = screen.getByRole('textbox', { name: 'Count for Prepared sauce' })
    fireEvent.change(rawInput, { target: { value: '1.12345' } })
    fireEvent.change(wipInput, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Count' }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0][1]).toEqual([
      { client_key: 'client-2', item_id: 'wip-1', quantity: '2' },
    ])
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('AC-012 retries an uncertain submit with the same UUID key and quantity', async () => {
    mockSubmit
      .mockRejectedValueOnce(new Error('connection dropped after commit'))
      .mockResolvedValueOnce([{ client_key: 'client-1', outcome: 'existing', line_id: 'line-1' }])
    renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Count for Raw flour' })
    fireEvent.change(rawInput, { target: { value: '0' } })
    const submit = screen.getByRole('button', { name: 'Submit Count' })

    fireEvent.click(submit)
    expect(await screen.findByText(
      'This Count could not be submitted. Your quantities are still here; retry when ready.',
    )).toBeInTheDocument()
    expect(rawInput).toHaveValue('0')
    expect(mockSubmit.mock.calls[0][1]).toEqual([
      { client_key: 'client-1', item_id: 'raw-1', quantity: '0' },
    ])
    await waitFor(() => expect(submit).toBeEnabled())

    fireEvent.click(submit)
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2))
    expect(mockSubmit.mock.calls[1][1]).toEqual(mockSubmit.mock.calls[0][1])
    expect(await screen.findByText('Submitted')).toBeInTheDocument()
  })

  it('AC-017 asks only for a blind recount and then a reason when the final Count still differs', async () => {
    const longItem: CafeCountableItem = {
      id: 'raw-1',
      name: 'Slow-roasted coffee beans for the weekend service',
      category: 'Pantry',
      kind: 'RAW',
      unitId: 'unit-case',
      unitName: 'sealed five-kilogram stock carton',
    }
    mockListItems.mockResolvedValue([longItem])
    mockListLines.mockResolvedValue([{
      id: 'line-1', branch_id: 'branch-1', activity: 'kitchen', count_date: '2026-10-06',
      wip_item_id: 'raw-1', item_name: longItem.name, item_category: 'Pantry', item_kind: 'RAW',
      item_unit_id: 'unit-case', unit_name: longItem.unitName, counted_quantity: '5.0000',
      recounted_quantity: null, reason: null, expected_ready: true, recount_required: true,
      reason_required: false, status: 'Submitted', posting_status: 'not_posted',
      submitted_at: '2026-10-06T03:00:00.000Z', reviewed_at: null, row_version: 2,
    }])
    renderPage()
    expect(await screen.findByText('This item differs. Recount it, then explain if it still differs.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: `Recount for ${longItem.name}` })).toBeInTheDocument()
    const beforeRecount = screen.getByRole('list', { name: 'Countable Café items' }).textContent ?? ''
    expect(beforeRecount).not.toContain('Expected balance')
    expect(beforeRecount).not.toContain('Variance')
    expect(beforeRecount).not.toContain('4.0000')
    expect(beforeRecount).not.toContain('1.0000')

    fireEvent.change(screen.getByRole('textbox', { name: `Recount for ${longItem.name}` }), { target: { value: '4.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit recount' }))
    await waitFor(() => expect(mockRecordRecount).toHaveBeenCalledWith('line-1', '4.5'))
    expect(await screen.findByText('This item still differs. Add a reason to continue.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: `Reason for ${longItem.name}` }), {
      target: { value: 'Recounted the sealed stock carton.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save reason' }))
    await waitFor(() => expect(mockRecordReason).toHaveBeenCalledWith('line-1', 'Recounted the sealed stock carton.'))
    expect(await screen.findByText('Recount and reason recorded. Waiting for review.')).toBeInTheDocument()
    const finalFloorText = screen.getByRole('list', { name: 'Countable Café items' }).textContent ?? ''
    expect(finalFloorText).not.toContain('Expected balance')
    expect(finalFloorText).not.toContain('Variance')
    expect(finalFloorText).not.toContain('4.0000')
  })

  it('AC-007 zero is submitted while a blank item is omitted; a refused line is shown individually', async () => {
    mockSubmit.mockResolvedValue([
      { client_key: 'client-1', outcome: 'submitted', line_id: 'line-1' },
      { client_key: 'client-2', outcome: 'refused', reason: 'already_counted' },
    ])
    renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Count for Raw flour' })
    const wipInput = screen.getByRole('textbox', { name: 'Count for Prepared sauce' })
    fireEvent.change(rawInput, { target: { value: '0' } })
    fireEvent.change(wipInput, { target: { value: '2,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Count' }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    const [stream, lines] = mockSubmit.mock.calls[0]
    expect(stream).toEqual(streamMocks.stream)
    expect(lines).toHaveLength(2)
    expect(lines.map(line => line.quantity)).toEqual(['0', '2.5'])
    expect(lines.every(line => Object.keys(line).sort().join(',') === 'client_key,item_id,quantity')).toBe(true)
    expect(await screen.findByText('Submitted')).toBeInTheDocument()
    expect(await screen.findByText('This item already has a Count today.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Countable Café items' })).getAllByRole('alert')).toHaveLength(1)
  })
})
