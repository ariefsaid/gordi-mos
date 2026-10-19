import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { FIXED_AREAS } from '@/shell/module-registry'
import { WorkHomePage } from './work-home-page'

const work = FIXED_AREAS.find((area) => area.id === 'work')!
const destinations = work.children ?? []

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname}{search}</output>
}

function renderPage(locale: 'en' | 'id' = 'en') {
  return render(
    <MemoryRouter initialEntries={['/work']}>
      <I18nProvider initialLocale={locale}>
        <WorkHomePage />
        <LocationProbe />
      </I18nProvider>
    </MemoryRouter>,
  )
}

const copy = {
  en: {
    navigation: 'Work destinations',
    create: 'Create task',
    entries: [
      ['Signals', 'Share updates and respond to what needs attention.'],
      ['Tasks', 'Carry out and follow up on assigned work.'],
      ['Projects & Processes', 'Organize projects and recurring processes.'],
      ['Objectives', 'Set direction and connect work to outcomes.'],
    ],
  },
  id: {
    navigation: 'Tujuan Kerja',
    create: 'Buat tugas',
    entries: [
      ['Sinyal', 'Bagikan kabar dan tanggapi hal yang perlu diperhatikan.'],
      ['Tugas', 'Kerjakan dan tindak lanjuti tugas yang diberikan.'],
      ['Proyek & Proses', 'Atur proyek dan proses berulang.'],
      ['Tujuan', 'Tentukan arah dan hubungkan pekerjaan dengan hasil.'],
    ],
  },
} as const

describe('WorkHomePage', () => {
  it('uses the Work registry children, in registry order, as navigable destinations', async () => {
    const user = userEvent.setup()
    renderPage()
    const nav = screen.getByRole('navigation', { name: copy.en.navigation })
    const links = within(nav).getAllByRole('link')

    expect(links.map((link) => link.getAttribute('href'))).toEqual(destinations.map(({ path }) => path))
    for (const destination of destinations) {
      const link = within(nav).getByRole('link', { name: new RegExp(`^${destination.label} `) })
      await user.click(link)
      expect(screen.getByTestId('location')).toHaveTextContent(destination.path)
    }
  })

  it('Create task opens task creation', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('link', { name: copy.en.create }))

    expect(screen.getByTestId('location')).toHaveTextContent('/work/tasks?create=1')
  })

  it('exposes only the PageFamilyFrame main landmark', () => {
    renderPage()

    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it.each(['en', 'id'] as const)('keeps registry destinations and descriptions available in %s', (locale) => {
    renderPage(locale)
    const nav = screen.getByRole('navigation', { name: copy[locale].navigation })

    expect(within(nav).getAllByRole('link')).toHaveLength(destinations.length)
    for (const [label, description] of copy[locale].entries) {
      expect(within(nav).getByRole('link', { name: `${label} ${description}` })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: copy[locale].create })).toBeInTheDocument()
  })
})
