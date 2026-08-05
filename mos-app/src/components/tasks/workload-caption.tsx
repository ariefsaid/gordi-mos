// WorkloadCaption — FR-236 / NFR-206 literacy bar.
// Shown when groupBy === 'workline' AND the list is filtered to exactly one person.
// Plain English sentence: "{Name}'s work: {N} projects and {M} daily jobs."
// Self-reference ("Your work:") when the filtered person is the viewer.
// One short sentence max; no new visual language; everyday words.

import { useT } from '@/i18n/use-t'

export type WorkloadSummary = {
  /** The display name (first name only) of the filtered person; or 'You' if it's the viewer. */
  isSelf: boolean
  firstName: string
  projectCount: number
  dailyCount: number
  /**
   * RI-4: open tasks that have no work_line_id (unclassified).
   * When > 0, the caption appends "and N unassigned" so the sentence reconciles
   * with all visible tasks (no silent omissions — NFR-206 literacy bar).
   */
  unassignedCount: number
}

type WorkloadCaptionProps = {
  summary: WorkloadSummary
}

export function WorkloadCaption({ summary }: WorkloadCaptionProps) {
  const t = useT()
  const { isSelf, firstName, projectCount, dailyCount, unassignedCount } = summary

  const subject = isSelf ? t('tasks.workload.you') : t('tasks.workload.person', { name: firstName })
  const parts: string[] = []
  if (projectCount > 0) {
    parts.push(t(projectCount === 1 ? 'tasks.workload.project.one' : 'tasks.workload.project.many', { count: projectCount }))
  }
  if (dailyCount > 0) {
    parts.push(t(dailyCount === 1 ? 'tasks.workload.daily.one' : 'tasks.workload.daily.many', { count: dailyCount }))
  }

  // RI-4: append the unassigned count so the sentence reconciles with reality.
  if (unassignedCount > 0) parts.push(t('tasks.workload.unassigned', { count: unassignedCount }))

  const body = parts.length > 0 ? parts.join(` ${t('tasks.workload.and')} `) + '.' : t('tasks.workload.none')
  const sentence = `${subject}: ${body}`

  return (
    <p
      className="workload-caption"
      role="status"
      aria-label={t('tasks.workload.summary')}
    >
      {sentence}
    </p>
  )
}
