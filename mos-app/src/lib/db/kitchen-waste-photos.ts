import { supabase } from '@/lib/supabase'
import {
  PRIVATE_PHOTO_MAX_BYTES,
  PRIVATE_PHOTO_MAX_PHOTOS,
  PRIVATE_PHOTO_MIME_TYPES,
  prepareEvidencePhoto,
  type PrivatePhotoEvidence,
} from './photo-evidence'

export const WASTE_PHOTO_BUCKET = 'waste-photos'
export const MAX_WASTE_PHOTOS = PRIVATE_PHOTO_MAX_PHOTOS
export const MAX_WASTE_PHOTO_BYTES = PRIVATE_PHOTO_MAX_BYTES
export const WASTE_PHOTO_UPLOAD_WINDOW_MINUTES = 15
export const WASTE_PHOTO_UPLOAD_WINDOW_MS = WASTE_PHOTO_UPLOAD_WINDOW_MINUTES * 60 * 1000
export const WASTE_PHOTO_MIME_TYPES = PRIVATE_PHOTO_MIME_TYPES
const SIGNED_URL_SECONDS = 60 * 60

export function isWastePhotoWindowExpired(createdAt: string, now = Date.now()): boolean {
  return now >= Date.parse(createdAt) + WASTE_PHOTO_UPLOAD_WINDOW_MS
}

export interface KitchenWastePhoto extends PrivatePhotoEvidence {
  logId: string
  createdAt?: string
}

export interface KitchenWasteDraft {
  logId: string
  clientRequestId?: string | null
  itemId: string
  itemUnitId: string | null
  unitName: string | null
  quantity: number
  entryUnitFactor?: number | null
  entryUnitName?: string | null
  logDate: string
  createdAt: string
  photos: KitchenWastePhoto[]
}

export interface KitchenWasteDraftScope {
  orgId: string
  personId: string
  branchId: string
  activity: string
}

/** Read resumable waste facts only for the signed-in person's current stream, across dates.
 * Existing RLS still determines which same-org rows and photo objects the session can read. */
export async function listCurrentPersonKitchenWasteDrafts(
  scope: KitchenWasteDraftScope,
): Promise<KitchenWasteDraft[]> {
  const { data, error } = await supabase.schema('ops').from('kitchen_logs')
    .select('id,client_request_id,wip_item_id,item_unit_id,qty_porsi,entry_quantity,entry_unit_factor,entry_unit_name,log_date,created_at')
    .eq('org_id', scope.orgId)
    .eq('submitted_by', scope.personId)
    .eq('branch_id', scope.branchId)
    .eq('activity', scope.activity)
    .eq('action', 'waste')
    .eq('status', 'Draft')
    .is('superseded_by', null)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listCurrentPersonKitchenWasteDrafts failed — ${error.message}`)

  const rows = (data ?? []) as Array<{
    id: string
    client_request_id: string | null
    wip_item_id: string
    item_unit_id: string | null
    qty_porsi: number
    entry_quantity: number | null
    entry_unit_factor: number | null
    entry_unit_name: string | null
    log_date: string
    created_at: string
  }>
  if (rows.length === 0) return []
  const unitIds = [...new Set(rows.flatMap(row => row.item_unit_id ? [row.item_unit_id] : []))]
  const [{ data: unitRows, error: unitError }, photos] = await Promise.all([
    supabase.schema('ops').from('item_units')
      .select('id,unit_name')
      .eq('org_id', scope.orgId)
      .in('id', unitIds),
    listKitchenWastePhotos(rows.map(row => row.id)),
  ])
  const unitNames = new Map(((unitError ? [] : unitRows ?? []) as Array<{ id: string; unit_name: string }>)
    .map(unit => [unit.id, unit.unit_name]))
  const photosByLog = new Map<string, KitchenWastePhoto[]>()
  for (const photo of photos) {
    const current = photosByLog.get(photo.logId) ?? []
    photosByLog.set(photo.logId, [...current, photo])
  }

  return rows.map(row => {
    const unitName = row.item_unit_id ? unitNames.get(row.item_unit_id) : undefined
    return {
      logId: row.id,
      clientRequestId: row.client_request_id,
      itemId: row.wip_item_id,
      itemUnitId: row.item_unit_id,
      unitName: row.entry_unit_name || unitName || null,
      quantity: row.entry_quantity ?? row.qty_porsi,
      entryUnitFactor: row.entry_unit_factor ?? null,
      entryUnitName: row.entry_unit_name ?? null,
      logDate: row.log_date,
      createdAt: row.created_at,
      photos: photosByLog.get(row.id) ?? [],
    }
  })
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
  if (isWastePhotoWindowExpired(data.created_at)) {
    throw new Error('WASTE_PHOTO_WINDOW_EXPIRED')
  }

  const body = await prepareEvidencePhoto(file)
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

/** Replace and retire the original in one transaction; retries reuse the same replacement. */
export async function restartKitchenWasteDraft(logId: string, logDate: string): Promise<{ logId: string; logDate: string }> {
  const { data, error } = await supabase.schema('ops').rpc('restart_cafe_waste_draft', {
    p_log_id: logId,
    p_log_date: logDate,
  })
  if (error) throw new Error(`restartKitchenWasteDraft failed — ${error.message}`)
  const replacement = (data as Array<{ id: string; log_date: string }> | null)?.[0]
  if (!replacement) throw new Error('restartKitchenWasteDraft failed — replacement was not returned')
  return { logId: replacement.id, logDate: replacement.log_date }
}
