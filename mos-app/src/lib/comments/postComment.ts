import { buildPersonMentionIndex, extractMentions, type MentionPerson, type PersonMentionIndex } from './mentions'
import { supabase } from '@/lib/supabase'

export type CommentEntityType = 'task' | 'weekly_update' | 'daily_log' | 'follow_up'

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
}: {
  sb?: CommentSupabase
  entityType: CommentEntityType
  entityId: string
  body: string
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

  for (const personId of mentionedPersonIds) {
    const { error: notifyError } = await sb.schema('mos').rpc('create_notification', {
      p_owner: personId,
      p_severity: 'info',
      p_title: `@mention in ${entityType}`,
      p_body: body.slice(0, 200),
      p_metadata: { source: 'mention', entity: { type: entityType, id: entityId } },
    })
    if (notifyError) throw new Error(notifyError.message ?? 'Could not notify mention')
  }

  return data.id
}
