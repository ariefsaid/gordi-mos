// DAL for typed V3 Work collection views, persisted on the existing mos.user_views substrate
// (docs/plans/2026-07-20-v3-record-collection.md Tasks 8/9 — DAL half). A collection row carries a
// discriminated, schema-versioned CollectionViewSpec in the existing `spec` jsonb plus the normalized
// kind/context/lifecycle metadata added by 20260721000001_mos_user_views_collection_views.sql.
//
// Discipline mirrored from user-views.ts: talk to Supabase through supabase.schema('mos'); RLS stamps
// org_id + owner_id, so the client NEVER sends them (AC-UV-014). The spec is validated BEFORE any
// INSERT (validate-before-DAL) so an invalid or pre-Issue-8 Team view can never be persisted. This
// DAL only ever touches kind='collection', context='work' rows — the legacy CompositionSpec
// (Home/dashboard) DAL in user-views.ts is untouched and continues to own its rows.
import { supabase } from '@/lib/supabase'
import {
  parseCollectionViewSpec,
  type CollectionViewCollection,
  type CollectionViewScope,
  type CollectionViewSpec,
  type PersistedCollectionView,
} from '@/lib/record-collection/collection-view-spec'

const mos = () => supabase.schema('mos')

export interface CollectionViewInput {
  name: string
  scope: CollectionViewScope
  spec: CollectionViewSpec
}

const SELECT = 'id,name,scope,kind,context,lifecycle,spec,created_at,updated_at,archived_at'

// The raw snake_case row PostgREST returns for a collection view.
interface CollectionViewRow {
  id: string
  name: string
  scope: CollectionViewScope
  kind: 'collection'
  context: 'work'
  lifecycle: 'active' | 'archived'
  spec: CollectionViewSpec
  created_at: string
  updated_at: string
  archived_at: string | null
}

/** Maps the raw snake_case DB row to the typed camelCase PersistedCollectionView. */
function toPersisted(row: CollectionViewRow): PersistedCollectionView {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    kind: row.kind,
    context: row.context,
    lifecycle: row.lifecycle,
    spec: row.spec,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  }
}

/**
 * Lists the caller's visible (RLS-scoped) live Work collection views for one collection, most-
 * recently-updated first. The kind/context/lifecycle + spec->>collectionId filters pin the partial
 * `mos_user_views_collection_live_idx` / `_owner_idx` hot path.
 */
export async function listCollectionViews(
  collectionId: CollectionViewCollection,
): Promise<readonly PersistedCollectionView[]> {
  const { data, error } = await mos()
    .from('user_views')
    .select(SELECT)
    .eq('kind', 'collection')
    .eq('context', 'work')
    .eq('lifecycle', 'active')
    .eq('spec->>collectionId', collectionId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listCollectionViews failed — ${error.message}`)
  return ((data ?? []) as unknown as CollectionViewRow[]).map(toPersisted)
}

/** Fetches one collection view by id (RLS-scoped); null when not found or not visible. */
export async function getCollectionView(id: string): Promise<PersistedCollectionView | null> {
  const { data, error } = await mos()
    .from('user_views')
    .select(SELECT)
    .eq('id', id)
    .eq('kind', 'collection')
    .maybeSingle()
  if (error) throw new Error(`getCollectionView failed — ${error.message}`)
  return data ? toPersisted(data as unknown as CollectionViewRow) : null
}

/**
 * Creates a collection view. The spec is validated BEFORE the INSERT so an invalid or pre-Issue-8
 * Team view never reaches the database. The metadata tuple (kind/context/lifecycle) is stamped here;
 * org_id + owner_id are NEVER sent — RLS defaults + WITH CHECK pin them.
 */
export async function createCollectionView(
  input: CollectionViewInput,
): Promise<PersistedCollectionView> {
  const validation = parseCollectionViewSpec(input.spec)
  if (!validation.ok) {
    const detail = validation.issues.map((i) => `${i.path || 'spec'}: ${i.detail}`).join('; ')
    throw new Error(`createCollectionView rejected — invalid spec (${detail})`)
  }
  const { data, error } = await mos()
    .from('user_views')
    .insert({
      name: input.name,
      scope: input.scope,
      spec: validation.spec,
      kind: 'collection',
      context: 'work',
      lifecycle: 'active',
    })
    .select(SELECT)
    .single()
  if (error) throw new Error(`createCollectionView failed — ${error.message}`)
  return toPersisted(data as unknown as CollectionViewRow)
}

/** Renames a collection view. kind/context are immutable (DB trigger) and are never sent. */
export async function renameCollectionView(id: string, name: string): Promise<void> {
  const { error } = await mos()
    .from('user_views')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`renameCollectionView failed — ${error.message}`)
}

/** Soft-archives a collection view (lifecycle=archived + archived_at) — no hard delete. */
export async function archiveCollectionView(id: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await mos()
    .from('user_views')
    .update({ lifecycle: 'archived', archived_at: now, updated_at: now })
    .eq('id', id)
  if (error) throw new Error(`archiveCollectionView failed — ${error.message}`)
}
