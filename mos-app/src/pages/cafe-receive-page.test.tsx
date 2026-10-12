import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
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
    stream: kitchen as typeof kitchen | typeof bar | null, homeStream: kitchen as typeof kitchen | typeof bar | null,
    myStreamKeys: new Set(['branch-1|kitchen']), branchId: 'branch-1',
  }
  return { branch, kitchen, bar, catalog, resolve: vi.fn(async () => catalog), adopt: vi.fn(), setStream: vi.fn() }
})
vi.mock('@/lib/use-cafe-stream', () => ({
  useCafeStream: () => ({ ...streamMocks.catalog, resolve: streamMocks.resolve, adopt: streamMocks.adopt, setStream: streamMocks.setStream }),
}))
vi.mock('@/lib/db/cafe-opening', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-opening')>()
  return { ...actual, wibToday: () => '2026-10-06' }
})
const keyMocks = vi.hoisted(() => ({ key: 0 }))
const poMocks = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/lib/db/cafe-receipts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-receipts')>()
  return {
    ...actual,
    newCafeReceiptClientKey: () => `receipt-key-${++keyMocks.key}`,
    listCafeReceivableItems: vi.fn(),
    listCafeReceipts: vi.fn(),
    submitCafeReceipt: vi.fn(),
    saveCafeReceiptLineExplanation: vi.fn(),
    sendCafeReceiptForReview: vi.fn(),
    listCafeReceiptDifferences: vi.fn(),
    listCafeOpenPoIdentities: poMocks.list,
  }
})
vi.mock('@/lib/db/cafe-receipt-issues', () => ({
  countCafeReceiptIssuesNeedingPo: vi.fn().mockResolvedValue(0),
  canManageCafeReceiptIssues: vi.fn().mockResolvedValue(false),
}))
import { canManageCafeReceiptIssues, countCafeReceiptIssuesNeedingPo } from '@/lib/db/cafe-receipt-issues'
vi.mock('@/lib/offline-photo-drafts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/offline-photo-drafts')>()
  return { ...actual, clearOfflinePhotoDraft: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('@/lib/db/cafe-receipt-photos', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-receipt-photos')>()
  return { ...actual, listCafeReceiptPhotos: vi.fn().mockResolvedValue([]), uploadCafeReceiptLinePhoto: vi.fn() }
})

import { useAuth } from '@/auth/use-auth'
import { messages } from '@/i18n/messages'
import {
  listCafeReceiptDifferences,
  listCafeReceipts,
  listCafeReceivableItems,
  saveCafeReceiptLineExplanation,
  sendCafeReceiptForReview,
  submitCafeReceipt,
  type CafeReceipt,
  type CafeReceiptLine,
  type CafeReceiptSubmitResult,
  type CafeReceivableItem,
} from '@/lib/db/cafe-receipts'
import { uploadCafeReceiptLinePhoto } from '@/lib/db/cafe-receipt-photos'
import { clearOfflinePhotoDraft } from '@/lib/offline-photo-drafts'
import { CafeReceivePage } from './cafe-receive-page'

const mockUseAuth = vi.mocked(useAuth)
const mockItems = vi.mocked(listCafeReceivableItems)
const mockSubmit = vi.mocked(submitCafeReceipt)
const mockSaveExplanation = vi.mocked(saveCafeReceiptLineExplanation)
const mockUploadReceiptPhoto = vi.mocked(uploadCafeReceiptLinePhoto)
const mockSend = vi.mocked(sendCafeReceiptForReview)
const mockDifferences = vi.mocked(listCafeReceiptDifferences)

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Café member',
        email: 'member@example.test', archived_at: null, must_change_password: false,
        created_at: '', updated_at: '',
      },
      roles: [], isManager: false, accessRoles, affiliated: ['cafe'],
    },
    signOut: vi.fn(),
  }
}
function receiptLine(overrides: Partial<CafeReceiptLine> = {}): CafeReceiptLine {
  return {
    id: 'line-1', item_unit_id: 'unit-kg', item_name: 'Coffee bean', item_category: 'Bar', unit_name: 'kg', received_quantity: '2.5',
    conditions: [], condition_reason: null, condition_updated_at: null, photos: [], ...overrides,
  }
}

function submitResult(receiptId: string, lines: CafeReceiptLine[], outcome: CafeReceiptSubmitResult['outcome'] = 'created'): CafeReceiptSubmitResult {
  return { receipt_id: receiptId, outcome, row_version: 1, lines }
}

const ITEMS: CafeReceivableItem[] = [
  {
    id: 'bean', name: 'Coffee bean', category: 'Bar', kind: 'RAW', defaultUnitId: 'unit-kg',
    units: [{ id: 'unit-kg', name: 'kg' }, { id: 'unit-bag', name: 'bag' }],
  },
  { id: 'milk', name: 'Fresh milk', category: 'Dairy', kind: 'RAW', defaultUnitId: 'unit-l', units: [{ id: 'unit-l', name: 'l' }] },
]

const EMPTY_PO_CACHE = { asOf: '2026-10-06T02:10:00Z', isCurrent: true, purchaseOrders: [] }
const TWO_PO_CACHE = {
  asOf: '2026-10-06T02:10:00Z',
  isCurrent: true,
  purchaseOrders: [
    {
      poNumber: 'PO-1043', supplierName: 'Sample produce supplier', poDate: '2026-10-04',
      items: [
        { itemUnitId: 'unit-kg', itemName: 'Coffee bean', unitName: 'kg' },
        { itemUnitId: 'unit-l', itemName: 'Fresh milk', unitName: 'l' },
      ],
    },
    {
      poNumber: 'PO-1044', supplierName: 'Sample dairy supplier', poDate: '2026-10-05',
      items: [{ itemUnitId: 'unit-l', itemName: 'Fresh milk', unitName: 'l' }],
    },
  ],
}
const PICKER_ITEMS: CafeReceivableItem[] = [
  ...ITEMS,
  { id: 'pastry', name: 'Whole-grain pastry dough prepared for morning service', category: 'Bakery', kind: 'RAW', defaultUnitId: 'unit-each', units: [{ id: 'unit-each', name: 'each' }] },
]

const LONG_PO_ITEMS: CafeReceivableItem[] = [
  ...Array.from({ length: 14 }, (_, k): CafeReceivableItem => {
    const n = String(k + 1).padStart(2, '0')
    return { id: `long-${n}`, name: `Long PO item ${n}`, category: 'Dry goods', kind: 'RAW', defaultUnitId: `unit-long-${n}`, units: [{ id: `unit-long-${n}`, name: 'kg' }] }
  }),
  { id: 'lemon', name: 'Lemon lokal', category: 'Produce', kind: 'RAW', defaultUnitId: 'unit-lemon', units: [{ id: 'unit-lemon', name: 'kg' }] },
]
const LONG_PO_CACHE = {
  asOf: '2026-10-06T02:10:00Z',
  isCurrent: true,
  purchaseOrders: [{
    poNumber: 'PO-2001', supplierName: 'Sample wholesale supplier', poDate: '2026-10-06',
    items: LONG_PO_ITEMS.slice(0, 14).map(item => ({ itemUnitId: item.defaultUnitId, itemName: item.name, unitName: 'kg' })),
  }],
}

function renderPage(locale?: 'en' | 'id') {
  return render(
    <MemoryRouter initialEntries={['/cafe/receive']}>
      <I18nProvider initialLocale={locale}><CafeReceivePage /></I18nProvider>
    </MemoryRouter>,
  )
}

/** Presses the page's Lock counts and returns the confirm step it opens. */
async function openLockStep() {
  fireEvent.click(screen.getByRole('button', { name: 'Lock counts' }))
  return screen.findByRole('dialog', { name: /^Lock \d+ lines?\?$/ })
}

const setArrivalDate = (iso: string) => fireEvent.change(screen.getByLabelText('Open calendar'), { target: { value: iso } })

beforeEach(() => {
  vi.clearAllMocks()
  keyMocks.key = 0
  streamMocks.catalog.branches = [streamMocks.branch]
  streamMocks.catalog.options = [streamMocks.kitchen, streamMocks.bar]
  streamMocks.catalog.stream = streamMocks.kitchen
  streamMocks.catalog.branchId = streamMocks.branch.id
  streamMocks.catalog.homeStream = streamMocks.kitchen
  localStorage.clear()
  mockUseAuth.mockReturnValue(viewer(['member']))
  mockItems.mockResolvedValue(ITEMS)
  poMocks.list.mockReset().mockResolvedValue(EMPTY_PO_CACHE as never)
  vi.mocked(listCafeReceipts).mockResolvedValue([])
  vi.mocked(canManageCafeReceiptIssues).mockResolvedValue(false)
  vi.mocked(countCafeReceiptIssuesNeedingPo).mockResolvedValue(0)
  itemSettingsMocks.list.mockResolvedValue([{
    id: 'item-setting', erpName: 'Synthetic item', mosName: 'Synthetic item', category: 'Kitchen',
    kind: null, isActive: false, defaultUnitId: null, units: [],
  }])
  itemSettingsMocks.canManage.mockResolvedValue(false)
  mockDifferences.mockResolvedValue([])
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('CafeReceivePage', () => {
  it('explains the missing confirmed stock unit when Items has active set-up items but none is receivable', async () => {
    mockItems.mockResolvedValue([])
    itemSettingsMocks.list.mockResolvedValue([{
      id: 'wip-1', erpName: 'Prepared sauce with roasted vegetables', mosName: 'Prepared sauce',
      category: 'Kitchen', kind: 'WIP', isActive: true, defaultUnitId: 'unit-portion',
      units: [{ id: 'unit-portion', name: 'porsi', isDefault: true, isShown: true, labelOrdinal: null, labelCount: 1 }],
    }])
    renderPage()

    const empty = await screen.findByTestId('empty-state')
    expect(empty).toHaveTextContent('1 item is set up')
    expect(empty).toHaveTextContent('default unit confirmed as an ESB stock unit')
    expect(empty).not.toHaveTextContent('not set up for this list')
  })

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

  it('FR-1034 the Receipt issues link carries a badge with how many wait for a PO', async () => {
    vi.mocked(canManageCafeReceiptIssues).mockResolvedValue(true)
    vi.mocked(countCafeReceiptIssuesNeedingPo).mockResolvedValue(3)
    renderPage()
    const link = await screen.findByRole('link', { name: /Receipt issues/ })
    await waitFor(() => expect(link).toHaveAccessibleName('Receipt issues 3 waiting for a PO'))
    expect(within(link).getByText('3')).toBeInTheDocument()
    expect(countCafeReceiptIssuesNeedingPo).toHaveBeenCalledWith({})
  })

  it('C9 a plain member makes no count request and sees no badge', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: /Receipt issues/ })
    await waitFor(() => expect(canManageCafeReceiptIssues).toHaveBeenCalled())
    await waitFor(() => expect(listCafeReceipts).toHaveBeenCalled())
    expect(countCafeReceiptIssuesNeedingPo).not.toHaveBeenCalled()
    expect(link).toHaveAccessibleName('Receipt issues')
  })

  it('C9 a receiver counts only the issues on their own receipts', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine()], { status: 'Approved' })])
    vi.mocked(countCafeReceiptIssuesNeedingPo).mockResolvedValue(1)
    renderPage()
    const link = await screen.findByRole('link', { name: /Receipt issues/ })
    await waitFor(() => expect(link).toHaveAccessibleName('Receipt issues 1 waiting for a PO'))
    expect(countCafeReceiptIssuesNeedingPo).toHaveBeenCalledTimes(1)
    expect(countCafeReceiptIssuesNeedingPo).toHaveBeenCalledWith({ receivedBy: 'person-1' })
  })

  it('C9 a stream reviewer counts without asking for the procurement capability', async () => {
    mockUseAuth.mockReturnValue(viewer(['member', 'supervisor']))
    vi.mocked(countCafeReceiptIssuesNeedingPo).mockResolvedValue(2)
    renderPage()
    const link = await screen.findByRole('link', { name: /Receipt issues/ })
    await waitFor(() => expect(link).toHaveAccessibleName('Receipt issues 2 waiting for a PO'))
    expect(canManageCafeReceiptIssues).not.toHaveBeenCalled()
    expect(countCafeReceiptIssuesNeedingPo).toHaveBeenCalledWith({})
  })

  it('FR-1034 no badge when nothing waits, or when the count cannot be read', async () => {
    vi.mocked(canManageCafeReceiptIssues).mockResolvedValue(true)
    vi.mocked(countCafeReceiptIssuesNeedingPo).mockRejectedValue(new Error('countCafeReceiptIssuesNeedingPo failed'))
    renderPage()
    const link = await screen.findByRole('link', { name: /Receipt issues/ })
    await waitFor(() => expect(countCafeReceiptIssuesNeedingPo).toHaveBeenCalled())
    expect(link).toHaveAccessibleName('Receipt issues')
  })

  it('AC-1001 opens on the person’s own stream with every other stream selectable', async () => {
    renderPage()
    await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    expect(screen.getByRole('heading', { name: 'Cafe Branch · Kitchen' }).closest('.cafe-page-head')).toBeInTheDocument()
    expect(mockItems).toHaveBeenCalledWith(streamMocks.kitchen)
    fireEvent.click(screen.getByRole('button', { name: /^switch kitchen$/i }))
    expect(screen.getByRole('option', { name: /Cafe Branch · Bar/ })).toBeInTheDocument()
  })

  it('AC-1001 asks for an explicit stream choice when the person has no stream Team', async () => {
    streamMocks.catalog.stream = null
    streamMocks.catalog.homeStream = null
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Choose a kitchen or bar' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: /stream/i })).getAllByRole('button')[0])
    expect(streamMocks.setStream).toHaveBeenCalledTimes(1)
    expect(mockItems).not.toHaveBeenCalled()
  })

  it('AC-1003 searching “bean” shows matching items with no typed PO number, ordered quantity, outstanding, price or location', async () => {
    const { container } = renderPage()
    await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    expect(screen.getByRole('button', { name: 'Switch kitchen' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Find an item' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an item' }), { target: { value: 'bean' } })
    await screen.findByRole('textbox', { name: 'Received for Coffee bean' })

    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('')
    expect(screen.queryByRole('textbox', { name: 'Received for Fresh milk' })).toBeNull()
    const page = container.textContent?.toLowerCase() ?? ''
    for (const word of ['ordered', 'outstanding', 'price', 'location']) {
      expect(page).not.toContain(word)
    }
    expect(screen.getAllByRole('textbox').filter(box => box.getAttribute('inputmode') === 'decimal').map(box => box.getAttribute('aria-label')))
      .toEqual(['Received for Coffee bean'])
    expect(screen.queryByRole('textbox', { name: /po number/i })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toHaveAttribute('inputmode', 'decimal')
  })

  it('Issue 1443 lists branch open POs without quantities, and picking one adds blank lines while search can add other items', async () => {
    mockItems.mockResolvedValue(PICKER_ITEMS)
    poMocks.list.mockResolvedValue(TWO_PO_CACHE as never)
    const { container } = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Choose from 2 open POs' }))
    expect(await screen.findByRole('button', { name: /PO-1043/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PO-1044/ })).toBeInTheDocument()
    expect(container.textContent).toContain('Sample produce supplier')
    expect(container.textContent).toContain('Coffee bean')
    expect(container.textContent).toContain('Fresh milk')
    for (const word of ['outstanding', 'ordered quantity', 'price']) expect(container.textContent?.toLowerCase()).not.toContain(word)
    expect(screen.queryByRole('textbox', { name: /po number/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /PO-1043/ }))
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Received for Fresh milk' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Received for Whole-grain pastry dough prepared for morning service' })).toHaveValue('')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an item' }), { target: { value: 'pastry' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Whole-grain pastry dough prepared for morning service' }), { target: { value: '6' } })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an item' }), { target: { value: '' } })

    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '4' } })
    const lockStep = await openLockStep()
    expect(within(lockStep).getByText('Coffee bean')).toBeInTheDocument()
    expect(within(lockStep).getByText('Fresh milk')).toBeInTheDocument()
    expect(within(lockStep).getByText('Whole-grain pastry dough prepared for morning service')).toBeInTheDocument()
  })

  it('Issue 1443 supports keyboard PO selection and returns focus after collapsing the picker', async () => {
    mockItems.mockResolvedValue(PICKER_ITEMS)
    poMocks.list.mockResolvedValue(TWO_PO_CACHE as never)
    renderPage()
    const toggle = await screen.findByRole('button', { name: 'Choose from 2 open POs' })
    toggle.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Tab}')
    const firstPo = screen.getByRole('button', { name: /PO-1043/ })
    expect(firstPo).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('button', { name: 'Change PO' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('')
  })

  it('Issue 1443 says when the branch has no open POs without blocking item search', async () => {
    renderPage()
    expect(await screen.findByText(/no open purchase orders/i)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /^On / })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toBeInTheDocument()
  })

  it('Issue 1443 keeps item search available while the open-PO read is loading', async () => {
    let resolveCache!: (cache: typeof EMPTY_PO_CACHE) => void
    poMocks.list.mockImplementation(() => new Promise<typeof EMPTY_PO_CACHE>(resolve => { resolveCache = resolve }) as never)
    renderPage()
    expect(await screen.findByText(/loading open purchase orders/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toBeInTheDocument()
    await act(async () => resolveCache(EMPTY_PO_CACHE))
    expect(await screen.findByText(/no open purchase orders/i)).toBeInTheDocument()
  })

  it('Issue 1443 explains when this branch has not synced open POs yet', async () => {
    poMocks.list.mockResolvedValue({ asOf: null, isCurrent: false, purchaseOrders: [] } as never)
    renderPage()
    expect(await screen.findByText(/have not synced for this branch yet/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toBeInTheDocument()
  })

  it('Issue 1443 identifies a stale PO cache and says on each order why it cannot be chosen', async () => {
    poMocks.list.mockResolvedValue({ ...TWO_PO_CACHE, asOf: '2026-10-05T02:10:00Z', isCurrent: false } as never)
    renderPage()
    expect(await screen.findByText(/open PO list is out of date/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose from 2 open POs' }))
    const card = screen.getByRole('listitem', { name: /PO-1043/ })
    expect(within(card).queryByRole('button')).toBeNull()
    expect(within(card).getByText(/can't be chosen: the PO list is out of date/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toBeInTheDocument()
  })

  it('Issue 1443 states the stale sync time in the app locale on the WIB clock', async () => {
    poMocks.list.mockResolvedValue({ ...TWO_PO_CACHE, asOf: '2026-10-05T02:10:00Z', isCurrent: false } as never)
    renderPage('id')
    expect(await screen.findByText(/terakhir disinkronkan 05 Okt 09:10\./)).toBeInTheDocument()
  })

  it('Issue 1443 reports an open-PO read error with retry while item search remains available', async () => {
    poMocks.list.mockRejectedValue(new Error('network'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load open purchase orders/i)
    expect(screen.getByRole('button', { name: /retry open PO list/i })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toBeInTheDocument()
  })

  it('Issue 1443 tells a member receiving at another location that no POs are offered here, with no retry', async () => {
    poMocks.list.mockRejectedValue(new Error('listCafeOpenPoIdentities failed: CAFE_OPEN_PO_FORBIDDEN'))
    renderPage()
    expect(await screen.findByText(/open POs show only for your own branch/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: /retry open PO list/i })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toBeInTheDocument()
  })

  it('Issue 1443 names a single open PO in the singular', async () => {
    poMocks.list.mockResolvedValue({ ...TWO_PO_CACHE, purchaseOrders: TWO_PO_CACHE.purchaseOrders.slice(0, 1) } as never)
    renderPage()
    expect(await screen.findByRole('button', { name: 'Choose from 1 open PO' })).toBeInTheDocument()
  })

  it('Issue 1443 Escape closes the open PO list and returns focus to its toggle', async () => {
    poMocks.list.mockResolvedValue(TWO_PO_CACHE as never)
    renderPage()
    const toggle = await screen.findByRole('button', { name: 'Choose from 2 open POs' })
    await userEvent.click(toggle)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /PO-1043/ })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveFocus()
  })

  it('Issue 1443 a long PO card names its first items and counts the rest', async () => {
    mockItems.mockResolvedValue(LONG_PO_ITEMS)
    poMocks.list.mockResolvedValue(LONG_PO_CACHE as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Choose from 1 open PO/ }))
    const card = screen.getByRole('listitem', { name: /PO-2001/ })
    expect(within(card).getByText('Long PO item 01')).toBeInTheDocument()
    expect(within(card).queryByText('Long PO item 04')).toBeNull()
    expect(within(card).getByText('+11 more')).toBeInTheDocument()
  })

  it('Issue 1443 a search after picking a PO longer than a screen shows its matches first', async () => {
    mockItems.mockResolvedValue(LONG_PO_ITEMS)
    poMocks.list.mockResolvedValue(LONG_PO_CACHE as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Choose from 1 open PO/ }))
    fireEvent.click(screen.getByRole('button', { name: /PO-2001/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an item' }), { target: { value: 'lemon' } })
    expect(screen.getAllByRole('textbox', { name: /^Received for / }).map(box => box.getAttribute('aria-label')))
      .toEqual(['Received for Lemon lokal'])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an item' }), { target: { value: 'item 1' } })
    expect(within(screen.getByRole('region', { name: 'On PO-2001' })).getAllByRole('textbox').map(box => box.getAttribute('aria-label')))
      .toEqual(['Received for Long PO item 10', 'Received for Long PO item 11', 'Received for Long PO item 12', 'Received for Long PO item 13', 'Received for Long PO item 14'])
  })

  it('Issue 1518 a picked PO keeps the row unit and names its different purchase unit', async () => {
    poMocks.list.mockResolvedValue({
      ...TWO_PO_CACHE,
      purchaseOrders: [{
        ...TWO_PO_CACHE.purchaseOrders[0],
        items: [{ itemUnitId: 'unit-bag', itemName: 'Coffee bean', unitName: 'bag 1 kg' }],
      }],
    } as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose from 1 open PO' }))
    fireEvent.click(screen.getByRole('button', { name: /PO-1043/ }))

    const bean = screen.getByRole('group', { name: /Coffee bean/ })
    expect(within(bean).getByText('PO lists: bag 1 kg')).toBeInTheDocument()
    expect(bean.querySelector('.cafe-count__unit')).toHaveTextContent('kg')
    expect(within(screen.getByRole('group', { name: /Fresh milk/ })).queryByText(/PO lists:/)).toBeNull()
  })

  it('Issue 1443 a picked PO shows its number, supplier and date over its own rows, apart from the other items', async () => {
    mockItems.mockResolvedValue(PICKER_ITEMS)
    poMocks.list.mockResolvedValue(TWO_PO_CACHE as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose from 2 open POs' }))
    fireEvent.click(screen.getByRole('button', { name: /PO-1043/ }))
    const picked = screen.getByRole('group', { name: /^On PO-1043/ })
    expect(picked).toHaveTextContent('Sample produce supplier')
    expect(picked).toHaveTextContent('Sun 4 Oct')
    const onPo = screen.getByRole('region', { name: 'On PO-1043' })
    expect(within(onPo).getAllByRole('textbox').map(box => box.getAttribute('aria-label')))
      .toEqual(['Received for Coffee bean', 'Received for Fresh milk'])
    expect(within(screen.getByRole('region', { name: 'Not on this PO' })).getAllByRole('textbox').map(box => box.getAttribute('aria-label')))
      .toEqual(['Received for Whole-grain pastry dough prepared for morning service'])
  })

  it('Issue 1443 Receive without a PO drops the pick and keeps typed counts', async () => {
    mockItems.mockResolvedValue(PICKER_ITEMS)
    poMocks.list.mockResolvedValue(TWO_PO_CACHE as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose from 2 open POs' }))
    fireEvent.click(screen.getByRole('button', { name: /PO-1043/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Receive without a PO' }))
    expect(screen.queryByRole('group', { name: /^On PO-1043/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'On PO-1043' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Choose from 2 open POs' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Received for Fresh milk' })).toHaveValue('4')
  })

  it('Issue 1518 says PO lines with a missing item or stream unit are not receivable here', async () => {
    mockItems.mockResolvedValue(PICKER_ITEMS)
    poMocks.list.mockResolvedValue({
      ...TWO_PO_CACHE,
      purchaseOrders: [{
        ...TWO_PO_CACHE.purchaseOrders[0],
        items: [
          ...TWO_PO_CACHE.purchaseOrders[0].items,
          { itemUnitId: null, itemName: 'Vanilla syrup 700 ml', unitName: 'bottle' },
          { itemUnitId: 'unit-elsewhere', itemName: 'Paper straws', unitName: 'pack' },
        ],
      }],
    } as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Choose from 1 open PO/ }))
    fireEvent.click(screen.getByRole('button', { name: /PO-1043/ }))
    expect(screen.getByRole('group', { name: /^On PO-1043/ })).toHaveTextContent('Not receivable here: Vanilla syrup 700 ml, Paper straws')
  })

  it('Issue 1518 remembers each branch’s picked PO when switching away and back', async () => {
    const otherBranch = { id: 'branch-2', code: 'other-cafe', name: 'Second Cafe Branch' }
    const otherKitchen = { branch: otherBranch, activity: 'kitchen' as const }
    const otherPo = { ...TWO_PO_CACHE.purchaseOrders[0], poNumber: 'PO-2043' }
    streamMocks.catalog.branches = [streamMocks.branch, otherBranch]
    streamMocks.catalog.options = [streamMocks.kitchen, streamMocks.bar, otherKitchen]
    poMocks.list.mockImplementation(branchId => Promise.resolve({
      ...TWO_PO_CACHE,
      purchaseOrders: [branchId === 'branch-1' ? TWO_PO_CACHE.purchaseOrders[0] : otherPo],
    }) as never)
    const view = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Choose from 1 open PO' }))
    fireEvent.click(screen.getByRole('button', { name: /PO-1043/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Switch kitchen' }))
    fireEvent.click(screen.getByRole('option', { name: /Second Cafe Branch · Kitchen/ }))
    await waitFor(() => expect(streamMocks.setStream).toHaveBeenCalledWith(otherKitchen))
    streamMocks.catalog.stream = otherKitchen
    streamMocks.catalog.branchId = otherBranch.id
    view.rerender(<MemoryRouter initialEntries={['/cafe/receive']}><I18nProvider><CafeReceivePage /></I18nProvider></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Choose from 1 open PO' }))
    fireEvent.click(screen.getByRole('button', { name: /PO-2043/ }))

    fireEvent.click(screen.getByRole('button', { name: /Back to/ }))
    streamMocks.catalog.stream = streamMocks.kitchen
    streamMocks.catalog.branchId = streamMocks.branch.id
    view.rerender(<MemoryRouter initialEntries={['/cafe/receive']}><I18nProvider><CafeReceivePage /></I18nProvider></MemoryRouter>)

    expect(await screen.findByRole('group', { name: /^On PO-1043/ })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /^On PO-2043/ })).toBeNull()
  })

  it('FR-1007 picking a PO changes no unit and starts no draft', async () => {
    poMocks.list.mockResolvedValue({
      ...TWO_PO_CACHE,
      purchaseOrders: [{ ...TWO_PO_CACHE.purchaseOrders[0], items: [{ itemUnitId: 'unit-bag', itemName: 'Coffee bean', unitName: 'bag' }] }],
    } as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /^Choose from 1 open PO/ }))
    fireEvent.click(screen.getByRole('button', { name: /PO-1043/ }))
    const bean = screen.getByRole('textbox', { name: 'Received for Coffee bean' })
    expect(bean.closest('.cafe-count__quantity-control')).toHaveTextContent('kg')
    expect(bean.closest('.cafe-capture-row')).toHaveTextContent('PO lists: bag')
    expect(screen.queryByRole('button', { name: 'Discard draft' })).toBeNull()
    expect(Object.keys(localStorage).filter(key => key.includes('receive'))).toEqual([])
  })

  it('FR-1013 a receiver can mark a line damaged or wrong before locking its count', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [receiptLine({ conditions: ['damaged_wrong'] })]))
    renderPage()
    const bean = await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    fireEvent.change(bean, { target: { value: '2,5' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Damaged or wrong for Coffee bean' }))

    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0][3]).toEqual([
      { item_unit_id: 'unit-kg', quantity: '2.5', damaged_wrong: true },
    ])
  })

  it('AC-1011 Send refuses a damaged line until its named reason and private photo are present', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [receiptLine({ conditions: ['damaged_wrong'] })]))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Damaged or wrong for Coffee bean' }))
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Send for review' }))

    const evidenceError = await screen.findByRole('alert')
    expect(evidenceError).toHaveTextContent(/reason.*photo.*Coffee bean/i)
    expect(evidenceError).toHaveFocus()
    expect(mockSend).not.toHaveBeenCalled()

    mockSaveExplanation.mockResolvedValue({ conditions: ['damaged_wrong'], condition_reason: 'The outer seal is torn', condition_updated_at: '2026-10-06T03:00:00Z' })
    mockUploadReceiptPhoto.mockResolvedValue({
      lineId: 'line-1', path: 'org-1/receipt-1/line-1/photo.jpg', url: 'https://private.test/photo',
    })
    mockSend.mockResolvedValue({ status: 'Submitted', row_version: 2 })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:receipt-photo') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for Coffee bean' }), { target: { value: 'The outer seal is torn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save explanation' }))
    await screen.findByText('Explanation saved.')
    const photo = new File(['image'], 'outer-seal.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Add a photo for Coffee bean'), { target: { files: [photo] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Upload photos' }))
    await screen.findByText('Private upload complete')
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('receipt-1', 1, ''))
    expect(mockSaveExplanation).toHaveBeenCalledWith('line-1', true, 'The outer seal is torn')
    expect(await screen.findByRole('heading', { name: 'Sent for review' })).toBeInTheDocument()
  })

  it('AC-1011 a condition can also be added after Count, where Send still names missing evidence', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [receiptLine()]))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
    await screen.findByRole('heading', { name: 'Counts locked' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Damaged or wrong for Coffee bean' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/reason.*photo.*Coffee bean/i)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('AC-1011 focuses the first invalid line when several lines need evidence', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [
      receiptLine({ conditions: ['damaged_wrong'] }),
      receiptLine({ id: 'line-2', item_name: 'Fresh milk', item_category: 'Dairy', unit_name: 'l', received_quantity: '12', conditions: ['damaged_wrong'] }),
    ]))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
    await screen.findByRole('heading', { name: 'Counts locked' })
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))

    const errors = await screen.findAllByRole('alert')
    expect(errors).toHaveLength(2)
    expect(errors[0]).toHaveFocus()
    expect(errors[0]).toHaveTextContent(/Coffee bean/i)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('AC-1005 changing unit keeps the chosen product detail and the typed quantity unconverted', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [receiptLine({ unit_name: 'bag' })]))
    renderPage()
    const bean = await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    expect(within(screen.getByRole('group', { name: /Fresh milk/ })).queryByRole('button', { name: 'Change unit' })).toBeNull()
    fireEvent.change(bean, { target: { value: '2,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change unit' }))
    fireEvent.click(screen.getByRole('radio', { name: 'bag' }))

    expect(bean).toHaveValue('2,5')
    expect(bean.parentElement).toHaveTextContent('bag')
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0]).toEqual([
      streamMocks.kitchen, '2026-10-06', 'receipt-key-1', [{ item_unit_id: 'unit-bag', quantity: '2.5', damaged_wrong: false }],
    ])
  })

  it('FR-1011 Count submit locks the quantities, then the receiver sends with a delivery-note number', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [receiptLine({
      item_name: 'Fresh milk', item_category: 'Dairy', unit_name: 'l', received_quantity: '12',
    })]))
    mockSend.mockResolvedValue({ status: 'Submitted', row_version: 2 })
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    expect(screen.getByText('1 line')).toBeInTheDocument()
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))

    const locked = await screen.findByRole('heading', { name: 'Counts locked' })
    await waitFor(() => expect(locked).toHaveFocus())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Received for Fresh milk' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Delivery-note number (optional)' }), { target: { value: 'DN-7' } })
    const send = screen.getByRole('button', { name: 'Send for review' })
    send.focus()
    fireEvent.click(send)
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('receipt-1', 1, 'DN-7'))
    expect(mockSaveExplanation).not.toHaveBeenCalled()
    const sent = await screen.findByRole('heading', { name: 'Sent for review' })
    await waitFor(() => expect(sent).toHaveFocus())
  })

  it('FR-1011 an uncertain Count submit stays in the confirm step and retries with the same idempotency key', async () => {
    mockSubmit.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(submitResult('r', [receiptLine({
      item_name: 'Fresh milk', item_category: 'Dairy', unit_name: 'l', received_quantity: '3',
    })], 'existing'))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '3' } })
    const step = await openLockStep()
    const lock = within(step).getByRole('button', { name: 'Lock counts' })
    fireEvent.click(lock)

    expect(await within(step).findByRole('alert')).toHaveTextContent('could not be submitted')
    expect(screen.getByRole('dialog')).toBe(step)
    await waitFor(() => expect(lock).not.toHaveAttribute('aria-disabled'))
    fireEvent.click(lock)
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2))
    expect(mockSubmit.mock.calls[1][2]).toBe(mockSubmit.mock.calls[0][2])
    expect(await screen.findByRole('heading', { name: 'Counts locked' })).toBeInTheDocument()
  })

  it('issue 1422: an invalid typed quantity blocks Count submit and says why in the send bar', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: 'abc' } })
    const submit = screen.getByRole('button', { name: 'Lock counts' })

    expect(submit).toBeDisabled()
    expect(within(submit.closest('.cafe-count__footer') as HTMLElement).getByText('Fix 1 quantity to continue')).toBeInTheDocument()
    fireEvent.click(submit)
    expect(mockSubmit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '1' } })
    expect(submit).toBeEnabled()
  })

  it('issue 1437: Lock counts opens a confirm step listing every line and submits nothing yet', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2,5' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    const step = await openLockStep()

    expect(step).toHaveAccessibleName('Lock 2 lines?')
    expect(within(step).getAllByRole('listitem').map(line => line.textContent)).toEqual([
      'Coffee bean2.5 × kg',
      'Fresh milk12 × l',
    ])
    expect(within(step).getAllByText(/cannot change after locking/)).toHaveLength(1)
    expect(within(step).getByRole('button', { name: 'Back to edit' })).toHaveFocus()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('issue 1437: Back to edit closes the step with every entry intact and focus on Lock counts', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2,5' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    const pageLock = screen.getByRole('button', { name: 'Lock counts' })
    const step = await openLockStep()

    fireEvent.click(within(step).getByRole('button', { name: 'Back to edit' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('2,5')
    expect(screen.getByRole('textbox', { name: 'Received for Fresh milk' })).toHaveValue('12')
    expect(pageLock).toHaveFocus()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('issue 1437: confirming locks every listed line in one submit', async () => {
    let settle: (value: CafeReceiptSubmitResult) => void = () => {}
    mockSubmit.mockReturnValue(new Promise(resolve => { settle = resolve }))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2,5' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    const lock = within(await openLockStep()).getByRole('button', { name: 'Lock counts' })

    fireEvent.click(lock)
    fireEvent.click(lock)
    settle(submitResult('receipt-1', [
      receiptLine(),
      receiptLine({ id: 'line-2', item_name: 'Fresh milk', item_category: 'Dairy', unit_name: 'l', received_quantity: '12' }),
    ]))

    expect(await screen.findByRole('heading', { name: 'Counts locked' })).toBeInTheDocument()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit.mock.calls[0][3]).toEqual([
      { item_unit_id: 'unit-kg', quantity: '2.5', damaged_wrong: false },
      { item_unit_id: 'unit-l', quantity: '12', damaged_wrong: false },
    ])
  })

  it('issue 1437: Tab while locking stays inside the confirm step', async () => {
    const user = userEvent.setup()
    mockSubmit.mockReturnValue(new Promise(() => {}))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    const step = await openLockStep()
    const lock = within(step).getByRole('button', { name: 'Lock counts' })
    lock.focus()
    fireEvent.click(lock)
    await within(step).findByRole('button', { name: 'Locking…' })

    await user.tab()
    expect(step.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(step.contains(document.activeElement)).toBe(true)
  })

  it('issue 1437: a key conflict in the confirm step points back to the page and offers no futile retry', async () => {
    mockSubmit.mockRejectedValueOnce(new Error('submitCafeReceipt failed: CAFE_RECEIPT_CLIENT_KEY_CONFLICT'))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    const step = await openLockStep()
    fireEvent.click(within(step).getByRole('button', { name: 'Lock counts' }))

    expect(await within(step).findByRole('alert')).toHaveTextContent('Go back to edit and check Your recent receipts.')
    expect(within(step).queryByRole('button', { name: 'Lock counts' })).toBeNull()
    expect(within(step).getByRole('button', { name: 'Back to edit' })).toHaveFocus()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it('issue 1437: going offline in the confirm step says so there and blocks Lock counts', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    const step = await openLockStep()

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    act(() => { window.dispatchEvent(new Event('offline')) })

    expect(within(step).getByRole('alert')).toHaveTextContent('Reconnect to send this receipt.')
    expect(within(step).getByRole('button', { name: 'Lock counts' })).toBeDisabled()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('FR-1004 a shift member may choose today or yesterday; an ops lead may backdate further', async () => {
    const { unmount } = renderPage()
    await screen.findByLabelText('Arrival date')
    expect(screen.getByLabelText('Open calendar')).toHaveAttribute('min', '2026-10-05')
    expect(screen.getByLabelText('Open calendar')).toHaveAttribute('max', '2026-10-06')
    unmount()
    mockUseAuth.mockReturnValue(viewer(['member', 'ops_lead']))
    renderPage()
    await screen.findByLabelText('Arrival date')
    expect(screen.getByLabelText('Open calendar')).not.toHaveAttribute('min')
    expect(screen.getByLabelText('Open calendar')).toHaveAttribute('max', '2026-10-06')
  })

  it('keeps an invalid typed arrival date from enabling Lock counts', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '2' } })
    const date = screen.getByLabelText('Arrival date')
    fireEvent.change(date, { target: { value: '35/13/2026' } })
    fireEvent.blur(date)
    expect(screen.getByRole('button', { name: 'Lock counts' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('That date doesn\'t exist')
  })

  it('AC-1006 an offline draft survives reload and reconnect never submits it automatically', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const first = renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    expect(await screen.findByText(/Saved on this device, nothing sent\. Reconnect to lock counts\./)).toBeInTheDocument()
    expect(screen.getAllByText(/Saved on this device/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Lock counts' })).toBeDisabled()
    first.unmount()

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    mockSubmit.mockResolvedValue(submitResult('receipt-reconnected', [receiptLine()]))
    renderPage()
    const bean = await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    expect(bean).toHaveValue('2.5')
    expect(mockSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Lock counts' })).toBeEnabled()

    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
  })

  it('AC-1006 an explicit discard is confirmed and clears only the local draft', async () => {
    renderPage()
    const bean = await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    fireEvent.change(bean, { target: { value: '2.5' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Discard draft' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard this draft?' })
    expect(bean).toHaveValue('2.5')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep draft' }))
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('2.5')

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Discard this draft?' })).getByRole('button', { name: 'Discard draft' }))
    expect(await screen.findByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('')
    expect(localStorage.length).toBe(0)
    await waitFor(() => expect(screen.getByLabelText('Arrival date')).toHaveFocus())
  })

  it('AC-1005 a restored count whose unit is no longer offered stays blank and is named, never moved to another unit', async () => {
    const first = renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change unit' }))
    fireEvent.click(screen.getByRole('radio', { name: 'bag' }))
    first.unmount()

    mockItems.mockResolvedValue([{ ...ITEMS[0], units: [{ id: 'unit-kg', name: 'kg' }] }, ITEMS[1]])
    renderPage()

    expect(await screen.findByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('')
    expect(screen.getByText('Not restored, count it again: Coffee bean.')).toBeInTheDocument()
  })

  it('AC-1006 locking the counts clears their device draft, so the next delivery starts blank', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [receiptLine()]))
    mockSend.mockResolvedValue({ status: 'Submitted', row_version: 2 })
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
    await screen.findByRole('heading', { name: 'Counts locked' })
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Receive another delivery' }))

    expect(await screen.findByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('')
  })

  it('AC-1006 a successful Send clears each line’s waiting photos for this person and receipt', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [receiptLine(), receiptLine({ id: 'line-2', item_name: 'Fresh milk', unit_name: 'l' })]))
    mockSend.mockResolvedValue({ status: 'Submitted', row_version: 2 })
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
    await screen.findByRole('heading', { name: 'Counts locked' })
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))
    await screen.findByRole('heading', { name: 'Sent for review' })

    expect(vi.mocked(clearOfflinePhotoDraft).mock.calls.map(([key]) => key).sort()).toEqual([
      JSON.stringify(['person-1', 'receipt-1', 'line-1']),
      JSON.stringify(['person-1', 'receipt-1', 'line-2']),
    ])
  })

  it('AC-1006 continuing yesterday’s receipt leaves the capture on today’s date and today’s draft', async () => {
    const first = renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '5' } })
    first.unmount()
    vi.mocked(listCafeReceipts).mockResolvedValue([{
      id: 'receipt-old', branch_id: 'branch-1', activity: 'kitchen', arrival_date: '2026-10-05', delivery_note_number: null,
      status: 'Counted', posting_status: 'not_posted', posting_hold_reason: null, received_by: 'person-1',
      received_at: '2026-10-05T02:00:00Z', submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null,
      row_version: 1, lines: [receiptLine({ id: 'line-old' })],
    }])
    mockSend.mockResolvedValue({ status: 'Submitted', row_version: 2 })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue receipt' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send for review' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Receive another delivery' }))

    expect(await screen.findByLabelText('Arrival date')).toHaveValue('6 Oct 2026')
    expect(screen.getByRole('textbox', { name: 'Received for Fresh milk' })).toHaveValue('5')
  })

  it('AC-1006 keeps arrival-date drafts separate and restores each date when revisited', async () => {
    renderPage()
    const bean = await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    fireEvent.change(bean, { target: { value: '2.5' } })
    setArrivalDate('2026-10-05')
    const yesterdayBean = await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    expect(yesterdayBean).toHaveValue('')
    fireEvent.change(yesterdayBean, { target: { value: '1' } })

    setArrivalDate('2026-10-06')
    expect(await screen.findByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('2.5')
    setArrivalDate('2026-10-05')
    expect(await screen.findByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('1')
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('AC-1006 warns before switching streams and restores the saved draft only on its original stream', async () => {
    const view = renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Switch kitchen' }))
    fireEvent.click(screen.getByRole('option', { name: /Cafe Branch · Bar/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Switch streams?' })
    expect(within(dialog).getByText(/does not send it/)).toBeInTheDocument()
    expect(streamMocks.setStream).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft and switch' }))
    await waitFor(() => expect(streamMocks.setStream).toHaveBeenCalledWith(streamMocks.bar))

    streamMocks.catalog.stream = streamMocks.bar
    view.rerender(<MemoryRouter initialEntries={['/cafe/receive']}><I18nProvider><CafeReceivePage /></I18nProvider></MemoryRouter>)
    expect(await screen.findByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('')
    streamMocks.catalog.stream = streamMocks.kitchen
    view.rerender(<MemoryRouter initialEntries={['/cafe/receive']}><I18nProvider><CafeReceivePage /></I18nProvider></MemoryRouter>)
    expect(await screen.findByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('2.5')
    expect(mockSubmit).not.toHaveBeenCalled()
  })
})

describe('AC-1010 the difference after Lock counts', () => {
  const AS_OF = '2026-10-06T02:10:00Z'
  function difference(item_unit_id: string, outcome: 'over' | 'short' | 'matches' | 'no_open_po' | 'unknown') {
    return { receipt_id: 'receipt-1', line_id: `line-${item_unit_id}`, item_unit_id, outcome, cache_as_of: AS_OF }
  }

  async function lockBeanAndMilk() {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [
      receiptLine({ id: 'line-bean', item_unit_id: 'unit-kg', item_name: 'Coffee bean', received_quantity: '3' }),
      receiptLine({ id: 'line-milk', item_unit_id: 'unit-l', item_name: 'Fresh milk', unit_name: 'l', received_quantity: '5' }),
    ]))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '5' } })
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
    await screen.findByRole('heading', { name: 'Counts locked' })
  }

  function lockedLine(name: string) {
    return within(screen.getByRole('list', { name: 'Counted lines' })).getByText(name).closest('li') as HTMLElement
  }

  it('AC-1010 each line shows over or short against the summed outstanding, and Send stays available', async () => {
    mockDifferences.mockResolvedValue([difference('unit-kg', 'short'), difference('unit-l', 'over')])
    await lockBeanAndMilk()

    expect(await within(lockedLine('Coffee bean')).findByText('Short of the open PO')).toBeInTheDocument()
    expect(within(lockedLine('Fresh milk')).getByText('Over the open PO')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 lines differ from the branch’s open POs. The reviewer checks them.')
    expect(mockDifferences).toHaveBeenCalledWith(['receipt-1'])
    expect(screen.getByRole('button', { name: 'Send for review' })).toBeEnabled()
  })

  it('AC-1010 a line that matches says so, and a product with no open PO line says “No open PO”', async () => {
    mockDifferences.mockResolvedValue([difference('unit-kg', 'matches'), difference('unit-l', 'no_open_po')])
    await lockBeanAndMilk()

    expect(await within(lockedLine('Coffee bean')).findByText('Matches the open PO')).toBeInTheDocument()
    expect(within(lockedLine('Fresh milk')).getByText('No open PO')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 lines differ')
  })

  it('AC-1010 an empty or stale cache says the difference is not yet known and does not block Send', async () => {
    mockSend.mockResolvedValue({ status: 'Submitted', row_version: 2 })
    mockDifferences.mockResolvedValue([difference('unit-kg', 'unknown'), difference('unit-l', 'unknown')])
    await lockBeanAndMilk()

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('MOS can’t compare with the branch’s open POs right now. You can still send for review.'))
    expect(screen.queryByText(/open PO$/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('receipt-1', 1, ''))
    expect(await screen.findByRole('heading', { name: 'Sent for review' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('the reviewer sees the difference once it can')
    expect(screen.getByRole('status')).not.toHaveTextContent('You can still send')
  })

  it('NFR-1006 a failed read of the PO cache degrades to “not yet known”, never an error', async () => {
    mockDifferences.mockRejectedValue(new Error('network'))
    await lockBeanAndMilk()

    expect(await screen.findByText(/MOS can’t compare/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send for review' })).toBeEnabled()
  })
})

describe('one open Counted receipt per receiver per branch', () => {
  it('FR-1012 a second Lock counts while an earlier receipt is not sent says so inside the confirm step, then on the page', async () => {
    mockSubmit.mockRejectedValue(new Error('submitCafeReceipt failed: CAFE_RECEIPT_COUNTED_PENDING: send your locked receipt'))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '3' } })
    const step = await openLockStep()
    fireEvent.click(within(step).getByRole('button', { name: 'Lock counts' }))

    expect(await within(step).findByRole('alert')).toHaveTextContent(
      'Your earlier locked counts at this branch are not sent yet. Go back to edit, send them from Your recent receipts, then lock these.')
    expect(within(step).queryByRole('button', { name: 'Lock counts' })).toBeNull()
    expect(mockSubmit).toHaveBeenCalledTimes(1)

    fireEvent.click(within(step).getByRole('button', { name: 'Back to edit' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your earlier locked counts at this branch are not sent yet. Send them from Your recent receipts below, then lock these.')
    expect(screen.getByRole('textbox', { name: 'Received for Fresh milk' })).toHaveValue('3')
  })
})

function countedReceipt(lines: CafeReceiptLine[], overrides: Partial<CafeReceipt> = {}): CafeReceipt {
  return {
    id: 'receipt-1', branch_id: 'branch-1', activity: 'kitchen', arrival_date: '2026-10-06', delivery_note_number: null,
    status: 'Counted', posting_status: 'not_posted', posting_hold_reason: null, received_by: 'person-1',
    received_at: '2026-10-06T02:00:00Z', submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null,
    row_version: 1, lines, ...overrides,
  }
}

const SEAL_PHOTO = { lineId: 'line-1', path: 'org-1/receipt-1/line-1/photo.jpg', url: 'https://private.test/photo' }

/** Continue the listed Counted receipt and let its difference read settle. */
async function continueListed() {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue receipt' }))
  await waitFor(() => expect(screen.queryByText(/^Checking against the branch/)).toBeNull())
}

async function lockWith(lines: CafeReceiptLine[]) {
  mockSubmit.mockResolvedValue(submitResult('receipt-1', lines))
  renderPage()
  fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
  fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
  await screen.findByRole('heading', { name: 'Counts locked' })
}

describe('issue 1425 condition evidence', () => {
  beforeEach(() => localStorage.clear())

  it('AC-1011 the receiver types a whole reason without focus leaving the field', async () => {
    await lockWith([receiptLine({ conditions: ['damaged_wrong'] })])
    const reason = screen.getByRole('textbox', { name: 'Reason for Coffee bean' })

    await userEvent.setup().type(reason, 'Seal torn')

    expect(reason).toHaveValue('Seal torn')
    expect(reason).toHaveFocus()
  })

  it('FR-1016 a line saved as damaged and then unticked is saved clean before Send', async () => {
    await lockWith([receiptLine({ conditions: ['damaged_wrong'] })])
    mockSaveExplanation.mockResolvedValue({ conditions: [], condition_reason: null, condition_updated_at: '2026-10-06T03:00:00Z' })
    mockSend.mockResolvedValue({ status: 'Submitted', row_version: 2 })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Damaged or wrong for Coffee bean' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))

    expect(await screen.findByRole('heading', { name: 'Sent for review' })).toBeInTheDocument()
    expect(mockSaveExplanation).toHaveBeenCalledWith('line-1', false, '')
    expect(mockSaveExplanation.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0])
  })

  it('AC-1011 a Send the server refuses for one line marks that line by id, even beside another line of the same item', async () => {
    const KG = '00000000-0000-0000-0000-0000000000a1'
    const BAG = '00000000-0000-0000-0000-0000000000a2'
    await lockWith([
      receiptLine({ id: KG, conditions: ['damaged_wrong'], condition_reason: 'Seal torn', photos: [{ ...SEAL_PHOTO, lineId: KG }] }),
      receiptLine({ id: BAG, item_unit_id: 'unit-bag', unit_name: 'bag', received_quantity: '3', conditions: ['damaged_wrong'], condition_reason: 'Bag split', photos: [{ ...SEAL_PHOTO, lineId: BAG, path: 'p2' }] }),
    ])
    mockSend.mockRejectedValue(new Error(`sendCafeReceiptForReview failed: CAFE_RECEIPT_PHOTO_REQUIRED: line ${BAG}: Coffee bean`))

    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))

    const [kgLine, bagLine] = screen.getAllByRole('region', { name: 'Coffee bean' })
    expect(await within(bagLine).findByRole('alert')).toHaveTextContent('Add at least one private photo for Coffee bean before sending for review.')
    expect(within(bagLine).getAllByText(/at least one private photo/i)).toHaveLength(1)
    expect(within(kgLine).queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/is still missing its reason or private photo/)).toBeNull()
    expect(mockSaveExplanation).not.toHaveBeenCalled()
  })

  it('FR-1010 a reason saved on the server after the device draft started wins on reopen', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({ conditions: ['damaged_wrong'], condition_updated_at: '2026-10-06T02:00:00Z' })])])
    const first = renderPage()
    await continueListed()
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for Coffee bean' }), { target: { value: 'Typed on this phone' } })
    first.unmount()

    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({
      conditions: ['damaged_wrong'], condition_reason: 'Saved on the tablet', condition_updated_at: '2026-10-06T02:05:00Z',
    })])])
    renderPage()
    await continueListed()

    expect(screen.getByRole('textbox', { name: 'Reason for Coffee bean' })).toHaveValue('Saved on the tablet')
  })

  it('FR-1010 a draft for a receipt that was sent elsewhere is removed from the device', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({ conditions: ['damaged_wrong'] })])])
    const first = renderPage()
    await continueListed()
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for Coffee bean' }), { target: { value: 'Seal torn' } })
    first.unmount()
    expect(Object.keys(localStorage).filter(key => key.startsWith('mos.cafe.receiptExplanations.'))).toHaveLength(1)

    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({ conditions: ['damaged_wrong'] })], { status: 'Submitted' })])
    renderPage()
    await screen.findByRole('region', { name: 'Your recent receipts' })

    await waitFor(() => expect(Object.keys(localStorage).filter(key => key.startsWith('mos.cafe.receiptExplanations.'))).toEqual([]))
  })

  it('NFR-1006 on a receipt whose photos could not be read, a flagged line does not claim it has none', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({ conditions: ['damaged_wrong'] })], { photosUnavailable: true })])
    renderPage()
    await continueListed()

    const line = screen.getByRole('region', { name: 'Coffee bean' })
    expect(within(line).getByText('Photos unavailable')).toBeInTheDocument()
    expect(within(line).queryByText('No photo yet.')).toBeNull()
    expect(within(line).queryByText('Add at least one photo before sending.')).toBeNull()
  })

  it('NFR-1005 the photo control is named for its item but shows a short label', async () => {
    await lockWith([receiptLine({ conditions: ['damaged_wrong'] })])
    const line = screen.getByRole('region', { name: 'Coffee bean' })

    expect(within(line).getByLabelText('Add a photo for Coffee bean')).toHaveAttribute('type', 'file')
    expect(within(line).getByText('Add photo')).toBeInTheDocument()
    expect(within(line).queryByText('Add a photo for Coffee bean')).toBeNull()
  })

  it('FR-1010 a typed but unsaved reason survives a reload of the page', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({ conditions: ['damaged_wrong'] })])])
    const first = renderPage()
    await continueListed()
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for Coffee bean' }), { target: { value: 'Seal torn' } })
    first.unmount()

    renderPage()
    await continueListed()

    expect(screen.getByRole('textbox', { name: 'Reason for Coffee bean' })).toHaveValue('Seal torn')
    expect(screen.getByRole('button', { name: 'Save explanation' })).toBeInTheDocument()
  })

  it('FR-1010 a saved reason clears its device copy, so the server value shows after a reload', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({ conditions: ['damaged_wrong'] })])])
    mockSaveExplanation.mockResolvedValue({ conditions: ['damaged_wrong'], condition_reason: 'Seal torn', condition_updated_at: '2026-10-06T03:00:00Z' })
    const first = renderPage()
    await continueListed()
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for Coffee bean' }), { target: { value: 'Seal torn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save explanation' }))
    await screen.findByText('Explanation saved.')
    first.unmount()

    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({ conditions: ['damaged_wrong'], condition_reason: 'Box dented' })])])
    renderPage()
    await continueListed()

    expect(screen.getByRole('textbox', { name: 'Reason for Coffee bean' })).toHaveValue('Box dented')
  })

  it('NFR-1006 a receipt whose photos could not be read says so and can still be continued', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([countedReceipt([receiptLine({ conditions: ['damaged_wrong'] })], { photosUnavailable: true })])
    renderPage()

    const recent = await screen.findByRole('region', { name: 'Your recent receipts' })
    expect(within(recent).getByText('Photos unavailable')).toBeInTheDocument()
    fireEvent.click(within(recent).getByRole('button', { name: 'Continue receipt' }))
    expect(await screen.findByRole('heading', { name: 'Counts locked' })).toBeInTheDocument()
  })

  it('DESIGN compact capture row: the damage flag appears only once its row has a quantity', async () => {
    renderPage()
    const bean = await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    expect(screen.queryByRole('checkbox', { name: /^Damaged or wrong for/ })).toBeNull()

    fireEvent.change(bean, { target: { value: '2' } })

    expect(screen.getByRole('checkbox', { name: 'Damaged or wrong for Coffee bean' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Damaged or wrong for Fresh milk' })).toBeNull()
  })

  it('the counted step explains flagging once, not under every line', async () => {
    mockSubmit.mockResolvedValue(submitResult('receipt-1', [
      receiptLine(),
      receiptLine({ id: 'line-2', item_name: 'Fresh milk', unit_name: 'l', received_quantity: '12' }),
    ]))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Coffee bean' }), { target: { value: '2.5' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    fireEvent.click(within(await openLockStep()).getByRole('button', { name: 'Lock counts' }))
    await screen.findByRole('heading', { name: 'Counts locked' })

    expect(screen.getAllByText(/Flag a line when accepted goods were damaged or incorrect/)).toHaveLength(1)
  })
})

describe('AC-1038 receiving copy says ESB, never ERP', () => {
  it('AC-1038 every Receive, review and issues string in English and Indonesian avoids “ERP” and names ESB', () => {
    for (const locale of ['en', 'id'] as const) {
      const catalog = messages[locale] as Record<string, string>
      const receiving = Object.entries(catalog).filter(([key]) =>
        key === 'nav.cafe.receive' || key.startsWith('cafe.receive.') || key.startsWith('cafe.receipts.'))
      expect(receiving.length).toBeGreaterThan(40)
      expect(receiving.filter(([, value]) => /\bERP\b/i.test(value))).toEqual([])
      expect(receiving.some(([, value]) => value.includes('ESB'))).toBe(true)
    }
  })
})
