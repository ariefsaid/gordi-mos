// PasswordReveal tests — the show-once panel (AC-011, NFR-003, design-plan §4.4).
// Covers the design-review minor: PasswordReveal owns a Tab-trap (Esc/backdrop stay
// disabled by design). Also covers copy success, clipboard-blocked fallback, and that
// the warning + Done are always present.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordReveal } from './password-reveal'

// jsdom exposes navigator.clipboard as a getter-only prop; redefine it for the test.
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
}

// Render PasswordReveal inside a role="alertdialog" wrapper, mirroring both call sites
// (create-person-dialog + admin-users-page) so the trap finds its enclosing dialog.
function renderReveal(props: Partial<Parameters<typeof PasswordReveal>[0]> = {}) {
  return render(
    <div role="alertdialog" aria-modal="true">
      <PasswordReveal
        personName="Budi Santoso"
        password="TempPw9999"
        email="budi.santoso@ops.gordi.local"
        context="create"
        onDone={props.onDone ?? vi.fn()}
        {...props}
      />
    </div>,
  )
}

describe('PasswordReveal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the password, the "copy this now" warning, sign-in name, and Done', () => {
    renderReveal()
    expect(screen.getByText('TempPw9999')).toBeInTheDocument()
    expect(screen.getByText(/copy this now/i)).toBeInTheDocument()
    expect(screen.getByText('budi.santoso@ops.gordi.local')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('renders the reset-context heading variant', () => {
    renderReveal({ context: 'reset' })
    expect(screen.getByText(/password reset for budi santoso/i)).toBeInTheDocument()
  })

  it('Done calls onDone (the only dismiss path)', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    renderReveal({ onDone })
    await user.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalled()
  })

  it('Copy password writes to the clipboard and flips to "Copied"', async () => {
    const user = userEvent.setup()
    // Stub AFTER setup() so our spy wins over user-event's own clipboard stub.
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    renderReveal()

    await user.click(screen.getByRole('button', { name: /copy password/i }))

    expect(writeText).toHaveBeenCalledWith('TempPw9999')
    // polite live region announces the copy (the SR-facing confirmation)
    await screen.findByText('Password copied to clipboard')
    // visible button label also flips to the copied confirmation
    expect(screen.getByText('Copied ✓')).toBeInTheDocument()
  })

  it('falls back to manual-copy hint when the clipboard is blocked', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'))
    stubClipboard(writeText)
    renderReveal()

    await user.click(screen.getByRole('button', { name: /copy password/i }))

    await screen.findByText(/select and copy manually/i)
  })

  it('auto-focuses Copy and confines Tab to the dialog (Esc/backdrop stay disabled)', async () => {
    const user = userEvent.setup()
    renderReveal()

    const copyBtn = screen.getByRole('button', { name: /copy password/i })
    const doneBtn = screen.getByRole('button', { name: /done/i })

    // Copy is auto-focused on open (design-plan §4.4)
    await waitFor(() => expect(copyBtn).toHaveFocus())

    // The trap keydown handler runs for Tab/Shift+Tab and keeps focus on the two
    // dialog controls — it never lets focus escape to document.body.
    doneBtn.focus()
    await user.tab()
    expect([copyBtn, doneBtn]).toContain(document.activeElement)

    copyBtn.focus()
    await user.tab({ shift: true })
    expect([copyBtn, doneBtn]).toContain(document.activeElement)

    // Esc is intentionally NOT a dismiss path here — pressing it must not throw or
    // surface any close affordance; Done remains the only way out.
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })
})
