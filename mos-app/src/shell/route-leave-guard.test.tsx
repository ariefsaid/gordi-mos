// RouteLeaveGuard — the page-route unsaved-changes guard (GAP-4 / OD-REDESIGN-91 #9).
// The goal-oracle: leaving a route that holds unsaved work must ASK (stay/discard), and only a
// "discard" actually leaves — a clean route (or a chosen "stay") never loses the page.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, MemoryRouter, Link } from 'react-router-dom'
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
  return render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RouteLeaveGuard (GAP-4 / OD-REDESIGN-91 #9)', () => {
  it('does not prompt or block when the page is clean (when=false)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderInDataRouter(false)
    await userEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument()
  })

  it('when dirty, "stay" (Cancel) keeps the page and its unsaved work', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false) // user chooses Stay
    renderInDataRouter(true)
    await userEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1))
    // Navigation was vetoed — still on the log page.
    expect(screen.getByRole('heading', { name: 'Log page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Other page' })).toBeNull()
  })

  it('when dirty, "discard" (OK) completes the navigation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true) // user chooses Discard
    renderInDataRouter(true)
    await userEvent.click(screen.getByRole('link', { name: /go elsewhere/i }))

    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
  })

  it('degrades to inert (renders nothing, never throws) outside a data router', () => {
    // A bare <MemoryRouter> is not a data router — useBlocker would throw, so the guard must not
    // mount its blocking hook. This proves unit harnesses that use <MemoryRouter> stay green.
    expect(() =>
      act(() => {
        render(
          <MemoryRouter>
            <RouteLeaveGuard when message="unused" />
          </MemoryRouter>,
        )
      }),
    ).not.toThrow()
  })
})
