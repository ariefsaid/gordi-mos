// The router-level half of "offline is an error, not a crash" (#802): a rejection that reaches the
// route errorElement is answered with the in-frame ErrorState + Retry when it is a transport
// failure, and with the crash screen when it is anything else.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RouteErrorBoundary } from './RouteErrorBoundary'

function renderWithLoader(loader: () => Promise<unknown>) {
  const router = createMemoryRouter(
    [{ path: '/', element: <div>page</div>, loader, errorElement: <RouteErrorBoundary /> }],
    { initialEntries: ['/'] },
  )
  return render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('RouteErrorBoundary', () => {
  it('answers a transport failure with the network state and re-issues the read on Retry', async () => {
    const loader = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(null)
    renderWithLoader(loader)

    await screen.findByText('Couldn’t reach the server')
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument()
    expect(loader).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('page')).toBeInTheDocument())
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('answers anything else with the crash screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithLoader(() => Promise.reject(new Error('boom')))

    await screen.findByText('This screen stopped working')
    expect(screen.queryByText('Couldn’t reach the server')).toBeNull()
  })
})
