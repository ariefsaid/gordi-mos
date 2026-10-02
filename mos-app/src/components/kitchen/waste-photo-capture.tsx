import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useT } from '@/i18n/use-t'
import {
  MAX_WASTE_PHOTOS,
  WASTE_PHOTO_MIME_TYPES,
  uploadKitchenWastePhoto,
} from '@/lib/db/kitchen-waste-photos'
import type { KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import './waste-photo-capture.css'

type PhotoStatus = 'selected' | 'uploading' | 'uploaded' | 'error' | 'expired' | 'tooLarge'
interface PhotoEntry {
  id: string
  file?: File
  name: string
  previewUrl: string
  path?: string
  status: PhotoStatus
}

export interface WastePhotoCaptureProps {
  /** Existing waste Draft id; storage RLS binds every object to this item row. */
  wasteLogId: string
  /** Persisted evidence for a resumed Draft. Uploaded evidence is immutable in this phase. */
  initialPhotos?: readonly KitchenWastePhoto[]
  /** Injected for the development harness and tests; production uses the private Storage helper. */
  onUpload?: (wasteLogId: string, file: File) => Promise<void>
  /** Parent submit controls stay disabled until this item has at least one accepted photo. */
  onCanSubmitChange?: (canSubmit: boolean) => void
}

export function WastePhotoCapture({
  wasteLogId,
  initialPhotos = [],
  onUpload = uploadKitchenWastePhoto,
  onCanSubmitChange,
}: WastePhotoCaptureProps) {
  const t = useT()
  const [photos, setPhotos] = useState<PhotoEntry[]>(() => initialPhotos.map((photo) => ({
    id: photo.path,
    name: photo.path.split('/').at(-1) ?? t('kitchen.wastePhotos.title'),
    previewUrl: photo.url,
    path: photo.path,
    status: 'uploaded',
  })))
  const [validationError, setValidationError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const previewUrls = useRef(new Map<string, string>())

  const uploadedCount = useMemo(() => photos.filter(photo => photo.status === 'uploaded').length, [photos])
  const canUpload = photos.some(photo => photo.status === 'selected' || photo.status === 'error')
  useEffect(() => {
    onCanSubmitChange?.(uploadedCount > 0)
  }, [onCanSubmitChange, uploadedCount])
  useEffect(() => () => {
    for (const url of previewUrls.current.values()) URL.revokeObjectURL(url)
    previewUrls.current.clear()
  }, [])

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (selected.length === 0) return

    const additions: PhotoEntry[] = []
    let nextError = ''
    for (const file of selected) {
      if (!WASTE_PHOTO_MIME_TYPES.includes(file.type as (typeof WASTE_PHOTO_MIME_TYPES)[number])) {
        nextError = t('kitchen.wastePhotos.invalidType')
        continue
      }
      if (photos.length + additions.length >= MAX_WASTE_PHOTOS) {
        nextError = t('kitchen.wastePhotos.tooMany')
        continue
      }
      const id = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.set(id, previewUrl)
      additions.push({ id, file, name: file.name, previewUrl, status: 'selected' })
    }
    setPhotos(current => [...current, ...additions])
    setValidationError(nextError)
  }

  function removePhoto(photo: PhotoEntry) {
    if (photo.status === 'uploaded' || photo.status === 'uploading') return
    const previewUrl = previewUrls.current.get(photo.id)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrls.current.delete(photo.id)
    setPhotos(current => current.filter(item => item.id !== photo.id))
    setValidationError('')
  }

  async function uploadPhoto(photoId: string) {
    const photo = photos.find(item => item.id === photoId)
    if (!photo?.file || photo.status === 'uploading' || photo.status === 'uploaded') return
    setValidationError('')
    setPhotos(current => current.map(item => item.id === photoId ? { ...item, status: 'uploading' } : item))
    try {
      await onUpload(wasteLogId, photo.file)
      setPhotos(current => current.map(item => item.id === photoId ? { ...item, file: undefined, path: item.path, status: 'uploaded' } : item))
    } catch (error) {
      const failure = error instanceof Error ? error.message : ''
      const terminalStatus = failure === 'WASTE_PHOTO_WINDOW_EXPIRED'
        ? 'expired'
        : failure === 'WASTE_PHOTO_TOO_LARGE'
          ? 'tooLarge'
          : null
      setPhotos(current => current.map(item => item.id === photoId
        ? { ...item, status: terminalStatus ?? 'error' }
        : item))
      if (terminalStatus === 'expired') setValidationError(t('kitchen.wastePhotos.windowExpired'))
      if (terminalStatus === 'tooLarge') setValidationError(t('kitchen.wastePhotos.tooLarge'))
    }
  }

  async function uploadSelected() {
    if (isUploading) return
    setIsUploading(true)
    try {
      const pending = photos.filter(photo => photo.status === 'selected' || photo.status === 'error')
      for (const photo of pending) await uploadPhoto(photo.id)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <section className="waste-photo-capture" aria-labelledby="waste-photo-title">
      <div className="waste-photo-capture-heading">
        <h3 id="waste-photo-title">{t('kitchen.wastePhotos.title')}</h3>
        <p>{t('kitchen.wastePhotos.help')}</p>
      </div>
      <label className="waste-photo-capture-add">
        <input
          className="waste-photo-capture-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          onChange={addFiles}
          disabled={photos.length >= MAX_WASTE_PHOTOS || isUploading}
        />
        <span>{t('kitchen.wastePhotos.add')}</span>
      </label>

      {validationError && <p role="alert" className="waste-photo-capture-error">{validationError}</p>}

      {photos.length > 0 && (
        <ul className="waste-photo-capture-list">
          {photos.map((photo, index) => (
            <li className="waste-photo-capture-item" key={photo.id}>
              <img src={photo.previewUrl} alt={t('kitchen.wastePhotos.preview', { n: index + 1 })} />
              <div className="waste-photo-capture-file">
                <span className="waste-photo-capture-filename" title={photo.name}>{photo.name}</span>
                {photo.status === 'uploading' && (
                  <progress aria-label={t('kitchen.wastePhotos.progress', { n: index + 1 })} />
                )}
                {(photo.status === 'error' || photo.status === 'expired' || photo.status === 'tooLarge') && (
                  <span role="alert" className="waste-photo-capture-error">
                    {photo.status === 'expired'
                      ? t('kitchen.wastePhotos.windowExpired')
                      : photo.status === 'tooLarge'
                        ? t('kitchen.wastePhotos.tooLarge')
                        : t('kitchen.wastePhotos.failed')}
                  </span>
                )}
                {photo.status === 'uploaded' && <span className="waste-photo-capture-uploaded">{t('kitchen.wastePhotos.uploaded')}</span>}
              </div>
              {photo.status === 'error' ? (
                <button type="button" className="btn btn-ghost waste-photo-capture-remove" onClick={() => void uploadPhoto(photo.id)}>
                  {t('kitchen.wastePhotos.retry', { n: index + 1 })}
                </button>
              ) : photo.status !== 'uploaded' && photo.status !== 'uploading' ? (
                <button type="button" className="btn btn-ghost waste-photo-capture-remove" onClick={() => removePhoto(photo)}>
                  {t('kitchen.wastePhotos.remove', { n: index + 1 })}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <button
          type="button"
          className="btn btn-primary waste-photo-capture-upload"
          disabled={isUploading}
          onClick={() => void uploadSelected()}
        >
          {isUploading ? t('common.working') : t('kitchen.wastePhotos.upload')}
        </button>
      )}
      <p className="waste-photo-capture-readiness" role="status" aria-live="polite">
        {uploadedCount > 0
          ? uploadedCount === 1
            ? t('kitchen.wastePhotos.ready.one', { count: uploadedCount })
            : t('kitchen.wastePhotos.ready.other', { count: uploadedCount })
          : t('kitchen.wastePhotos.required')}
      </p>
    </section>
  )
}
