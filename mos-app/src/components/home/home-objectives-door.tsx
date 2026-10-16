import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { GroupHeader } from '@/components/ui/group-header'
import type { HomeObjectiveProgress } from '@/lib/db/home-objectives'
// The band grammar this door is built from (`.stream-band` / `-head` / `-label` / `-link`) lives
// in home-stream.css — the same shared texture Home's List bands and the Signals feed head render
// through. Pulled in here because no arrangement imports it on this section's behalf.
import './home-stream.css'
import './home-objectives-door.css'

/**
 * AC-204 (4): Home's Objectives roll-up door.
 *
 * #179 cut the cascade route and took Home's progress drill with it. What was left on the
 * owner-cockpit read as a surface with something removed. This is the successor door on the
 * SHIPPED Home, and it is deliberately shaped like a finished section rather than like a drop
 * point: a real headed band with the same hairline + display-face label every other Home group
 * carries, live progress rows, and a drill link. No dashed placeholder, no "coming" language —
 * that is what a removed surface leaves behind.
 *
 * HomePage owns the read and passes the same real Objective → Work line → Task roll-up the Work
 * surfaces use. This component owns only the door anatomy and its loading/error/empty states.
 */
export interface HomeObjectivesDoorProps {
  state?: 'loading' | 'ready' | 'error'
  rows?: readonly HomeObjectiveProgress[]
  onRetry?: () => void
}

export function HomeObjectivesDoor({ state = 'ready', rows = [], onRetry }: HomeObjectivesDoorProps) {
  const t = useT()
  return (
    <section className="stream-band home-objectives-door" aria-label={t('home.objectives.title')}>
      {/* The shared GroupHeader: name, muted "(n)", and the band's own drill door at the right. Its
          label does not repeat the heading (DESIGN.md Don't); the section name carries the subject. */}
      <GroupHeader
        label={t('home.objectives.title')}
        count={state === 'ready' ? rows.length : undefined}
        trailing={<Link to="/work/objectives" className="stream-band-link tap-floor">{t('home.objectives.drill')}</Link>}
      />
      {state === 'loading' ? (
        <LoadingShell count={2} label={t('home.objectives.loading')} />
      ) : state === 'error' ? (
        <ErrorState message={t('home.objectives.error')} onRetry={onRetry} retryLabel={t('home.objectives.retry')} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('home.objectives.empty')} variant="quiet" nested headingLevel={3} />
      ) : (
        <ul className="home-objectives-list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/work/objectives/${row.id}`}
                className="home-objective-row tap-floor"
              >
                <span className="home-objective-name">{row.name}</span>
                <span className="home-objective-progress tabular-nums">
                  {t('home.objectives.progress', { done: row.done, total: row.total })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
