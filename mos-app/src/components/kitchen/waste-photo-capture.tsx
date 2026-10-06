import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useT } from '@/i18n/use-t'
import { loadOfflinePhotoDraft, saveOfflinePhotoDraft } from '@/lib/offline-photo-drafts'
import {
  MAX_WASTE_PHOTOS,
  WASTE_PHOTO_MIME_TYPES,
  WASTE_PHOTO_UPLOAD_WINDOW_MINUTES,
  uploadKitchenWastePhoto,
} from '@/lib/db/kitchen-waste-photos'
import type { PrivatePhotoEvidence } from '@/lib/db/photo-evidence'
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

export interface PrivatePhotoCaptureCopy {
  title: string
  help: string
  add: string
  /** The add control's accessible name, when the visible label is shortened. */
  addName: string
  invalidType: string
  tooMany: string
  tooLarge: string
  required: string
  upload: string
  uploaded: string
  failed: string
  progress: (n: number) => string
  preview: (n: number) => string
  remove: (n: number) => string
  retry: (n: number) => string
  ready: (n: number) => string
  windowExpired: (minutes: number) => string
  draftSaved: string
  draftSaveFailed: string
}

type PhotoOwner = { ownerId: string; wasteLogId?: never } | { wasteLogId: string; ownerId?: never }

export type WastePhotoCaptureProps<TPhoto extends PrivatePhotoEvidence = KitchenWastePhoto> = PhotoOwner & {
  /** Persisted private evidence for a resumed owner row. Uploaded evidence is immutable here. */
  initialPhotos?: readonly TPhoto[]
  /** Injected for other private evidence owners; the default remains the waste-photo adapter. */
  onUpload?: (ownerId: string, file: File) => Promise<TPhoto | void>
  onPhotoUploaded?: (photo: TPhoto) => void
  onCanSubmitChange?: (canSubmit: boolean) => void
  onPhotoWindowExpired?: () => void
  /** Optional device-local key for restoring selected files until upload succeeds. */
  draftKey?: string
  disabled?: boolean
  /** Keeps file selection available offline while preventing network upload controls. */
  uploadDisabled?: boolean
  /** Reuse this capture interaction with domain-specific accessible copy. */
  copy?: Partial<PrivatePhotoCaptureCopy>
}

export function WastePhotoCapture<TPhoto extends PrivatePhotoEvidence = KitchenWastePhoto>({
  ownerId,
  wasteLogId,
  initialPhotos = [],
  onUpload,
  onPhotoUploaded,
  onCanSubmitChange,
  onPhotoWindowExpired,
  draftKey,
  disabled = false,
  uploadDisabled = false,
  copy: copyOverrides,
}: WastePhotoCaptureProps<TPhoto>) {
  const t = useT()
  const subjectId = ownerId ?? wasteLogId
  const copy: PrivatePhotoCaptureCopy = {
    title: copyOverrides?.title ?? t('kitchen.wastePhotos.title'),
    help: copyOverrides?.help ?? t('kitchen.wastePhotos.help'),
    add: copyOverrides?.add ?? t('kitchen.wastePhotos.add'),
    addName: copyOverrides?.addName ?? copyOverrides?.add ?? t('kitchen.wastePhotos.add'),
    invalidType: copyOverrides?.invalidType ?? t('kitchen.wastePhotos.invalidType'),
    tooMany: copyOverrides?.tooMany ?? t('kitchen.wastePhotos.tooMany'),
    tooLarge: copyOverrides?.tooLarge ?? t('kitchen.wastePhotos.tooLarge'),
    required: copyOverrides?.required ?? t('kitchen.wastePhotos.required'),
    upload: copyOverrides?.upload ?? t('kitchen.wastePhotos.upload'),
    uploaded: copyOverrides?.uploaded ?? t('kitchen.wastePhotos.uploaded'),
    failed: copyOverrides?.failed ?? t('kitchen.wastePhotos.failed'),
    progress: copyOverrides?.progress ?? (n => t('kitchen.wastePhotos.progress', { n })),
    preview: copyOverrides?.preview ?? (n => t('kitchen.wastePhotos.preview', { n })),
    remove: copyOverrides?.remove ?? (n => t('kitchen.wastePhotos.remove', { n })),
    retry: copyOverrides?.retry ?? (n => t('kitchen.wastePhotos.retry', { n })),
    ready: copyOverrides?.ready ?? (n => t(n === 1 ? 'kitchen.wastePhotos.ready.one' : 'kitchen.wastePhotos.ready.other', { count: n })),
    windowExpired: copyOverrides?.windowExpired ?? (minutes => t('kitchen.wastePhotos.windowExpired', { minutes })),
    draftSaved: copyOverrides?.draftSaved ?? t('kitchen.wastePhotos.draftSaved'),
    draftSaveFailed: copyOverrides?.draftSaveFailed ?? t('kitchen.wastePhotos.draftSaveFailed'),
  }
  const titleId = useId()
  const [photos, setPhotos] = useState<PhotoEntry[]>(() => initialPhotos.map((photo) => ({
    id: photo.path,
    name: photo.name ?? photo.path.split('/').at(-1) ?? t('kitchen.wastePhotos.title'),
    previewUrl: photo.url,
    path: photo.path,
    status: 'uploaded',
  })))
  const [validationError, setValidationError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [hydratedDraftKey, setHydratedDraftKey] = useState<string | null>(draftKey ?? '')
  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saved' | 'failed'>('idle')
  const previewUrls = useRef(new Map<string, string>())

  useEffect(() => {
    let active = true
    if (!draftKey) {
      setHydratedDraftKey('')
      return () => { active = false }
    }
    setHydratedDraftKey(null)
    void loadOfflinePhotoDraft(draftKey).then(files => {
      if (!active) return
      const restored = files.map(file => {
        const id = crypto.randomUUID()
        const previewUrl = URL.createObjectURL(file)
        previewUrls.current.set(id, previewUrl)
        return { id, file, name: file.name, previewUrl, status: 'selected' as const }
      })
      setPhotos(current => {
        const uploaded = current.filter(photo => photo.status === 'uploaded')
        const pendingByFile = new Map<string, PhotoEntry>()
        for (const photo of restored) {
          if (photo.file) pendingByFile.set(`${photo.file.name}|${photo.file.size}|${photo.file.lastModified}`, photo)
        }
        for (const photo of current.filter(item => item.status !== 'uploaded')) {
          if (photo.file) pendingByFile.set(`${photo.file.name}|${photo.file.size}|${photo.file.lastModified}`, photo)
        }
        return [...uploaded, ...pendingByFile.values()]
      })
      setHydratedDraftKey(draftKey)
    })
    return () => { active = false }
  }, [draftKey])

  useEffect(() => {
    let active = true
    if (!draftKey || hydratedDraftKey !== draftKey) return () => { active = false }
    const pending = photos.filter(photo => (photo.status === 'selected' || photo.status === 'error') && photo.file)
    if (pending.length === 0) {
      setDraftSaveStatus('idle')
      void saveOfflinePhotoDraft(draftKey, [])
      return () => { active = false }
    }
    void saveOfflinePhotoDraft(draftKey, pending.map(photo => photo.file!)).then(saved => {
      if (active) setDraftSaveStatus(saved ? 'saved' : 'failed')
    })
    return () => { active = false }
  }, [draftKey, hydratedDraftKey, photos])

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
        nextError = copy.invalidType
        continue
      }
      if (photos.length + additions.length >= MAX_WASTE_PHOTOS) {
        nextError = copy.tooMany
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
    if (disabled || uploadDisabled || !photo?.file || photo.status === 'uploading' || photo.status === 'uploaded') return
    setValidationError('')
    setPhotos(current => current.map(item => item.id === photoId ? { ...item, status: 'uploading' } : item))
    try {
      const uploaded = onUpload
        ? await onUpload(subjectId, photo.file)
        : await uploadKitchenWastePhoto(subjectId, photo.file) as unknown as TPhoto
      if (uploaded) onPhotoUploaded?.(uploaded)
      setPhotos(current => current.map(item => item.id === photoId ? {
        ...item,
        file: undefined,
        path: uploaded?.path ?? item.path,
        previewUrl: uploaded?.url ?? item.previewUrl,
        status: 'uploaded',
      } : item))
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
      if (terminalStatus === 'expired') {
        setValidationError(copy.windowExpired(WASTE_PHOTO_UPLOAD_WINDOW_MINUTES))
        onPhotoWindowExpired?.()
      }
      if (terminalStatus === 'tooLarge') setValidationError(copy.tooLarge)
    }
  }

  async function uploadSelected() {
    if (isUploading || disabled || uploadDisabled) return
    setIsUploading(true)
    try {
      const pending = photos.filter(photo => photo.status === 'selected' || photo.status === 'error')
      for (const photo of pending) await uploadPhoto(photo.id)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <section className="waste-photo-capture" aria-labelledby={titleId}>
      <div className="waste-photo-capture-heading">
        <h3 id={titleId}>{copy.title}</h3>
        <p>{copy.help}</p>
      </div>
      <label className="waste-photo-capture-add">
        <input
          className="waste-photo-capture-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          aria-label={copy.addName}
          multiple
          onChange={addFiles}
          disabled={photos.length >= MAX_WASTE_PHOTOS || isUploading || disabled}
        />
        <span>{copy.add}</span>
      </label>

      {validationError && <p role="alert" className="waste-photo-capture-error">{validationError}</p>}
      {draftSaveStatus === 'saved' && <p role="status" className="waste-photo-capture-readiness">{copy.draftSaved}</p>}
      {draftSaveStatus === 'failed' && <p role="alert" className="waste-photo-capture-error">{copy.draftSaveFailed}</p>}

      {photos.length > 0 && (
        <ul className="waste-photo-capture-list">
          {photos.map((photo, index) => (
            <li className="waste-photo-capture-item" key={photo.id}>
              <img src={photo.previewUrl} alt={copy.preview(index + 1)} />
              <div className="waste-photo-capture-file">
                <span className="waste-photo-capture-filename" title={photo.name}>{photo.name}</span>
                {photo.status === 'uploading' && (
                  <progress aria-label={copy.progress(index + 1)} />
                )}
                {(photo.status === 'error' || photo.status === 'expired' || photo.status === 'tooLarge') && (
                  <span role="alert" className="waste-photo-capture-error">
                    {photo.status === 'expired'
                      ? copy.windowExpired(WASTE_PHOTO_UPLOAD_WINDOW_MINUTES)
                      : photo.status === 'tooLarge'
                        ? copy.tooLarge
                        : copy.failed}
                  </span>
                )}
                {photo.status === 'uploaded' && <span className="waste-photo-capture-uploaded">{copy.uploaded}</span>}
              </div>
              {photo.status === 'error' ? (
                <button type="button" className="btn btn-ghost waste-photo-capture-remove" disabled={disabled || uploadDisabled} onClick={() => void uploadPhoto(photo.id)}>
                  {copy.retry(index + 1)}
                </button>
              ) : photo.status !== 'uploaded' && photo.status !== 'uploading' ? (
                <button type="button" className="btn btn-ghost waste-photo-capture-remove" disabled={disabled} onClick={() => removePhoto(photo)}>
                  {copy.remove(index + 1)}
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
          disabled={isUploading || disabled || uploadDisabled}
          onClick={() => void uploadSelected()}
        >
          {isUploading ? t('common.working') : copy.upload}
        </button>
      )}
      <p className="waste-photo-capture-readiness" role="status" aria-live="polite">
        {uploadedCount > 0 ? copy.ready(uploadedCount) : copy.required}
      </p>
    </section>
  )
}
