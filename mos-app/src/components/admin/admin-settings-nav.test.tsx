import { act, render, screen, waitFor } from '@testing-library/react'
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
  it('marks the active tab current and brings it into view', async () => {
    renderNav()

    const nav = screen.getByRole('navigation', { name: 'Admin settings sections' })
    const activeTab = screen.getByRole('link', { name: 'Roles & permissions' })
    expect(nav).toContainElement(activeTab)
    expect(activeTab).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' }))
  })

  it('shows the right and left edge fades only where the tab strip has hidden content', async () => {
    renderNav()

    const nav = screen.getByRole('navigation', { name: 'Admin settings sections' })
    const frame = nav.parentElement!
    Object.defineProperties(nav, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 500 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    act(() => nav.dispatchEvent(new Event('scroll')))
    await waitFor(() => expect(frame).toHaveClass('admin-settings-nav-frame--more-right'))
    expect(frame).not.toHaveClass('admin-settings-nav-frame--more-left')

    act(() => {
      nav.scrollLeft = 80
      nav.dispatchEvent(new Event('scroll'))
    })
    await waitFor(() => expect(frame).toHaveClass('admin-settings-nav-frame--more-left'))
    expect(frame).toHaveClass('admin-settings-nav-frame--more-right')

    act(() => {
      nav.scrollLeft = 200
      nav.dispatchEvent(new Event('scroll'))
    })
    await waitFor(() => expect(frame).not.toHaveClass('admin-settings-nav-frame--more-right'))
    expect(frame).toHaveClass('admin-settings-nav-frame--more-left')
  })
})
