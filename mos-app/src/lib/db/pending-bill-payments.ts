import { supabase } from '@/lib/supabase'
import { readAllPages } from '@/lib/db/reporting-shared'
import { shrinkPhoto } from '@/lib/db/signal-photos'

export const PENDING_BILL_PROOFS_BUCKET = 'pending-bill-proofs'
export const MAX_PENDING_BILL_PROOF_BYTES = 307_200
const SIGNED_URL_SECONDS = 3600

interface PageQuery extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(columns: string): PageQuery
  eq(column: string, value: unknown): PageQuery
  in(column: string, values: unknown[]): PageQuery
  order(column: string, options: { ascending: boolean }): PageQuery
  range(from: number, to: number): PageQuery
}

interface SchemaClient {
  from(table: string): PageQuery
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

interface StorageBucket {
  upload(path: string, body: Blob, options: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }>
  createSignedUrls(paths: string[], expiresIn: number): Promise<{
    data: Array<{ signedUrl?: string | null; error?: string | null } | null> | null
    error: { message: string } | null
  }>
}

interface StorageClient {
  from(bucket: string): StorageBucket
}

const schema = (name: string) => supabase.schema(name) as unknown as SchemaClient
const storage = supabase.storage as unknown as StorageClient

export interface PendingBillPaymentIdentity {
  esbCode: string
  branchCode: string
  billNo: string
}

export interface PendingBillPaymentAmountRow {
  id: string
  esb_code: string
  branch_code: string
  bill_no: string
  /** Signed amount: reversals are negative. */
  amount: number
  cash_in_date: string
}

export interface PendingBillPaymentHistoryEntry extends PendingBillPaymentIdentity {
  id: string
  entryKind: 'payment' | 'reversal'
  amount: number
  cashInDate: string
  proofPath: string | null
  proofUrl: string | null
  note: string | null
  reversalOf: string | null
  reversalReason: string | null
  actorName: string | null
  createdAt: string
}

export interface RecordPendingBillPaymentInput extends PendingBillPaymentIdentity {
  amount: number | null
  cashInDate: string | null
  proofPath: string | null
  note: string | null
  idempotencyKey: string
  reversePaymentId?: string | null
  reversalReason?: string | null
}

export interface RecordPendingBillPaymentResult {
  paymentId: string
  replayed: boolean
}

export interface PaySeveralPendingBillsInput {
  billIds: string[]
  cashInDate: string
  proofPath: string
  idempotencyKey: string
}

export interface PaidPendingBill {
  billId: string
  paymentId: string
  esbCode: string
  branchCode: string
  billNo: string
  amount: number
  replayed: boolean
}

export async function listPendingBillPaymentAmounts(): Promise<PendingBillPaymentAmountRow[]> {
  const rows = await readAllPages<Record<string, unknown>>('listPendingBillPaymentAmounts', (from, to) =>
    schema('mos').from('pending_bill_payments')
      .select('id,esb_code,branch_code,bill_no,amount,cash_in_date,created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to))
  return rows.map((row) => ({
    id: String(row.id),
    esb_code: String(row.esb_code),
    branch_code: String(row.branch_code),
    bill_no: String(row.bill_no),
    amount: Number(row.amount),
    cash_in_date: String(row.cash_in_date),
  }))
}

export async function listPendingBillPaymentHistory(
  identity: PendingBillPaymentIdentity,
): Promise<PendingBillPaymentHistoryEntry[]> {
  const rows = await readAllPages<Record<string, unknown>>('listPendingBillPaymentHistory', (from, to) =>
    schema('mos').from('pending_bill_payments')
      .select('id,esb_code,branch_code,bill_no,entry_kind,amount,cash_in_date,proof_path,note,reversal_of,reversal_reason,created_by,created_at')
      .eq('esb_code', identity.esbCode)
      .eq('branch_code', identity.branchCode)
      .eq('bill_no', identity.billNo)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to))

  const actorIds = [...new Set(rows.map((row) => String(row.created_by)))]
  const actors = actorIds.length === 0
    ? []
    : await readPeople(actorIds)
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.full_name]))

  const proofPaths = [...new Set(rows.flatMap((row) => row.proof_path == null ? [] : [String(row.proof_path)]))]
  const signedUrls = new Map<string, string | null>()
  if (proofPaths.length > 0) {
    const { data, error } = await storage.from(PENDING_BILL_PROOFS_BUCKET).createSignedUrls(proofPaths, SIGNED_URL_SECONDS)
    if (error) throw new Error(`listPendingBillPaymentHistory proof failed — ${error.message}`)
    proofPaths.forEach((path, index) => {
      const result = data?.[index]
      if (result?.error) throw new Error(`listPendingBillPaymentHistory proof failed — ${result.error}`)
      signedUrls.set(path, result?.signedUrl ?? null)
    })
  }

  return rows.map((row) => {
    const proofPath = row.proof_path == null ? null : String(row.proof_path)
    return {
      id: String(row.id),
      esbCode: String(row.esb_code),
      branchCode: String(row.branch_code),
      billNo: String(row.bill_no),
      entryKind: String(row.entry_kind) as PendingBillPaymentHistoryEntry['entryKind'],
      amount: Number(row.amount),
      cashInDate: String(row.cash_in_date),
      proofPath,
      proofUrl: proofPath ? signedUrls.get(proofPath) ?? null : null,
      note: row.note == null ? null : String(row.note),
      reversalOf: row.reversal_of == null ? null : String(row.reversal_of),
      reversalReason: row.reversal_reason == null ? null : String(row.reversal_reason),
      actorName: actorNames.get(String(row.created_by)) ?? null,
      createdAt: String(row.created_at),
    }
  })
}

async function readPeople(ids: string[]): Promise<Array<{ id: string; full_name: string }>> {
  const { data, error } = await schema('shared').from('people').select('id,full_name').in('id', ids)
  if (error) throw new Error(`listPendingBillPaymentHistory people failed — ${error.message}`)
  return (data ?? []) as unknown as Array<{ id: string; full_name: string }>
}

export async function recordPendingBillPayment(
  input: RecordPendingBillPaymentInput,
): Promise<RecordPendingBillPaymentResult> {
  const { data, error } = await schema('mos').rpc('record_pending_bill_payment', {
    p_esb_code: input.esbCode,
    p_branch_code: input.branchCode,
    p_bill_no: input.billNo,
    p_amount: input.amount,
    p_cash_in_date: input.cashInDate,
    p_proof_path: input.proofPath,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
    p_reverse_payment_id: input.reversePaymentId ?? null,
    p_reversal_reason: input.reversalReason ?? null,
  })
  if (error) throw new Error(`recordPendingBillPayment failed — ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || !('payment_id' in row)) {
    throw new Error('recordPendingBillPayment failed — no result row')
  }
  const result = row as { payment_id: unknown; replayed: unknown }
  return { paymentId: String(result.payment_id), replayed: Boolean(result.replayed) }
}

export async function paySeveralPendingBills(input: PaySeveralPendingBillsInput): Promise<PaidPendingBill[]> {
  const { data, error } = await schema('mos').rpc('pay_several_pending_bills', {
    p_bill_ids: input.billIds,
    p_cash_in_date: input.cashInDate,
    p_proof_path: input.proofPath,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw new Error(error.message)
  if (!Array.isArray(data)) throw new Error('paySeveralPendingBills failed — no result rows')

  const results = data.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('paySeveralPendingBills failed — invalid result row')
    const row = entry as Record<string, unknown>
    if (typeof row.payment_id !== 'string' || typeof row.esb_code !== 'string'
      || typeof row.branch_code !== 'string' || typeof row.bill_no !== 'string') {
      throw new Error('paySeveralPendingBills failed — invalid result row')
    }
    const amount = Number(row.amount)
    if (!Number.isFinite(amount)) throw new Error('paySeveralPendingBills failed — invalid amount')
    return {
      billId: JSON.stringify([row.esb_code, row.branch_code, row.bill_no]),
      paymentId: row.payment_id,
      esbCode: row.esb_code,
      branchCode: row.branch_code,
      billNo: row.bill_no,
      amount,
      replayed: Boolean(row.replayed),
    }
  })
  const resultIds = new Set(results.map((result) => result.billId))
  if (results.length !== input.billIds.length || input.billIds.some((id) => !resultIds.has(id))) {
    throw new Error('paySeveralPendingBills failed — the server returned a different bill selection')
  }
  return results
}

export type PendingBillProofErrorCode = 'unsupported' | 'empty' | 'tooLarge' | 'uploadFailed'

export class PendingBillProofError extends Error {
  readonly code: PendingBillProofErrorCode

  constructor(code: PendingBillProofErrorCode, message: string) {
    super(message)
    this.name = 'PendingBillProofError'
    this.code = code
  }
}

const PROOF_TYPES: Record<string, { extension: string; contentType: string }> = {
  'image/jpeg': { extension: 'jpg', contentType: 'image/jpeg' },
  'image/png': { extension: 'png', contentType: 'image/png' },
  'image/webp': { extension: 'webp', contentType: 'image/webp' },
  'application/pdf': { extension: 'pdf', contentType: 'application/pdf' },
}

export async function uploadPendingBillProof(orgId: string, file: File): Promise<string> {
  const type = PROOF_TYPES[file.type]
  if (!type) throw new PendingBillProofError('unsupported', 'Choose a JPG, PNG, WebP, or PDF proof.')
  if (file.size === 0) throw new PendingBillProofError('empty', 'The selected proof file is empty.')

  let body: Blob = file
  let contentType = type.contentType
  let extension = type.extension
  if (file.type.startsWith('image/')) {
    try {
      body = await shrinkPhoto(file)
    } catch {
      throw new PendingBillProofError('unsupported', 'This image could not be prepared. Choose another proof file.')
    }
    contentType = 'image/jpeg'
    extension = 'jpg'
  }
  if (body.size > MAX_PENDING_BILL_PROOF_BYTES) {
    throw new PendingBillProofError('tooLarge', 'Proof must be 300 KB or smaller after image compression.')
  }

  const path = `${orgId}/${crypto.randomUUID()}.${extension}`
  const { error } = await storage.from(PENDING_BILL_PROOFS_BUCKET).upload(path, body, { contentType, upsert: false })
  if (error) throw new PendingBillProofError('uploadFailed', error.message)
  return path
}
