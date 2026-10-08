import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
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
    submitCafeCounts: vi.fn(),
  }
})

import { useAuth } from '@/auth/use-auth'
import { supabase } from '@/lib/supabase'
import { canManageCafeItemSettings, listCafeItemSettings } from '@/lib/db/cafe-item-settings'
import { listCafeCountableItems, submitCafeCounts } from '@/lib/db/cafe-count'
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
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('cafe_countable_items', { p_branch_id: 'branch-1', p_activity: 'kitchen' })
    expect(listCafeItemSettings).toHaveBeenCalledWith(streamMocks.stream)
  })

  it('puts the localized date in PageHead metadata and labels the kitchen switch in both locales', async () => {
    for (const locale of ['en', 'id'] as const) {
      const { unmount } = renderPage(locale)
      const streamName = locale === 'en' ? 'Cafe Branch · Kitchen' : 'Cafe Branch · Dapur'
      const stream = await screen.findByRole('heading', { name: streamName })
      const context = stream.closest('.cafe-capture-context')
      expect(context).toBeInTheDocument()
      expect(context?.querySelector('time')).toBeNull()

      const head = screen.getByTestId('page-head')
      const date = head.querySelector('time')
      expect(date).toHaveAttribute('datetime', '2026-10-06')
      expect(date).toHaveTextContent(formatWeekdayDayMonth('2026-10-06', locale))
      expect(date?.closest('.ch-meta, .page-head-meta')).toBeInTheDocument()

      const switchLabel = locale === 'en' ? 'Switch kitchen stream' : 'Ganti stream dapur'
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
    const rawInput = await screen.findByRole('textbox', { name: 'Count for Raw flour' })
    const wipInput = screen.getByRole('textbox', { name: 'Count for Prepared sauce' })

    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    expect(listCafeItemSettings).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('cafe_countable_items', { p_branch_id: 'branch-1', p_activity: 'kitchen' })
    expect(rawInput).toHaveValue('')
    expect(wipInput).toHaveValue('')
    expect(rawInput).toHaveAttribute('inputmode', 'decimal')
    expect(rawInput).not.toHaveAttribute('placeholder')
    expect(container.querySelector('.cafe-count__unit')).toHaveTextContent('kg')
    expect(rawInput).toHaveClass('cafe-capture-quantity-field')
    expect(rawInput.closest('.cafe-count__quantity-control')).toHaveClass('cafe-count__quantity-control')
    expect(rawInput.closest('.cafe-count__quantity-control')).not.toHaveClass('cafe-capture-control-group')
    expect(rawInput.closest('.cafe-count__input-group')?.querySelector('label')).toHaveClass('sr-only')
    expect(rawInput.closest('.cafe-capture-row')?.querySelector('.cafe-count__unit')).toHaveAttribute('aria-label', 'kg')
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
    fireEvent.change(rawInput, { target: { value: '1.500' } })
    fireEvent.change(wipInput, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Count' }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0][1]).toEqual([
      { client_key: 'client-2', item_id: 'wip-1', quantity: '2' },
    ])
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Did you mean 1500 or 1.500? Use up to 2 decimals.')
    expect(within(document.querySelector('.cafe-count__footer')!).getByText('1 item needs fixing')).toBeInTheDocument()
  })

  it('rejects Count values beyond two decimal places instead of accepting four-place fractions', async () => {
    renderPage()
    const input = await screen.findByRole('textbox', { name: 'Count for Raw flour' })
    fireEvent.change(input, { target: { value: '1.2345' } })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Use up to 2 decimals.')
    expect(screen.getByRole('button', { name: 'Submit Count' })).toBeDisabled()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('AC-011 refuses both ambiguous Count readings and offers typed-digit corrections', async () => {
    renderPage()
    const rawInput = await screen.findByRole('textbox', { name: 'Count for Raw flour' })
    const wipInput = screen.getByRole('textbox', { name: 'Count for Prepared sauce' })
    fireEvent.change(rawInput, { target: { value: '1.250' } })
    fireEvent.change(wipInput, { target: { value: '0,125' } })

    expect(rawInput).toHaveAttribute('aria-invalid', 'true')
    expect(wipInput).toHaveAttribute('aria-invalid', 'true')
    const errors = screen.getAllByRole('alert')
    expect(errors[0]).toHaveTextContent('Did you mean 1250 or 1.250? Use up to 2 decimals.')
    expect(errors[1]).toHaveTextContent('Did you mean 125 or 0.125? Use up to 2 decimals.')
    expect(screen.getByRole('button', { name: 'Submit Count' })).toBeDisabled()
    expect(mockSubmit).not.toHaveBeenCalled()
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

  it('shows a short reason-specific quantity error in Indonesian', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/cafe/count']}>
        <I18nProvider initialLocale="id"><CafeCountPage /></I18nProvider>
      </MemoryRouter>,
    )
    const input = await screen.findByRole('textbox', { name: 'Count untuk Raw flour' })
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
    const rawInput = await screen.findByRole('textbox', { name: 'Count for Raw flour' })
    const wipInput = screen.getByRole('textbox', { name: 'Count for Prepared sauce' })
    fireEvent.change(rawInput, { target: { value: '0' } })
    fireEvent.change(wipInput, { target: { value: '0,12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Count' }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    const [stream, lines] = mockSubmit.mock.calls[0]
    expect(stream).toEqual(streamMocks.stream)
    expect(lines).toHaveLength(2)
    expect(lines.map(line => line.quantity)).toEqual(['0', '0.12'])
    expect(lines.every(line => Object.keys(line).sort().join(',') === 'client_key,item_id,quantity')).toBe(true)
    expect(await screen.findByText('Submitted')).toBeInTheDocument()
    expect(await screen.findByText('This item already has a Count today.')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
