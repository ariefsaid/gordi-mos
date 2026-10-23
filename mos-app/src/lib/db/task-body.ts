import { supabase } from '@/lib/supabase'
import {
  assertBlockDocumentSize,
  BlockDocumentConflictError,
  type BlockDocument,
  type BlockDocumentRead,
} from './block-document'

// Task description document: mos.tasks.body, a top-level JSON array of editor blocks. The database
// keeps mos.tasks.description (the plain-text copy) in step, and RLS (mos.can_edit_task) decides who
// may save. Never sends updated_at — the DB stamps it, and it is the concurrency token for the next save.

const mos = () => supabase.schema('mos')

/** Read one Task's document and the `updated_at` it was read at. Null when the row is not visible. */
export async function readTaskBody(taskId: string): Promise<BlockDocumentRead | null> {
  const { data, error } = await mos()
    .from('tasks')
    .select('body,updated_at')
    .eq('id', taskId)
    .maybeSingle()
  if (error) throw new Error(`readTaskBody failed — ${error.message}`)
  if (!data) return null
  const row = data as { body: unknown; updated_at: string }
  return { blocks: Array.isArray(row.body) ? row.body : null, updatedAt: row.updated_at }
}

/**
 * Conditional save: only replaces the document when `updated_at` still equals `expectedUpdatedAt`.
 * Returns the new `updated_at`; with an `actor` it also records one `field_edited` event. Zero matched rows throws BlockDocumentConflictError — never retried here.
 */
export async function saveTaskBody(
  taskId: string, blocks: BlockDocument, expectedUpdatedAt: string, actor?: string | null,
): Promise<string> {
  assertBlockDocumentSize(blocks)
  const { data, error } = await mos()
    .from('tasks')
    .update({ body: blocks })
    .eq('id', taskId)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at')
  if (error) throw new Error(`saveTaskBody failed — ${error.message}`)
  const rows = (data ?? []) as Array<{ updated_at: string }>
  if (rows.length === 0) throw new BlockDocumentConflictError()
  // The Task's activity shows one field edit per save, as a description edit did (no content copied).
  // The save has landed, so a failed event row never turns it into a failed save.
  if (actor) await mos().from('task_events').insert({ task_id: taskId, actor_person_id: actor, event_type: 'field_edited' })
  return rows[0].updated_at
}
