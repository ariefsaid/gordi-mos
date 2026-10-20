import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
const locationMocks = vi.hoisted(() => ({ choices: vi.fn() }))
vi.mock('@/lib/use-cafe-location-choices', () => ({ useCafeLocationChoices: locationMocks.choices }))
vi.mock('@/lib/db/cafe-item-settings', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-item-settings')>()
  return { ...actual, listCafeItemSettings: vi.fn(), canManageCafeItemSettings: vi.fn() }
})
const streamMocks = vi.hoisted(() => {
  const branch = { id: 'branch-1', code: 'cafe-branch', name: 'Cafe Branch' }
  const alternateBranch = { id: 'branch-2', code: 'other-cafe', name: 'Other Cafe' }
  const stream = { branch, activity: 'kitchen' as const }
  const alternateStream = { branch: alternateBranch, activity: 'bar' as const }
  const catalog = {
    branches: [branch, alternateBranch], options: [stream, alternateStream], destinations: [], locationOptions: [stream, alternateStream],
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
    listCafeCountCountedElsewhere: vi.fn(),
    listCafeCountExcludedItems: vi.fn(),
    recordCafeCountRecount: vi.fn(),
    recordCafeCountReason: vi.fn(),
    submitCafeCounts: vi.fn(),
  }
})

import { useAuth } from '@/auth/use-auth'
import { supabase } from '@/lib/supabase'
import { canManageCafeItemSettings, listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { listCafeCountCountedElsewhere, listCafeCountExcludedItems, listCafeCountFloorLines, listCafeCountableItems, recordCafeCountReason, recordCafeCountRecount, submitCafeCounts } from '@/lib/db/cafe-count'
import type { CafeCountableItem } from '@/lib/db/cafe-count'
import { CafeCountPage } from './cafe-count-page'
import { formatWeekdayDayMonth } from '@/lib/format/date'

const mockUseAuth = vi.mocked(useAuth)
const mockListItems = vi.mocked(listCafeCountableItems)
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

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(
    <MemoryRouter initialEntries={['/cafe/count']}>
      <I18nProvider initialLocale={locale}><CafeCountPage /></I18nProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  countMocks.key = 0
  mockUseAuth.mockReturnValue(VIEWER)
  mockListItems.mockResolvedValue(ITEMS)
  vi.mocked(listCafeCountFloorLines).mockResolvedValue([])
  vi.mocked(listCafeCountCountedElsewhere).mockResolvedValue({})
  vi.mocked(listCafeCountExcludedItems).mockResolvedValue([])
  vi.mocked(listCafeItemSettings).mockResolvedValue([])
  window.localStorage.clear()
  locationMocks.choices.mockReturnValue({ status: 'ready', locations: [], defaults: null, retry: vi.fn() })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('CafeCountPage', () => {
  it('explains stock-unit eligibility when Count reads no rows but Items has an active configured item', async () => {
    const actual = await vi.importActual<typeof import('@/lib/db/cafe-count')>('@/lib/db/cafe-count')
    mockListItems.mockImplementationOnce(actual.listCafeCountableItems)
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as never)
    vi.mocked(listCafeItemSettings).mockResolvedValue([{
      id: 'wip-1', erpName: 'Prepared sauce with roasted vegetables', mosName: 'Prepared sauce',
      category: 'Kitchen', kind: 'WIP', isActive: true, defaultUnitId: 'unit-portion',
      units: [{ id: 'unit-portion', name: 'porsi', isDefault: true, isShown: true, labelOrdinal: null, labelCount: 1 }],
    }])
    vi.mocked(canManageCafeItemSettings).mockResolvedValue(true)
    renderPage()

    const empty = await screen.findByTestId('empty-state')
    expect(empty).toHaveTextContent('1 item is set up')
    expect(empty).toHaveTextContent('default unit confirmed as an ESB stock unit')
    expect(empty).not.toHaveTextContent('not set up for this list')
    expect(empty).not.toHaveTextContent('Give it a kind')
    expect(screen.queryByRole('textbox', { name: /counted/ })).not.toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('cafe_countable_items', { p_branch_id: 'branch-1', p_activity: 'kitchen' })
    expect(listCafeItemSettings).toHaveBeenCalledWith(streamMocks.stream)
  })

  it('puts the localized date in PageHead metadata and labels the kitchen switch in both locales', async () => {
    for (const locale of ['en', 'id'] as const) {
      const { unmount } = renderPage(locale)
      const streamName = locale === 'en' ? 'Cafe Branch · Kitchen' : 'Cafe Branch · Dapur'
      const stream = await screen.findByRole('heading', { name: streamName })
      const context = stream.closest('.ch-status-row')
      expect(context).toBeInTheDocument()
      expect(context?.querySelector('time')).toBeNull()

      const head = screen.getByTestId('page-head')
      const date = head.querySelector('time')
      expect(date).toHaveAttribute('datetime', '2026-10-06')
      expect(date).toHaveTextContent(formatWeekdayDayMonth('2026-10-06', locale))
      expect(date?.closest('.ch-meta, .page-head-meta')).toBeInTheDocument()

      const switchLabel = locale === 'en' ? 'Switch kitchen' : 'Ganti dapur'
      const switchButton = within(context as HTMLElement).getByRole('button', { name: switchLabel })
      expect(switchButton).toHaveTextContent(locale === 'en' ? 'Switch kitchen' : 'Ganti dapur')
      expect(context).not.toHaveTextContent(formatWeekdayDayMonth('2026-10-06', locale))
      fireEvent.click(switchButton)
      expect(await screen.findByRole('option', { name: /Other Cafe · Bar/ })).toBeInTheDocument()
      unmount()
    }
  })

  it('AC-007 renders eligible items as blank fixed-unit inputs instead of the eligibility empty state', async () => {
    const actual = await vi.importActual<typeof import('@/lib/db/cafe-count')>('@/lib/db/cafe-count')
    mockListItems.mockImplementationOnce(actual.listCafeCountableItems)
    const rpc = vi.fn().mockResolvedValue({ data: [
      { item_id: 'raw-1', item_name: 'Raw flour', item_category: 'Pantry', item_kind: 'RAW', item_unit_id: 'unit-kg', unit_name: 'kg' },
      { item_id: 'wip-1', item_name: 'Prepared sauce', item_category: 'Kitchen', item_kind: 'WIP', item_unit_id: 'unit-tray', unit_name: 'tray' },
      { item_id: 'raw-2', item_name: 'Uncounted rice', item_category: 'Pantry', item_kind: 'RAW', item_unit_id: 'unit-bag', unit_name: 'bag' },
    ], error: null })
    vi.mocked(supabase.schema).mockReturnValue({ rpc } as never)
    const { container } = renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    const wipInput = screen.getByRole('textbox', { name: 'Prepared sauce, counted, tray' })

    expect(screen.getAllByRole('textbox', { name: /counted/ })).toHaveLength(3)
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('cafe_countable_items', { p_branch_id: 'branch-1', p_activity: 'kitchen' })
    expect(rawInput).toHaveValue('')
    expect(wipInput).toHaveValue('')
    expect(rawInput).toHaveAttribute('inputmode', 'decimal')
    expect(rawInput).not.toHaveAttribute('placeholder')
    const entry = container.querySelector('.cafe-count')?.textContent?.toLowerCase() ?? ''
    expect(entry).not.toContain('expected balance')
    expect(entry).not.toContain('variance')
    expect(entry).not.toContain('stock')
    expect(entry).not.toContain('plan')
  })

  it('submits the selected storage location for the counted line', async () => {
    locationMocks.choices.mockReturnValue({
      status: 'ready',
      locations: [{ id: 'chiller-1', name: 'Chiller', use: 'storage', parent_id: null, branch_ids: ['branch-1'], archived_at: null, row_version: 1, updated_at: '', updated_by: null }],
      defaults: null,
      retry: vi.fn(),
    })
    mockSubmit.mockResolvedValue([{ client_key: 'client-1', outcome: 'submitted', line_id: 'line-1' }])
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' }), { target: { value: '2' } })
    fireEvent.click(screen.getAllByRole('combobox', { name: 'Storage location' })[0]!)
    fireEvent.click(screen.getByRole('option', { name: 'Chiller' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit stock count' }))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0][1]).toContainEqual(expect.objectContaining({
      item_id: 'raw-1', quantity: '2', storage_location_id: 'chiller-1',
    }))
  })

  it('AC-011 an invalid row does not block another valid Count from submitting', async () => {
    mockSubmit.mockResolvedValue([{ client_key: 'client-2', outcome: 'submitted', line_id: 'line-2' }])
    renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    const wipInput = screen.getByRole('textbox', { name: 'Prepared sauce, counted, tray' })
    fireEvent.change(rawInput, { target: { value: '1.500' } })
    fireEvent.change(wipInput, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit stock count' }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0][1]).toEqual([
      { client_key: 'client-2', item_id: 'wip-1', quantity: '2' },
    ])
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Did you mean 1500 or 1.500? Use up to 2 decimals.')
    expect(screen.getByText('1 item needs fixing')).toBeInTheDocument()
  })

  it('rejects Count values beyond two decimal places instead of accepting four-place fractions', async () => {
    renderPage()
    const input = await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    fireEvent.change(input, { target: { value: '1.2345' } })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Use up to 2 decimals.')
    expect(screen.getByRole('button', { name: 'Submit stock count' })).toBeDisabled()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('AC-011 refuses both ambiguous Count readings and offers typed-digit corrections', async () => {
    renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    const wipInput = screen.getByRole('textbox', { name: 'Prepared sauce, counted, tray' })
    fireEvent.change(rawInput, { target: { value: '1.250' } })
    fireEvent.change(wipInput, { target: { value: '0,125' } })

    expect(rawInput).toHaveAttribute('aria-invalid', 'true')
    expect(wipInput).toHaveAttribute('aria-invalid', 'true')
    const errors = screen.getAllByRole('alert')
    const messages = errors.map(error => error.textContent)
    expect(messages).toContain('Did you mean 1250 or 1.250? Use up to 2 decimals.')
    expect(messages).toContain('Did you mean 125 or 0.125? Use up to 2 decimals.')
    expect(screen.getByRole('button', { name: 'Submit stock count' })).toBeDisabled()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('AC-012 retries an uncertain submit with the same UUID key and quantity', async () => {
    mockSubmit
      .mockRejectedValueOnce(new Error('connection dropped after commit'))
      .mockResolvedValueOnce([{ client_key: 'client-1', outcome: 'existing', line_id: 'line-1' }])
    renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    fireEvent.change(rawInput, { target: { value: '0' } })
    const submit = screen.getByRole('button', { name: 'Submit stock count' })

    fireEvent.click(submit)
    expect(await screen.findByText(
      'This stock count could not be submitted. Your quantities are still here; retry when ready.',
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

  it('shows a short reason-specific quantity error in Indonesian', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/cafe/count']}>
        <I18nProvider initialLocale="id"><CafeCountPage /></I18nProvider>
      </MemoryRouter>,
    )
    const input = await screen.findByRole('textbox', { name: 'Raw flour, dihitung, kg' })
    fireEvent.change(input, { target: { value: '-1' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Masukkan nol atau lebih.')
    unmount()
  })

  it('AC-007 zero is submitted while a blank item is omitted; a refused line is shown individually', async () => {
    mockSubmit.mockResolvedValue([
      { client_key: 'client-1', outcome: 'submitted', line_id: 'line-1' },
      { client_key: 'client-2', outcome: 'refused', reason: 'already_counted' },
    ])
    renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    const wipInput = screen.getByRole('textbox', { name: 'Prepared sauce, counted, tray' })
    fireEvent.change(rawInput, { target: { value: '0' } })
    fireEvent.change(wipInput, { target: { value: '0,12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit stock count' }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    const [stream, lines] = mockSubmit.mock.calls[0]
    expect(stream).toEqual(streamMocks.stream)
    expect(lines).toHaveLength(2)
    expect(lines.map(line => line.quantity)).toEqual(['0', '0.12'])
    expect(lines.every(line => Object.keys(line).sort().join(',') === 'client_key,item_id,quantity')).toBe(true)
    expect(await screen.findByText('Submitted')).toBeInTheDocument()
    expect(await screen.findByText('This item already has a stock count today.')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('updates a waiting count line after the page regains focus', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    vi.mocked(listCafeCountFloorLines)
      .mockResolvedValueOnce([{ id: 'line-raw', itemId: 'raw-1', state: 'waiting', rowVersion: 1 }])
      .mockResolvedValueOnce([{ id: 'line-raw', itemId: 'raw-1', state: 'needs_recount', rowVersion: 2 }])
      .mockResolvedValueOnce([{ id: 'line-raw', itemId: 'raw-1', state: 'needs_recount', rowVersion: 2 }])
    renderPage()

    expect(await screen.findByText('Counted · waiting for the system check')).toBeInTheDocument()
    window.dispatchEvent(new Event('focus'))

    expect(await screen.findByText('This item differs. It needs a recount, and a reason if it still differs.')).toBeInTheDocument()
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(listCafeCountFloorLines).toHaveBeenCalledTimes(3))
    expect(listCafeCountFloorLines).toHaveBeenNthCalledWith(2, streamMocks.stream, '2026-10-06')
    expect(listCafeCountFloorLines).toHaveBeenNthCalledWith(3, streamMocks.stream, '2026-10-06')
  })

  it('AC-017 a line that differs asks only for a recount and a reason, with no expected figure, Variance or direction', async () => {
    vi.mocked(listCafeCountFloorLines).mockResolvedValue([
      { id: 'line-raw', itemId: 'raw-1', state: 'needs_recount', rowVersion: 2 },
      { id: 'line-wip', itemId: 'wip-1', state: 'held', rowVersion: 5 },
    ])
    vi.mocked(recordCafeCountRecount).mockResolvedValue({ reasonRequired: true, rowVersion: 3 })
    vi.mocked(recordCafeCountReason).mockResolvedValue({ rowVersion: 4 })
    renderPage()

    expect(await screen.findByText('This item differs. It needs a recount, and a reason if it still differs.')).toBeInTheDocument()
    const sheet = screen.getByRole('table')
    expect(sheet).not.toHaveTextContent(/expected|variance|surplus|shortage|more|less|[+-]\d/i)
    expect(screen.getByText('Confirmed, not posted')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Raw flour, counted, kg' })).toBeDisabled()

    const recount = screen.getByRole('textbox', { name: 'Recount for Raw flour, kg' })
    expect(recount).toHaveValue('')
    fireEvent.change(recount, { target: { value: '4,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save recount' }))
    await waitFor(() => expect(recordCafeCountRecount).toHaveBeenCalledWith('line-raw', '4.5'))

    expect(await screen.findByText('It still differs. Say why, then it goes to the reviewer.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save reason' }))
    expect(screen.getByText('Write a reason of up to 500 characters.')).toBeInTheDocument()
    expect(recordCafeCountReason).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for Raw flour' }), { target: { value: 'Half a bag spilled' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save reason' }))
    await waitFor(() => expect(recordCafeCountReason).toHaveBeenCalledWith('line-raw', 'Half a bag spilled'))
    expect(await screen.findByText('Counted · with the reviewer')).toBeInTheDocument()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('shows the recount request in Indonesian', async () => {
    vi.mocked(listCafeCountFloorLines).mockResolvedValue([{ id: 'line-raw', itemId: 'raw-1', state: 'needs_recount', rowVersion: 2 }])
    renderPage('id')
    expect(await screen.findByText('Item ini berbeda. Perlu dihitung ulang, dan diberi alasan jika masih berbeda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simpan hitung ulang' })).toBeInTheDocument()
  })

  it('AC-009 typed entries survive a reload for that person, stream and date, and clear after a successful submit', async () => {
    const first = renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' }), { target: { value: '2,5' } })
    expect(screen.getByText('Saved on this phone until you submit or discard.')).toBeInTheDocument()
    first.unmount()

    const second = renderPage()
    const restored = await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    expect(restored).toHaveValue('2,5')
    mockSubmit.mockResolvedValue([{ client_key: 'client-1', outcome: 'submitted', line_id: 'line-1' }])
    fireEvent.click(screen.getByRole('button', { name: 'Submit stock count' }))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(streamMocks.stream, [expect.objectContaining({ client_key: 'client-1', quantity: '2.5' })], '2026-10-06'))
    await screen.findByText('Submitted')
    second.unmount()

    renderPage()
    expect(await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })).toHaveValue('')
  })

  it('AC-009 an explicit discard clears the entries, and switching stream with unsent entries asks first', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' }), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Switch kitchen' }))
    fireEvent.click(await screen.findByRole('option', { name: /Other Cafe · Bar/ }))
    expect(await screen.findByRole('dialog', { name: 'Switch stream?' })).toBeInTheDocument()
    expect(streamMocks.setStream).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Discard entries' }))
    expect(screen.getByRole('textbox', { name: 'Raw flour, counted, kg' })).toHaveValue('')
    expect(Object.keys(window.localStorage).filter(key => key.includes(':count:'))).toHaveLength(0)
  })

  it('AC-010 offline: typing continues, Submit is disabled with a message, and nothing is sent when the connection returns', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' }), { target: { value: '1' } })
    expect(screen.getByRole('button', { name: 'Submit stock count' })).toBeDisabled()
    expect(screen.getByText('Reconnect to submit this stock count.')).toBeInTheDocument()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit stock count' })).toBeEnabled())
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('AC-008 a count typed in a manager multiple shows its default-unit amount and sends the multiple; no multiples, no unit control', async () => {
    vi.mocked(listCafeItemSettings).mockResolvedValue([{ id: 'raw-1', unitMultiples: [0.5] }] as never)
    mockSubmit.mockResolvedValue([{ client_key: 'client-1', outcome: 'submitted', line_id: 'line-1' }])
    renderPage()
    const box = await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    expect(screen.getAllByRole('button', { name: 'Change unit' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Change unit' }))
    fireEvent.click(screen.getByRole('radio', { name: /0[.,]5/ }))
    fireEvent.change(box, { target: { value: '3' } })
    expect(screen.getByText('Equals 1.5 kg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit stock count' }))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(streamMocks.stream, [expect.objectContaining({ quantity: '3', unit_factor: 0.5 })], '2026-10-06'))
  })

  it('AC-005 a reviewer sees which stream items cannot be counted; a floor member is never asked', async () => {
    vi.mocked(listCafeCountExcludedItems).mockResolvedValue(['Boxed tea', 'Paper cups'])
    const floor = renderPage()
    await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' })
    expect(listCafeCountExcludedItems).not.toHaveBeenCalled()
    expect(screen.queryByText(/cannot be counted/)).not.toBeInTheDocument()
    floor.unmount()

    mockUseAuth.mockReturnValue({ ...VIEWER, viewer: { ...(VIEWER as Extract<AuthState, { status: 'authenticated' }>).viewer, accessRoles: ['member', 'supervisor'] } } as AuthState)
    renderPage()
    expect(await screen.findByText('2 items on this list cannot be counted because their unit is not the ESB stock unit: Boxed tea, Paper cups.')).toBeInTheDocument()
  })

  it('FR-006 an item another stream of the branch counted today shows where and takes no entry', async () => {
    vi.mocked(listCafeCountCountedElsewhere).mockResolvedValue({ 'raw-1': { activity: 'bar', submittedAt: '2026-10-06T02:05:00.000Z' } })
    renderPage()
    expect(await screen.findByText(/^Already counted on Cafe Branch · Bar at 0?9[:.]05/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Raw flour, counted, kg' })).toBeDisabled()
  })

  it('FR-003 the kind and not-yet-counted filters narrow the list', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Raw flour, counted, kg' }), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('combobox', { name: /Show/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Not yet counted' }))
    expect(screen.queryByRole('textbox', { name: 'Raw flour, counted, kg' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Uncounted rice, counted, bag' })).toBeInTheDocument()
    expect(screen.getByText('1 of 3 counted')).toBeInTheDocument()
  })
})
