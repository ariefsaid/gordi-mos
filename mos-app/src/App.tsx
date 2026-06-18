import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ThemeBootstrap } from './theme/ThemeBootstrap'
import { router } from './router'

export default function App() {
  return (
    <AuthProvider>
      <ThemeBootstrap />
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
