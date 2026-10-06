/** Shared capture contract for immutable private evidence images. */
export const PRIVATE_PHOTO_MAX_PHOTOS = 4
export const PRIVATE_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const PRIVATE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface PrivatePhotoEvidence {
  path: string
  url: string
  name?: string
}
