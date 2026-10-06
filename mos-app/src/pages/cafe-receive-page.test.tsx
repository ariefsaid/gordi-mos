import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
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
  return {
    ...actual,
    newCafeReceiptClientKey: () => `receipt-key-${++keyMocks.key}`,
    listCafeReceivableItems: vi.fn(),
    listCafeReceipts: vi.fn(),
    submitCafeReceipt: vi.fn(),
    sendCafeReceiptForReview: vi.fn(),
  }
})

import { useAuth } from '@/auth/use-auth'
import { messages } from '@/i18n/messages'
import {
  listCafeReceipts,
  listCafeReceivableItems,
  sendCafeReceiptForReview,
  submitCafeReceipt,
  type CafeReceivableItem,
} from '@/lib/db/cafe-receipts'
import { CafeReceivePage } from './cafe-receive-page'

const mockUseAuth = vi.mocked(useAuth)
const mockItems = vi.mocked(listCafeReceivableItems)
const mockSubmit = vi.mocked(submitCafeReceipt)
const mockSend = vi.mocked(sendCafeReceiptForReview)

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
const ITEMS: CafeReceivableItem[] = [
  {
    id: 'bean', name: 'Coffee bean', category: 'Bar', kind: 'RAW', defaultUnitId: 'unit-kg',
    units: [{ id: 'unit-kg', name: 'kg' }, { id: 'unit-bag', name: 'bag' }],
  },
  { id: 'milk', name: 'Fresh milk', category: 'Dairy', kind: 'RAW', defaultUnitId: 'unit-l', units: [{ id: 'unit-l', name: 'l' }] },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cafe/receive']}>
      <I18nProvider><CafeReceivePage /></I18nProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  keyMocks.key = 0
  streamMocks.catalog.stream = streamMocks.kitchen
  streamMocks.catalog.homeStream = streamMocks.kitchen
  mockUseAuth.mockReturnValue(viewer(['member']))
  mockItems.mockResolvedValue(ITEMS)
  vi.mocked(listCafeReceipts).mockResolvedValue([])
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('CafeReceivePage', () => {
  it('AC-1001 opens on the person’s own stream with every other stream selectable', async () => {
    renderPage()
    await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    expect(mockItems).toHaveBeenCalledWith(streamMocks.kitchen)
    fireEvent.click(screen.getByRole('button', { name: /^change stream$/i }))
    expect(screen.getByRole('option', { name: /Cafe Branch · Bar/ })).toBeInTheDocument()
  })

  it('AC-1001 asks for an explicit stream choice when the person has no stream Team', async () => {
    streamMocks.catalog.stream = null
    streamMocks.catalog.homeStream = null
    renderPage()
    expect(await screen.findByText('Choose the Café stream receiving this delivery.')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: /stream/i })).getAllByRole('button')[0])
    expect(streamMocks.setStream).toHaveBeenCalledTimes(1)
    expect(mockItems).not.toHaveBeenCalled()
  })

  it('AC-1003 searching “bean” shows matching items with no PO, ordered, outstanding, price or location control', async () => {
    const { container } = renderPage()
    await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bean' } })

    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toHaveValue('')
    expect(screen.queryByRole('textbox', { name: 'Received for Fresh milk' })).toBeNull()
    const page = container.textContent?.toLowerCase() ?? ''
    for (const word of ['purchase order', 'po number', 'ordered', 'outstanding', 'price', 'location']) {
      expect(page).not.toContain(word)
    }
    expect(screen.getAllByRole('textbox').map(box => box.getAttribute('aria-label')))
      .toEqual(['Received for Coffee bean'])
    expect(screen.getByRole('textbox', { name: 'Received for Coffee bean' })).toHaveAttribute('inputmode', 'decimal')
  })

  it('AC-1005 changing unit keeps the chosen product detail and the typed quantity unconverted', async () => {
    mockSubmit.mockResolvedValue({ receipt_id: 'receipt-1', outcome: 'created', row_version: 1 })
    renderPage()
    const bean = await screen.findByRole('textbox', { name: 'Received for Coffee bean' })
    expect(within(screen.getAllByRole('listitem')[1]).queryByRole('button', { name: 'Change unit' })).toBeNull()
    fireEvent.change(bean, { target: { value: '2,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change unit' }))
    fireEvent.click(screen.getByRole('radio', { name: 'bag' }))

    expect(bean).toHaveValue('2,5')
    expect(bean.parentElement).toHaveTextContent('bag')
    fireEvent.click(screen.getByRole('button', { name: 'Count submit' }))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0]).toEqual([
      streamMocks.kitchen, '2026-10-06', 'receipt-key-1', [{ item_unit_id: 'unit-bag', quantity: '2.5' }],
    ])
  })

  it('FR-1011 Count submit locks the quantities, then the receiver sends with a delivery-note number', async () => {
    mockSubmit.mockResolvedValue({ receipt_id: 'receipt-1', outcome: 'created', row_version: 1 })
    mockSend.mockResolvedValue({ status: 'Submitted', row_version: 2 })
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '12' } })
    expect(screen.getByText('1 line')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Count submit' }))

    expect(await screen.findByRole('heading', { name: 'Counted · quantities locked' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Received for Fresh milk' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Delivery-note number (optional)' }), { target: { value: 'DN-7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }))
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('receipt-1', 1, 'DN-7'))
    expect(await screen.findByRole('heading', { name: 'Sent for review' })).toBeInTheDocument()
  })

  it('FR-1011 an uncertain Count submit retries with the same idempotency key', async () => {
    mockSubmit.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ receipt_id: 'r', outcome: 'existing', row_version: 1 })
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Received for Fresh milk' }), { target: { value: '3' } })
    const submit = screen.getByRole('button', { name: 'Count submit' })
    fireEvent.click(submit)
    expect(await screen.findByText(/could not be submitted/)).toBeInTheDocument()
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2))
    expect(mockSubmit.mock.calls[1][2]).toBe(mockSubmit.mock.calls[0][2])
  })

  it('FR-1004 a shift member may choose today or yesterday; an ops lead may backdate further', async () => {
    const { unmount } = renderPage()
    const date = await screen.findByLabelText('Arrival date')
    expect(date).toHaveAttribute('min', '2026-10-05')
    expect(date).toHaveAttribute('max', '2026-10-06')
    unmount()
    mockUseAuth.mockReturnValue(viewer(['member', 'ops_lead']))
    renderPage()
    const leadDate = await screen.findByLabelText('Arrival date')
    expect(leadDate).not.toHaveAttribute('min')
    expect(leadDate).toHaveAttribute('max', '2026-10-06')
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
