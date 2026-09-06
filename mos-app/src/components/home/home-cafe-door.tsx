import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { getViewerCafeDoor, type CafeDoorFacts } from '@/lib/db/cafe-opening'
import './home-cafe-door.css'

export function HomeCafeDoor() {
  const t = useT()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [facts, setFacts] = useState<CafeDoorFacts | null>(null)
  const load = useCallback(() => {
    setState('loading')
    getViewerCafeDoor().then((data) => { setFacts(data); setState('ready') }).catch(() => setState('error'))
  }, [])
  useEffect(() => { load() }, [load])
  if (state === 'loading') return <LoadingShell count={1} label={t('home.cafe.title')} />
  if (state === 'error') return <ErrorState message={t('home.cafe.error')} onRetry={load} retryLabel={t('home.cafe.retry')} />
  if (!facts) return null
  return (
    <Link to="/cafe" className="btn btn-outline home-cafe-door">
      <span>{t('home.cafe.title')} {facts.branchName} · {t('home.cafe.today')}</span>
      <span className="tabular">{t('home.cafe.checklist')} {facts.done}/{facts.total}</span>
      <span>{t('home.cafe.action')} →</span>
    </Link>
  )
}
