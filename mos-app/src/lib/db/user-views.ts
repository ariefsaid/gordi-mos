// DAL for mos.user_views (ADR-0018 D6 P1 / ADR-0017 D5). Adapted from the sibling internal
// project's db/userViews.ts; MOS deltas: mos schema (supabase.schema('mos')), owner_id
// (person), MOS error convention (throw new Error). RLS stamps org_id + owner_id — NEVER
// sent by the client (AC-UV-014).
import { supabase } from '@/lib/supabase'
import type { CompositionSpec } from '@/lib/viewspec/types'

const mos = () => supabase.schema('mos')

export type UserViewScope = 'private' | 'shared_team'

export interface UserViewRow {
  id: string
  name: string
  spec: CompositionSpec
  scope: UserViewScope
  created_at: string
  updated_at: string
  archived_at: string | null
  // org_id / owner_id are RLS-stamped; not selected back (caller does not need them).
}

export interface UserViewInput {
  name: string
  spec: CompositionSpec
  scope?: UserViewScope
}

const SELECT = 'id,name,spec,scope,created_at,updated_at,archived_at'

/** Lists the caller's visible (RLS-scoped) live user views, most-recently-updated first. */
export async function listUserViews(): Promise<UserViewRow[]> {
  const { data, error } = await mos()
    .from('user_views').select(SELECT).is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listUserViews failed — ${error.message}`)
  return (data ?? []) as unknown as UserViewRow[]
}

/** Fetches one user view by id (RLS-scoped); null when not found or not visible. */
export async function getUserView(id: string): Promise<UserViewRow | null> {
  const { data, error } = await mos().from('user_views').select(SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(`getUserView failed — ${error.message}`)
  return (data ?? null) as unknown as UserViewRow | null
}

/** Creates a user view. org_id + owner_id are NEVER sent — defaults + WITH CHECK pin them. */
export async function createUserView(input: UserViewInput): Promise<UserViewRow> {
  const { data, error } = await mos()
    .from('user_views').insert({ name: input.name, spec: input.spec, scope: input.scope ?? 'private' })
    .select(SELECT).single()
  if (error) throw new Error(`createUserView failed — ${error.message}`)
  return data as unknown as UserViewRow
}

/** Updates a user view's name/spec/scope. org_id/owner_id are never sent (RLS pins them). */
export async function updateUserView(id: string, input: UserViewInput): Promise<void> {
  const { error } = await mos()
    .from('user_views').update({
      name: input.name, spec: input.spec, scope: input.scope ?? 'private',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  if (error) throw new Error(`updateUserView failed — ${error.message}`)
}

/** Soft-archives a user view (no hard delete — mirrors the app's archive discipline). */
export async function archiveUserView(id: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await mos().from('user_views').update({ archived_at: now, updated_at: now }).eq('id', id)
  if (error) throw new Error(`archiveUserView failed — ${error.message}`)
}
