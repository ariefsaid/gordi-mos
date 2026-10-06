import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { getBusinessUnits } from '@/lib/db/directory'
import { canWorkAnyLane } from '@/lib/follow-up-lanes'
import { FOLLOW_UPS_PAGE_SIZE, listFollowUps, transitionFollowUp, isOverdue, type FollowUpRow, type FollowUpState, type FollowUpTransition } from '@/lib/db/follow-ups'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { ListPaging } from '@/components/ui/list-paging'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { StatusPill, type TaskStatus } from '@/components/tasks/status-pill'

type FetchState = 'loading' | 'ready' | 'error'

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function nextActions(row: FollowUpRow, canConfirm: boolean, canChase: boolean): FollowUpTransition[] {
  if (row.state === 'settled') return canConfirm ? ['confirm'] : []
  if (row.state === 'confirmed') return []
  if (!canChase) return []
  const basic: FollowUpTransition[] = ['chase', 'promise', 'partial', 'settle']
  return basic
}

function followUpStatusTone(state: FollowUpState): TaskStatus {
  if (state === 'open') return 'Open'
  if (state === 'confirmed') return 'Done'
  return 'In Progress'
}

export function FollowUpsPage() {
  useDocumentTitle('Follow-up queue — Gordi MOS')
  const t = useT()
  const auth = useAuth()
  const isDesktop = useIsDesktop()
  const [params] = useSearchParams()
  const route = useParams<{ id?: string }>()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const accessRoles = useMemo(() => viewer?.accessRoles ?? [], [viewer])
  const canConfirm = accessRoles.includes('finance') || accessRoles.includes('admin')
  const [canChase, setCanChase] = useState(accessRoles.includes('admin'))
  const [rows, setRows] = useState<FollowUpRow[]>([])
  const [state, setState] = useState<FetchState>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const cursorRef = useRef<Pick<FollowUpRow, 'created_at' | 'id'> | null>(null)
  const loadGeneration = useRef(0)
  const moreInFlight = useRef(false)
  const [active, setActive] = useState<{ id: string; verb: FollowUpTransition } | null>(null)
  const [form, setForm] = useState({ amount: '', cash_in_date: '', evidence: '', promise_date: '', note: '' })
  // Typed date text that is not a usable date: Submit stays off rather than sending the old date.
  const [dateInvalid, setDateInvalid] = useState(false)

  const load = useCallback(() => {
    const generation = ++loadGeneration.current
    let cancelled = false
    setState('loading')
    setHasMore(false)
    setLoadingMore(false)
    setMoreError(false)
    moreInFlight.current = false
    cursorRef.current = null
    listFollowUps({ overdue: params.get('filter') === 'overdue' })
      .then((data) => {
        if (!cancelled && generation === loadGeneration.current) {
          setRows(data)
          cursorRef.current = data.length === FOLLOW_UPS_PAGE_SIZE ? data.at(-1)! : null
          setHasMore(cursorRef.current !== null)
          setState('ready')
        }
      })
      .catch(() => { if (!cancelled && generation === loadGeneration.current) setState('error') })
    return () => { cancelled = true }
  }, [params])

  useEffect(() => load(), [load])

  useEffect(() => {
    if (!viewer) return
    let cancelled = false
    getBusinessUnits()
      .then((bus) => {
        if (!cancelled) setCanChase(canWorkAnyLane(viewer.roles, bus, accessRoles))
      })
      .catch(() => setCanChase(accessRoles.includes('admin')))
    return () => { cancelled = true }
  }, [accessRoles, viewer])

  const overdueCount = useMemo(() => rows.filter((row) => isOverdue(row)).length, [rows])

  async function loadMore() {
    const before = cursorRef.current
    if (!before || moreInFlight.current) return
    const generation = loadGeneration.current
    moreInFlight.current = true
    setLoadingMore(true)
    setMoreError(false)
    try {
      const page = await listFollowUps({ overdue: params.get('filter') === 'overdue', before })
      if (generation !== loadGeneration.current) return
      setRows((loaded) => [...loaded, ...page])
      cursorRef.current = page.length === FOLLOW_UPS_PAGE_SIZE ? page.at(-1)! : null
      setHasMore(cursorRef.current !== null)
    } catch {
      if (generation === loadGeneration.current) setMoreError(true)
    } finally {
      if (generation === loadGeneration.current) {
        moreInFlight.current = false
        setLoadingMore(false)
      }
    }
  }

  async function run(row: FollowUpRow, verb: FollowUpTransition) {
    if (verb === 'partial' || verb === 'settle' || verb === 'promise') {
      setActive({ id: row.id, verb })
      setForm({ amount: verb === 'settle' ? String(row.running_balance) : '', cash_in_date: '', evidence: '', promise_date: '', note: '' })
      return
    }
    await transitionFollowUp(row.id, verb, {})
    load()
  }

  async function submit(row: FollowUpRow, verb: FollowUpTransition) {
    const payload = verb === 'promise'
      ? { promise_date: form.promise_date, note: form.note }
      : { amount: Number(form.amount || row.running_balance), cash_in_date: form.cash_in_date, evidence: form.evidence, note: form.note }
    await transitionFollowUp(row.id, verb, payload)
    setActive(null)
    load()
  }

  function renderTransitionForm(row: FollowUpRow, verb: FollowUpTransition) {
    if (verb === 'chase' || verb === 'confirm') return null
    const formReady = verb === 'promise'
      ? !!form.promise_date
      : !!form.cash_in_date && !!form.evidence && !!form.amount

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {verb === 'promise' ? (
          <DateField
            aria-label={t('followUps.promiseDate')}
            value={form.promise_date}
            onChange={(promise_date) => setForm({ ...form, promise_date })}
            onValidityChange={setDateInvalid}
          />
        ) : (
          <>
            <input
              aria-label={t('followUps.amountInput')}
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <DateField
              aria-label={t('followUps.cashInDate')}
              value={form.cash_in_date}
              onChange={(cash_in_date) => setForm({ ...form, cash_in_date })}
              onValidityChange={setDateInvalid}
            />
            <input
              aria-label={t('followUps.evidence')}
              placeholder={t('followUps.evidence')}
              value={form.evidence}
              onChange={(e) => setForm({ ...form, evidence: e.target.value })}
            />
          </>
        )}
        <Button variant="primary" disabled={!formReady || dateInvalid} onClick={() => void submit(row, verb)}>
          {t('followUps.submit')}
        </Button>
      </div>
    )
  }

  const detailRow = rows.find((row) => row.id === (active?.id ?? route.id)) ?? null

  const columns: DataTableColumn<FollowUpRow>[] = [
    {
      key: 'counterparty',
      header: t('followUps.counterparty'),
      cardLabel: '',
      render: (row) => (
        <div>
          <strong className="follow-ups-counterparty">{row.counterparty}</strong>
          <br />
          {row.source_invoice_ref ?? row.kind}
        </div>
      ),
    },
    {
      key: 'original_amount',
      header: t('followUps.amount'),
      numeric: true,
      render: (row) => money.format(row.original_amount),
    },
    {
      key: 'running_balance',
      header: t('followUps.balance'),
      numeric: true,
      render: (row) => money.format(row.running_balance),
    },
    {
      key: 'state',
      header: t('followUps.state'),
      render: (row) => (
        <StatusPill status={followUpStatusTone(row.state)} label={row.state} />
      ),
    },
    {
      key: 'due_date',
      header: t('followUps.due'),
      render: (row) => (
        <>
          {row.due_date ?? '—'}
          {isOverdue(row) ? ` · ${t('followUps.overdue')}` : ''}
        </>
      ),
    },
    {
      key: 'actions',
      header: t('followUps.actions'),
      render: (row) => {
        const actions = nextActions(row, canConfirm, canChase)

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {actions.length === 0 && <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
              {actions.map((verb) => (
                <Button key={verb} variant="outline" onClick={() => void run(row, verb)}>
                  {t(`followUps.action.${verb}`)}
                </Button>
              ))}
            </div>
          </div>
        )
      },
    },
  ]

  return (
    <PageFrame variant="data">
      <PageHead
        variant="content"
        title={t('followUps.title')}
        count={state === 'ready' ? (hasMore ? `${rows.length}+` : rows.length) : null}
        meta={<span>{t('followUps.overdue')}: {hasMore ? `${overdueCount}+` : overdueCount}</span>}
      />
      {state === 'loading' && <SkeletonRows count={5} />}
      {state === 'error' && (
        <ErrorState
          message={t('followUps.error')}
          onRetry={() => { load() }}
        />
      )}
      {state === 'ready' && rows.length === 0 && (
        <EmptyState title={t('followUps.empty')} />
      )}
      {state === 'ready' && rows.length > 0 && (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            isDesktop={isDesktop}
            caption={t('followUps.title')}
          />
          <ListPaging count={rows.length} hasMore={hasMore} loading={loadingMore}
            error={moreError} onLoadMore={() => { void loadMore() }} />
        </>
      )}
      {state === 'ready' && detailRow && (
        <aside
          role="complementary"
          aria-label="Follow-up detail"
          style={{
            marginTop: 16,
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-rest)',
          }}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{detailRow.counterparty}</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 12px', margin: '0 0 12px' }}>
            <dt style={{ color: 'var(--muted-foreground)' }}>Source</dt>
            <dd style={{ margin: 0 }}>{detailRow.source_invoice_ref ?? detailRow.kind}</dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>State</dt>
            <dd style={{ margin: 0 }}>
              <StatusPill status={followUpStatusTone(detailRow.state)} label={detailRow.state} />
            </dd>
            <dt style={{ color: 'var(--muted-foreground)' }}>Running balance</dt>
            <dd className="tabular" style={{ margin: 0 }}>{money.format(detailRow.running_balance)}</dd>
          </dl>
          {active?.id === detailRow.id && renderTransitionForm(detailRow, active.verb)}
        </aside>
      )}
    </PageFrame>
  )
}
