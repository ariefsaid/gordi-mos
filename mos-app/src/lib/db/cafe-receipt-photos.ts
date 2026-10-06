import { supabase } from '@/lib/supabase'
import { shrinkPhoto } from '@/lib/db/signal-photos'
import {
  PRIVATE_PHOTO_MAX_BYTES,
  PRIVATE_PHOTO_MIME_TYPES,
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

  const body = await shrinkPhoto(file)
  if (body.size > PRIVATE_PHOTO_MAX_BYTES) throw new Error('WASTE_PHOTO_TOO_LARGE')
  const path = `${line.org_id}/${line.receipt_id}/${lineId}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage.from(CAFE_RECEIPT_PHOTO_BUCKET).upload(path, body, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (uploadError) throw new Error(`uploadCafeReceiptLinePhoto failed: ${uploadError.message}`)
  const stored = await listCafeReceiptLinePhotos([lineId])
  const uploaded = stored.find(photo => photo.path === path)
  if (!uploaded) throw new Error('uploadCafeReceiptLinePhoto failed: the private photo was not returned')
  return { ...uploaded, name: file.name }
}

/** One org-scoped read for requested lines, followed by short-lived URLs from the private bucket. */
export async function listCafeReceiptLinePhotos(lineIds: readonly string[]): Promise<CafeReceiptPhoto[]> {
  const ids = [...new Set(lineIds)]
  if (ids.length === 0) return []
  const { data, error } = await supabase.schema('ops').from('cafe_receipt_line_photos')
    .select('line_id,path,created_at')
    .in('line_id', ids)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listCafeReceiptLinePhotos failed: ${error.message}`)
  const rows = (data ?? []) as Array<{ line_id: string; path: string; created_at: string }>
  if (rows.length === 0) return []
  const { data: signed, error: signedError } = await supabase.storage.from(CAFE_RECEIPT_PHOTO_BUCKET)
    .createSignedUrls(rows.map(row => row.path), SIGNED_URL_SECONDS)
  if (signedError) throw new Error(`listCafeReceiptLinePhotos failed: ${signedError.message}`)
  return rows.map((row, index) => {
    const url = signed[index]?.signedUrl
    if (!url) throw new Error('listCafeReceiptLinePhotos failed: could not sign a stored photo')
    return { lineId: row.line_id, path: row.path, url, createdAt: row.created_at }
  })
}
