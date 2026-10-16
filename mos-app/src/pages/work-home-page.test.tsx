import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { useAuth } from '@/auth/use-auth'
import { ContextRow } from '@/shell/context-row'
import { WorkHomePage } from './work-home-page'

vi.mock('@/auth/use-auth')

const mockUseAuth = vi.mocked(useAuth)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
})

describe('Work home', () => {
  it('shows its job sentence once across the page and shell context row', () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work']}>
          <Routes>
            <Route path="/work" element={<><ContextRow /><WorkHomePage /></>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )

    expect(
      screen.getAllByText('Move the work forward, share what is happening, and keep priorities clear.'),
    ).toHaveLength(1)
  })
})
