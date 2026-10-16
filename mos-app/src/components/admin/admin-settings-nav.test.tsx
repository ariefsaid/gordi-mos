import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AdminSettingsNav } from './admin-settings-nav'

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderNav(path = '/admin/access') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<><AdminSettingsNav /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AdminSettingsNav', () => {
  it('shows the current section in the switcher', () => {
    renderNav()

    const nav = screen.getByRole('navigation', { name: 'Admin settings sections' })
    expect(within(nav).getByRole('combobox', { name: 'Admin settings' })).toHaveTextContent('Access levels')
  })

  it('lists the sections and goes to the one chosen', async () => {
    const user = userEvent.setup()
    renderNav()

    await user.click(screen.getByRole('combobox', { name: 'Admin settings' }))
    for (const name of ['People', 'Teams', 'Access levels', 'Agent apps']) {
      expect(await screen.findByRole('option', { name })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('option', { name: 'Teams' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/teams')
  })
})
