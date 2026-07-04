/**
 * LocaleToggle tests (plan §1.6/§4.6, Task 3.9). A minimal en/id switch that
 * proves the i18n seam end-to-end — calls useI18n().setLocale.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider, useI18n } from '@/i18n/I18nProvider'
import { LocaleToggle } from './locale-toggle'

function LocaleReadout() {
  const { locale } = useI18n()
  return <div data-testid="locale">{locale}</div>
}

function renderToggle() {
  return render(
    <I18nProvider>
      <LocaleToggle />
      <LocaleReadout />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('LocaleToggle', () => {
  it('renders an English and a Bahasa Indonesia option as buttons', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bahasa Indonesia' })).toBeInTheDocument()
  })

  it('has an accessible group label (Language)', () => {
    renderToggle()
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
  })

  it('defaults to English pressed (aria-pressed=true)', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Bahasa Indonesia' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking Bahasa Indonesia switches the active locale to id', async () => {
    const user = userEvent.setup()
    renderToggle()
    await user.click(screen.getByRole('button', { name: 'Bahasa Indonesia' }))
    expect(screen.getByTestId('locale').textContent).toBe('id')
    expect(screen.getByRole('button', { name: 'Bahasa Indonesia' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking English after switching to id switches back to en', async () => {
    const user = userEvent.setup()
    renderToggle()
    await user.click(screen.getByRole('button', { name: 'Bahasa Indonesia' }))
    await user.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByTestId('locale').textContent).toBe('en')
  })
})
