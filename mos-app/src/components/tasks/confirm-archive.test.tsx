import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmArchive } from './confirm-archive'

describe('ConfirmArchive', () => {
  // Two separate journeys (cohesion-debt item #4): the shared ConfirmDialog holds a
  // busy state after a successful confirm (the caller unmounts it), so confirm and
  // cancel are distinct paths — never both on one live instance.
  it('renders a modal dialog and wires the confirm action', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmArchive onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('dialog', { name: /archive confirmation/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))
    expect(onConfirm).toHaveBeenCalled()
  }, 10_000)

  it('wires the cancel action', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmArchive onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // cohesion-debt item #4: ConfirmArchive now composes the shared ConfirmDialog,
  // gaining Esc-to-cancel + focus-trap it previously lacked.
  it('Esc dismisses via onCancel (shared modal primitive)', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmArchive onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
