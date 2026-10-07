// CheckboxRow keeps native label activation consistent across admin dialog pickers.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckboxRow } from './checkbox-row'

describe('CheckboxRow', () => {
  it('clicking the label text toggles exactly once', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<CheckboxRow label="Bungur" checked={false} onToggle={onToggle} />)
    await user.click(screen.getByText('Bungur'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('clicking the checkbox glyph toggles exactly once (no double-fire from row + glyph)', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<CheckboxRow label="Bungur" checked={false} onToggle={onToggle} />)
    await user.click(screen.getByRole('checkbox', { name: 'Bungur' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('a disabled row does not toggle on label-text or glyph click', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<CheckboxRow label="Bungur" checked={false} disabled onToggle={onToggle} />)
    await user.click(screen.getByText('Bungur'))
    const checkbox = screen.getByRole('checkbox', { name: 'Bungur' })
    expect(checkbox).toBeDisabled()
    await user.click(checkbox)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('exposes checked state through the native checkbox', () => {
    render(<CheckboxRow label="Whole POS" checked onToggle={() => {}} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Whole POS' })
    expect(checkbox.tagName).toBe('INPUT')
    expect(checkbox).toBeChecked()
  })
})
