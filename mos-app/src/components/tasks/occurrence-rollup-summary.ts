type OccurrenceRollupSummaryKey =
  | 'processes.rollup.summaryNoAssign'
  | 'processes.rollup.summaryUnassigned'

export function occurrenceRollupSummaryKey(pendingUnresolved: number, canAssign: boolean): OccurrenceRollupSummaryKey {
  return pendingUnresolved === 0 || canAssign
    ? 'processes.rollup.summaryNoAssign'
    : 'processes.rollup.summaryUnassigned'
}
