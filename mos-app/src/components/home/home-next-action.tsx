import { useId } from 'react'
import { useT } from '@/i18n/use-t'
import { useHomeRedesignT } from '@/i18n/home-redesign'
import type { StreamItem } from '@/lib/home-stream'
import { LoadingShell } from '@/components/ui/state-kit'
import { StreamRow } from './stream-row'
import './home-next-action.css'

/** `readState` is the worst state of the regions the next task is drawn from: while they load or have
 *  failed, "no task needs you" would be a made-up all-clear, so the section shows a skeleton / hides. */
export function HomeNextAction({ item, readState = 'ready' }: { item: StreamItem | null; readState?: 'loading' | 'error' | 'ready' }) {
  const t = useT()
  const homeT = useHomeRedesignT()
  const headingId = useId()
  if (!item && readState === 'error') return null
  return (
    <section className="home-next-action" aria-labelledby={headingId}>
      <h2 id={headingId} className="home-next-action-heading">{homeT('nextAction')}</h2>
      {item ? (
        <ul className="home-next-action-list">
          <StreamRow item={item} reasonStyle="text" actionLabel={t('home.brief.openTask')} />
        </ul>
      ) : readState === 'loading' ? (
        <LoadingShell count={1} label={t('common.loading')} />
      ) : (
        <p className="home-next-action-empty">{homeT('noNextAction')}</p>
      )}
    </section>
  )
}
