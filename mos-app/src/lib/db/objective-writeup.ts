import { supabase } from '@/lib/supabase'

// Objective write-up: mos.objectives.write_up, a top-level JSON array of editor blocks.
// RLS and the column check are the authority; the size guard here only spares a doomed request.
// Never sends updated_at — the DB stamps it, and it is the concurrency token for the next save.

const mos = () => supabase.schema('mos')

export const WRITE_UP_MAX_BYTES = 262144

export type WriteUpBlocks = unknown[]

export interface WriteUpRead {
  writeUp: WriteUpBlocks | null
  updatedAt: string
}

export class WriteUpConflictError extends Error {
  constructor() {
    super('write-up changed elsewhere')
    this.name = 'WriteUpConflictError'
  }
}

export class WriteUpTooLargeError extends Error {
  constructor() {
    super('write-up too large')
    this.name = 'WriteUpTooLargeError'
  }
}

const SAFE_LINK = /^(?:https?|mailto|tel):/i

/** Only http, https, mailto and tel links render as links; anything else is plain text. */
export function isSafeWriteUpLink(href: unknown): boolean {
  if (typeof href !== 'string') return false
  // eslint-disable-next-line no-control-regex
  return SAFE_LINK.test(href.replace(/[\u0000-\u0020\u007f-\u009f\u2000-\u200f\u2028\u2029\ufeff]/g, ''))
}

function plainTextInline(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') return [node]
  const item = node as { type?: unknown; href?: unknown; content?: unknown }
  if (item.type !== 'link' || isSafeWriteUpLink(item.href)) return [node]
  return Array.isArray(item.content) ? item.content : []
}

function plainTextBlock(block: unknown): unknown {
  if (!block || typeof block !== 'object') return block
  const b = block as { content?: unknown; children?: unknown }
  const next: Record<string, unknown> = { ...b }
  if (Array.isArray(b.content)) next.content = b.content.flatMap(plainTextInline)
  if (Array.isArray(b.children)) next.children = b.children.map(plainTextBlock)
  return next
}

/** Replace links with a disallowed scheme by their text, at any block depth. */
export function plainTextUnsafeLinks(blocks: WriteUpBlocks): WriteUpBlocks {
  return blocks.map(plainTextBlock)
}

export function writeUpByteLength(blocks: WriteUpBlocks): number {
  return new TextEncoder().encode(JSON.stringify(blocks)).length
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
  if (writeUpByteLength(blocks) > WRITE_UP_MAX_BYTES) throw new WriteUpTooLargeError()
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
