// FollowUpRecordHost — the fetch layer behind the canonical Follow-up record door. It
// resolves ONE follow-up (row + lifecycle events + people) and renders it through the
// shared RecordViewer via createFollowUpRecordAdapter — the same grammar a Task or a
// Signal uses. `mode` mirrors the Task/Signal record hosts: "panel" (the in-list drawer
// content) or "page" (the standalone canonical record page). Chrome (Close / Open full
// page / modal regime) is owned by the host slot, never here.
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { RecordViewer } from '@/components/records/record-viewer'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import {
  getFollowUp,
  listFollowUpEvents,
  type FollowUpRow,
  type FollowUpEvent,
} from '@/lib/db/follow-ups'
import { createFollowUpRecordAdapter } from './follow-up-record-adapter'

export interface FollowUpRecordHostProps {
  followUpId: string
  /** panel = in-list drawer content; page = standalone canonical record page. */
  mode?: 'panel' | 'page'
}

type FetchState = 'loading' | 'ready' | 'error' | 'not-found'

export function FollowUpRecordHost({ followUpId, mode = 'panel' }: FollowUpRecordHostProps) {
  const t = useT()
  const [state, setState] = useState<FetchState>('loading')
  const [row, setRow] = useState<FollowUpRow | null>(null)
  const [events, setEvents] = useState<FollowUpEvent[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    getFollowUp(followUpId)
      .then(async (found) => {
        if (cancelled) return
        if (!found) { setState('not-found'); return }
        const [eventRows, peopleRows] = await Promise.all([
          listFollowUpEvents(followUpId),
          getPeople(),
        ])
        if (cancelled) return
        setRow(found)
        setEvents(eventRows)
        setPeople(peopleRows)
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [followUpId])

  useEffect(() => load(), [load])

  if (state === 'loading') {
    return <LoadingShell count={4} label={t('followUps.loading')} />
  }
  if (state === 'not-found') {
    return <ErrorState message={t('followUps.notFound')} onRetry={load} />
  }
  if (state === 'error' || !row) {
    return <ErrorState message={t('followUps.error')} onRetry={load} />
  }

  const adapter = createFollowUpRecordAdapter({ row, events, people })
  return <RecordViewer adapter={adapter} mode={mode} headingLevel={mode === 'page' ? 2 : 2} />
}
