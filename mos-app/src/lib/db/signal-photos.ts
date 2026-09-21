import { supabase } from '@/lib/supabase'

// Signal photos live in the private `signal-photos` bucket at <org>/<signal>/<uuid>.jpg. The bucket's
// RLS is the authority (author adds at capture, readers of the Signal read); this layer only moves
// bytes and paths.
const BUCKET = 'signal-photos'
export const MAX_SIGNAL_PHOTOS = 4
const MAX_EDGE = 1600
const SIGNED_URL_SECONDS = 3600

export interface SignalPhoto {
  signalId: string
  path: string
  url: string
}

/** Downscale to a phone-upload-friendly JPEG. EXIF orientation is applied by the decoder. */
// ponytail: one size serves the feed thumbnail and the full view; add a small variant if feeds get heavy.
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('shrinkPhoto failed'))), 'image/jpeg', 0.8)
  })
}

/** Upload photos to a Signal the viewer just posted. Returns the files that did NOT upload, so the
 * caller can offer a retry without re-posting the Signal. */
export async function uploadSignalPhotos(signalId: string, files: File[]): Promise<File[]> {
  if (files.length === 0) return []
  const { data, error } = await supabase.schema('mos').from('signals').select('org_id').eq('id', signalId).single()
  if (error) throw new Error(`uploadSignalPhotos failed — ${error.message}`)
  // One at a time: the photos keep the order they were chosen in, and a weak connection carries
  // one upload, not four.
  const failed: File[] = []
  for (const file of files) {
    try {
      const body = await shrinkPhoto(file)
      const path = `${data.org_id}/${signalId}/${crypto.randomUUID()}.jpg`
      const upload = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' })
      if (upload.error) failed.push(file)
    } catch {
      failed.push(file)
    }
  }
  return failed
}

/** Photos for many Signals in one read (the feed), oldest first within a Signal. */
export async function listSignalPhotos(signalIds: string[]): Promise<SignalPhoto[]> {
  if (signalIds.length === 0) return []
  const { data, error } = await supabase.schema('mos').from('signal_photos')
    .select('signal_id, path, created_at').in('signal_id', signalIds).order('created_at')
  if (error) throw new Error(`listSignalPhotos failed — ${error.message}`)
  const rows = (data ?? []) as Array<{ signal_id: string; path: string }>
  if (rows.length === 0) return []
  const signed = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((row) => row.path), SIGNED_URL_SECONDS)
  if (signed.error) throw new Error(`listSignalPhotos failed — ${signed.error.message}`)
  return rows.flatMap((row, i) => {
    const url = signed.data[i]?.signedUrl
    return url ? [{ signalId: row.signal_id, path: row.path, url }] : []
  })
}
