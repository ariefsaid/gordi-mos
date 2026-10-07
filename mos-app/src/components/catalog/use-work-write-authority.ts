import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import {
  emptyWorkWriteScopes,
  getWorkWriteScopes,
  type WorkWriteScopes,
} from '@/lib/db/work-authority'

/** A lookup that has not answered by then counts as failed, so the viewer can retry instead of waiting. */
export const WORK_AUTHORITY_TIMEOUT_MS = 10_000

export function canCreateForScope(kind: 'work-line' | 'objective', scopes: WorkWriteScopes): boolean {
  return kind === 'work-line'
    ? scopes.workline_org || scopes.workline_bu_ids.length > 0
    : scopes.objective_org || scopes.objective_bu_ids.length > 0
}

export function canManageForScope(
  kind: 'work-line' | 'objective',
  businessUnitId: string | null | undefined,
  scopes: WorkWriteScopes,
): boolean {
  const org = kind === 'work-line' ? scopes.workline_org : scopes.objective_org
  if (org) return true
  if (!businessUnitId) return false
  const buIds = kind === 'work-line' ? scopes.workline_bu_ids : scopes.objective_bu_ids
  return buIds.includes(businessUnitId)
}

/**
 * May the viewer edit an Objective's write-up and key-result current values (the content tier)?
 * Org-wide for the content org scope; otherwise only on an Objective owned by one of the viewer's
 * own units. A Company-wide or unit-less Objective is never in a unit scope. Structure (name,
 * unit, period, owner) is a separate, stricter authority: see `canManageForScope`.
 */
export function canEditObjectiveContentForScope(
  row: { businessUnitId?: string | null; isCompanyWide?: boolean },
  scopes: WorkWriteScopes,
): boolean {
  if (scopes.objective_content_org) return true
  if (row.isCompanyWide === true || !row.businessUnitId) return false
  return scopes.objective_content_bu_ids.includes(row.businessUnitId)
}

export function allowedBusinessUnitIds(
  kind: 'work-line' | 'objective',
  scopes: WorkWriteScopes,
): readonly string[] | null {
  const org = kind === 'work-line' ? scopes.workline_org : scopes.objective_org
  return org ? null : (kind === 'work-line' ? scopes.workline_bu_ids : scopes.objective_bu_ids)
}

/** Read runtime Work authority when the caller needs mutation affordances. */
export function useWorkWriteAuthority(enabled = true) {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const orgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : null
  const [scopes, setScopes] = useState<WorkWriteScopes>(() => emptyWorkWriteScopes())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setScopes(emptyWorkWriteScopes())
    setLoading(true)
    setError(false)
    if (!enabled || !viewerId || !orgId) {
      setLoading(false)
      return () => { live = false }
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('work authority lookup timed out')), WORK_AUTHORITY_TIMEOUT_MS)
    })
    Promise.race([getWorkWriteScopes(), timeout])
      .then((next) => { if (live) setScopes(next) })
      .catch(() => { if (live) setError(true) })
      .finally(() => { clearTimeout(timer); if (live) setLoading(false) })
    return () => { live = false; clearTimeout(timer) }
  }, [enabled, orgId, viewerId, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { scopes, loading, error, retry }
}
