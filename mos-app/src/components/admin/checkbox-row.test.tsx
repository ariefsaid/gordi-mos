// CheckboxRow — the shared toggleable row for the admin dialog pickers. These tests pin the
// "Defect 3" whole-row-click invariant at the unit layer (the row markup was previously copied in
// both pickers; the picker suites still assert it end-to-end as wiring):
// a click on the label text OR the glyph toggles exactly once; a disabled row never toggles.

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
    await user.click(screen.getByRole('checkbox', { name: 'Bungur' }))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('reflects checked state via aria-checked', () => {
    render(<CheckboxRow label="Whole POS" checked onToggle={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Whole POS' })).toHaveAttribute('aria-checked', 'true')
  })
})
