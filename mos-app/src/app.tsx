import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/auth-provider'
import { ThemeBootstrap } from './theme/theme-bootstrap'
import { router } from './router'

export function App() {
  return (
    <AuthProvider>
      <ThemeBootstrap />
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
