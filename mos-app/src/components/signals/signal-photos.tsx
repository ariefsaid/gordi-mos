import { useT } from '@/i18n/use-t'
import type { SignalPhoto } from '@/lib/db/signal-photos'
import { useSignalPhotos } from './use-signal-photos'
import './signal-photos.css'

/** `link` — the record: each photo opens full size. Without it (a feed row that is itself one
 * press target) the photos are plain images. */
export function SignalPhotoStrip({ photos, link = false }: { photos: readonly SignalPhoto[] | undefined; link?: boolean }) {
  const t = useT()
  if (!photos || photos.length === 0) return null
  return (
    <ul className={`signal-photos${link ? ' signal-photos--record' : ''}`} aria-label={t('signals.record.photosLabel')}>
      {photos.map((photo, i) => {
        const img = <img src={photo.url} loading="lazy" alt={t(link ? 'signals.record.photoAlt' : 'signals.composer.photoAlt', { n: i + 1, total: photos.length })} />
        return <li key={photo.path}>{link ? <a href={photo.url} target="_blank" rel="noreferrer">{img}</a> : img}</li>
      })}
    </ul>
  )
}

export function SignalRecordPhotos({ signalId }: { signalId: string }) {
  return <SignalPhotoStrip photos={useSignalPhotos([signalId])[signalId]} link />
}
