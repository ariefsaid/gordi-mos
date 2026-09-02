import { buildPersonMentionIndex, extractMentions, type MentionPerson, type PersonMentionIndex } from './mentions'
import { supabase } from '@/lib/supabase'
import { translateFor } from '@/i18n/use-t'
import type { Locale, MessageKey } from '@/i18n/messages'

// Mirrors the CHECK on `mos.comments.entity_type` exactly. `'signal'` is in that CHECK on the
// squashed baseline (mos_structure) and the comment SELECT policy already special-cases it via
// `mos.can_read_signal`, so this union was simply narrower than its own table until Signals ported.
export type CommentEntityType = 'task' | 'weekly_update' | 'daily_log' | 'follow_up' | 'signal'

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message?: string } | null }>

type QueryBuilder<T> = {
  select: (columns?: string) => QueryBuilder<T>
  insert: (payload: unknown) => QueryBuilder<T>
  is: (column: string, value: unknown) => QueryBuilder<T>
  eq: (column: string, value: unknown) => QueryBuilder<T>
  order: (column: string, options?: unknown) => QueryBuilder<T>
  single: () => Promise<{ data: T | null; error: { message?: string } | null }>
} & QueryResult<T>

type SchemaClient = {
  from: <T = unknown>(table: string) => QueryBuilder<T>
  rpc: (name: string, args: unknown) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

export type CommentSupabase = {
  schema: (name: 'mos' | 'shared') => SchemaClient
}

type CommentInsertResult = { id: string }

// Issue #584: the notification row carries no actor beyond metadata.entity, so the title (the
// only thing the Inbox list renders) is composed HERE, at insert, from the commenting person's
// name + the mentioned-into entity kind — never the bare "@mention in ${entityType}" a stacked
// mention couldn't tell apart. `translateFor` (not `useT`) because this runs outside render.
const ENTITY_LABEL_KEY: Record<CommentEntityType, MessageKey> = {
  task: 'notifications.mention.entity.task',
  weekly_update: 'notifications.mention.entity.weekly_update',
  daily_log: 'notifications.mention.entity.daily_log',
  follow_up: 'notifications.mention.entity.follow_up',
  signal: 'notifications.mention.entity.signal',
}

export type CommentRow = {
  id: string
  author_id: string
  body: string
  created_at: string
}

export async function listComments({
  sb = supabase as unknown as CommentSupabase,
  entityType,
  entityId,
}: {
  sb?: CommentSupabase
  entityType: CommentEntityType
  entityId: string
}): Promise<CommentRow[]> {
  const { data, error } = await sb
    .schema('mos')
    .from<CommentRow[]>('comments')
    .select('id,author_id,body,created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message ?? 'Could not load comments')
  return data ?? []
}

export async function loadPersonIndex(sb: CommentSupabase): Promise<PersonMentionIndex> {
  const { data, error } = await sb
    .schema('shared')
    .from<MentionPerson[]>('people')
    .select('id,full_name')
    .is('archived_at', null)
    .order('full_name', { ascending: true })

  if (error) throw new Error(error.message ?? 'Could not load people')
  return buildPersonMentionIndex(data ?? [])
}

export async function postComment({
  sb = supabase as unknown as CommentSupabase,
  entityType,
  entityId,
  body,
  actorId,
  actorName,
  locale,
}: {
  sb?: CommentSupabase
  entityType: CommentEntityType
  entityId: string
  body: string
  /** The commenting person's id — carried in metadata.actor so a future render (a locale switch,
   *  a redesign) can recompose the title without re-parsing the frozen string (#584 review). */
  actorId: string
  /** The commenting person's display name — names the notification title (#584). Blank when the
   *  caller has no resolved viewer yet (auth still loading); falls back to a real word rather than
   *  producing "${blank} mentioned you in a task". */
  actorName: string
  /** The commenting person's active locale — the title is composed in THEIR locale, once, at
   *  insert; a recipient on the other locale still reads a real sentence, just not their own. */
  locale: Locale
}): Promise<string> {
  const { data, error } = await sb
    .schema('mos')
    .from<CommentInsertResult>('comments')
    .insert({ entity_type: entityType, entity_id: entityId, body })
    .select('id')
    .single()

  if (error) throw new Error(error.message ?? 'Could not post comment')
  if (!data?.id) throw new Error('Could not post comment')

  const personIndex = await loadPersonIndex(sb)
  const mentionedPersonIds = extractMentions(body, personIndex)

  // Mention fan-out is best-effort + parallel: the comment row is the durable unit (already
  // committed above), so a transient create_notification failure must NOT invalidate it or
  // abort the call (which would push the user to retry and duplicate the comment). Per-mention
  // errors are swallowed; NFR-P3-CM-001 (fail-quiet) already governs unresolvable slugs.
  const t = translateFor(locale)
  const resolvedActorName = actorName.trim() || t('notifications.mention.someone')
  const title = t('notifications.mention.title', {
    name: resolvedActorName,
    entity: t(ENTITY_LABEL_KEY[entityType]),
  })

  await Promise.allSettled(
    mentionedPersonIds.map((personId) =>
      sb.schema('mos').rpc('create_notification', {
        p_owner: personId,
        p_severity: 'info',
        p_title: title,
        p_body: body.slice(0, 200),
        p_metadata: {
          source: 'mention',
          entity: { type: entityType, id: entityId },
          actor: { id: actorId, name: resolvedActorName },
        },
      }),
    ),
  )

  return data.id
}
