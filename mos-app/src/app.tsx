import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/auth-provider'
import { ThemeProvider } from './theme/theme-provider'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  )
}
