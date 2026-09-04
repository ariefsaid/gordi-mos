import type { SignalRow } from '@/lib/db/signals.types'

/** Build the one canonical Tasks create URL, carrying Signal context for the inline composer. */
export function signalTaskCreateHref(signal: Pick<SignalRow, 'id' | 'body' | 'owning_team_id'>, businessUnitId: string, responsiblePersonId: string): string {
  const params = new URLSearchParams({
    create: '1',
    createTitle: signal.body.split(/\r?\n/, 1)[0] ?? signal.body,
    createBu: businessUnitId,
    createPic: responsiblePersonId,
    sourceSignal: signal.id,
  })
  return `/work/tasks?${params.toString()}`
}
