import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AuthContext, type AuthState } from './auth/context'
import { ThemeProvider } from './theme/theme-provider'
import { I18nProvider } from './i18n/I18nProvider'
import { router } from './router'
import './index.css'
import './components/ui/Button.css'
import './components/ui/Pill.css'
import './styles/drawer.css'
import './styles/form-grid.css'

const auth: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'visual-preview-user',
      full_name: 'Café Preview',
      email: 'cafe-preview@example.test',
      archived_at: null,
      must_change_password: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    roles: [],
    isManager: true,
    accessRoles: ['admin', 'finance', 'manager', 'supervisor', 'ops_lead', 'member'],
    affiliated: ['cafe'],
  },
  signOut: async () => {},
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AuthContext.Provider value={auth}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
