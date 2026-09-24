import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/auth-provider'
import { ThemeProvider } from './theme/theme-provider'
import { I18nProvider } from './i18n/I18nProvider'
import { AccountLocaleProvider } from './i18n/account-locale'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <AccountLocaleProvider>
            <RouterProvider router={router} />
          </AccountLocaleProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
