// RouteLeaveGuard — the page-route unsaved-changes guard (GAP-4 / OD-REDESIGN-91 #9).
// The goal-oracle: leaving a route that holds unsaved work must ASK (stay/discard), and only a
// "discard" actually leaves — a clean route (or a chosen "stay") never loses the page.
//
// UPDATED TO THE STATED CONTRACT (#190, following #188's pattern for the four cases it corrected).
// The v4 file this is carried from drives `vi.spyOn(window, 'confirm')` and asserts the spy was
// called. v4's OWN source stopped calling `window.confirm` on 2026-07-28 — the harden note at the
// top of route-leave-guard.tsx rules the prompt to be the shared ConfirmDialog, for three stated
// reasons, the third of which is that `window.confirm` is suppressed outright in some contexts and
// the old code then took its `leave = true` branch and silently discarded the work. Run unchanged
// against the source it ships beside, that file is 2 failed / 2 passed:
//   → expected "bound " to be called 1 times, but got 0 times
// So the assertions below are not relaxed — they are re-pointed at the control the ruling names,
// and they assert MORE than the originals did: the dialog's identity, its localized labels, and
// that Esc is the STAY path (the safe default the ruling is explicit about, which a `window.confirm`
// spy could never observe).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, MemoryRouter, Link } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RouteLeaveGuard } from './route-leave-guard'

function DirtyPage({ when }: { when: boolean }) {
  return (
    <div>
      <RouteLeaveGuard when={when} message="Leave without submitting? Your staged entries will be discarded." />
      <h1>Log page</h1>
      <Link to="/other">Go elsewhere</Link>
    </div>
  )
}

function renderInDataRouter(when: boolean) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <DirtyPage when={when} /> },
      { path: '/other', element: <h1>Other page</h1> },
    ],
    { initialEntries: ['/'] },
  )
  return render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RouteLeaveGuard (GAP-4 / OD-REDESIGN-91 #9)', () => {
  it('does not prompt or block when the page is clean (when=false)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderInDataRouter(false)
    await userEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // The native prompt is not merely unused here — it must never be the mechanism (harden #2/#3).
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument()
  })

  it('when dirty, the house dialog asks — with the message and localized stay/discard labels', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderInDataRouter(true)
    await userEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Leave without saving?' })).toBeInTheDocument()
    expect(screen.getByText(/your staged entries will be discarded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stay on this page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard and leave' })).toBeInTheDocument()
    // harden #2: the browser's own OK/Cancel, labelled in the browser's UI language, is never used.
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('when dirty, "stay" keeps the page and its unsaved work', async () => {
    renderInDataRouter(true)
    await userEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))

    await userEvent.click(await screen.findByRole('button', { name: 'Stay on this page' }))
    // Navigation was vetoed — still on the log page.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { name: 'Log page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Other page' })).toBeNull()
  })

  it('when dirty, "discard" completes the navigation', async () => {
    renderInDataRouter(true)
    await userEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))

    await userEvent.click(await screen.findByRole('button', { name: 'Discard and leave' }))
    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument()
  })

  it('Esc is the STAY path — the discard is never reachable by a stray keystroke', async () => {
    // The harden ruling is explicit that Esc must never be the discard path. This is the half a
    // window.confirm spy could not observe at all: the native prompt's Esc maps to Cancel, but that
    // is the browser's behaviour, not this guard's, and it disappeared with the prompt.
    renderInDataRouter(true)
    await userEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { name: 'Log page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Other page' })).toBeNull()
  })

  it('degrades to inert (renders nothing, never throws) outside a data router', () => {
    // A bare <MemoryRouter> is not a data router — useBlocker would throw, so the guard must not
    // mount its blocking hook. This proves unit harnesses that use <MemoryRouter> stay green.
    expect(() =>
      act(() => {
        render(
          <I18nProvider>
            <MemoryRouter>
              <RouteLeaveGuard when message="unused" />
            </MemoryRouter>
          </I18nProvider>,
        )
      }),
    ).not.toThrow()
  })
})
