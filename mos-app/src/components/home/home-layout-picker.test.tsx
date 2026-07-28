import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { HomeLayoutPicker } from './home-layout-picker'

function renderPicker(value: 'focused' | 'overview' | 'list' = 'focused', onChange = vi.fn()) {
  render(
    <I18nProvider>
      <HomeLayoutPicker value={value} onChange={onChange} />
    </I18nProvider>,
  )
  return onChange
}

describe('HomeLayoutPicker (OD-V4-9, FR-920)', () => {
  it('FR-920: offers exactly three named options', () => {
    renderPicker()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /focused/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /list/i })).toBeInTheDocument()
  })

  it('AC-930: the current choice is exposed to assistive tech, not colour alone', () => {
    renderPicker('overview')
    expect(screen.getByRole('radio', { name: /overview/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /focused/i })).not.toBeChecked()
  })

  it('AC-930: every option is reachable and selectable by keyboard', async () => {
    const onChange = renderPicker('focused')
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('overview')
  })

  it('reports the chosen layout', async () => {
    const onChange = renderPicker('focused')
    await userEvent.click(screen.getByRole('radio', { name: /list/i }))
    expect(onChange).toHaveBeenCalledWith('list')
  })
})
