// Owner of the set-password FORM contract (#131). The gate and the recovery flow each own their
// own wiring; the shared field/validation/busy behaviour is asserted once, here.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SetPasswordForm } from './set-password-form'

function renderForm(onSubmit: (p: string) => Promise<string | null | void>, footer?: (busy: boolean) => React.ReactNode) {
  return render(
    <SetPasswordForm title="Set a new password" subtitle="Choose one." onSubmit={onSubmit} footer={footer} />,
  )
}

async function fill(newPw: string, confirmPw: string) {
  await userEvent.type(screen.getByLabelText(/new password/i), newPw)
  await userEvent.type(screen.getByLabelText(/confirm password/i), confirmPw)
  await userEvent.click(screen.getByRole('button', { name: /save password/i }))
}

describe('SetPasswordForm', () => {
  // #425: the port dropped aria-required — recovery (#131 gate) required fields must say so
  it('both password fields carry aria-required (#425)', () => {
    renderForm(vi.fn())
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('aria-required', 'true')
  })

  it('refuses to submit when the confirmation does not match', async () => {
    const onSubmit = vi.fn()
    renderForm(onSubmit)

    await fill('correct horse battery', 'correct horse batteries')

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the password once both fields agree', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderForm(onSubmit)

    await fill('correct horse battery', 'correct horse battery')

    expect(onSubmit).toHaveBeenCalledWith('correct horse battery')
  })

  it('shows a returned message and lets the user retry', async () => {
    const onSubmit = vi.fn().mockResolvedValue('Password is too short.')
    renderForm(onSubmit)

    await fill('short', 'short')

    expect(await screen.findByRole('alert')).toHaveTextContent('Password is too short.')
    // Re-enabled, fields intact — the user can correct and resubmit.
    expect(screen.getByRole('button', { name: /save password/i })).toBeEnabled()
    expect(screen.getByLabelText(/new password/i)).toHaveValue('short')
  })

  it("surfaces a thrown Error's own message rather than a generic one", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Couldn't confirm your new password."))
    renderForm(onSubmit)

    await fill('correct horse battery', 'correct horse battery')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't confirm your new password.")
  })

  it('ties the server error to the password field for screen readers', async () => {
    const onSubmit = vi.fn().mockResolvedValue('Password is too short.')
    renderForm(onSubmit)

    await fill('short', 'short')

    const alert = await screen.findByRole('alert')
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('aria-describedby', alert.id)
  })

  it('stays busy after a successful submit, since the caller is about to tear the screen down', async () => {
    // Never resolves the navigation — assert the button does not flash back to enabled.
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderForm(onSubmit, (busy) => <button type="button" disabled={busy}>Sign out</button>)

    await fill('correct horse battery', 'correct horse battery')

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    // The footer escape hatch is disabled mid-save so it cannot be hit by a stray tap.
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDisabled()
  })
})
