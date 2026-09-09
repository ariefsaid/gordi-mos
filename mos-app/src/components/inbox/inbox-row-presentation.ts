import type { Attention } from '@/lib/db/signals.types'
import type { TriageNotificationRow } from './read-handled-semantics'

export type InboxEntityType = 'signal' | 'task' | 'follow_up' | 'unknown'

export interface InboxRowPresentation {
  actorName: string | null
  entityType: InboxEntityType
  attention: Attention | null
  /** The notification producer, when present in the metadata envelope. */
  source: string | null
  /** A structured reason, used by signal-retraction notifications. */
  reason: string | null
  isSignalRetraction: boolean
  sourceLine: string | null
  fallbackTitle: string
}

const ENTITY_TYPES: readonly InboxEntityType[] = ['signal', 'task', 'follow_up']
const ATTENTIONS: readonly Attention[] = ['FYI', 'Needs attention', 'Urgent']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function firstLine(value: string | null): string | null {
  const line = value?.trim().split(/\r?\n/, 1)[0]?.trim()
  return line || null
}

/**
 * Projects the notification envelope into the small amount of source context Inbox needs.
 * Old notifications remain renderable through `fallbackTitle`; new mention rows can compose a
 * stable actor/source title without parsing the frozen notification title.
 */
export function deriveInboxRowPresentation(row: TriageNotificationRow): InboxRowPresentation {
  const metadata = isRecord(row.metadata) ? row.metadata as Record<string, unknown> : {}
  const actor = isRecord(metadata.actor) ? metadata.actor : null
  const entity = isRecord(metadata.entity) ? metadata.entity : null
  const actorName = typeof actor?.name === 'string' && actor.name.trim() ? actor.name.trim() : null
  const rawEntityType = typeof entity?.type === 'string' ? entity.type : ''
  const entityType = (ENTITY_TYPES as readonly string[]).includes(rawEntityType)
    ? rawEntityType as InboxEntityType
    : 'unknown'
  const rawAttention = typeof metadata.attention === 'string' ? metadata.attention : null
  const attention = rawAttention && (ATTENTIONS as readonly string[]).includes(rawAttention)
    ? rawAttention as Attention
    : null

  return {
    actorName,
    entityType,
    attention,
    source: typeof metadata.source === 'string' && metadata.source.trim() ? metadata.source.trim() : null,
    reason: typeof metadata.reason === 'string' && metadata.reason.trim() ? metadata.reason.trim() : null,
    isSignalRetraction: metadata.source === 'signal_retraction' && rawEntityType === 'signal',
    sourceLine: firstLine(row.body),
    fallbackTitle: row.title,
  }
}
