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

const BLOCK_TYPES = ['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'quote'] as const
const COLORS = new Set(['default', 'gray', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'])
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify'])
const BOOLEAN_STYLES = ['bold', 'italic', 'underline', 'strike', 'code'] as const
const COLOR_STYLES = ['textColor', 'backgroundColor'] as const
const MAX_DEPTH = 16

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isBlockType = (v: unknown): v is (typeof BLOCK_TYPES)[number] => BLOCK_TYPES.some((t) => t === v)

function sanitizeStyles(raw: unknown): Rec {
  const out: Rec = {}
  if (!isRec(raw)) return out
  for (const key of BOOLEAN_STYLES) if (raw[key] === true) out[key] = true
  for (const key of COLOR_STYLES) if (typeof raw[key] === 'string' && COLORS.has(raw[key])) out[key] = raw[key]
  return out
}

function sanitizeText(node: unknown): Rec | null {
  if (!isRec(node) || node.type !== 'text' || typeof node.text !== 'string') return null
  return { type: 'text', text: node.text, styles: sanitizeStyles(node.styles) }
}

function sanitizeInline(node: unknown): Rec[] {
  const text = sanitizeText(node)
  if (text) return [text]
  if (!isRec(node) || node.type !== 'link' || !Array.isArray(node.content)) return []
  const inner = node.content.map(sanitizeText).filter((t): t is Rec => t !== null)
  return typeof node.href === 'string' && isSafeWriteUpLink(node.href) ? [{ type: 'link', href: node.href, content: inner }] : inner
}

function sanitizeProps(type: (typeof BLOCK_TYPES)[number], raw: unknown): Rec {
  const out: Rec = {}
  if (!isRec(raw)) return out
  for (const key of COLOR_STYLES) if (typeof raw[key] === 'string' && COLORS.has(raw[key])) out[key] = raw[key]
  if (type !== 'quote' && typeof raw.textAlignment === 'string' && ALIGNMENTS.has(raw.textAlignment)) out.textAlignment = raw.textAlignment
  if (type === 'heading' && typeof raw.level === 'number' && Number.isInteger(raw.level) && raw.level >= 1 && raw.level <= 6) out.level = raw.level
  if (type === 'numberedListItem' && typeof raw.start === 'number' && Number.isInteger(raw.start)) out.start = raw.start
  if (type === 'checkListItem' && raw.checked === true) out.checked = true
  return out
}

function sanitizeBlock(block: unknown, depth: number): Rec | null {
  if (!isRec(block) || !isBlockType(block.type)) return null
  const out: Rec = { type: block.type }
  if (typeof block.id === 'string' && /^[\w-]{1,64}$/.test(block.id)) out.id = block.id
  const props = sanitizeProps(block.type, block.props)
  if (Object.keys(props).length > 0) out.props = props
  if (typeof block.content === 'string') out.content = [{ type: 'text', text: block.content, styles: {} }]
  else if (Array.isArray(block.content)) out.content = block.content.flatMap(sanitizeInline)
  if (Array.isArray(block.children) && depth < MAX_DEPTH) {
    const children = sanitizeBlocks(block.children, depth + 1)
    if (children.length > 0) out.children = children
  }
  return out
}

function sanitizeBlocks(blocks: unknown[], depth: number): Rec[] {
  return blocks.map((b) => sanitizeBlock(b, depth)).filter((b): b is Rec => b !== null)
}

/**
 * Sanitize stored write-up content before it reaches the editor: only the allowed text blocks with
 * their valid props survive, inline content is text and safe links only, everything else is dropped.
 */
export function sanitizeWriteUp(blocks: unknown): WriteUpBlocks {
  return Array.isArray(blocks) ? sanitizeBlocks(blocks, 0) : []
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
