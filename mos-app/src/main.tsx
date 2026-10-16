import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/foundation.css'
// Shared UI primitives — loaded globally so `.btn-*` / `.pill` class usages on
// <Link>/<a> resolve (not just the <Button>/<Pill> component imports). Vite dedupes.
import './components/ui/Button.css'
import './components/ui/Pill.css'
import './components/ui/round1-components.css'
// The shared drawer/overlay chrome (#190). Loaded globally because RecordPanelHost mounts at the
// shell root as well as inside a collection page — a route-scoped stylesheet would leave the
// shell-mounted panel unskinned.
import './styles/drawer.css'
// Shared desktop form grid (#959) — global for the same reason as drawer.css above: multiple
// route trees (admin dialogs today, more lanes to follow) reference the class names without each
// importing the stylesheet themselves.
import './styles/form-grid.css'
import './styles/table-head.css'
import './styles/page-title.css'
import { App } from './app.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { createClientErrorSink } from './lib/client-error-sink'
import { installGlobalErrorListeners } from './lib/global-error-listeners'
import { supabase } from './lib/supabase'
import { registerErrorSink } from './lib/telemetry'
import { registerServiceWorker } from './sw-register'

registerErrorSink(createClientErrorSink({
  isSignedIn: async () => {
    const { data, error } = await supabase.auth.getSession()
    return !error && data.session !== null
  },
  report: async ({ message, stack, route, releaseSha, userAgent }) => {
    const { error } = await supabase.rpc('report_client_error', {
      p_message: message,
      p_stack: stack,
      p_route: route,
      p_release_sha: releaseSha,
      p_user_agent: userAgent,
    })
    if (error) throw error
  },
  releaseSha: import.meta.env.VITE_RELEASE_SHA,
  getRoute: () => window.location.pathname,
  getUserAgent: () => navigator.userAgent,
}))
installGlobalErrorListeners()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
