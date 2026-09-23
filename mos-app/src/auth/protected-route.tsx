import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './use-auth'
import { OrphanScreen } from './orphan-screen'
import { SetPasswordScreen } from './set-password-screen'

// FR-010/011/013/016: gate for all protected routes.
// loading → neutral loading indicator (no protected content flash, FR-013)
// unauthenticated → redirect to /login, carrying the route asked for (FR-010)
// orphan → blocked orphan screen (FR-016)
// recovering → redirect to /recovery (audit L1: password must be set before accessing the app)
// authenticated + must_change_password → blocked set-password screen (#131)
// authenticated → render the route (Outlet)
export function ProtectedRoute() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') {
    return (
      <div role="status" aria-label="Loading">
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (auth.status === 'unauthenticated') {
    // The route asked for travels in router state, never the URL: a `?next=` on a public form is
    // an open-redirect surface and it leaks the person's destination into logs and referrers.
    // /login decides what to do with it — see safeReturnTarget in return-target.ts.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  if (auth.status === 'recovering') {
    return <Navigate to="/recovery" replace />
  }

  if (auth.status === 'orphan') {
    return <OrphanScreen />
  }

  // #131: the password was set by an admin and is known to them — block every route until the
  // holder replaces it. Rendered in place rather than redirected to, for three reasons:
  // /recovery sits under RedirectIfAuthed (which bounces an authenticated viewer straight back
  // here, i.e. a redirect loop); the in-place block is the existing shape for "authenticated but
  // barred" (OrphanScreen, above); and keeping the URL means the viewer lands back where they
  // were once the flag clears.
  if (auth.status === 'authenticated' && auth.viewer.person.must_change_password) {
    return <SetPasswordScreen signOut={auth.signOut} />
  }

  return <Outlet />
}
