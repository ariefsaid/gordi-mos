import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { schema: vi.fn(), storage: { from: vi.fn() } },
}))
vi.mock('@/lib/db/signal-photos', () => ({ shrinkPhoto: vi.fn() }))

import { supabase } from '@/lib/supabase'
import { shrinkPhoto } from '@/lib/db/signal-photos'
import {
  listPendingBillPaymentAmounts,
  listPendingBillPaymentHistory,
  MAX_PENDING_BILL_PROOF_BYTES,
  PendingBillProofError,
  paySeveralPendingBills,
  recordPendingBillPayment,
  uploadPendingBillProof,
} from './pending-bill-payments'

const schemaMock = vi.mocked(supabase.schema)
const storageFrom = vi.mocked(supabase.storage.from)
const shrinkMock = vi.mocked(shrinkPhoto)

interface Call { method: string; args: unknown[] }

type Result = { data: unknown; error: { message: string } | null }

function query(result: Result, calls: Call[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'range']) {
    builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder }
  }
  builder.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

beforeEach(() => vi.clearAllMocks())

describe('listPendingBillPaymentAmounts', () => {
  it('reads every signed entry in a stable order and lets RLS choose the org', async () => {
    const calls: Call[] = []
    schemaMock.mockImplementation((name) => {
      expect(name).toBe('mos')
      return { from: (table: string) => {
        expect(table).toBe('pending_bill_payments')
        return query({ data: [{ id: 'p1', esb_code: 'ESB', branch_code: 'BR', bill_no: 'PB-1', amount: '125.00', cash_in_date: '2026-10-06' }], error: null }, calls)
      } } as never
    })
    const rows = await listPendingBillPaymentAmounts()
    expect(rows).toEqual([{ id: 'p1', esb_code: 'ESB', branch_code: 'BR', bill_no: 'PB-1', amount: 125, cash_in_date: '2026-10-06' }])
    expect(calls.find((call) => call.method === 'select')?.args).toEqual(['id,esb_code,branch_code,bill_no,amount,cash_in_date,created_at'])
    expect(calls.filter((call) => call.method === 'order').map((call) => call.args)).toEqual([
      ['created_at', { ascending: true }], ['id', { ascending: true }],
    ])
    expect(calls.find((call) => call.method === 'range')?.args).toEqual([0, 999])
    expect(JSON.stringify(calls)).not.toContain('org_id')
  })
})

describe('listPendingBillPaymentHistory', () => {
  it('returns same-bill history with actor names and short-lived private proof links', async () => {
    const queryCalls: Record<string, Call[]> = { mos: [], shared: [] }
    schemaMock.mockImplementation((name) => ({
      from: (table: string) => query({
        data: table === 'pending_bill_payments' ? [{
          id: 'p1', esb_code: 'ESB', branch_code: 'BR', bill_no: 'PB-1', entry_kind: 'payment', amount: '125',
          cash_in_date: '2026-10-06', proof_path: 'org/p1.pdf', note: 'Thanks', reversal_of: null,
          reversal_reason: null, created_by: 'person-1', created_at: '2026-10-06T03:00:00Z',
        }] : [{ id: 'person-1', full_name: 'Finance Person' }],
        error: null,
      }, queryCalls[name]),
    } as never))
    const createSignedUrls = vi.fn().mockResolvedValue({ data: [{ signedUrl: 'https://proof.test/signed', error: null }], error: null })
    storageFrom.mockReturnValue({ createSignedUrls } as never)

    const history = await listPendingBillPaymentHistory({ esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-1' })
    expect(history).toEqual([{
      id: 'p1', esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-1', entryKind: 'payment', amount: 125,
      cashInDate: '2026-10-06', proofPath: 'org/p1.pdf', proofUrl: 'https://proof.test/signed', note: 'Thanks',
      reversalOf: null, reversalReason: null, actorName: 'Finance Person', createdAt: '2026-10-06T03:00:00Z',
    }])
    expect(queryCalls.mos.filter((call) => call.method === 'eq')).toEqual([
      { method: 'eq', args: ['esb_code', 'ESB'] },
      { method: 'eq', args: ['branch_code', 'BR'] },
      { method: 'eq', args: ['bill_no', 'PB-1'] },
    ])
    expect(queryCalls.mos.filter((call) => call.method === 'order').map((call) => call.args)).toEqual([
      ['created_at', { ascending: false }], ['id', { ascending: false }],
    ])
    expect(queryCalls.shared.find((call) => call.method === 'in')).toEqual({ method: 'in', args: ['id', ['person-1']] })
    expect(storageFrom).toHaveBeenCalledWith('pending-bill-proofs')
    expect(createSignedUrls).toHaveBeenCalledWith(['org/p1.pdf'], 3600)
  })

  it('batches signed proof links for the history rows', async () => {
    schemaMock.mockImplementation(() => ({
      from: (table: string) => query({
        data: table === 'pending_bill_payments' ? [
          { id: 'p1', esb_code: 'ESB', branch_code: 'BR', bill_no: 'PB-1', entry_kind: 'payment', amount: '125',
            cash_in_date: '2026-10-06', proof_path: 'org/p1.pdf', note: null, reversal_of: null,
            reversal_reason: null, created_by: 'person-1', created_at: '2026-10-06T03:00:00Z' },
          { id: 'p2', esb_code: 'ESB', branch_code: 'BR', bill_no: 'PB-1', entry_kind: 'payment', amount: '250',
            cash_in_date: '2026-10-06', proof_path: 'org/p2.pdf', note: null, reversal_of: null,
            reversal_reason: null, created_by: 'person-1', created_at: '2026-10-06T04:00:00Z' },
        ] : [{ id: 'person-1', full_name: 'Finance Person' }], error: null,
      }, []),
    } as never))
    const createSignedUrls = vi.fn().mockResolvedValue({ data: [
      { signedUrl: 'https://proof.test/one', error: null },
      { signedUrl: 'https://proof.test/two', error: null },
    ], error: null })
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'unused' }, error: null })
    storageFrom.mockReturnValue({ createSignedUrl, createSignedUrls } as never)

    const history = await listPendingBillPaymentHistory({ esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-1' })
    expect(history.map((entry) => entry.proofUrl)).toEqual(['https://proof.test/one', 'https://proof.test/two'])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(['org/p1.pdf', 'org/p2.pdf'], 3600)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('does not ask storage for a signed URL when history has no proof rows', async () => {
    schemaMock.mockImplementation(() => ({
      from: (table: string) => query({ data: table === 'pending_bill_payments' ? [] : [], error: null }, []),
    } as never))
    storageFrom.mockReturnValue({ createSignedUrls: vi.fn() } as never)
    await expect(listPendingBillPaymentHistory({ esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-1' })).resolves.toEqual([])
    expect(storageFrom).not.toHaveBeenCalled()
  })
})

describe('recordPendingBillPayment', () => {
  it('calls only the SECURITY DEFINER RPC and sends the idempotency and reversal fields', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ payment_id: 'p1', replayed: true }], error: null })
    schemaMock.mockImplementation((name) => {
      expect(name).toBe('mos')
      return { rpc } as never
    })
    await expect(recordPendingBillPayment({
      esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-1', amount: 125, cashInDate: '2026-10-06',
      proofPath: 'org/p1.pdf', note: null, idempotencyKey: 'key', reversePaymentId: null, reversalReason: null,
    })).resolves.toEqual({ paymentId: 'p1', replayed: true })
    expect(rpc).toHaveBeenCalledWith('record_pending_bill_payment', {
      p_esb_code: 'ESB', p_branch_code: 'BR', p_bill_no: 'PB-1', p_amount: 125,
      p_cash_in_date: '2026-10-06', p_proof_path: 'org/p1.pdf', p_note: null,
      p_idempotency_key: 'key', p_reverse_payment_id: null, p_reversal_reason: null,
    })
  })

  it('throws instead of hiding RPC failures or empty result rows', async () => {
    schemaMock.mockImplementation(() => ({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }) } as never))
    const input = {
      esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-1', amount: 1, cashInDate: '2026-10-06',
      proofPath: 'org/p1.pdf', note: null, idempotencyKey: 'key',
    }
    await expect(recordPendingBillPayment(input)).rejects.toThrow(/recordPendingBillPayment failed — denied/)
    schemaMock.mockImplementation(() => ({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never))
    await expect(recordPendingBillPayment(input)).rejects.toThrow(/no result row/)
  })
})

describe('paySeveralPendingBills', () => {
  it('calls the atomic batch RPC and maps every settled bill result', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [
      { payment_id: 'p1', esb_code: 'ESB', branch_code: 'BR', bill_no: 'PB-1', amount: '125.50', replayed: false },
      { payment_id: 'p2', esb_code: 'ESB', branch_code: 'BR', bill_no: 'PB-2', amount: '250', replayed: true },
    ], error: null })
    schemaMock.mockImplementation((name) => {
      expect(name).toBe('mos')
      return { rpc } as never
    })
    const billIds = ['["ESB","BR","PB-1"]', '["ESB","BR","PB-2"]']
    await expect(paySeveralPendingBills({
      billIds, cashInDate: '2026-10-06', proofPath: 'org/p1.pdf', idempotencyKey: 'batch-key',
    })).resolves.toEqual([
      { billId: billIds[0], paymentId: 'p1', esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-1', amount: 125.5, replayed: false },
      { billId: billIds[1], paymentId: 'p2', esbCode: 'ESB', branchCode: 'BR', billNo: 'PB-2', amount: 250, replayed: true },
    ])
    expect(rpc).toHaveBeenCalledWith('pay_several_pending_bills', {
      p_bill_ids: billIds,
      p_cash_in_date: '2026-10-06',
      p_proof_path: 'org/p1.pdf',
      p_idempotency_key: 'batch-key',
    })
  })

  it('surfaces server failure and refuses a partial or mismatched result set', async () => {
    const input = { billIds: ['["ESB","BR","PB-1"]'], cashInDate: '2026-10-06', proofPath: 'org/p1.pdf', idempotencyKey: 'key' }
    schemaMock.mockImplementation(() => ({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Pending bill PB-1 is already settled.' } }) } as never))
    await expect(paySeveralPendingBills(input)).rejects.toThrow(/Pending bill PB-1 is already settled/)
    schemaMock.mockImplementation(() => ({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never))
    await expect(paySeveralPendingBills(input)).rejects.toThrow(/different bill selection/)
  })
})

describe('uploadPendingBillProof', () => {
  it('keeps PDFs as PDFs and uploads them under the org-scoped private bucket', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    storageFrom.mockReturnValue({ upload } as never)
    const file = new File(['proof'], 'statement.pdf', { type: 'application/pdf' })
    const path = await uploadPendingBillProof('org-1', file)
    expect(path).toMatch(/^org-1\/[0-9a-f-]+\.pdf$/)
    expect(upload).toHaveBeenCalledWith(path, file, { contentType: 'application/pdf', upsert: false })
    expect(storageFrom).toHaveBeenCalledWith('pending-bill-proofs')
  })

  it('compresses supported images and rejects unsupported or over-limit files before upload', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    storageFrom.mockReturnValue({ upload } as never)
    const compressed = new Blob(['small jpeg'], { type: 'image/jpeg' })
    shrinkMock.mockResolvedValue(compressed)
    const png = new File(['source'], 'photo.png', { type: 'image/png' })
    expect(await uploadPendingBillProof('org-1', png)).toMatch(/\.jpg$/)
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), compressed, { contentType: 'image/jpeg', upsert: false })

    await expect(uploadPendingBillProof('org-1', new File(['bad'], 'proof.txt', { type: 'text/plain' })))
      .rejects.toBeInstanceOf(PendingBillProofError)
    shrinkMock.mockResolvedValue(new Blob([new Uint8Array(MAX_PENDING_BILL_PROOF_BYTES + 1)], { type: 'image/jpeg' }))
    await expect(uploadPendingBillProof('org-1', png)).rejects.toMatchObject({ code: 'tooLarge' })
    expect(upload).toHaveBeenCalledTimes(1)
  })
})
