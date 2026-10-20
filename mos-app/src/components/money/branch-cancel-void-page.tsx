import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useT } from '@/i18n/use-t'
import { latestCancelVoidDate } from '@/lib/db/cancel-void'
import { readMoneyView, resolveMoneyWindow, withMoneyView } from '@/lib/money-branch-table'
import { useNormalizeMoneyRange } from '@/lib/use-normalize-money-range'
import { PeriodControl } from './money-head'
import { CancelVoidRegister } from './cancel-void-register'
import { ErrorState } from '@/components/ui/state-kit'

// Ops leads can review cases without acquiring a revenue or margin tier.
export function BranchCancelVoidPage() {
  const { code = '' } = useParams()
  const t = useT()
  useDocumentTitle(`${code} · ${t('money.cancelVoid.title')}`)
  const [params, setParams] = useSearchParams()
  const [latest, setLatest] = useState<string | null>(null)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setStatus('loading')
    latestCancelVoidDate(code).then(
      value => { if (live) { setLatest(value); setStatus('ready') } },
      () => { if (live) setStatus('error') },
    )
    return () => { live = false }
  }, [code, attempt])
  const view = readMoneyView(params, { canSeeMargin: false, latestDate: latest ?? undefined })
  useNormalizeMoneyRange({ searchParams: params, setSearchParams: setParams, ready: status === 'ready', view })
  const window = latest ? resolveMoneyWindow(view, latest) : null
  return <PageFamilyFrame family="workspace" title={code}>
    <div className="money-body money-branch">
      <div className="money-filter-controls"><PeriodControl period={view.period} range={view.range} latestDate={latest}
        disabled={status !== 'ready' || !latest}
        onChange={period => setParams(withMoneyView(params, { ...view, period, range: null }))}
        onRangeChange={range => setParams(withMoneyView(params, { ...view, range }))} /></div>
      {status === 'loading' && <p role="status">{t('common.loading')}</p>}
      {status === 'error' && <ErrorState message={t('money.cancelVoid.loadError')} onRetry={() => setAttempt(value => value + 1)} />}
      {status === 'ready' && !window && <p>{t('money.cancelVoid.empty')}</p>}
      {window && <CancelVoidRegister key={code} branch={code} start={window.from} end={window.to} />}
    </div>
  </PageFamilyFrame>
}
