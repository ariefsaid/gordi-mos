import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'
import { CafePageFrame } from './cafe-page-frame'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

const kitchen: ProductionStream = {
  branch: { id: 'rr', code: 'rumah_rames', name: 'Rumah Rames' },
  activity: 'kitchen',
  produces: true,
}
const bar: ProductionStream = { ...kitchen, activity: 'bar' }

function renderFrame(locale: Locale, stream: ProductionStream | null = kitchen) {
  return render(
    <MemoryRouter><I18nProvider initialLocale={locale}>
      <CafePageFrame
        page="production"
        date="2026-09-28"
        streamBar={{
          options: [kitchen, bar],
          stream,
          onChange: () => {},
        }}
      >
        <p>Page body</p>
      </CafePageFrame>
    </I18nProvider></MemoryRouter>,
  )
}

describe('CafePageFrame', () => {
  it('omits stream controls and placeholders for the org-wide recipe catalog', () => {
    render(<MemoryRouter><I18nProvider initialLocale="en"><CafePageFrame page="recipes"><p>Recipes body</p></CafePageFrame></I18nProvider></MemoryRouter>)
    const head = screen.getByTestId('page-head')
    expect(within(head).getByRole('heading', { level: 1 })).toHaveTextContent('Recipes')
    expect(within(head).queryByRole('button')).not.toBeInTheDocument()
  })
  it.each([
    ['en', 'Production', 'Rumah Rames · Kitchen', 'Switch kitchen'],
    ['id', 'Produksi', 'Rumah Rames · Dapur', 'Ganti dapur'],
  ] as const)('%s identifies the page, date and current stream and offers switching', (locale, title, streamLabel, switchLabel) => {
    renderFrame(locale)

    const heads = screen.getAllByTestId('page-head')
    expect(heads).toHaveLength(1)
    const head = heads[0]
    expect(within(head).getByRole('heading', { level: 1 })).toHaveTextContent(title)
    expect(head.querySelector('time')).toHaveAttribute('datetime', '2026-09-28')
    expect(within(head).getByRole('heading', { name: streamLabel })).toBeInTheDocument()
    expect(within(head).getByRole('button', { name: switchLabel })).toBeInTheDocument()
  })

  it('omits the stream row when no default exists, leaving the date in PageHead meta', () => {
    renderFrame('en', null)
    const head = screen.getByTestId('page-head')
    expect(within(head).queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(head.querySelector('time')).toHaveAttribute('datetime', '2026-09-28')
  })
})
