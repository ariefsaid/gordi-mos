import { shrinkPhoto } from '@/lib/db/signal-photos'

/** Shared capture contract for immutable private evidence images. */
export const PRIVATE_PHOTO_MAX_PHOTOS = 4
export const PRIVATE_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const PRIVATE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface PrivatePhotoEvidence {
  path: string
  url: string
  name?: string
}

const prepared = new WeakSet<Blob>()

/** Marks a photo as already in its stored form, such as one restored from the device draft. */
export function markPreparedEvidencePhoto<T extends Blob>(photo: T): T {
  prepared.add(photo)
  return photo
}

/**
 * The JPEG an evidence photo is stored as: the phone's image shrunk once, then held to the 5 MB
 * cap. Uploads and the offline draft both use it, so a photo kept on the device is the one that
 * will be sent. A marked JPEG within the cap is returned as it is, not shrunk again. Throws
 * WASTE_PHOTO_TOO_LARGE when even the shrunk image is over the cap.
 */
export async function prepareEvidencePhoto(file: Blob): Promise<Blob> {
  if (prepared.has(file) && file.type === 'image/jpeg' && file.size <= PRIVATE_PHOTO_MAX_BYTES) return file
  const body = await shrinkPhoto(file)
  if (body.size > PRIVATE_PHOTO_MAX_BYTES) throw new Error('WASTE_PHOTO_TOO_LARGE')
  return markPreparedEvidencePhoto(body)
}
