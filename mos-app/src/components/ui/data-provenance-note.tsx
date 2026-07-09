import { formatWibDateTime } from '@/lib/wib-time'
import '@/components/dashboard/freshness-label.css'

type SnapshotProvenanceNoteProps = {
  kind: 'snapshot'
  hasData: boolean
  asOf?: string | Date | null
  nextSyncLabel?: string
}

type LiveProvenanceNoteProps = {
  kind: 'live'
  show: boolean
  note: string
}

export type DataProvenanceNoteProps = SnapshotProvenanceNoteProps | LiveProvenanceNoteProps

export function DataProvenanceNote(props: DataProvenanceNoteProps) {
  if (props.kind === 'live') {
    if (!props.show) return null
    return <span className="freshness-label">{props.note}</span>
  }

  if (props.hasData && props.asOf) {
    return (
      <span className="freshness-label">
        as of <span className="tabular freshness-label-ts">{formatWibDateTime(props.asOf)}</span>
      </span>
    )
  }

  return <span className="freshness-label">No snapshot yet · next sync {props.nextSyncLabel ?? '03:30 WIB'}</span>
}
