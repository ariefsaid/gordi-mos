// WorkloadCaption — FR-236 / NFR-206 literacy bar.
// Shown when groupBy === 'workline' AND the list is filtered to exactly one person.
// Plain English sentence: "{Name}'s work: {N} projects and {M} daily jobs."
// Self-reference ("Your work:") when the filtered person is the viewer.
// One short sentence max; no new visual language; everyday words.

export type WorkloadSummary = {
  /** The display name (first name only) of the filtered person; or 'You' if it's the viewer. */
  isSelf: boolean
  firstName: string
  projectCount: number
  dailyCount: number
}

type WorkloadCaptionProps = {
  summary: WorkloadSummary
}

function pluralise(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

export function WorkloadCaption({ summary }: WorkloadCaptionProps) {
  const { isSelf, firstName, projectCount, dailyCount } = summary

  const subject = isSelf ? 'Your work' : `${firstName}'s work`
  const parts: string[] = []
  if (projectCount > 0) parts.push(pluralise(projectCount, 'project', 'projects'))
  if (dailyCount > 0) parts.push(pluralise(dailyCount, 'daily job', 'daily jobs'))

  const body = parts.length > 0 ? parts.join(' and ') + '.' : 'no work-lines yet.'
  const sentence = `${subject}: ${body}`

  return (
    <p
      className="workload-caption"
      role="status"
      aria-label="Workload summary"
    >
      {sentence}
    </p>
  )
}
