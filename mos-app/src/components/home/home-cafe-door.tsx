import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import type { HomeCafeDoorData } from '@/lib/db/home-cafe'
import './home-cafe-door.css'

export type HomeCafeDoorState = 'loading' | 'ready' | 'error'

export interface HomeCafeDoorProps {
  state?: HomeCafeDoorState
  data?: HomeCafeDoorData | null
  onRetry?: () => void
}

/** The member's first door: today’s real opening run, or an honest not-started/empty state. */
export function HomeCafeDoor({ state = 'ready', data = null, onRetry }: HomeCafeDoorProps) {
  const t = useT()
  const titleId = useId()

  return (
    <section className="home-cafe-door" aria-labelledby={titleId} data-testid="home-cafe-door">
      <h2 id={titleId} className="home-cafe-door-heading">{t('home.cafeDoor.heading')}</h2>
      {state === 'loading' ? (
        <LoadingShell count={1} label={t('home.cafeDoor.loading')} />
      ) : state === 'error' ? (
        <ErrorState message={t('home.cafeDoor.error')} onRetry={onRetry} retryLabel={t('home.cafeDoor.retry')} />
      ) : data ? (
        <Link to="/cafe" className="home-cafe-door-link">
          <span className="home-cafe-door-copy">
            <span className="home-cafe-door-kicker">{t('home.cafeDoor.title', { branch: data.branchName })}</span>
            <span className="home-cafe-door-checklist">
              {data.opening.rollup
                ? t('home.cafeDoor.progress', {
                    done: data.opening.rollup.done,
                    total: data.opening.rollup.total,
                  })
                : t('home.cafeDoor.notStarted')}
            </span>
          </span>
          <span className="home-cafe-door-action">{t('home.cafeDoor.action')}</span>
        </Link>
      ) : (
        <EmptyState title={t('home.cafeDoor.empty')} variant="blank" nested headingLevel={3} />
      )}
    </section>
  )
}
