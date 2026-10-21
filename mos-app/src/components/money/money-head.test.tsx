import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { MoneyFreshness, PeriodControl } from './money-head'

it.each([
  ['en', /synced time unknown/],
  ['id', /sinkron waktu tidak diketahui/],
] as const)('states that the sync time is unknown when none is available (%s)', (locale, expected) => {
  render(<I18nProvider initialLocale={locale}><MoneyFreshness latestDate="2026-10-05" syncedAt={null} /></I18nProvider>)
  expect(screen.getByText(expected)).toBeInTheDocument()
})

it.each(['en', 'id'] as const)('restores a preset after Back leaves a custom range in %s', locale => {
  const props = { period: 30 as const, latestDate: '2026-10-19', onChange: () => {}, onRangeChange: () => {} }
  const view = render(<I18nProvider initialLocale={locale}><PeriodControl {...props} range={{ from: '2026-10-01', to: '2026-10-10' }} /></I18nProvider>)
  expect(screen.getByRole('combobox')).toHaveTextContent(locale === 'en' ? 'Custom range' : 'Rentang khusus')
  view.rerender(<I18nProvider initialLocale={locale}><PeriodControl {...props} range={null} /></I18nProvider>)
  expect(screen.getByRole('combobox')).toHaveTextContent(locale === 'en' ? '30 days' : '30 hari')
  expect(screen.queryByText(locale === 'en' ? 'From' : 'Dari')).toBeNull()
})
