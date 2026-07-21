import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// §Task-11 (Issue-8 gate): no `team` chip until Issue 8 lands the real Task team_id contract.
export type TasksSavedViewChip = 'mine' | 'overdue' | 'followups'
export type TasksSavedViewKey = TasksSavedViewChip | 'all' | 'unknown'
export type TasksSavedViewSegment = 'mine' | 'all'

export type TasksSavedView = {
  view: TasksSavedViewKey
  activeChip: TasksSavedViewChip | null
  segment: TasksSavedViewSegment
  overdueOnly: boolean
  reserved: 'followups' | null
  search: string
}

const KNOWN_VIEWS = new Set<TasksSavedViewChip | 'all'>(['mine', 'overdue', 'followups', 'all'])

export function useTasksSavedView() {
  const location = useLocation()
  const navigate = useNavigate()

  const savedView = useMemo<TasksSavedView>(() => {
    const params = new URLSearchParams(location.search)
    const raw = params.get('view')
    const view = raw && KNOWN_VIEWS.has(raw as TasksSavedViewChip | 'all')
      ? raw as TasksSavedViewKey
      : raw
        ? 'unknown'
        : 'all'

    switch (view) {
      case 'mine':
        return { view, activeChip: 'mine', segment: 'mine', overdueOnly: false, reserved: null, search: location.search }
      case 'overdue':
        return { view, activeChip: 'overdue', segment: 'all', overdueOnly: true, reserved: null, search: location.search }
      case 'followups':
        return { view, activeChip: 'followups', segment: 'all', overdueOnly: false, reserved: 'followups', search: location.search }
      case 'all':
      case 'unknown':
      default:
        return { view, activeChip: null, segment: 'all', overdueOnly: false, reserved: null, search: location.search }
    }
  }, [location.search])

  const setSavedView = useCallback((next: TasksSavedViewChip | 'all') => {
    const params = new URLSearchParams(location.search)
    if (next === 'all') params.delete('view')
    else params.set('view', next)
    const search = params.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' })
  }, [location.pathname, location.search, navigate])

  return { savedView, setSavedView }
}
