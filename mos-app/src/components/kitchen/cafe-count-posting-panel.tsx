import { useEffect, useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/cafe/redesign/worksheet'
import { useT } from '@/i18n/use-t'
import { formatWeekdayDayMonth } from '@/lib/format/date'
import {
  listCafeCountPostingQueue,
  listCafeCountPostingSwitches,
  releaseCafeCountPosting,
  setCafeCountPostingEnabled,
  type CafeCountPostingQueueRow,
  type CafeCountPostingSwitch,
} from '@/lib/db/cafe-count'
import { useIsOffline } from '@/shell/use-is-offline'
import { streamKey, streamLabel } from '@/lib/kitchen-action-label'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { ALL_STREAMS } from './cafe-stream-bar'
import './cafe-count-posting-panel.css'

const STATUS_KEYS = {
  held: 'cafe.count.posting.status.held',
  queued: 'cafe.count.posting.status.queued',
  awaiting_authorization: 'cafe.count.posting.status.awaiting_authorization',
  posted: 'cafe.count.posting.status.posted',
  failed: 'cafe.count.posting.status.failed',
} as const

export function CafeCountPostingPanel({
  streamFilter,
  streamCatalog,
  canManagePosting,
  canReleasePosting,
  refreshKey,
}: {
  streamFilter: string
  streamCatalog: readonly ProductionStream[]
  canManagePosting: boolean
  canReleasePosting: boolean
  refreshKey: number
}) {
  const t = useT()
  const offline = useIsOffline()
  const [rows, setRows] = useState<CafeCountPostingQueueRow[] | null>(null)
  const [switches, setSwitches] = useState<CafeCountPostingSwitch[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [queueError, setQueueError] = useState(false)
  const [switchError, setSwitchError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [busyBranch, setBusyBranch] = useState<string | null>(null)
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setQueueError(false)
    void listCafeCountPostingQueue().then(next => {
      if (active) setRows(next)
    }).catch(() => {
      if (active) setQueueError(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    if (canManagePosting) {
      setSwitchError(false)
      void listCafeCountPostingSwitches().then(next => {
        if (active) setSwitches(next)
      }).catch(() => {
        if (active) setSwitchError(true)
      })
    } else {
      setSwitches(null)
      setSwitchError(false)
    }
    return () => { active = false }
  }, [canManagePosting, refreshKey, retry])

  const visibleRows = useMemo(() => (rows ?? []).filter(row =>
    streamFilter === ALL_STREAMS || streamKey(row.branch_id, row.activity) === streamFilter,
  ), [rows, streamFilter])
  const heldByBranch = useMemo(() => {
    const held = new Map<string, CafeCountPostingQueueRow[]>()
    for (const row of visibleRows) {
      if (row.posting_status !== 'held') continue
      const group = held.get(row.branch_id) ?? []
      group.push(row)
      held.set(row.branch_id, group)
    }
    return held
  }, [visibleRows])

  async function toggle(branch: CafeCountPostingSwitch, enabled: boolean) {
    if (busyBranch || offline) return
    setBusyBranch(branch.branch_id)
    setActionError(false)
    try {
      await setCafeCountPostingEnabled(branch.branch_id, enabled)
      setSwitches(current => current?.map(row => row.branch_id === branch.branch_id ? { ...row, posting_enabled: enabled } : row) ?? null)
      setRetry(value => value + 1)
    } catch {
      setActionError(true)
    } finally {
      setBusyBranch(null)
    }
  }

  async function release(branchId: string) {
    if (busyBranch || offline) return
    setBusyBranch(branchId)
    setActionError(false)
    setReleaseMessage(null)
    try {
      const result = await releaseCafeCountPosting(branchId)
      setReleaseMessage(t('cafe.count.posting.releaseResult', {
        released: result.released_lines,
        outdated: result.expected_out_of_date_lines,
      }))
      setRetry(value => value + 1)
    } catch {
      setActionError(true)
    } finally {
      setBusyBranch(null)
    }
  }

  const statusLabel = (row: CafeCountPostingQueueRow) => row.expected_out_of_date
    ? t('cafe.count.posting.expectedOutOfDate')
    : t(STATUS_KEYS[row.posting_status])

  return <div className="cafe-count-posting">
    {canManagePosting && <Panel title={t('cafe.count.posting.switchesTitle')} open className="cafe-count-posting__switch-panel">
      <p>{t('cafe.count.posting.switchesHelp')}</p>
      {switchError && <Notice tone="urgent" action={<button type="button" className="btn btn-outline btn-touch" onClick={() => setRetry(value => value + 1)}>{t('common.retry')}</button>}>{t('cafe.count.posting.switchesFailed')}</Notice>}
      {switches === null && !switchError ? <p role="status">{t('common.loading')}</p>
        : switches?.length === 0 ? <p>{t('cafe.count.posting.noBranches')}</p>
          : <ul className="cafe-count-posting__switches">{switches?.map(branch => {
            const id = `count-posting-${branch.branch_id}`
            return <li key={branch.branch_id}>
              <label htmlFor={id}>{branch.branch_name}</label>
              <Checkbox id={id} checked={branch.posting_enabled} disabled={offline || busyBranch !== null}
                aria-label={t('cafe.count.posting.switchLabel', { branch: branch.branch_name })}
                aria-busy={busyBranch === branch.branch_id}
                onChange={enabled => void toggle(branch, enabled)} />
            </li>
          })}</ul>}
    </Panel>}

    <Panel title={t('cafe.count.posting.queueTitle')} open className="cafe-count-posting__queue-panel">
      <p>{t('cafe.count.posting.queueHelp')}</p>
      {offline && <Notice tone="attention" role="alert">{t('cafe.count.offline')}</Notice>}
      {actionError && <Notice tone="urgent" action={<button type="button" className="btn btn-outline btn-touch" onClick={() => setRetry(value => value + 1)}>{t('common.retry')}</button>}>{t('cafe.count.posting.actionFailed')}</Notice>}
      {releaseMessage && <p role="status" aria-live="polite">{releaseMessage}</p>}
      {loading && <p role="status">{t('common.loading')}</p>}
      {queueError && <Notice tone="urgent" action={<button type="button" className="btn btn-outline btn-touch" onClick={() => setRetry(value => value + 1)}>{t('common.retry')}</button>}>{t('cafe.count.posting.queueFailed')}</Notice>}
      {!loading && !queueError && visibleRows.length === 0 && <p>{t('cafe.count.posting.queueEmpty')}</p>}
      {!loading && !queueError && visibleRows.length > 0 && <ul className="cafe-count-posting__rows">
        {visibleRows.map(row => {
          const stream = streamCatalog.find(candidate => candidate.branch.id === row.branch_id && candidate.activity === row.activity) ?? null
          return <li key={row.line_id}>
            <div>
              <strong>{row.item_name}</strong>
              <span>{stream ? streamLabel(t, stream) : row.branch_name} · {formatWeekdayDayMonth(row.count_date)}</span>
            </div>
            <div className="cafe-count-posting__state">
              <span role="status">{statusLabel(row)}</span>
              {row.esb_doc_num && <span>{t('cafe.count.posting.document', { number: row.esb_doc_num })}</span>}
              {row.posting_error && <span role="alert">{row.posting_error}</span>}
            </div>
          </li>
        })}
      </ul>}
      {canReleasePosting && !loading && !queueError && [...heldByBranch].map(([branchId, held]) => {
        const branch = visibleRows.find(row => row.branch_id === branchId)
        const enabled = branch?.posting_enabled ?? false
        if (!enabled) return null
        return <button key={branchId} type="button" className="btn btn-outline btn-touch"
          disabled={offline || busyBranch !== null} onClick={() => void release(branchId)}>
          {busyBranch === branchId ? t('common.working') : t('cafe.count.posting.release', { branch: branch?.branch_name ?? '', count: held.length })}
        </button>
      })}
    </Panel>
  </div>
}
