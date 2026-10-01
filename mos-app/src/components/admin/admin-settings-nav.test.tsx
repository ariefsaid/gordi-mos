import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AdminSettingsNav } from './admin-settings-nav'

const scrollIntoView = vi.fn()

beforeEach(() => {
  scrollIntoView.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
})

function renderNav(path = '/admin/access') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<AdminSettingsNav />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AdminSettingsNav', () => {
  it('keeps the tabs in a dedicated scroll container and brings the active tab into view', async () => {
    renderNav()

    const nav = screen.getByRole('navigation', { name: 'Admin settings sections' })
    const activeTab = screen.getByRole('link', { name: 'Roles & permissions' })
    expect(nav).toContainElement(activeTab)
    expect(activeTab).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' }))
  })
})
