// FollowUpRecordHost — the fetch layer behind the canonical Follow-up record door. It
// resolves ONE follow-up (row + lifecycle events + people) and renders it through the
// shared RecordViewer via createFollowUpRecordAdapter — the same grammar a Task or a
// Signal uses. `mode` mirrors the Task/Signal record hosts: "panel" (the in-list drawer
// content) or "page" (the standalone canonical record page). Chrome (Close / Open full
// page / modal regime) is owned by the host slot, never here.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { RecordViewer } from '@/components/records/record-viewer'
import { getPeople, type PersonOption } from '@/lib/db/directory'
import {
  FOLLOW_UPS_PAGE_SIZE,
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
  const [eventsHasMore, setEventsHasMore] = useState(false)
  const [eventsLoadingMore, setEventsLoadingMore] = useState(false)
  const [eventsMoreError, setEventsMoreError] = useState(false)
  const loadGeneration = useRef(0)
  const eventsInFlight = useRef(false)
  const [people, setPeople] = useState<PersonOption[]>([])

  const load = useCallback(() => {
    const generation = ++loadGeneration.current
    let cancelled = false
    eventsInFlight.current = false
    setEventsLoadingMore(false)
    setEventsMoreError(false)
    setState('loading')
    getFollowUp(followUpId)
      .then(async (found) => {
        if (cancelled || generation !== loadGeneration.current) return
        if (!found) { setState('not-found'); return }
        const [eventRows, peopleRows] = await Promise.all([
          listFollowUpEvents(followUpId),
          getPeople(),
        ])
        if (cancelled || generation !== loadGeneration.current) return
        setRow(found)
        setEvents(eventRows)
        setEventsHasMore(eventRows.length === FOLLOW_UPS_PAGE_SIZE)
        setEventsMoreError(false)
        setPeople(peopleRows)
        setState('ready')
      })
      .catch(() => { if (!cancelled && generation === loadGeneration.current) setState('error') })
    return () => { cancelled = true }
  }, [followUpId])

  useEffect(() => load(), [load])

  const loadMoreEvents = useCallback(async () => {
    const before = events.at(-1)
    if (!before || eventsInFlight.current) return
    const generation = loadGeneration.current
    eventsInFlight.current = true
    setEventsLoadingMore(true)
    setEventsMoreError(false)
    try {
      const older = await listFollowUpEvents(followUpId, before)
      if (generation !== loadGeneration.current) return
      setEvents((loaded) => [...loaded, ...older])
      setEventsHasMore(older.length === FOLLOW_UPS_PAGE_SIZE)
    } catch {
      if (generation === loadGeneration.current) setEventsMoreError(true)
    } finally {
      if (generation === loadGeneration.current) {
        eventsInFlight.current = false
        setEventsLoadingMore(false)
      }
    }
  }, [events, followUpId])

  if (state === 'loading') {
    return <LoadingShell count={4} label={t('followUps.loading')} />
  }
  if (state === 'not-found') {
    return <ErrorState message={t('followUps.notFound')} onRetry={load} />
  }
  if (state === 'error' || !row) {
    return <ErrorState message={t('followUps.error')} onRetry={load} />
  }

  const adapter = createFollowUpRecordAdapter({
    row, events, people, eventsHasMore, eventsLoadingMore, eventsMoreError, onLoadMoreEvents: loadMoreEvents,
  })
  return <RecordViewer adapter={adapter} mode={mode} headingLevel={mode === 'page' ? 2 : 2} />
}
