import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'
import { useSearchParamState } from './use-search-param-state'

function Box() {
  const [q, setQ] = useSearchParamState('q', '')
  const { search } = useLocation()
  return (
    <>
      <input aria-label="box" value={q} onChange={(e) => setQ(e.target.value)} />
      <output data-testid="url">{search}</output>
    </>
  )
}

// Real key events, no inter-key delay: the field must show exactly what was typed and the URL follow it.
describe('useSearchParamState — real typing', () => {
  it('keeps "Cahya Cafe" typed with no delay, and the URL follows', async () => {
    const user = userEvent.setup({ delay: null })
    render(<MemoryRouter><Box /></MemoryRouter>)
    const box = screen.getByRole('textbox', { name: 'box' })
    await user.type(box, 'Cahya Cafe')
    expect(box).toHaveValue('Cahya Cafe')
    expect(screen.getByTestId('url')).toHaveTextContent('?q=Cahya+Cafe')
  })

  it('select-all + Delete clears the field and the URL', async () => {
    const user = userEvent.setup({ delay: null })
    render(<MemoryRouter initialEntries={['/?q=abc']}><Box /></MemoryRouter>)
    const box = screen.getByRole('textbox', { name: 'box' })
    await user.click(box)
    await user.keyboard('{Control>}a{/Control}{Delete}')
    expect(box).toHaveValue('')
    expect(screen.getByTestId('url')).toHaveTextContent(/^$/)
  })

  it('a data router (the app\'s router kind) keeps every key typed with no delay', async () => {
    const user = userEvent.setup({ delay: null })
    const router = createMemoryRouter([{ path: '/', element: <Box /> }])
    render(<RouterProvider router={router} />)
    const box = screen.getByRole('textbox', { name: 'box' })
    await user.type(box, 'Cahya Cafe')
    expect(box).toHaveValue('Cahya Cafe')
    await user.keyboard('{Control>}a{/Control}{Delete}')
    expect(box).toHaveValue('')
    expect(router.state.location.search).toBe('')
  })
})
