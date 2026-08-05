// useFollowUpQueue — the single data/behavior hook behind every Follow-up queue
// door (Money queue entry, Work Tasks saved-view, and the canonical
// /work/follow-ups record page). Money-inbox-alignment (Step 9, FR-905/AC-906/
// AC-907): extracted verbatim from FollowUpsPage so the record has ONE canonical
// behavior implementation reached from multiple destinations (ADR-0025 D9;
// experience-contract Rule 2 "Follow-up" row).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { getBusinessUnits } from '@/lib/db/directory'
import { canWorkAnyLane } from '@/lib/follow-up-lanes'
import {
  listFollowUps,
  transitionFollowUp,
  isOverdue,
  type FollowUpRow,
  type FollowUpTransition,
} from '@/lib/db/follow-ups'

export type FollowUpFetchState = 'loading' | 'ready' | 'error'

export interface FollowUpTransitionForm {
  amount: string
  cash_in_date: string
  evidence: string
  promise_date: string
  note: string
}

export interface UseFollowUpQueueOptions {
  /** the follow-up id whose detail aside should open (the canonical /work/follow-ups/:id route). */
  detailId?: string
}

export interface FollowUpQueueState {
  rows: FollowUpRow[]
  state: FollowUpFetchState
  error: string | null
  overdueCount: number
  canConfirm: boolean
  canChase: boolean
  active: { id: string; verb: FollowUpTransition } | null
  form: FollowUpTransitionForm
  detailRow: FollowUpRow | null
  setForm: (form: FollowUpTransitionForm) => void
  load: () => void
  run: (row: FollowUpRow, verb: FollowUpTransition) => Promise<void>
  submit: (row: FollowUpRow, verb: FollowUpTransition) => Promise<void>
}

const EMPTY_FORM: FollowUpTransitionForm = { amount: '', cash_in_date: '', evidence: '', promise_date: '', note: '' }

export function useFollowUpQueue({ detailId }: UseFollowUpQueueOptions = {}): FollowUpQueueState {
  const auth = useAuth()
  const [params] = useSearchParams()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const accessRoles = useMemo(() => viewer?.accessRoles ?? [], [viewer])
  const canConfirm = accessRoles.includes('finance') || accessRoles.includes('admin')
  const [canChase, setCanChase] = useState(accessRoles.includes('admin'))
  const [rows, setRows] = useState<FollowUpRow[]>([])
  const [state, setState] = useState<FollowUpFetchState>('loading')
  const [active, setActive] = useState<{ id: string; verb: FollowUpTransition } | null>(null)
  const [form, setForm] = useState<FollowUpTransitionForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    listFollowUps({ overdue: params.get('filter') === 'overdue' })
      .then((data) => { if (!cancelled) { setRows(data); setState('ready') } })
      .catch((err: unknown) => { if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setState('error') } })
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

  const run = useCallback(async (row: FollowUpRow, verb: FollowUpTransition) => {
    if (verb === 'partial' || verb === 'settle' || verb === 'promise') {
      setActive({ id: row.id, verb })
      setForm({ ...EMPTY_FORM, amount: verb === 'settle' ? String(row.running_balance) : '' })
      return
    }
    await transitionFollowUp(row.id, verb, {})
    load()
  }, [load])

  const submit = useCallback(async (row: FollowUpRow, verb: FollowUpTransition) => {
    const payload = verb === 'promise'
      ? { promise_date: form.promise_date, note: form.note }
      : { amount: Number(form.amount || row.running_balance), cash_in_date: form.cash_in_date, evidence: form.evidence, note: form.note }
    await transitionFollowUp(row.id, verb, payload)
    setActive(null)
    load()
  }, [form, load])

  const detailRow = rows.find((row) => row.id === (active?.id ?? detailId)) ?? null

  return { rows, state, error, overdueCount, canConfirm, canChase, active, form, detailRow, setForm, load, run, submit }
}
