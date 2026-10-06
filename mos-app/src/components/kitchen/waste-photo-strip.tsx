import { useT } from '@/i18n/use-t'
import type { PrivatePhotoEvidence } from '@/lib/db/photo-evidence'
import type { KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import './waste-photo-strip.css'

/** Compact immutable evidence: each private thumbnail opens its signed original in a new tab. */
export function WastePhotoStrip<TPhoto extends PrivatePhotoEvidence = KitchenWastePhoto>({
  photos,
  copy,
}: {
  photos: readonly TPhoto[] | undefined
  copy?: { reviewLabel: string; openAlt: (n: number, total: number) => string }
}) {
  const t = useT()
  if (!photos?.length) return null
  return (
    <ul className="waste-photo-strip" aria-label={copy?.reviewLabel ?? t('kitchen.wastePhotos.reviewLabel')}>
      {photos.map((photo, index) => (
        <li key={photo.path}>
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            aria-label={copy?.openAlt(index + 1, photos.length) ?? t('kitchen.wastePhotos.openAlt', { n: index + 1, total: photos.length })}
          >
            <img src={photo.url} loading="lazy" alt="" />
          </a>
        </li>
      ))}
    </ul>
  )
}
