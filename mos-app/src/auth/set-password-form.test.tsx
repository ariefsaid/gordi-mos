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
    const onSubmit = vi.fn().mockResolvedValue('Password is too weak.')
    renderForm(onSubmit)

    await fill('password1', 'password1')

    expect(await screen.findByRole('alert')).toHaveTextContent('Password is too weak.')
    // Re-enabled, fields intact — the user can correct and resubmit.
    expect(screen.getByRole('button', { name: /save password/i })).toBeEnabled()
    expect(screen.getByLabelText(/new password/i)).toHaveValue('password1')
  })

  it("surfaces a thrown Error's own message rather than a generic one", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Couldn't confirm your new password."))
    renderForm(onSubmit)

    await fill('correct horse battery', 'correct horse battery')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't confirm your new password.")
  })

  it('ties the server error to the password field for screen readers', async () => {
    const onSubmit = vi.fn().mockResolvedValue('Password is too weak.')
    renderForm(onSubmit)

    await fill('password1', 'password1')

    const alert = await screen.findByRole('alert')
    expect(screen.getByLabelText(/new password/i).getAttribute('aria-describedby')).toContain(alert.id)
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

  // ── #799 ── AC-015: the rule is stated before any error, and it is checked first ────────────

  it('AC-015: the length rule sits under New password before anything is submitted', () => {
    renderForm(vi.fn())

    const rule = screen.getByText('At least 8 characters')
    expect(rule).toBeInTheDocument()
    // Announced with the field, not just painted near it.
    expect(screen.getByLabelText(/new password/i).getAttribute('aria-describedby')).toContain(rule.id)
    // No error has been raised yet.
    expect(screen.queryByText(/must be at least 8 characters/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/don't match/i)).not.toBeInTheDocument()
  })

  it('AC-015: both fields carry a show/hide toggle that flips the input type', async () => {
    renderForm(vi.fn())

    const newField = screen.getByLabelText(/new password/i)
    const confirmField = screen.getByLabelText(/confirm password/i)
    expect(newField).toHaveAttribute('type', 'password')
    expect(confirmField).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(newField).toHaveAttribute('type', 'text')
    expect(confirmField).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Show password confirmation' }))
    expect(confirmField).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(newField).toHaveAttribute('type', 'password')
  })

  it('AC-015: two short, differing passwords report the rule only — never the mismatch', async () => {
    const onSubmit = vi.fn()
    renderForm(onSubmit)

    await fill('abc', 'abd')

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(screen.queryByText(/don't match/i)).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('AC-015: a rule-length password entered twice raises no client error', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderForm(onSubmit)

    await fill('abcdefgh', 'abcdefgh')

    expect(screen.queryByText('Password must be at least 8 characters.')).not.toBeInTheDocument()
    expect(screen.queryByText(/don't match/i)).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith('abcdefgh')
  })
})
