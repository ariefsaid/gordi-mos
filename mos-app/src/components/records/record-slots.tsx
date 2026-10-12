import { RecordFieldList } from './record-viewer'
import type { RecordContentSlot, RecordFieldSpec, RecordMetadataSection } from './record-viewer.types'

/** A read-only field spec with NO per-field provenance caption. The whole-record read-only
 *  reason is carried once by the viewer footer (LAW-6 / F3), never repeated per row. */
export function readField(spec: Omit<RecordFieldSpec, 'editable' | 'readOnlyReason'>): RecordFieldSpec {
  return { ...spec, editable: false }
}

/** Wrap a read-only field section as an ordered content slot: the section renders through
 *  RecordFieldList inside the slot's `data-content-slot` landmark at the viewer's heading rung. */
export function fieldSlot(id: string, label: string, fields: RecordFieldSpec[]): RecordContentSlot {
  const section: RecordMetadataSection = { id, label, fields }
  return {
    id,
    label,
    section,
    render: (context) => (
      <RecordFieldList
        section={section}
        onCommitField={context.onCommitField}
        onDirtyChange={context.onDirtyChange}
        fieldCommitsFrozen={context.fieldCommitsFrozen}
        headingLevel={context.headingLevel}
      />
    ),
  }
}
