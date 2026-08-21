import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorFallback } from './ErrorFallback'

// #400: the crash screen renders ABOVE I18nProvider, so it resolves the persisted locale
// directly from localStorage — no provider in these renders, by design.
describe('ErrorFallback — locale seam (#400)', () => {
  afterEach(() => localStorage.clear())

  it('renders the honest English fallback by default', () => {
    render(<ErrorFallback />)
    expect(screen.getByText('This screen stopped working')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument()
  })

  it('with mos.locale=id, the whole card is Indonesian', () => {
    localStorage.setItem('mos.locale', 'id')
    render(<ErrorFallback />)
    expect(screen.getByText('Layar ini berhenti bekerja')).toBeInTheDocument()
    expect(screen.getByText(/Biasanya memuat ulang sudah cukup/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Muat ulang aplikasi' })).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).toBeNull()
  })

  it('onReset variant shows the shared retry label, localized', () => {
    localStorage.setItem('mos.locale', 'id')
    render(<ErrorFallback onReset={() => {}} />)
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
  })
})
