import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { getDirectManagerPersonIds, getPeople } from '@/lib/db/directory'

type SupervisorDraft = { id: string; responsible_person_id: string; accountable_person_id: string; business_unit_id: string }
export type SupervisorHint = { taskId: string; picId: string; businessUnitId: string; status: 'missing' | 'error' }
export type SupervisorResolution = { supervisorId: string | null; status: 'ready' | 'missing' | 'error' }

export function defaultSupervisorId(
  managerIds: readonly string[],
  picId: string,
  activePersonIds: readonly string[],
): string | null {
  const active = new Set(activePersonIds)
  const candidates = [...new Set(managerIds.filter((id) => id !== picId && active.has(id)))]
  return candidates.length === 1 ? candidates[0] : null
}

export async function resolvePicSupervisor(picId: string, businessUnitId: string): Promise<SupervisorResolution> {
  if (!picId || !businessUnitId) return { supervisorId: null, status: 'missing' }
  try {
    const [managerIds, people] = await Promise.all([getDirectManagerPersonIds(picId, businessUnitId), getPeople()])
    const supervisorId = defaultSupervisorId(managerIds, picId, people.map((person) => person.id))
    return { supervisorId, status: supervisorId ? 'ready' : 'missing' }
  } catch {
    return { supervisorId: null, status: 'error' }
  }
}

export function usePicSupervisorDefault<T extends SupervisorDraft>(
  draft: T | null,
  setDraft: Dispatch<SetStateAction<T | null>>,
) {
  const [hint, setHint] = useState<SupervisorHint | null>(null)
  const explicit = useRef(false)
  const derived = useRef<{ taskId: string; picId: string; businessUnitId: string; supervisorId: string | null } | null>(null)
  const taskId = draft?.id
  const picId = draft?.responsible_person_id
  const businessUnitId = draft?.business_unit_id ?? ''
  const supervisorId = draft?.accountable_person_id ?? ''

  useEffect(() => {
    if (!taskId || !picId) { setHint(null); return }
    if (explicit.current) { setHint(null); return }
    const previous = derived.current
    const sameContext = previous?.taskId === taskId && previous.picId === picId && previous.businessUnitId === businessUnitId
    if (sameContext && previous.supervisorId === supervisorId) return
    if (previous && supervisorId === previous.supervisorId) {
      derived.current = null
      setHint(null)
      setDraft((current) => current?.id === taskId && current.responsible_person_id === picId && current.business_unit_id === businessUnitId && current.accountable_person_id === supervisorId
        ? { ...current, accountable_person_id: '' }
        : current)
      return
    }
    if (supervisorId) {
      explicit.current = true
      setHint(null)
      return
    }
    derived.current = null
    setHint(null)
    if (!businessUnitId) return
    let active = true
    void resolvePicSupervisor(picId, businessUnitId).then((resolution) => {
      if (!active || explicit.current) return
      derived.current = { taskId, picId, businessUnitId, supervisorId: resolution.supervisorId }
      if (resolution.status !== 'ready') setHint({ taskId, picId, businessUnitId, status: resolution.status })
      setDraft((current) => current?.id === taskId && current.responsible_person_id === picId && current.business_unit_id === businessUnitId && !explicit.current
        ? { ...current, accountable_person_id: resolution.supervisorId ?? '' }
        : current)
    })
    return () => { active = false }
  }, [businessUnitId, picId, setDraft, supervisorId, taskId])

  const reset = useCallback((hasExplicitChoice: boolean) => {
    explicit.current = hasExplicitChoice
    derived.current = null
    setHint(null)
  }, [])
  const choose = useCallback(() => {
    explicit.current = true
    derived.current = null
    setHint(null)
  }, [])

  return { hint, reset, choose }
}
