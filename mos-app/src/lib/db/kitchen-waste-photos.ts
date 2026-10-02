import { supabase } from '@/lib/supabase'
import { shrinkPhoto } from '@/lib/db/signal-photos'

export const WASTE_PHOTO_BUCKET = 'waste-photos'
export const MAX_WASTE_PHOTOS = 4
export const MAX_WASTE_PHOTO_BYTES = 5 * 1024 * 1024
export const WASTE_PHOTO_UPLOAD_WINDOW_MS = 15 * 60 * 1000
export const WASTE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const SIGNED_URL_SECONDS = 60 * 60

export interface KitchenWastePhoto {
  logId: string
  path: string
  url: string
  createdAt?: string
  name?: string
}

/** Store evidence on an existing waste Draft. Signal's downscaler preserves the original photo's
 * orientation and emits one JPEG; the bucket cap applies to those stored bytes, not the phone's
 * uncompressed source. The item's ERP product-detail unit is unrelated and remains unchanged. */
export async function uploadKitchenWastePhoto(logId: string, file: File): Promise<KitchenWastePhoto> {
  if (!WASTE_PHOTO_MIME_TYPES.includes(file.type as (typeof WASTE_PHOTO_MIME_TYPES)[number])) {
    throw new Error('WASTE_PHOTO_INVALID_TYPE')
  }

  const { data, error } = await supabase.schema('ops').from('kitchen_logs')
    .select('org_id,action,status,created_at')
    .eq('id', logId)
    .single()
  if (error) throw new Error(`uploadKitchenWastePhoto failed — ${error.message}`)
  if (data.action !== 'waste' || data.status !== 'Draft') {
    throw new Error('WASTE_PHOTO_DRAFT_REQUIRED')
  }
  if (Date.now() >= Date.parse(data.created_at) + WASTE_PHOTO_UPLOAD_WINDOW_MS) {
    throw new Error('WASTE_PHOTO_WINDOW_EXPIRED')
  }

  const body = await shrinkPhoto(file)
  if (body.size > MAX_WASTE_PHOTO_BYTES) throw new Error('WASTE_PHOTO_TOO_LARGE')
  const path = `${data.org_id}/${logId}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage.from(WASTE_PHOTO_BUCKET).upload(path, body, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (uploadError) throw new Error(`uploadKitchenWastePhoto failed — ${uploadError.message}`)
  const stored = await listKitchenWastePhotos([logId])
  const uploaded = stored.find(photo => photo.path === path)
  if (!uploaded) throw new Error('uploadKitchenWastePhoto failed — the stored photo was not returned')
  return { ...uploaded, name: file.name }
}

/** One org-scoped view read for all waste rows in the review queue, then short-lived private URLs. */
export async function listKitchenWastePhotos(logIds: readonly string[]): Promise<KitchenWastePhoto[]> {
  if (logIds.length === 0) return []
  const { data, error } = await supabase.schema('ops').from('kitchen_log_waste_photos')
    .select('log_id,path,created_at')
    .in('log_id', [...new Set(logIds)])
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listKitchenWastePhotos failed — ${error.message}`)
  const rows = (data ?? []) as Array<{ log_id: string; path: string; created_at: string }>
  if (rows.length === 0) return []

  const { data: signed, error: signedError } = await supabase.storage.from(WASTE_PHOTO_BUCKET)
    .createSignedUrls(rows.map((row) => row.path), SIGNED_URL_SECONDS)
  if (signedError) throw new Error(`listKitchenWastePhotos failed — ${signedError.message}`)
  return rows.map((row, index) => {
    const url = signed[index]?.signedUrl
    if (!url) throw new Error('listKitchenWastePhotos failed — could not sign a stored photo')
    return { logId: row.log_id, path: row.path, url, createdAt: row.created_at }
  })
}

/** Move a photo-backed waste Draft into the normal reviewer queue. The database rechecks evidence,
 * ownership, status and org; this helper intentionally sends only the row id. */
export async function submitKitchenWasteLog(logId: string): Promise<void> {
  const { error } = await supabase.schema('ops').rpc('submit_cafe_waste_log', { p_log_id: logId })
  if (error) throw new Error(`submitKitchenWasteLog failed — ${error.message}`)
}
