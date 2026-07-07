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
import { App } from './app.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerServiceWorker } from './sw-register'

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
