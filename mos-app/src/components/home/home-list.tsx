import type { ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { StreamRow } from './stream-row'
import type { HomeRegion } from './home-regions'
import './home-layouts.css'

export interface HomeLayoutProps {
  regions: HomeRegion[]
  feed: ReactNode
}

// List — one continuous list grouped by kind, attention-first. The most complete of the three:
// nothing is behind a click.
export function HomeList({ regions, feed }: HomeLayoutProps) {
  const t = useT()
  return (
    <div className="home-layout">
      <div>
        {regions.map((region) => (
          <section key={region.id} className="home-band" aria-label={t(region.labelKey)}>
            <h3 className="stream-band-label">{t(region.labelKey)} · {region.count}</h3>
            <ul className="stream-band-list">
              {region.items.map((i) => <StreamRow key={i.id} item={i} />)}
            </ul>
          </section>
        ))}
      </div>
      {feed}
    </div>
  )
}
