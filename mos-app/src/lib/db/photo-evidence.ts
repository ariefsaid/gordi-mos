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

/**
 * The JPEG an evidence photo is stored as: the phone's image shrunk once, then held to the 5 MB
 * cap. Uploads and the offline draft both use it, so a photo kept on the device is the one that
 * will be sent. Throws WASTE_PHOTO_TOO_LARGE when even the shrunk image is over the cap.
 */
export async function prepareEvidencePhoto(file: Blob): Promise<Blob> {
  const body = await shrinkPhoto(file)
  if (body.size > PRIVATE_PHOTO_MAX_BYTES) throw new Error('WASTE_PHOTO_TOO_LARGE')
  return body
}
