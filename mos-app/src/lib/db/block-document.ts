// Shared block documents: a top-level JSON array of editor blocks stored in one jsonb column
// (Objective write-up, Task description). RLS and the column checks are the authority; the size
// guard here only spares a doomed request. Content read back is sanitized before it reaches the
// editor, so only the allowed blocks and inline nodes ever render.

export const BLOCK_DOCUMENT_MAX_BYTES = 262144

export type BlockDocument = unknown[]

/** One stored document and the `updated_at` it was read at (the concurrency token of the next save). */
export interface BlockDocumentRead {
  blocks: BlockDocument | null
  updatedAt: string
}

/** Where a document comes from and goes to. `save` returns the new `updated_at`. */
export interface BlockDocumentStore {
  read: () => Promise<BlockDocumentRead | null>
  save: (blocks: BlockDocument, expectedUpdatedAt: string) => Promise<string>
}

export class BlockDocumentConflictError extends Error {
  constructor(message = 'document changed elsewhere') {
    super(message)
    this.name = 'BlockDocumentConflictError'
  }
}

export class BlockDocumentTooLargeError extends Error {
  constructor(message = 'document too large') {
    super(message)
    this.name = 'BlockDocumentTooLargeError'
  }
}

/** Which inline nodes beyond text and links a document may carry. */
export interface BlockDocumentInlineOptions {
  /** `mention` nodes: a person or Team, stored as kind + id. */
  mentions?: boolean
  /** `recordLink` nodes: a Task, Objective, Project/Process, Signal or Meeting, stored as kind + id. */
  recordLinks?: boolean
  /** Extra block types (a Meeting's task rows): each type maps to the sanitizer that returns its one stored shape, or null to drop it. */
  blocks?: Record<string, (block: Record<string, unknown>) => Record<string, unknown> | null>
}

const MENTION_KINDS = ['person', 'team'] as const
export type MentionNodeKind = (typeof MENTION_KINDS)[number]
const RECORD_LINK_KINDS = ['task', 'objective', 'project', 'signal', 'meeting'] as const
export type RecordLinkKind = (typeof RECORD_LINK_KINDS)[number]

const SAFE_LINK = /^(?:https?|mailto|tel):/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A stored record id: only a uuid survives a load. */
export const isDocumentId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

/** Only http, https, mailto and tel links render as links; anything else is plain text. */
export function isSafeDocumentLink(href: unknown): boolean {
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
const isMentionKind = (v: unknown): v is MentionNodeKind => MENTION_KINDS.some((k) => k === v)
const isRecordLinkKind = (v: unknown): v is RecordLinkKind => RECORD_LINK_KINDS.some((k) => k === v)

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

/** A mention or record link keeps its kind and uuid only: names and titles are never stored. */
function sanitizeReference(node: unknown, options: BlockDocumentInlineOptions): Rec | null {
  if (!isRec(node) || !isRec(node.props)) return null
  const { kind, id } = node.props
  if (!isDocumentId(id)) return null
  if (node.type === 'mention' && options.mentions && isMentionKind(kind)) return { type: 'mention', props: { kind, id: id.toLowerCase() } }
  if (node.type === 'recordLink' && options.recordLinks && isRecordLinkKind(kind)) return { type: 'recordLink', props: { kind, id: id.toLowerCase() } }
  return null
}

function sanitizeInline(options: BlockDocumentInlineOptions) {
  return (node: unknown): Rec[] => {
    const text = sanitizeText(node)
    if (text) return [text]
    const reference = sanitizeReference(node, options)
    if (reference) return [reference]
    if (!isRec(node) || node.type !== 'link' || !Array.isArray(node.content)) return []
    const inner = node.content.map(sanitizeText).filter((t): t is Rec => t !== null)
    return typeof node.href === 'string' && isSafeDocumentLink(node.href) ? [{ type: 'link', href: node.href, content: inner }] : inner
  }
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

type Sanitizers = { inline: ReturnType<typeof sanitizeInline>; custom: NonNullable<BlockDocumentInlineOptions['blocks']> }

const safeId = (block: Rec): Rec => (typeof block.id === 'string' && /^[\w-]{1,64}$/.test(block.id) ? { id: block.id } : {})

function sanitizeBlock(block: unknown, depth: number, ctx: Sanitizers): Rec | null {
  if (isRec(block) && typeof block.type === 'string' && Object.hasOwn(ctx.custom, block.type)) {
    const kept = ctx.custom[block.type](block)
    return kept && { ...kept, ...safeId(block) }
  }
  if (!isRec(block) || !isBlockType(block.type)) return null
  const out: Rec = { type: block.type, ...safeId(block) }
  const props = sanitizeProps(block.type, block.props)
  if (Object.keys(props).length > 0) out.props = props
  if (typeof block.content === 'string') out.content = [{ type: 'text', text: block.content, styles: {} }]
  else if (Array.isArray(block.content)) out.content = block.content.flatMap(ctx.inline)
  if (Array.isArray(block.children) && depth < MAX_DEPTH) {
    const children = sanitizeBlocks(block.children, depth + 1, ctx)
    if (children.length > 0) out.children = children
  }
  return out
}

function sanitizeBlocks(blocks: unknown[], depth: number, ctx: Sanitizers): Rec[] {
  return blocks.map((b) => sanitizeBlock(b, depth, ctx)).filter((b): b is Rec => b !== null)
}

/**
 * Sanitize stored content before it reaches the editor: only the allowed text blocks with their
 * valid props survive; inline content is text, safe links and (when enabled) mentions and record
 * links with a known kind and a uuid; everything else is dropped.
 */
export function sanitizeBlockDocument(blocks: unknown, options: BlockDocumentInlineOptions = {}): BlockDocument {
  return Array.isArray(blocks) ? sanitizeBlocks(blocks, 0, { inline: sanitizeInline(options), custom: options.blocks ?? {} }) : []
}

function blockDocumentByteLength(blocks: BlockDocument): number {
  return new TextEncoder().encode(JSON.stringify(blocks)).length
}

/** Throws before any request when the document is past the database cap. */
export function assertBlockDocumentSize(blocks: BlockDocument): void {
  if (blockDocumentByteLength(blocks) > BLOCK_DOCUMENT_MAX_BYTES) throw new BlockDocumentTooLargeError()
}

/** Every `{kind, id}` reference of one inline type found anywhere in a document (children included). */
export function collectDocumentReferences<K extends string>(
  blocks: BlockDocument, type: 'mention' | 'recordLink',
): Array<{ kind: K; id: string }> {
  const seen = new Map<string, { kind: K; id: string }>()
  const walk = (list: unknown[]) => {
    for (const block of list) {
      if (!isRec(block)) continue
      if (Array.isArray(block.content)) {
        for (const node of block.content) {
          if (isRec(node) && node.type === type && isRec(node.props) && typeof node.props.id === 'string' && typeof node.props.kind === 'string') {
            seen.set(`${node.props.kind}:${node.props.id}`, { kind: node.props.kind as K, id: node.props.id })
          }
        }
      }
      if (Array.isArray(block.children)) walk(block.children)
    }
  }
  walk(blocks)
  return [...seen.values()]
}
