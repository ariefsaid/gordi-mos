import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock supabase so App can load without real env (already set in vite.config.ts test.env)
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn(), id: 'sub', callback: vi.fn() } },
      }),
      signOut: vi.fn(),
    },
  },
}))

vi.mock('./lib/db/viewer', () => ({
  resolveViewer: vi.fn(),
}))

import App from './App'

describe('App smoke', () => {
  it('renders without crashing and shows loading state while auth resolves', () => {
    render(<App />)
    // While auth is loading, ProtectedRoute shows loading indicator (no heading flash)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
