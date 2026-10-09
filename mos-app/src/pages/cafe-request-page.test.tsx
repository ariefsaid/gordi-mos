import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
const itemSettingsMocks = vi.hoisted(() => ({ list: vi.fn(), canManage: vi.fn() }))
vi.mock('@/lib/db/cafe-item-settings', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-item-settings')>()
  return { ...actual, listCafeItemSettings: itemSettingsMocks.list, canManageCafeItemSettings: itemSettingsMocks.canManage }
})
const streamMocks = vi.hoisted(() => {
  const branch = { id: 'branch-1', code: 'cafe-branch', name: 'Cafe Branch' }
  const kitchen = { branch, activity: 'kitchen' as const }
  const bar = { branch, activity: 'bar' as const }
  const catalog = {
    branches: [branch], options: [kitchen, bar], destinations: [], locationOptions: [kitchen, bar],
    stream: kitchen as typeof kitchen | null, homeStream: kitchen as typeof kitchen | null,
    myStreamKeys: new Set(['branch-1|kitchen']), branchId: 'branch-1',
  }
  return { kitchen, bar, catalog, resolve: vi.fn(async () => catalog), adopt: vi.fn(), setStream: vi.fn() }
})
vi.mock('@/lib/use-cafe-stream', () => ({
  useCafeStream: () => ({ ...streamMocks.catalog, resolve: streamMocks.resolve, adopt: streamMocks.adopt, setStream: streamMocks.setStream }),
}))
vi.mock('@/lib/db/cafe-opening', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-opening')>()
  return { ...actual, wibToday: () => '2026-10-06' }
})
const keyMocks = vi.hoisted(() => ({ key: 0 }))
vi.mock('@/lib/db/cafe-receipts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-receipts')>()
  return { ...actual, newCafeReceiptClientKey: () => `request-key-${++keyMocks.key}`, listCafeReceivableItems: vi.fn() }
})
vi.mock('@/lib/db/cafe-purchase-requests', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-purchase-requests')>()
  return { ...actual, listCafePurchaseRequests: vi.fn(), submitCafePurchaseRequest: vi.fn() }
})

import { useAuth } from '@/auth/use-auth'
import { listCafeReceivableItems, type CafeReceivableItem } from '@/lib/db/cafe-receipts'
import { listCafePurchaseRequests, submitCafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import { CafeRequestPage } from './cafe-request-page'

const mockUseAuth = vi.mocked(useAuth)
const mockItems = vi.mocked(listCafeReceivableItems)
const mockSubmit = vi.mocked(submitCafePurchaseRequest)
const mockList = vi.mocked(listCafePurchaseRequests)

function viewer(accessRoles: string[], affiliated: string[] = ['cafe']): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Café member',
        email: 'member@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles, affiliated,
    },
    signOut: vi.fn(),
  } as AuthState
}
const ITEMS: CafeReceivableItem[] = [
  {
    id: 'bean', name: 'Coffee bean', category: 'Bar', kind: 'RAW', defaultUnitId: 'unit-kg',
    units: [{ id: 'unit-kg', name: 'kg' }, { id: 'unit-bag', name: 'bag' }],
  },
  { id: 'milk', name: 'Fresh milk', category: 'Dairy', kind: 'RAW', defaultUnitId: 'unit-l', units: [{ id: 'unit-l', name: 'l' }] },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cafe/request']}>
      <I18nProvider><CafeRequestPage /></I18nProvider>
    </MemoryRouter>,
  )
}

const neededBy = () => screen.getByLabelText(/Needed by/)
const setNeededBy = (iso: string) => fireEvent.change(screen.getByLabelText('Open calendar'), { target: { value: iso } })
const send = () => screen.getByRole('button', { name: 'Send for approval' })

beforeEach(() => {
  vi.clearAllMocks()
  keyMocks.key = 0
  streamMocks.catalog.stream = streamMocks.kitchen
  streamMocks.catalog.homeStream = streamMocks.kitchen
  mockUseAuth.mockReturnValue(viewer(['member']))
  mockItems.mockResolvedValue(ITEMS)
  mockList.mockResolvedValue([])
  itemSettingsMocks.list.mockResolvedValue([{
    id: 'item-setting', erpName: 'Synthetic item', mosName: 'Synthetic item', category: 'Kitchen',
    kind: null, isActive: false, defaultUnitId: null, units: [],
  }])
  itemSettingsMocks.canManage.mockResolvedValue(false)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('CafeRequestPage', () => {
  it.each([false, true])('offers the Items setup link only to people who can manage items (canManage=%s)', async canManage => {
    mockItems.mockResolvedValue([])
    itemSettingsMocks.canManage.mockResolvedValue(canManage)
    renderPage()

    if (canManage) {
      expect(await screen.findByRole('link', { name: 'Set up items' })).toHaveAttribute('href', '/cafe/items')
    } else {
      expect(await screen.findByText(/kitchen manager or an ops lead sets it up in Café items/i)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Set up items' })).not.toBeInTheDocument()
      expect(document.querySelector('a[href="/cafe/items"]')).not.toBeInTheDocument()
    }
  })

  it('AC-1043 opens blank on the person’s stream with item search, typed quantity and fixed unit, and no pre-fill or purchase-versus-transfer control', async () => {
    const { container } = renderPage()
    const bean = await screen.findByRole('textbox', { name: 'Needed for Coffee bean' })
    expect(screen.getByRole('button', { name: 'Switch kitchen' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cafe Branch · Kitchen' }).closest('.cafe-page-head')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Find an item' })).toBeInTheDocument()
    expect(mockItems).toHaveBeenCalledWith(streamMocks.kitchen)
    expect(bean).toHaveValue('')
    expect(bean).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByRole('textbox', { name: 'Needed for Fresh milk' })).toHaveValue('')
    expect(neededBy()).toHaveValue('')
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('')
    expect(screen.getByText('kg')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/purchase order|transfer|supplier|price|ERP/i)
    expect(screen.queryByRole('combobox', { name: /type|process|transfer/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an item' }), { target: { value: 'bean' } })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Needed for Fresh milk' })).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Needed for Coffee bean' })).toBeInTheDocument()
    expect(send()).toBeDisabled()
  })

  it('AC-1043 the unit stays fixed until the person deliberately changes it; one-unit items have no change control', async () => {
    renderPage()
    await screen.findByRole('textbox', { name: 'Needed for Coffee bean' })
    expect(screen.getAllByRole('button', { name: 'Change unit' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Change unit' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'ESB unit for Coffee bean' })).getByLabelText('bag'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Needed for Coffee bean' }), { target: { value: '2,5' } })
    setNeededBy('2026-10-08')
    mockSubmit.mockResolvedValue({ request_id: 'q-1', outcome: 'created', row_version: 1 })
    fireEvent.click(send())
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(
      streamMocks.kitchen, '2026-10-08', '', 'request-key-1', [{ item_unit_id: 'unit-bag', quantity: '2.5' }],
    ))
  })

  it('FR-1051 needs a needed-by date and a valid quantity before sending, stated once in the band', async () => {
    renderPage()
    const milk = await screen.findByRole('textbox', { name: 'Needed for Fresh milk' })
    fireEvent.change(milk, { target: { value: '3' } })
    expect(screen.getByText('1 line')).toBeInTheDocument()
    expect(screen.getByText('Choose the date this is needed by.')).toBeInTheDocument()
    expect(send()).toBeDisabled()
    setNeededBy('2026-10-07')
    expect(send()).toBeEnabled()
    fireEvent.change(milk, { target: { value: '0' } })
    expect(screen.getByText('Fix 1 quantity to continue')).toBeInTheDocument()
    expect(send()).toBeDisabled()
    setNeededBy('2026-10-05')
    fireEvent.change(milk, { target: { value: '3' } })
    expect(screen.getByText('Choose a date from today up to 90 days ahead.')).toBeInTheDocument()
    expect(send()).toBeDisabled()
  })

  it('keeps malformed typed dates from enabling send', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Needed for Fresh milk' }), { target: { value: '1' } })
    fireEvent.change(neededBy(), { target: { value: '35/13/2026' } })
    fireEvent.blur(neededBy())
    expect(send()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent("That date doesn't exist")
  })

  it('puts Review requests after the capture form', async () => {
    mockUseAuth.mockReturnValue(viewer(['member', 'supervisor']))
    renderPage()
    const date = await screen.findByLabelText(/Needed by/)
    const review = await screen.findByRole('link', { name: 'Review requests' })
    expect(date.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sends once, shows the sent lines, and starts the next request blank with a fresh key', async () => {
    let resolve!: (value: { request_id: string; outcome: 'created'; row_version: number }) => void
    mockSubmit.mockReturnValue(new Promise(r => { resolve = r }))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Needed for Fresh milk' }), { target: { value: '12' } })
    setNeededBy('2026-10-07')
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Weekend menu' } })
    fireEvent.click(send())
    fireEvent.click(screen.getByRole('button', { name: 'Working…' }))
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledWith(streamMocks.kitchen, '2026-10-07', 'Weekend menu', 'request-key-1', [{ item_unit_id: 'unit-l', quantity: '12' }])
    resolve({ request_id: 'q-1', outcome: 'created', row_version: 1 })
    const sent = await screen.findByRole('heading', { name: 'Sent for approval' })
    await waitFor(() => expect(sent).toHaveFocus())
    expect(within(screen.getByRole('list', { name: 'Requested lines' })).getByText('12 × l')).toBeInTheDocument()
    const sentCard = screen.getByRole('heading', { name: 'Sent for approval' }).closest('section')!
    expect(sentCard).toHaveTextContent(/Needed by .*7 Oct/)
    expect(sentCard).toHaveTextContent('Note: Weekend menu')
    fireEvent.click(screen.getByRole('button', { name: 'Raise another request' }))
    expect(await screen.findByRole('textbox', { name: 'Needed for Fresh milk' })).toHaveValue('')
    expect(neededBy()).toHaveValue('')
    fireEvent.change(screen.getByRole('textbox', { name: 'Needed for Fresh milk' }), { target: { value: '1' } })
    setNeededBy('2026-10-07')
    mockSubmit.mockResolvedValue({ request_id: 'q-2', outcome: 'created', row_version: 1 })
    fireEvent.click(send())
    await waitFor(() => expect(mockSubmit).toHaveBeenLastCalledWith(
      streamMocks.kitchen, '2026-10-07', '', 'request-key-2', [{ item_unit_id: 'unit-l', quantity: '1' }],
    ))
  })

  it('keeps every entry and states the failure when sending is refused', async () => {
    mockSubmit.mockRejectedValue(new Error('submitCafePurchaseRequest failed: CAFE_PURCHASE_REQUEST_ITEM_NOT_AVAILABLE'))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Needed for Fresh milk' }), { target: { value: '12' } })
    setNeededBy('2026-10-07')
    fireEvent.click(send())
    expect(await screen.findByRole('alert')).toHaveTextContent('An item or its ESB unit is no longer available.')
    expect(screen.getByRole('textbox', { name: 'Needed for Fresh milk' })).toHaveValue('12')
  })

  it('offline disables sending with a plain message', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Needed for Fresh milk' }), { target: { value: '12' } })
    setNeededBy('2026-10-07')
    expect(screen.getByText('Reconnect to send this request.')).toBeInTheDocument()
    expect(send()).toBeDisabled()
  })

  it('folds the person’s own requests above the form, each named by its items, with state and a rejection reason', async () => {
    const line = (id: string, item_name: string) => ({ id, item_name, item_category: null, unit_name: 'l', quantity: '1' })
    mockList.mockResolvedValue([
      {
        id: 'q-9', branch_id: 'branch-1', activity: 'kitchen', required_by: '2026-10-08', note: null, status: 'Rejected',
        requested_by: 'person-1', requested_at: '2026-10-06T01:00:00Z', reviewed_by: 'p-2', reviewed_at: '2026-10-06T02:00:00Z',
        review_note: 'Raised twice', row_version: 2,
        lines: [line('l-1', 'Fresh milk'), line('l-2', 'Oat milk'), line('l-3', 'Cocoa powder')],
      },
      {
        id: 'q-8', branch_id: 'branch-1', activity: 'kitchen', required_by: '2026-10-07', note: null, status: 'Approved',
        requested_by: 'person-1', requested_at: '2026-10-05T01:00:00Z', reviewed_by: 'p-2', reviewed_at: '2026-10-05T02:00:00Z',
        review_note: null, row_version: 2, lines: [line('l-4', 'Vanilla syrup')],
      },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('Your requests (2)'))
    const recent = screen.getByRole('list', { name: 'Your requests' })
    const [rejected, approved] = within(recent).getAllByRole('listitem')
    expect(rejected).toHaveTextContent('Fresh milk, Oat milk +1 more')
    expect(rejected).toHaveTextContent('Rejected · raise a new request')
    expect(rejected).toHaveTextContent('Reason: Raised twice')
    expect(approved).toHaveTextContent('Approved · not posted to ESB')
    expect(mockList).toHaveBeenCalledWith(['Submitted', 'Approved', 'Rejected'], { requestedBy: 'person-1', limit: 10 })
  })

  it('says when the person’s requests could not be loaded and retries', async () => {
    mockList.mockRejectedValueOnce(new Error('down'))
    renderPage()
    expect(await screen.findByText('Your requests could not be loaded.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText('Your requests could not be loaded.')).not.toBeInTheDocument())
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('a person outside the café reads why they cannot raise a request', async () => {
    mockUseAuth.mockReturnValue(viewer(['member'], []))
    renderPage()
    expect(await screen.findByText('Requests are raised by Café teammates, Ops Leads, and admins.')).toBeInTheDocument()
    expect(mockItems).not.toHaveBeenCalled()
  })
})
