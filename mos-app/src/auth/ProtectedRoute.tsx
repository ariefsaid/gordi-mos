import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'
import { OrphanScreen } from './OrphanScreen'

// FR-010/011/013/016: gate for all protected routes.
// loading → neutral loading indicator (no protected content flash, FR-013)
// unauthenticated → redirect to /login (FR-010)
// orphan → blocked orphan screen (FR-016)
// recovering → redirect to /recovery (audit L1: password must be set before accessing the app)
// authenticated → render the route (Outlet)
export function ProtectedRoute() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <div role="status" aria-label="Loading">
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (auth.status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  if (auth.status === 'recovering') {
    return <Navigate to="/recovery" replace />
  }

  if (auth.status === 'orphan') {
    return <OrphanScreen />
  }

  return <Outlet />
}
