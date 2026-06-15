import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmArchive } from './ConfirmArchive'

describe('ConfirmArchive', () => {
  it('renders a modal dialog and wires confirm/cancel', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmArchive onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('dialog', { name: /archive confirmation/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))
    expect(onConfirm).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
