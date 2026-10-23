import { supabase } from '@/lib/supabase'
import {
  assertBlockDocumentSize,
  BLOCK_DOCUMENT_MAX_BYTES,
  BlockDocumentConflictError,
  BlockDocumentTooLargeError,
  isSafeDocumentLink,
  sanitizeBlockDocument,
  type BlockDocument,
} from './block-document'

// Objective write-up: mos.objectives.write_up, a top-level JSON array of editor blocks (the shared
// block-document shape). RLS and the column check are the authority; the size guard only spares a
// doomed request. Never sends updated_at — the DB stamps it, and it is the concurrency token for the next save.

const mos = () => supabase.schema('mos')

export const WRITE_UP_MAX_BYTES = BLOCK_DOCUMENT_MAX_BYTES

export type WriteUpBlocks = BlockDocument

export interface WriteUpRead {
  writeUp: WriteUpBlocks | null
  updatedAt: string
}

export class WriteUpConflictError extends BlockDocumentConflictError {
  constructor() {
    super('write-up changed elsewhere')
    this.name = 'WriteUpConflictError'
  }
}

export class WriteUpTooLargeError extends BlockDocumentTooLargeError {
  constructor() {
    super('write-up too large')
    this.name = 'WriteUpTooLargeError'
  }
}

export const isSafeWriteUpLink = isSafeDocumentLink

/** Sanitize stored write-up content before it reaches the editor (text blocks, text and safe links only). */
export function sanitizeWriteUp(blocks: unknown): WriteUpBlocks {
  return sanitizeBlockDocument(blocks)
}

/** Read one Objective's write-up and the `updated_at` it was read at. Null when the row is not visible. */
export async function readWriteUp(objectiveId: string): Promise<WriteUpRead | null> {
  const { data, error } = await mos()
    .from('objectives')
    .select('write_up,updated_at')
    .eq('id', objectiveId)
    .maybeSingle()
  if (error) throw new Error(`readWriteUp failed — ${error.message}`)
  if (!data) return null
  const row = data as { write_up: unknown; updated_at: string }
  return { writeUp: Array.isArray(row.write_up) ? row.write_up : null, updatedAt: row.updated_at }
}

/**
 * Conditional save: only replaces the write-up when `updated_at` still equals `expectedUpdatedAt`.
 * Returns the new `updated_at`. Zero matched rows throws WriteUpConflictError — never retried here.
 */
export async function saveWriteUp(
  objectiveId: string,
  blocks: WriteUpBlocks,
  expectedUpdatedAt: string,
): Promise<string> {
  try {
    assertBlockDocumentSize(blocks)
  } catch {
    throw new WriteUpTooLargeError()
  }
  const { data, error } = await mos()
    .from('objectives')
    .update({ write_up: blocks })
    .eq('id', objectiveId)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at')
  if (error) throw new Error(`saveWriteUp failed — ${error.message}`)
  const rows = (data ?? []) as Array<{ updated_at: string }>
  if (rows.length === 0) throw new WriteUpConflictError()
  return rows[0].updated_at
}
