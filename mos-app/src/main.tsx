import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans'
// Inter is scoped to numeric cells only (the `.tabular` utility): DM Sans's "tnum"
// feature is a no-op in its @fontsource build, so digits don't column-align. Inter
// carries verified tabular figures. Body/UI text stays DM Sans. (OD-P3-9 contingency)
import '@fontsource-variable/inter'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
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
