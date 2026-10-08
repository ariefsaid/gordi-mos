import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CafeReceipt } from '@/lib/db/cafe-receipts'
import {
  canManageCafeReceiptIssues,
  closeCafeReceiptIssue,
  linkCafeReceiptIssue,
  listCafeReceiptIssueOpenPos,
  listCafeReceiptIssues,
  resolveCafeReceiptHaltedGroup,
  type CafeReceiptHaltedGroup,
  type CafeReceiptHeldPortion,
  type CafeReceiptIssue,
} from '@/lib/db/cafe-receipt-issues'
import { CafeReceiptIssuesQueue } from './cafe-receipt-issues-queue'

vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: vi.fn(() => false) }))
vi.mock('@/lib/db/directory', () => ({
  getPeople: vi.fn(async () => [{ id: 'receiver-1', full_name: 'Ayu Kusumawardhani Pratiwi' }, { id: 'buyer-1', full_name: 'Dimas Prasetyo' }]),
}))
vi.mock('@/lib/db/branches', () => ({
  listActiveBranches: vi.fn(async () => [{ id: 'branch-1', code: 'hq', name: 'Gordi HQ Kemang' }]),
}))
vi.mock('@/lib/db/cafe-receipt-issues', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/cafe-receipt-issues')>()),
  canManageCafeReceiptIssues: vi.fn(),
  closeCafeReceiptIssue: vi.fn(),
  linkCafeReceiptIssue: vi.fn(),
  resolveCafeReceiptHaltedGroup: vi.fn(),
  listCafeReceiptIssues: vi.fn(),
  listCafeReceiptIssueOpenPos: vi.fn(),
  requestCafeReceiptIssuePoRefresh: vi.fn(),
}))

const mockCanManage = vi.mocked(canManageCafeReceiptIssues)
const mockClose = vi.mocked(closeCafeReceiptIssue)
const mockLink = vi.mocked(linkCafeReceiptIssue)
const mockList = vi.mocked(listCafeReceiptIssues)
const mockOpenPos = vi.mocked(listCafeReceiptIssueOpenPos)
const mockResolveHalted = vi.mocked(resolveCafeReceiptHaltedGroup)

const LINE = {
  id: 'line-1', item_unit_id: 'unit-1', item_name: 'Susu UHT full cream 1 L karton isi 12', item_category: 'Dairy',
  unit_name: 'karton', received_quantity: '6', conditions: ['damaged_wrong' as const], condition_reason: 'Two cartons dented',
  condition_updated_at: '2026-10-06T02:00:00Z',
  photos: [{ lineId: 'line-1', path: 'org/receipt-1/line-1/photo.jpg', url: 'https://private.test/photo.jpg' }],
}
const RECEIPT = {
  id: 'receipt-1', branch_id: 'branch-1', activity: 'kitchen', arrival_date: '2026-10-05', delivery_note_number: null,
  status: 'Approved', posting_status: 'not_posted', posting_hold_reason: null, received_by: 'receiver-1',
  received_at: '2026-10-05T02:00:00Z', submitted_at: null, reviewed_by: null, reviewed_at: null, review_note: null,
  row_version: 3, lines: [LINE], posting: null,
} as unknown as CafeReceipt
const OVER: CafeReceiptIssue = {
  id: 'issue-over', kind: 'over', quantity: '2', status: 'open', created_at: '2026-10-05T03:00:00Z',
  linked_po_number: null, reopened_po_number: null, parts: [], closed_note: null, resolved_by: null, resolved_at: null,
  receipt: RECEIPT, line: LINE,
}
const DAMAGED: CafeReceiptIssue = { ...OVER, id: 'issue-damaged', kind: 'damaged_wrong', quantity: '6' }

const HALTED: CafeReceiptHaltedGroup = {
  group_id: 'group-halted', po_number: 'PO-2610-0042', mos_key: 'MOS-RECEIPT-0001-GROUP-0001', receipt: RECEIPT,
}

const HELD: CafeReceiptHeldPortion = {
  id: 'portion-held', quantity: '4', created_at: '2026-10-05T04:00:00Z',
  receipt: RECEIPT, line: { ...LINE, id: 'line-2', item_name: 'Gula Aren Cair Organik 750 ml', unit_name: 'botol', conditions: [], condition_reason: null, photos: [] },
}

let serverIssues: CafeReceiptIssue[]
let serverHeld: CafeReceiptHeldPortion[]
let serverHalted: CafeReceiptHaltedGroup[]
let resolvedTotal: number

function renderQueue() {
  return render(<I18nProvider><CafeReceiptIssuesQueue /></I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  serverIssues = [OVER, DAMAGED]
  serverHeld = []
  serverHalted = []
  resolvedTotal = 0
  mockList.mockImplementation(async () => ({
    issues: serverIssues, held: serverHeld, haltedGroups: serverHalted,
    resolvedTotal: Math.max(resolvedTotal, serverIssues.filter(issue => issue.status !== 'open').length),
  }))
  mockCanManage.mockResolvedValue(true)
  mockResolveHalted.mockImplementation(async groupId => { serverHalted = serverHalted.filter(group => group.group_id !== groupId) })
  mockOpenPos.mockResolvedValue({
    options: [
      { po_number: 'PO-2610-0042', supplier_name: 'PT Sumber Susu Nusantara', po_date: '2026-10-05', available: '4', date_eligible: true, created_after_delivery: true },
      { po_number: 'PO-2610-0051', supplier_name: null, po_date: '2026-10-06', available: '6', date_eligible: false, created_after_delivery: true },
      { po_number: 'PO-2610-0038', supplier_name: null, po_date: '2026-10-01', available: '0', date_eligible: true, created_after_delivery: false },
    ],
    cache_as_of: '2026-10-06T01:00:00Z', is_current: true, refresh_requested_at: null,
  })
})

describe('Receipt issues', () => {
  it('AC-1031 each issue shows kind, item, quantity, reason, photo, receiver, arrival and age; the badge counts open blocking issues; state is text', async () => {
    renderQueue()
    const row = (await screen.findByText('Over-delivery')).closest('li')!
    expect(within(row).getByText(LINE.item_name)).toBeInTheDocument()
    expect(within(row).getByText('2 × karton')).toBeInTheDocument()
    expect(within(row).getByText(/More arrived than the open POs still had \(6 × karton received\)/)).toBeInTheDocument()
    expect(within(row).getByText('Two cartons dented')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Open photo 1 of 1' })).toBeInTheDocument()
    expect(within(row).getByText(/Received by Ayu Kusumawardhani Pratiwi/)).toBeInTheDocument()
    expect(within(row).getByText('Gordi HQ Kemang')).toBeInTheDocument()
    expect(within(row).getByText(/Arrived/)).toBeInTheDocument()
    expect(within(row).getByText(/raised \d+d ago/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Needs action/ })).toHaveTextContent('1')
    expect(screen.getByRole('tab', { name: /Follow-up/ })).toHaveTextContent('1')
    expect(screen.queryByText(/The receiver marked it damaged or wrong/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Follow-up/ }))
    const damaged = (await screen.findByText(/The receiver marked it damaged or wrong. Posting is not blocked/)).closest('li')!
    expect(within(damaged).getByText('6 × karton')).toBeInTheDocument()
    expect(within(damaged).queryByRole('button', { name: 'Link a PO' })).not.toBeInTheDocument()
  })

  it('AC-1533 procurement records a hand-found number; the worker will adopt it without a new create', async () => {
    serverHalted = [HALTED]
    renderQueue()

    expect(await screen.findByText('Posting halted: check ESB')).toBeInTheDocument()
    expect(screen.getByText('PO-2610-0042')).toBeInTheDocument()
    expect(screen.getByText(/MOS key MOS-RECEIPT-0001-GROUP-0001/)).toBeInTheDocument()
    const record = screen.getByRole('button', { name: 'Record number' })
    expect(record).toBeDisabled()
    await userEvent.type(screen.getByLabelText('ESB goods-receipt number'), 'GR-FOUND-42')
    await userEvent.click(record)

    expect(mockResolveHalted).toHaveBeenCalledWith('group-halted', 'record_number', 'GR-FOUND-42')
    expect(await screen.findByText('Recorded GR-FOUND-42; the worker will adopt it without creating another receipt.')).toHaveFocus()
    await waitFor(() => expect(screen.queryByText('Posting halted: check ESB')).not.toBeInTheDocument())
  })

  it('AC-1533 requeue requires an explicit confirmation that ESB has no receipt', async () => {
    serverHalted = [HALTED]
    renderQueue()

    const requeue = await screen.findByRole('button', { name: 'Confirm absence and requeue' })
    expect(requeue).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /I checked ESB and confirmed this receipt is absent/ }))
    expect(requeue).toBeEnabled()
    await userEvent.click(requeue)

    expect(mockResolveHalted).toHaveBeenCalledWith('group-halted', 'confirm_absent', '')
    expect(await screen.findByText('Confirmed absent; the worker will retry this receipt.')).toBeInTheDocument()
  })

  it('FR-1035 procurement links a blocking issue to an eligible PO; one dated after arrival says why it cannot be linked', async () => {
    mockLink.mockImplementation(async () => {
      serverIssues = [{ ...OVER, status: 'linked', linked_po_number: 'PO-2610-0042',
        line: { ...LINE, po_created_after_delivery: true }, resolved_by: 'buyer-1', resolved_at: '2026-10-06T04:00:00Z' }, DAMAGED]
      return { status: 'linked', matched_quantity: '2', remaining_quantity: '0', posting: 'held', po_created_after_delivery: true }
    })
    renderQueue()
    await userEvent.click(await screen.findByRole('button', { name: 'Link a PO' }))

    expect(await screen.findByText('PO-2610-0051')).toBeInTheDocument()
    expect(screen.getByText(/ESB refuses a receipt dated before its PO/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link to PO-2610-0051' })).not.toBeInTheDocument()
    expect(screen.getByText('4 × karton left on this PO')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link to PO-2610-0038' })).not.toBeInTheDocument()
    expect(screen.getByText('This PO has nothing left for this item.')).toBeInTheDocument()
    expect(screen.getAllByText('PO created after delivery')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Link to PO-2610-0042' }))
    expect(mockLink).toHaveBeenCalledWith('issue-over', 'PO-2610-0042')
    const notice = await screen.findByText('Linked to PO-2610-0042. It is held until the branch posts receipts.')
    expect(notice).toHaveFocus()

    await userEvent.click(screen.getByRole('tab', { name: /Resolved/ }))
    const resolved = (await screen.findByText('Over-delivery')).closest('li')!
    expect(within(resolved).getByText('Linked to PO-2610-0042')).toBeInTheDocument()
    expect(within(resolved).getByText('PO created after delivery')).toBeInTheDocument()
    expect(within(resolved).getByText(/Dimas Prasetyo/)).toBeInTheDocument()
  })

  it('FR-1036 a link the database refuses keeps the picker open with the plain reason', async () => {
    mockLink.mockRejectedValue(new Error('linkCafeReceiptIssue failed: CAFE_RECEIPT_ISSUE_PO_NO_OUTSTANDING'))
    renderQueue()
    await userEvent.click(await screen.findByRole('button', { name: 'Link a PO' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Link to PO-2610-0042' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This PO has nothing left for this item.')
    expect(screen.getByRole('button', { name: 'Link to PO-2610-0042' })).toBeInTheDocument()
  })

  it('FR-1037 closing needs a note, then the issue moves to Resolved with its note', async () => {
    mockClose.mockImplementation(async () => {
      serverIssues = [{ ...OVER, status: 'closed', closed_note: 'Returned to supplier', resolved_by: 'buyer-1', resolved_at: '2026-10-06T04:00:00Z' }, DAMAGED]
    })
    renderQueue()
    await userEvent.click(await screen.findByRole('button', { name: 'Close issue' }))
    const confirm = screen.getAllByRole('button', { name: 'Close issue' }).at(-1)!
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Why is it closed? (required)'), 'Returned to supplier')
    await userEvent.click(confirm)
    expect(mockClose).toHaveBeenCalledWith('issue-over', 'Returned to supplier')
    await userEvent.click(await screen.findByRole('tab', { name: /Resolved/ }))
    expect(await screen.findByText('Returned to supplier')).toBeInTheDocument()
  })

  it('FR-1040 a receiver reads their issues with state text and no action', async () => {
    mockCanManage.mockResolvedValue(false)
    renderQueue()
    const row = (await screen.findByText('Over-delivery')).closest('li')!
    expect(within(row).getByText('Waiting for procurement')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /Link|Close/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Procurement links them to a PO or closes them/)).toBeInTheDocument()
  })

  it('NFR-1005 loading, a failed read with retry, and an empty list each say so', async () => {
    let fail = true
    mockList.mockImplementation(async () => {
      if (fail) throw new Error('listCafeReceiptIssues failed')
      return { issues: [], held: [], haltedGroups: [], resolvedTotal: 0 }
    })
    renderQueue()
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(screen.getByText(/Couldn’t load Receipt issues/)).toBeInTheDocument()
    fail = false
    await userEvent.click(retry)
    await waitFor(() => expect(screen.getByText('Nothing waiting for a PO')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('C1 focus moves to the outcome once it has rendered, after the first action on the page', async () => {
    mockLink.mockResolvedValue({ status: 'linked', matched_quantity: '2', remaining_quantity: '0', posting: 'queued', po_created_after_delivery: false })
    const focused: string[] = []
    const focus = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
      focused.push(this.textContent ?? '')
    })
    renderQueue()
    await userEvent.click(await screen.findByRole('button', { name: 'Link a PO' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Link to PO-2610-0042' }))
    await screen.findByText('Linked to PO-2610-0042 and queued for ESB.')
    await waitFor(() => expect(focused).toContain('Linked to PO-2610-0042 and queued for ESB.'))
    expect(focused).not.toContain('')
    focus.mockRestore()
  })

  it('C3 a resolved row says how it was resolved, not why it is blocked', async () => {
    serverIssues = [{ ...OVER, status: 'linked', linked_po_number: 'PO-2610-0042', resolved_by: 'buyer-1', resolved_at: '2026-10-06T04:00:00Z',
      parts: [{ po_number: 'PO-2610-0042', quantity: '2', state: 'queued', po_created_after_delivery: false }] },
      { ...DAMAGED, status: 'closed', closed_note: 'Supplier credit note', resolved_by: 'buyer-1', resolved_at: '2026-10-06T05:00:00Z' }]
    renderQueue()
    await userEvent.click(await screen.findByRole('tab', { name: /Resolved/ }))
    expect(await screen.findByText('2 × karton posts on PO-2610-0042.')).toBeInTheDocument()
    expect(screen.getByText('Closed with a note; this part is not posted.')).toBeInTheDocument()
    expect(screen.queryByText(/Not posted until it is linked/)).not.toBeInTheDocument()
  })

  it('C10 a resolved row whose linked part is held says it is held, not that it posts', async () => {
    serverIssues = [{ ...OVER, status: 'linked', linked_po_number: 'PO-2610-0057', resolved_by: 'buyer-1', resolved_at: '2026-10-06T04:00:00Z',
      parts: [{ po_number: 'PO-2610-0057', quantity: '2', state: 'held', po_created_after_delivery: false }] }]
    renderQueue()
    await userEvent.click(await screen.findByRole('tab', { name: /Resolved/ }))
    expect(await screen.findByText('2 × karton on PO-2610-0057 is held until the branch releases its receipts.')).toBeInTheDocument()
    expect(screen.queryByText(/posts on PO-2610-0057/)).not.toBeInTheDocument()
  })

  it('C10 a receiver, who reads no parts, is told only which PO procurement linked', async () => {
    mockCanManage.mockResolvedValue(false)
    serverIssues = [{ ...OVER, status: 'linked', linked_po_number: 'PO-2610-0057', resolved_by: 'buyer-1', resolved_at: '2026-10-06T04:00:00Z' }]
    renderQueue()
    await userEvent.click(await screen.findByRole('tab', { name: /Resolved/ }))
    expect(await screen.findByText('Procurement linked it to PO-2610-0057.')).toBeInTheDocument()
    expect(screen.queryByText(/posts on/)).not.toBeInTheDocument()
  })

  it('S9 an open issue with a linked part names that PO and its late flag', async () => {
    serverIssues = [{ ...OVER, quantity: '1', parts: [{ po_number: 'PO-2610-0057', quantity: '1', state: 'queued', po_created_after_delivery: true }] }]
    renderQueue()
    const part = (await screen.findByText('1 × karton posts on PO-2610-0057.')).closest('li')!
    expect(within(part).getByText('PO created after delivery')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link a PO' })).toBeInTheDocument()
  })

  it('S9 a line linked to two POs shows each PO with its own late flag', async () => {
    // A partial link left 1 open; the second link took it, so the issue's own quantity is that last 1.
    serverIssues = [{ ...OVER, quantity: '1', status: 'linked', linked_po_number: 'PO-PROBE-OLDER', resolved_by: 'buyer-1', resolved_at: '2026-10-06T04:00:00Z',
      line: { ...LINE, po_created_after_delivery: true },
      parts: [
        { po_number: 'PO-2610-0057', quantity: '1', state: 'queued', po_created_after_delivery: true },
        { po_number: 'PO-PROBE-OLDER', quantity: '1', state: 'queued', po_created_after_delivery: false },
      ] }]
    renderQueue()
    await userEvent.click(await screen.findByRole('tab', { name: /Resolved/ }))
    const late = (await screen.findByText('1 × karton posts on PO-2610-0057.')).closest('li')!
    const older = screen.getByText('1 × karton posts on PO-PROBE-OLDER.').closest('li')!
    expect(within(late).getByText('PO created after delivery')).toBeInTheDocument()
    expect(within(older).queryByText('PO created after delivery')).not.toBeInTheDocument()
    // The line's own flag would repeat the part's, beside the other PO.
    expect(screen.getAllByText('PO created after delivery')).toHaveLength(1)
    // The row's quantity is everything linked, not only the last part.
    expect(late.closest('.cafe-count-review__row')).toHaveTextContent('2 × karton')
    expect(screen.getByText('Linked to 2 POs')).toBeInTheDocument()
  })

  it('S8 an issue a release re-opened says its PO had no room, and can be linked again', async () => {
    serverIssues = [{ ...OVER, reopened_po_number: 'PO-2610-0057' }]
    renderQueue()
    expect(await screen.findByText('PO-2610-0057 no longer has room for this part, so it is open again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link a PO' })).toBeEnabled()
  })

  it('C4 an issue another holder already resolved says so and the list refreshes', async () => {
    mockClose.mockRejectedValue(new Error('closeCafeReceiptIssue failed: CAFE_RECEIPT_ISSUE_NOT_OPEN'))
    renderQueue()
    await userEvent.click(await screen.findByRole('button', { name: 'Close issue' }))
    await userEvent.type(screen.getByLabelText('Why is it closed? (required)'), 'Returned')
    serverIssues = [{ ...OVER, status: 'closed', closed_note: 'Returned by the other buyer', resolved_by: 'buyer-1', resolved_at: '2026-10-06T04:00:00Z' }, DAMAGED]
    await userEvent.click(screen.getAllByRole('button', { name: 'Close issue' }).at(-1)!)
    expect(await screen.findByText('Someone already resolved this issue. The list is up to date.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Resolved/ })).toHaveTextContent('1'))
  })

  it('DD-2026-10-06-1429 a held portion no PO has room for is listed under Needs action, read-only, with branch, item, quantity and age', async () => {
    serverHeld = [HELD]
    renderQueue()
    const row = (await screen.findByText('Held: no room on its PO')).closest('li')!
    expect(within(row).getByText('Gula Aren Cair Organik 750 ml')).toBeInTheDocument()
    expect(within(row).getByText('4 × botol')).toBeInTheDocument()
    expect(within(row).getByText('Gordi HQ Kemang')).toBeInTheDocument()
    expect(within(row).getByText(/raised \d+d ago/)).toBeInTheDocument()
    expect(within(row).getByText(/A release found no open PO with room for it/)).toBeInTheDocument()
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Needs action/ })).toHaveTextContent('2')
  })

  it('C2 the Resolved tab says when older resolved issues are not shown', async () => {
    serverIssues = [{ ...OVER, status: 'linked', linked_po_number: 'PO-2610-0042', resolved_by: 'buyer-1', resolved_at: '2026-10-06T04:00:00Z' }]
    resolvedTotal = 340
    renderQueue()
    await userEvent.click(await screen.findByRole('tab', { name: /Resolved/ }))
    expect(screen.getByRole('tab', { name: /Resolved/ })).toHaveTextContent('340')
    expect(await screen.findByText('Showing the newest 1 of 340 resolved issues.')).toBeInTheDocument()
  })

  it('C7 the PO picker takes focus when it opens, and Escape closes it back to its button', async () => {
    renderQueue()
    const open = await screen.findByRole('button', { name: 'Link a PO' })
    await userEvent.click(open)
    await screen.findByText('PO-2610-0042')
    expect(screen.getByRole('group', { name: 'Choose a PO for Susu UHT full cream 1 L karton isi 12' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('PO-2610-0042')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link a PO' })).toHaveFocus()
  })
})
