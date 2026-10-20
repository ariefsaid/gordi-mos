// Which period sources a Records view must read completely before it may show a total.
import { movementsFor, type Movement } from './model'
import type { SourceId } from './load'
import type { RecordsUrlState } from './url-state'

const SOURCE_ID_OF = { log: 'logs', count: 'counts', receipt: 'receipts', request: 'requests' } as const
export const MOVEMENT_SOURCE: Record<Movement, SourceId> = { sent: 'logs', made: 'logs', transferred: 'logs', wasted: 'logs', received: 'receipts', requested: 'requests', counted: 'counts' }
const ALL_SOURCES: SourceId[] = ['logs', 'counts', 'receipts', 'requests']

export function requiredSources(state: Pick<RecordsUrlState, 'question' | 'reading' | 'history' | 'entry'>): SourceId[] {
  const set = new Set<SourceId>()
  if (state.reading === 'day') {
    // Day columns come from logs and Counts whatever the question; Received also reads receipts.
    if (state.question !== 'requested') { set.add('logs'); set.add('counts') }
    if (state.question === 'received') set.add('receipts')
  } else for (const movement of movementsFor(state.question)) set.add(MOVEMENT_SOURCE[movement])
  const entrySource = state.entry.split(':')[0] as keyof typeof SOURCE_ID_OF
  if (state.entry && SOURCE_ID_OF[entrySource]) set.add(SOURCE_ID_OF[entrySource])
  if (state.history) ALL_SOURCES.forEach(source => set.add(source))
  return ALL_SOURCES.filter(source => set.has(source))
}
