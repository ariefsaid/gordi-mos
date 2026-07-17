import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listReadableSignals, correctSignal, listAllTeams } from '@/lib/db/signals'
import { getPeople } from '@/lib/db/directory'
import type { SignalRow } from '@/lib/db/signals.types'
import { useSignalComposer } from '@/shell/signal-composer-host'
import { SignalFeed } from './signal-feed'

// C3b (AC-426/FR-414): the Home ambient feed slot — fetch+mutate wrapper around the presentational
// SignalFeed (B13), mirroring Home's own convention ("each slot = one read-model/DAL query + one
// existing kit primitive", home-page.tsx). "Create Task" navigates to the canonical record, where
// the real Create-follow-up-Task flow lives (SignalRecordHost, C3a) — Rule 11: one implementation,
// not a second inline flow duplicated into the feed.

type FetchState = 'loading' | 'ready' | 'error'

export function SignalFeedSection() {
  const navigate = useNavigate()
  const { open: openSignalComposer } = useSignalComposer()
  const [signals, setSignals] = useState<SignalRow[]>([])
  const [authorNamesById, setAuthorNamesById] = useState<Record<string, string>>({})
  const [teamNamesById, setTeamNamesById] = useState<Record<string, string>>({})
  const [state, setState] = useState<FetchState>('loading')

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    Promise.all([listReadableSignals({}), getPeople(), listAllTeams()])
      .then(([signalRows, people, teams]) => {
        if (cancelled) return
        setSignals(signalRows)
        setAuthorNamesById(Object.fromEntries(people.map((p) => [p.id, p.full_name])))
        setTeamNamesById(Object.fromEntries(teams.map((team) => [team.id, team.name])))
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') }) // ambient region — degrades quietly, never blocks Home
    return () => { cancelled = true }
  }, [])

  useEffect(() => load(), [load])

  function openRecord(signalId: string) {
    navigate(`/work/signals?record=${signalId}`)
  }

  async function handleCategorize(signalId: string, category: SignalRow['category']) {
    if (!category) return
    await correctSignal(signalId, { category })
    load()
  }

  if (state === 'loading') return null // Home's own skeleton regions cover initial paint (NFR-405)

  return (
    <SignalFeed
      signals={signals}
      authorNamesById={authorNamesById}
      teamNamesById={teamNamesById}
      onShareClick={openSignalComposer}
      onCategorize={(signalId, category) => { void handleCategorize(signalId, category) }}
      onCreateTask={openRecord}
      onOpen={openRecord}
    />
  )
}
