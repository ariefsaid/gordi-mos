import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './index.css'
// Shared UI primitives — loaded globally so `.btn-*` / `.pill` class usages on
// <Link>/<a> resolve (not just the <Button>/<Pill> component imports). Vite dedupes.
import './components/ui/Button.css'
import './components/ui/Pill.css'
import { App } from './app.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
