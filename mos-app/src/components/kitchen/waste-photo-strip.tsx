import { useT } from '@/i18n/use-t'
import type { KitchenWastePhoto } from '@/lib/db/kitchen-waste-photos'
import './waste-photo-strip.css'

/** Compact review evidence: each private thumbnail opens its signed original in a new tab. */
export function WastePhotoStrip({ photos }: { photos: readonly KitchenWastePhoto[] | undefined }) {
  const t = useT()
  if (!photos?.length) return null
  return (
    <ul className="waste-photo-strip" aria-label={t('kitchen.wastePhotos.reviewLabel')}>
      {photos.map((photo, index) => (
        <li key={photo.path}>
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            aria-label={t('kitchen.wastePhotos.openAlt', { n: index + 1, total: photos.length })}
          >
            <img src={photo.url} loading="lazy" alt="" />
          </a>
        </li>
      ))}
    </ul>
  )
}
