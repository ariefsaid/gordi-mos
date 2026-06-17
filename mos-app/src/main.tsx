import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
// Shared UI primitives — loaded globally so `.btn-*` / `.pill` class usages on
// <Link>/<a> resolve (not just the <Button>/<Pill> component imports). Vite dedupes.
import './components/ui/Button.css'
import './components/ui/Pill.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
