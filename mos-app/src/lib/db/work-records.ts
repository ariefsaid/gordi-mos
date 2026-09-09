import { supabase } from '@/lib/supabase'
import { wibToday } from './cafe-opening'

// Read-only detail seams for the existing Project/Process tables. This module deliberately does
// not add lifecycle writes or schema assumptions: RLS remains the authority and the Process
// worker owns start/finish/cancel mutations separately.
const mos = () => supabase.schema('mos')

export interface ProcessCadenceRecord {
  id: string
  work_line_id: string
  cadence_kind: 'manual' | 'daily' | 'weekly' | 'monthly'
  active: boolean
  timezone: string
  anchor_date: string | null
}

export interface ProcessStepRecord {
  id: string
  work_line_id: string
  title: string
  description: string | null
  position: number
  due_offset_days: number
  pic_person_id: string | null
  pic_role_id: string | null
  supervisor_person_id: string | null
  supervisor_role_id: string | null
  checklist_items?: unknown
  archived_at: string | null
}

export interface ProcessOccurrenceRecord {
  id: string
  work_line_id: string
  owning_team_id: string
  period_key: string
  caption: string
  scheduled_date: string
  status: 'open' | 'completed' | 'cancelled'
  definition_version: number
  started_by: string | null
  completed_at: string | null
  completed_by: string | null
}

export interface ProcessRecordData {
  cadence: ProcessCadenceRecord | null
  steps: ProcessStepRecord[]
  occurrences: ProcessOccurrenceRecord[]
}

export interface ProcessCollectionOccurrenceFact {
  run_ids: readonly string[]
  scheduled_date: string | null
  status: ProcessOccurrenceRecord['status'] | 'mixed'
  done: number
  total: number
  pending_unresolved: number
}

export interface ProcessCollectionFact {
  work_line_id: string
  cadence_kind: ProcessCadenceRecord['cadence_kind'] | null
  cadence_active: boolean | null
  anchor_date: string | null
  next_due_date: string | null
  current_occurrence: ProcessCollectionOccurrenceFact | null
}

function isoWeekPeriodKey(date: string): string {
  const value = new Date(`${date}T00:00:00Z`)
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${value.getUTCFullYear()}W${String(week).padStart(2, '0')}`
}

function currentPeriodKey(kind: ProcessCadenceRecord['cadence_kind'], today: string): string {
  if (kind === 'daily' || kind === 'manual') return today
  if (kind === 'monthly') return today.slice(0, 7)
  return isoWeekPeriodKey(today)
}

function aggregateOccurrenceStatus(
  statuses: readonly ProcessOccurrenceRecord['status'][],
): ProcessCollectionOccurrenceFact['status'] {
  const unique = [...new Set(statuses)]
  return unique.length === 1 ? unique[0] : 'mixed'
}

/** Load the small cadence/progress projection used by the Projects & Processes collection. This
 * is deliberately separate from the focused Process document loader: the collection needs one
 * cadence row, the next due date, and the current occurrence roll-up, while the document reads
 * full steps and occurrences. Both reads stay inside the existing mos process tables and remain
 * RLS-governed. */
export async function listProcessCollectionFacts(workLineIds: string[]): Promise<ProcessCollectionFact[]> {
  if (workLineIds.length === 0) return []
  const today = wibToday()
  const [cadenceResult, runsResult] = await Promise.all([
    mos().from('process_cadences')
      .select('work_line_id,cadence_kind,active,anchor_date')
      .in('work_line_id', workLineIds),
    mos().from('process_runs')
      .select('id,work_line_id,period_key,scheduled_date,status')
      .in('work_line_id', workLineIds)
      .order('scheduled_date', { ascending: true }),
  ])
  if (cadenceResult.error) throw new Error(`listProcessCollectionFacts cadence failed — ${cadenceResult.error.message}`)
  if (runsResult.error) throw new Error(`listProcessCollectionFacts runs failed — ${runsResult.error.message}`)

  const runs = (runsResult.data ?? []) as Array<{
    id: string
    work_line_id: string
    period_key: string
    scheduled_date: string
    status: ProcessOccurrenceRecord['status']
  }>

  const cadenceById = new Map<string, ProcessCollectionFact>()
  for (const row of (cadenceResult.data ?? []) as Array<{
    work_line_id: string
    cadence_kind: ProcessCadenceRecord['cadence_kind']
    active: boolean
    anchor_date: string | null
  }>) {
    cadenceById.set(row.work_line_id, {
      work_line_id: row.work_line_id,
      cadence_kind: row.cadence_kind,
      cadence_active: row.active,
      anchor_date: row.anchor_date,
      next_due_date: null,
      current_occurrence: null,
    })
  }

  // A Process may be adopted by more than one Team in the same period. Resolve the current run
  // set before reading roll-ups so the collection asks the view only for runs it can render; a
  // historical run must never affect current progress or add avoidable roll-up work.
  const currentRunsById = new Map<string, typeof runs>()
  for (const id of workLineIds) {
    const cadence = cadenceById.get(id)
    const kind = cadence?.cadence_kind
    if (!cadence?.cadence_active || !kind) continue
    const currentRuns = kind === 'manual'
      ? runs.filter((run) => run.work_line_id === id && run.status === 'open')
      : runs.filter((run) => run.work_line_id === id
        && run.period_key === currentPeriodKey(kind, today)
        && run.status !== 'cancelled')
    if (currentRuns.length > 0) currentRunsById.set(id, currentRuns)
  }

  const currentRunIds = [...new Set([...currentRunsById.values()].flat().map((run) => run.id))]
  const rollupByRunId = new Map<string, {
    scheduled_date: string
    status: ProcessOccurrenceRecord['status']
    done: number
    total: number
    pending_unresolved: number
  }>()
  if (currentRunIds.length > 0) {
    const rollupResult = await mos().from('process_run_rollup')
      .select('process_run_id,scheduled_date,status,done,total,pending_unresolved')
      .in('process_run_id', currentRunIds)
    if (rollupResult.error) throw new Error(`listProcessCollectionFacts rollups failed — ${rollupResult.error.message}`)
    for (const row of (rollupResult.data ?? []) as Array<{
      process_run_id: string
      scheduled_date: string
      status: ProcessOccurrenceRecord['status']
      done: number
      total: number
      pending_unresolved: number
    }>) {
      rollupByRunId.set(row.process_run_id, row)
    }
    const missingRunId = currentRunIds.find((runId) => !rollupByRunId.has(runId))
    if (missingRunId) {
      throw new Error(`listProcessCollectionFacts missing rollup for ${missingRunId}`)
    }
  }

  const nextDueById = new Map<string, string>()
  const firstPastById = new Map<string, string>()
  for (const row of runs) {
    if (row.status === 'cancelled') continue
    if (row.scheduled_date >= today && !nextDueById.has(row.work_line_id)) nextDueById.set(row.work_line_id, row.scheduled_date)
    if (!firstPastById.has(row.work_line_id)) firstPastById.set(row.work_line_id, row.scheduled_date)
  }

  return workLineIds.map((id) => {
    const fact = cadenceById.get(id) ?? {
      work_line_id: id,
      cadence_kind: null,
      cadence_active: null,
      anchor_date: null,
      next_due_date: null,
      current_occurrence: null,
    }
    const currentRuns = currentRunsById.get(id) ?? []
    const currentRollups = currentRuns.map((run) => rollupByRunId.get(run.id)!)
    const scheduledDates = [...new Set(currentRollups.map((rollup) => rollup.scheduled_date))]
    return {
      ...fact,
      next_due_date: nextDueById.get(id) ?? firstPastById.get(id) ?? null,
      current_occurrence: currentRollups.length > 0 ? {
        run_ids: currentRuns.map((run) => run.id),
        scheduled_date: scheduledDates.length === 1 ? scheduledDates[0] : null,
        status: aggregateOccurrenceStatus(currentRollups.map((rollup) => rollup.status)),
        done: currentRollups.reduce((sum, rollup) => sum + rollup.done, 0),
        total: currentRollups.reduce((sum, rollup) => sum + rollup.total, 0),
        pending_unresolved: currentRollups.reduce((sum, rollup) => sum + rollup.pending_unresolved, 0),
      } : null,
    }
  })
}

/** Load the supported Process definition and existing occurrence facts for one work line. */
export async function loadProcessRecordData(workLineId: string): Promise<ProcessRecordData> {
  const [cadenceResult, stepsResult, occurrencesResult] = await Promise.all([
    mos().from('process_cadences')
      .select('id,work_line_id,cadence_kind,active,timezone,anchor_date')
      .eq('work_line_id', workLineId)
      .maybeSingle(),
    mos().from('process_task_defs')
      .select('id,work_line_id,title,description,position,due_offset_days,checklist_items,pic_person_id,pic_role_id,supervisor_person_id,supervisor_role_id,archived_at')
      .eq('work_line_id', workLineId)
      .is('archived_at', null)
      .order('position', { ascending: true }),
    mos().from('process_runs')
      .select('id,work_line_id,owning_team_id,period_key,caption,scheduled_date,status,definition_version,started_by,completed_at,completed_by')
      .eq('work_line_id', workLineId)
      .order('scheduled_date', { ascending: false }),
  ])

  if (cadenceResult.error) throw new Error(`loadProcessRecordData cadence failed — ${cadenceResult.error.message}`)
  if (stepsResult.error) throw new Error(`loadProcessRecordData steps failed — ${stepsResult.error.message}`)
  if (occurrencesResult.error) throw new Error(`loadProcessRecordData occurrences failed — ${occurrencesResult.error.message}`)

  return {
    cadence: (cadenceResult.data as ProcessCadenceRecord | null) ?? null,
    steps: (stepsResult.data ?? []) as ProcessStepRecord[],
    occurrences: (occurrencesResult.data ?? []) as ProcessOccurrenceRecord[],
  }
}
