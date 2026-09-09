import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import {
  emptyWorkWriteScopes,
  getWorkWriteScopes,
  type WorkWriteScopes,
} from '@/lib/db/work-authority'

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

export function allowedBusinessUnitIds(
  kind: 'work-line' | 'objective',
  scopes: WorkWriteScopes,
): readonly string[] | null {
  const org = kind === 'work-line' ? scopes.workline_org : scopes.objective_org
  return org ? null : (kind === 'work-line' ? scopes.workline_bu_ids : scopes.objective_bu_ids)
}

/** Read runtime Work authority on each mount/navigation without blocking catalog reads. */
export function useWorkWriteAuthority() {
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const orgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : null
  const [scopes, setScopes] = useState<WorkWriteScopes>(() => emptyWorkWriteScopes())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    setScopes(emptyWorkWriteScopes())
    setLoading(true)
    setError(false)
    if (!viewerId || !orgId) {
      setLoading(false)
      return () => { live = false }
    }
    getWorkWriteScopes()
      .then((next) => { if (live) setScopes(next) })
      .catch(() => { if (live) setError(true) })
    .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [orgId, viewerId])

  return { scopes, loading, error }
}
