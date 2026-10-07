import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { CafeCaptureTable, type CafeCaptureTableItem } from './cafe-capture-table'

const ITEM: CafeCaptureTableItem = {
  id: 'coffee',
  kind: 'RAW',
  name: 'Long-roast coffee beans for the morning counter',
  category: 'Beverages',
}

function renderTable(isDesktop: boolean) {
  return render(
    <I18nProvider>
      <CafeCaptureTable
        rows={[ITEM]}
        caption="Café capture rows"
        quantityHeader="COUNTED"
        isDesktop={isDesktop}
        renderControls={() => <input aria-label="Count for coffee" />}
        renderFeedback={() => <p role="alert">Correct this quantity.</p>}
      />
    </I18nProvider>,
  )
}

describe('CafeCaptureTable', () => {
  it('renders the shared item identity, action header, controls and row feedback in the desktop table', () => {
    renderTable(true)

    const table = screen.getByRole('table', { name: 'Café capture rows' })
    expect(within(table).getByRole('columnheader', { name: 'Item' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'COUNTED' })).toBeInTheDocument()
    expect(within(table).getByText('Long-roast coffee beans for the morning counter').parentElement).toHaveTextContent('RAW - Long-roast coffee beans for the morning counter')
    expect(within(table).getByText('Beverages')).toBeInTheDocument()
    expect(within(table).getByRole('textbox', { name: 'Count for coffee' })).toBeInTheDocument()
    expect(within(table).getByRole('alert')).toHaveTextContent('Correct this quantity.')
  })

  it('renders the same identity, controls and feedback in the compact phone row', () => {
    renderTable(false)

    const row = screen.getByRole('group', { name: 'RAW - Long-roast coffee beans for the morning counter' })
    expect(within(row).getByText('Beverages')).toBeInTheDocument()
    expect(within(row).getByRole('textbox', { name: 'Count for coffee' })).toBeInTheDocument()
    expect(within(row).getByRole('alert')).toHaveTextContent('Correct this quantity.')
    expect(row.lastElementChild).toHaveTextContent('Correct this quantity.')
  })
})
