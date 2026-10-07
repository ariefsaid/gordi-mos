import { supabase } from '@/lib/supabase'
import {
  PRIVATE_PHOTO_MIME_TYPES,
  prepareEvidencePhoto,
  type PrivatePhotoEvidence,
} from './photo-evidence'

export const CAFE_RECEIPT_PHOTO_BUCKET = 'cafe-receipt-photos'
const SIGNED_URL_SECONDS = 60 * 60

export interface CafeReceiptPhoto extends PrivatePhotoEvidence {
  lineId: string
  createdAt?: string
}

/** Store one image on a Counted receipt line. Storage RLS binds it to the authenticated receiver. */
export async function uploadCafeReceiptLinePhoto(lineId: string, file: File): Promise<CafeReceiptPhoto> {
  if (!PRIVATE_PHOTO_MIME_TYPES.includes(file.type as (typeof PRIVATE_PHOTO_MIME_TYPES)[number])) {
    throw new Error('CAFE_RECEIPT_PHOTO_INVALID_TYPE')
  }
  const { data: line, error: lineError } = await supabase.schema('ops').from('cafe_receipt_lines')
    .select('org_id,receipt_id')
    .eq('id', lineId)
    .single()
  if (lineError) throw new Error(`uploadCafeReceiptLinePhoto failed: ${lineError.message}`)

  const body = await prepareEvidencePhoto(file)
  const path = `${line.org_id}/${line.receipt_id}/${lineId}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage.from(CAFE_RECEIPT_PHOTO_BUCKET).upload(path, body, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (uploadError) throw new Error(`uploadCafeReceiptLinePhoto failed: ${uploadError.message}`)
  const { data: signed, error: signError } = await supabase.storage.from(CAFE_RECEIPT_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS)
  if (signError || !signed?.signedUrl) throw new Error(`uploadCafeReceiptLinePhoto failed: ${signError?.message ?? 'could not sign the photo'}`)
  return { lineId, path, url: signed.signedUrl, name: file.name }
}

/** Receipts per photo read; the server refuses more. */
export const CAFE_RECEIPT_PHOTO_READ_LIMIT = 50

export type CafeReceiptPhotoRecord = { lineId: string; path: string; createdAt: string }

/**
 * The photo records of up to 50 receipts, keyed by receipt. The server returns a receipt only when
 * the caller may read its evidence, with every photo in one row, so no row cap can drop one.
 */
export async function listCafeReceiptPhotos(receiptIds: readonly string[]): Promise<Map<string, CafeReceiptPhotoRecord[]>> {
  const ids = [...new Set(receiptIds)]
  if (ids.length === 0) return new Map()
  if (ids.length > CAFE_RECEIPT_PHOTO_READ_LIMIT) throw new Error('listCafeReceiptPhotos: at most 50 receipts per read')
  const { data, error } = await supabase.schema('ops').rpc('list_cafe_receipt_photos', { p_receipt_ids: ids })
  if (error) throw new Error(`listCafeReceiptPhotos failed: ${error.message}`)
  const byReceipt = new Map<string, CafeReceiptPhotoRecord[]>()
  for (const row of (data ?? []) as Array<{ receipt_id: unknown; photos: unknown }>) {
    if (typeof row.receipt_id !== 'string' || !Array.isArray(row.photos)) throw new Error('listCafeReceiptPhotos failed: invalid row')
    byReceipt.set(row.receipt_id, row.photos.map((photo: Record<string, unknown>) => {
      if (typeof photo.line_id !== 'string' || typeof photo.path !== 'string' || typeof photo.created_at !== 'string') {
        throw new Error('listCafeReceiptPhotos failed: invalid photo')
      }
      return { lineId: photo.line_id, path: photo.path, createdAt: photo.created_at }
    }))
  }
  return byReceipt
}

/**
 * Paths per signing request. The storage API checks the bucket's read policy for every path, so
 * one request for a whole review queue could outlast the statement timeout; batches stay short.
 */
const SIGN_BATCH = 100
const SIGN_CONCURRENCY = 4

/** Short-lived URLs for the photos about to be shown; each one passes the bucket's read policy. */
export async function signCafeReceiptPhotos(records: readonly CafeReceiptPhotoRecord[]): Promise<CafeReceiptPhoto[]> {
  const batches: CafeReceiptPhotoRecord[][] = []
  for (let start = 0; start < records.length; start += SIGN_BATCH) batches.push(records.slice(start, start + SIGN_BATCH))
  const signed: CafeReceiptPhoto[][] = new Array(batches.length)
  let next = 0
  async function worker() {
    while (next < batches.length) {
      const index = next++
      const batch = batches[index]
      const { data, error } = await supabase.storage.from(CAFE_RECEIPT_PHOTO_BUCKET)
        .createSignedUrls(batch.map(record => record.path), SIGNED_URL_SECONDS)
      if (error) throw new Error(`signCafeReceiptPhotos failed: ${error.message}`)
      signed[index] = batch.map((record, position) => {
        const url = data[position]?.signedUrl
        if (!url) throw new Error('signCafeReceiptPhotos failed: could not sign a stored photo')
        return { ...record, url }
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(SIGN_CONCURRENCY, batches.length) }, worker))
  return signed.flat()
}
