import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
// Inter Variable — DESIGN.md OD-P3-9 sanctioned tabular-figure fallback, scoped
// SOLELY to the `.tabular` utility (money/%/counts/deltas). Never used as body/UI
// font. DM Sans's tnum is a verified no-op in its @fontsource build (2026-06-18),
// so `.tabular` engages Inter's tnum instead (see index.css --font-tabular).
import '@fontsource-variable/inter'
import './index.css'
// Shared UI primitives — loaded globally so `.btn-*` / `.pill` class usages on
// <Link>/<a> resolve (not just the <Button>/<Pill> component imports). Vite dedupes.
import './components/ui/Button.css'
import './components/ui/Pill.css'
// The shared drawer/overlay chrome (#190). Loaded globally because RecordPanelHost mounts at the
// shell root as well as inside a collection page — a route-scoped stylesheet would leave the
// shell-mounted panel unskinned.
import './styles/drawer.css'
// Shared desktop form grid (#959) — global for the same reason as drawer.css above: multiple
// route trees (admin dialogs today, more lanes to follow) reference the class names without each
// importing the stylesheet themselves.
import './styles/form-grid.css'
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
