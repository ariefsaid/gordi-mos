import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installDisabledBlur } from '@/test/browser-focus-fixup'
import { useFocusRestore } from './use-focus-restore'

type RecoveryFormProps = {
  label: string
  busy: boolean
  failed: boolean
  includeFormControls?: boolean
  target?: 'text' | 'button'
  showTarget?: boolean
  disabledAfterFailure?: boolean
}

function RecoveryForm({
  label,
  busy,
  failed,
  includeFormControls = false,
  target = 'text',
  showTarget = true,
  disabledAfterFailure = false,
}: RecoveryFormProps) {
  const ref = useFocusRestore<HTMLFormElement>(
    busy,
    failed,
    includeFormControls ? { includeFormControls: true } : undefined,
  )
  const disabled = busy || disabledAfterFailure

  return (
    <form ref={ref} aria-label={label} onSubmit={(event) => event.preventDefault()}>
      {showTarget && (target === 'text'
        ? <input aria-label={`${label} field`} disabled={disabled} />
        : <button type="button" aria-label={`${label} picker`} disabled={disabled}>Choose</button>)}
      <button type="button" aria-label={`${label} other action`}>Other action</button>
    </form>
  )
}

describe('useFocusRestore', () => {
  it('keeps the existing text-field recovery behavior by default', () => {
    const restore = installDisabledBlur()
    try {
      const { rerender } = render(<RecoveryForm label="Task" busy={false} failed={false} />)
      const field = screen.getByRole('textbox', { name: 'Task field' })
      field.focus()
      expect(field).toHaveFocus()

      rerender(<RecoveryForm label="Task" busy={true} failed={false} />)
      expect(document.body).toHaveFocus()
      rerender(<RecoveryForm label="Task" busy={false} failed />)

      expect(field).toHaveFocus()
    } finally {
      restore()
    }
  })

  it('restores a picker-like form control only when the caller opts in', () => {
    const restore = installDisabledBlur()
    try {
      const { rerender } = render(
        <RecoveryForm label="Status" busy={false} failed={false} target="button" includeFormControls />,
      )
      const picker = screen.getByRole('button', { name: 'Status picker' })
      picker.focus()
      expect(picker).toHaveFocus()

      rerender(<RecoveryForm label="Status" busy={true} failed={false} target="button" includeFormControls />)
      expect(document.body).toHaveFocus()
      rerender(<RecoveryForm label="Status" busy={false} failed target="button" includeFormControls />)

      expect(picker).toHaveFocus()
    } finally {
      restore()
    }
  })

  it('does not expand the default text-only recovery to buttons', () => {
    const restore = installDisabledBlur()
    try {
      const { rerender } = render(<RecoveryForm label="Status" busy={false} failed={false} target="button" />)
      const picker = screen.getByRole('button', { name: 'Status picker' })
      picker.focus()
      rerender(<RecoveryForm label="Status" busy={true} failed={false} target="button" />)
      expect(document.body).toHaveFocus()
      rerender(<RecoveryForm label="Status" busy={false} failed target="button" />)

      expect(document.body).toHaveFocus()
    } finally {
      restore()
    }
  })

  it('does not move focus away from another useful control when a save fails', () => {
    const { rerender } = render(<RecoveryForm label="Task" busy={false} failed={false} />)
    const field = screen.getByRole('textbox', { name: 'Task field' })
    const otherAction = screen.getByRole('button', { name: 'Task other action' })
    field.focus()
    rerender(<RecoveryForm label="Task" busy={true} failed={false} />)
    otherAction.focus()

    rerender(<RecoveryForm label="Task" busy={false} failed />)

    expect(otherAction).toHaveFocus()
  })

  it('never restores a control from a different form container', () => {
    const { rerender } = render(
      <>
        <RecoveryForm label="First form" busy={false} failed={false} />
        <RecoveryForm label="Second form" busy={true} failed={false} />
      </>,
    )
    const firstField = screen.getByRole('textbox', { name: 'First form field' })
    firstField.focus()
    firstField.blur()
    expect(document.body).toHaveFocus()

    rerender(
      <>
        <RecoveryForm label="First form" busy={false} failed={false} />
        <RecoveryForm label="Second form" busy={false} failed />
      </>,
    )

    expect(document.body).toHaveFocus()
    expect(firstField).not.toHaveFocus()
  })

  it('does not focus a remembered control after it has been removed', () => {
    const restore = installDisabledBlur()
    try {
      const { rerender } = render(<RecoveryForm label="Task" busy={false} failed={false} />)
      const field = screen.getByRole('textbox', { name: 'Task field' })
      field.focus()
      rerender(<RecoveryForm label="Task" busy={true} failed={false} />)
      rerender(<RecoveryForm label="Task" busy={false} failed showTarget={false} />)

      expect(document.body).toHaveFocus()
      expect(field).not.toBeInTheDocument()
    } finally {
      restore()
    }
  })

  it('does not return focus to a form control that remains disabled after failure', () => {
    const restore = installDisabledBlur()
    try {
      const { rerender } = render(
        <RecoveryForm label="Status" busy={false} failed={false} target="button" includeFormControls />,
      )
      const picker = screen.getByRole('button', { name: 'Status picker' })
      const otherAction = screen.getByRole('button', { name: 'Status other action' })
      picker.focus()
      rerender(<RecoveryForm label="Status" busy={true} failed={false} target="button" includeFormControls />)
      rerender(
        <RecoveryForm label="Status" busy={false} failed target="button" includeFormControls disabledAfterFailure />,
      )

      expect(picker).toBeDisabled()
      expect(otherAction).toHaveFocus()
    } finally {
      restore()
    }
  })
})
