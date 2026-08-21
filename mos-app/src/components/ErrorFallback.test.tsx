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

// #411 review: the crash screen re-authored the shared `.btn` inline and hardcoded the
// phone 44px floor at EVERY width, so it shipped controls no other surface has and made the
// `data-touch-target` seam it added unobservable. DESIGN.md § Density: "Standard controls are
// 32px; phone targets are at least 44px" — the width split belongs to Button.css's media
// query, which `[data-touch-target='true']` already opts into.
describe('ErrorFallback — recovery buttons use the shared button, not a local re-author (#411)', () => {
  afterEach(() => localStorage.clear())

  function recoveryButtons() {
    render(<ErrorFallback onReset={() => {}} />)
    return screen.getAllByRole('button')
  }

  it('carries the shared .btn hierarchy classes', () => {
    const [reset, reload] = recoveryButtons()
    expect(reset.className).toBe('btn btn-outline')
    expect(reload.className).toBe('btn btn-primary')
  })

  it('opts into the phone touch floor through the shared seam', () => {
    for (const button of recoveryButtons()) {
      expect(button).toHaveAttribute('data-touch-target', 'true')
    }
  })

  it('sets no inline geometry or typography of its own', () => {
    for (const button of recoveryButtons()) {
      // An inline min-height wins at every width, which is exactly what defeats the seam above.
      expect(button.style.minHeight).toBe('')
      expect(button.style.height).toBe('')
      expect(button.style.padding).toBe('')
      expect(button.style.borderRadius).toBe('')
      expect(button.style.fontSize).toBe('')
      expect(button.style.fontWeight).toBe('')
    }
  })
})
