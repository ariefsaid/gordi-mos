import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/auth-provider'
import { ThemeProvider } from './theme/theme-provider'
import { I18nProvider } from './i18n/I18nProvider'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
