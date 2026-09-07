import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { listObjectiveProgress, type ObjectiveProgress } from '@/lib/db/objectives'
import './home-objectives-door.css'

export function HomeObjectivesDoor() {
  const t = useT()
  const titleId = useId()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [rows, setRows] = useState<ObjectiveProgress[]>([])
  const load = useCallback(() => {
    setState('loading')
    listObjectiveProgress().then((data) => { setRows(data); setState('ready') }).catch(() => setState('error'))
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <section className="home-objectives-door" aria-labelledby={titleId}>
      <h2 id={titleId} className="home-objectives-title">{t('home.objectives.title')}</h2>
      {state === 'loading' && <LoadingShell count={2} label={t('home.objectives.title')} />}
      {state === 'error' && <ErrorState message={t('home.objectives.error')} onRetry={load} retryLabel={t('home.objectives.retry')} />}
      {state === 'ready' && rows.length === 0 && (
        <EmptyState nested variant="quiet" title={t('home.objectives.empty')} />
      )}
      {state === 'ready' && rows.length > 0 && (
        <div className="home-objectives-rows">
          {rows.map((row) => (
            <Link key={row.id} className="home-objective-row" to={`/work/objectives?q=${encodeURIComponent(row.name)}`}>
              <span>{row.name}</span><span className="tabular"> · {row.done}/{row.total} {t('home.objectives.done')} →</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
